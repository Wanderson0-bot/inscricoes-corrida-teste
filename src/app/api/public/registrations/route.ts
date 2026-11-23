import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getAppUrl, getPrivacyPolicyVersion } from "@/lib/env";
import { createSafe2PayPixCharge } from "@/lib/payments/safe2pay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const registrationSchema = z.object({
  raceId: z.string().uuid(),
  categoryId: z.string().uuid(),
  teamId: z.union([z.string().uuid(), z.literal("")]).optional(),
  couponCode: z.string().trim().max(32).default(""),
  participantName: z.string().trim().min(2).max(160),
  participantIdentity: z.string().transform((value) => value.replace(/\D/g, "")).refine((value) => value.length === 11),
  participantEmail: z.string().trim().email().max(254),
  participantPhone: z.string().transform((value) => value.replace(/\D/g, "")).refine((value) => [10, 11].includes(value.length)),
  zipCode: z.string().transform((value) => value.replace(/\D/g, "")).refine((value) => value.length === 8),
  street: z.string().trim().min(2).max(150),
  number: z.string().trim().min(1).max(15),
  district: z.string().trim().min(2).max(60),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().regex(/^[A-Za-z]{2}$/),
  privacyConsent: z.literal(true),
});

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function registrationErrorMessage(code: string | null) {
  const messages: Record<string, string> = {
    race_not_available: "Esta corrida não está disponível",
    registration_closed: "As inscrições estão fechadas",
    category_not_found: "A categoria escolhida não está disponível",
    category_full: "As vagas desta categoria acabaram",
    team_not_found: "A equipe selecionada não é válida para esta corrida",
    coupon_invalid: "Este cupom não é válido",
    coupon_team_required: "Selecione uma equipe para usar este cupom",
    coupon_not_allowed_for_team: "Este cupom não é válido para a equipe escolhida",
    coupon_limit_reached: "Este cupom atingiu o limite de usos",
    duplicate_registration: "Este atleta já possui uma inscrição ativa nesta corrida",
    invalid_registration_data: "Confira os dados informados",
  };
  return messages[code ?? ""] ?? "Não foi possível concluir a inscrição";
}

async function cancelPendingRegistration(registrationId: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("registrations")
    .update({ status: "cancelled" })
    .eq("id", registrationId)
    .eq("status", "pending");
  if (error) {
    console.error("Could not release a pending registration after payment setup failure", {
      registrationId,
      code: error.code,
    });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Dados da inscrição inválidos.", 400);
  }

  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) return jsonError("Revise os dados e aceite a política de privacidade.", 400);

  const admin = createSupabaseAdminClient();
  const { data: rows, error: registrationError } = await admin.rpc("create_public_registration", {
    p_race_id: parsed.data.raceId,
    p_category_id: parsed.data.categoryId,
    p_team_id: parsed.data.teamId || null,
    p_coupon_code: parsed.data.couponCode,
    p_participant_name: parsed.data.participantName,
    p_participant_email: parsed.data.participantEmail,
    p_participant_phone: parsed.data.participantPhone,
    p_privacy_policy_version: getPrivacyPolicyVersion(),
  });
  if (registrationError) {
    if (registrationError.code === "23505") return jsonError("Este atleta já possui uma inscrição ativa nesta corrida.", 409);
    return jsonError(`${registrationErrorMessage(registrationError.message)}.`, 409);
  }

  const registration = rows?.[0];
  if (!registration) return jsonError("Não foi possível criar a inscrição.", 500);
  if (registration.amount_cents === 0) {
    return Response.json({ registrationId: registration.registration_id, amountCents: 0, payment: null });
  }

  let callbackUrl: URL;
  try {
    callbackUrl = new URL("/api/webhooks/safe2pay", getAppUrl());
  } catch {
    await cancelPendingRegistration(registration.registration_id);
    return jsonError("O endereço público seguro da aplicação não está configurado.", 503);
  }
  if (callbackUrl.protocol !== "https:") {
    await cancelPendingRegistration(registration.registration_id);
    return jsonError("O pagamento Pix só pode ser iniciado após configurar a URL pública HTTPS.", 503);
  }

  const [{ data: race, error: raceError }, { data: category, error: categoryError }, { data: reservation, error: reservationError }] = await Promise.all([
    admin.from("races").select("name").eq("id", parsed.data.raceId).single(),
    admin.from("race_categories").select("name").eq("id", parsed.data.categoryId).single(),
    admin.from("registrations").select("expires_at").eq("id", registration.registration_id).single(),
  ]);
  if (raceError || categoryError || reservationError || !race || !category || !reservation) {
    await cancelPendingRegistration(registration.registration_id);
    return jsonError("Não foi possível preparar o pagamento desta inscrição.", 500);
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
    console.error("Could not prepare Safe2Pay public payment", {
      registrationId: registration.registration_id,
      code: prepareError?.code ?? "missing_payment",
    });
    await cancelPendingRegistration(registration.registration_id);
    return jsonError("O pagamento Safe2Pay ainda não está habilitado para esta corrida.", 503);
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
        district: parsed.data.district,
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
    console.error("Could not create or save Safe2Pay public Pix charge", {
      registrationId: registration.registration_id,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return jsonError("Não foi possível concluir a cobrança Pix. Aguarde alguns minutos antes de tentar novamente.", 502);
  }
}
