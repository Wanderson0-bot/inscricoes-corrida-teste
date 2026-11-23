import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getAppUrl, getPrivacyPolicyVersion } from "@/lib/env";
import { createSafe2PayPixCharge } from "@/lib/payments/safe2pay";
import { requireOrganizer } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  categoryId: z.string().uuid(),
  teamId: z.string().uuid().or(z.literal("")),
  couponCode: z.string().trim().max(32).default(""),
  participantName: z.string().trim().min(2).max(160),
  participantIdentity: z.string().transform((value) => value.replace(/\D/g, "")).refine((value) => value.length === 11),
  birthDate: z.string().date(),
  sex: z.enum(["", "female", "male", "other", "prefer_not_to_say"]),
  participantEmail: z.string().trim().email().max(254),
  participantPhone: z.string().transform((value) => value.replace(/\D/g, "")).refine((value) => [10, 11].includes(value.length)),
  privacyConsent: z.literal(true),
  zipCode: z.string().transform((value) => value.replace(/\D/g, "")).refine((value) => value.length === 8),
  street: z.string().trim().min(2).max(150),
  number: z.string().trim().min(1).max(15),
  neighborhood: z.string().trim().min(2).max(60),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().regex(/^[A-Za-z]{2}$/),
});

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

async function cancelPendingRegistration(registrationId: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("registrations")
    .update({ status: "cancelled" })
    .eq("id", registrationId)
    .eq("status", "pending");
  if (error) {
    console.error("Could not release a manual registration after payment setup failure", {
      registrationId,
      code: error.code,
    });
  }
}

export async function POST(request: Request, context: RouteContext<"/api/painel/corridas/[id]/inscricoes/manual">) {
  const { supabase, user } = await requireOrganizer();
  const { id: raceId } = await context.params;
  let input: unknown;
  try { input = await request.json(); } catch { return errorResponse("Revise os dados do atleta.", 400); }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return errorResponse("Preencha os dados obrigatórios, endereço para cobrança Pix e autorização do atleta.", 400);

  const { data: rpcRows, error: registrationError } = await supabase.rpc("create_manual_registration", {
    p_race_id: raceId,
    p_category_id: parsed.data.categoryId,
    p_team_id: parsed.data.teamId || null,
    p_coupon_code: parsed.data.couponCode,
    p_participant_name: parsed.data.participantName,
    p_participant_email: parsed.data.participantEmail,
    p_participant_phone: parsed.data.participantPhone,
    p_birth_date: parsed.data.birthDate,
    p_sex: parsed.data.sex || null,
    p_created_by_user_id: user.id,
    p_privacy_policy_version: getPrivacyPolicyVersion(),
  });
  if (registrationError) {
    const error = registrationError.message;
    if (error.includes("duplicate_registration") || registrationError.code === "23505") return errorResponse("Este atleta já possui uma inscrição ativa nesta corrida. Confira o nome e o e-mail.", 409);
    if (error.includes("category_full")) return errorResponse("As vagas desta categoria acabaram.", 409);
    if (error.includes("coupon")) return errorResponse("O cupom não é válido para esta equipe ou atingiu o limite de usos.", 409);
    return errorResponse("Não foi possível salvar a inscrição. Confira a corrida e os dados informados.", 400);
  }
  const registration = rpcRows?.[0];
  if (!registration) return errorResponse("Não foi possível salvar a inscrição.", 500);
  if (registration.amount_cents === 0) {
    return Response.json({ registrationId: registration.registration_id, amountCents: 0, payment: null });
  }

  const admin = createSupabaseAdminClient();
  const [{ data: race, error: raceError }, { data: category, error: categoryError }, { data: reservation, error: reservationError }] = await Promise.all([
    supabase.from("races").select("name").eq("id", raceId).single(),
    supabase.from("race_categories").select("name").eq("id", parsed.data.categoryId).single(),
    admin.from("registrations").select("expires_at").eq("id", registration.registration_id).single(),
  ]);
  if (raceError || categoryError || reservationError || !race || !category || !reservation) {
    await cancelPendingRegistration(registration.registration_id);
    return errorResponse("Não foi possível preparar a cobrança Pix.", 500);
  }

  let callbackUrl: URL;
  try {
    callbackUrl = new URL("/api/webhooks/safe2pay", getAppUrl());
  } catch {
    await cancelPendingRegistration(registration.registration_id);
    return errorResponse("O endereço público seguro da aplicação não está configurado.", 503);
  }
  if (callbackUrl.protocol !== "https:") {
    await cancelPendingRegistration(registration.registration_id);
    return errorResponse("O pagamento Pix só pode ser iniciado após configurar a URL pública HTTPS.", 503);
  }

  const callbackToken = randomBytes(32).toString("hex");
  callbackUrl.searchParams.set("token", callbackToken);
  const callbackTokenHash = createHash("sha256").update(callbackToken).digest("hex");
  const { data: paymentRows, error: prepareError } = await admin.rpc("prepare_safe2pay_payment", {
    p_registration_id: registration.registration_id,
    p_reference: registration.registration_id,
    p_callback_token_hash: callbackTokenHash,
  });
  if (prepareError || !paymentRows?.[0]) {
    console.error("Could not prepare Safe2Pay manual payment", {
      registrationId: registration.registration_id,
      code: prepareError?.code ?? "missing_payment",
    });
    await cancelPendingRegistration(registration.registration_id);
    return errorResponse("O pagamento Safe2Pay ainda não está habilitado para esta corrida.", 503);
  }
  const payment = paymentRows[0];

  try {
    const charge = await createSafe2PayPixCharge({
      registrationId: registration.registration_id,
      raceName: race.name,
      categoryName: category.name,
      amountCents: registration.amount_cents,
      identity: parsed.data.participantIdentity,
      name: parsed.data.participantName,
      email: parsed.data.participantEmail,
      phone: parsed.data.participantPhone,
      address: {
        zipCode: parsed.data.zipCode,
        street: parsed.data.street,
        number: parsed.data.number,
        district: parsed.data.neighborhood,
        city: parsed.data.city,
        state: parsed.data.state,
      },
      callbackUrl: callbackUrl.toString(),
      organizerReceiverId: payment.organizer_receiver_id,
      platformReceiverId: payment.platform_receiver_id,
    });
    const { error: saveError } = await admin.rpc("save_safe2pay_charge", {
      p_registration_id: registration.registration_id,
      p_provider_payment_id: charge.transactionId,
      p_amount_cents: registration.amount_cents,
      p_pix_copy_paste: charge.pixCopyPaste,
      p_pix_qr_code_url: charge.qrCodeUrl,
    });
    if (saveError) throw new Error(`Could not save Safe2Pay transaction (${saveError.code})`);

    return Response.json({
      registrationId: registration.registration_id,
      amountCents: registration.amount_cents,
      payment: {
        qrCode: charge.pixCopyPaste,
        qrCodeUrl: charge.qrCodeUrl,
        expiresAt: reservation.expires_at,
      },
    });
  } catch (error) {
    console.error("Could not create or save Safe2Pay manual Pix charge", {
      registrationId: registration.registration_id,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return errorResponse("Não foi possível concluir a cobrança Pix. Aguarde alguns minutos antes de tentar novamente.", 502);
  }
}
