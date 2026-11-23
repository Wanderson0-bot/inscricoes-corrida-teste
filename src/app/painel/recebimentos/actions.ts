"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrganizer } from "@/lib/auth";
import { createSafe2PaySubaccount } from "@/lib/payments/safe2pay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const subaccountSchema = z.object({
  accountType: z.enum(["individual", "company"]),
  name: z.string().trim().min(2).max(160),
  commercialName: z.string().trim().max(160).default(""),
  identity: z.string().transform((value) => value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()),
  email: z.string().trim().email().max(254),
  responsibleName: z.string().trim().max(160).default(""),
  responsibleIdentity: z.string().transform((value) => value.replace(/\D/g, "")).default(""),
  responsibleBirthDate: z.string().date(),
  responsiblePhone: z.string().transform((value) => value.replace(/\D/g, "")).refine((value) => [10, 11].includes(value.length)),
  zipCode: z.string().transform((value) => value.replace(/\D/g, "")).refine((value) => value.length === 8),
  street: z.string().trim().min(2).max(150),
  number: z.string().trim().min(1).max(15),
  district: z.string().trim().min(2).max(60),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().regex(/^[A-Za-z]{2}$/),
  bank: z.string().trim().regex(/^\d{3}$/),
  accountTypeCode: z.enum(["CC", "PP"]),
  bankAgency: z.string().trim().regex(/^\d{1,10}$/),
  bankAgencyDigit: z.string().trim().max(1).default(""),
  bankAccount: z.string().trim().regex(/^\d{1,15}$/),
  bankAccountDigit: z.string().trim().regex(/^[0-9Xx]$/),
  consent: z.literal("on"),
}).superRefine((data, context) => {
  if (data.accountType === "individual" && !/^\d{11}$/.test(data.identity)) {
    context.addIssue({ code: "custom", path: ["identity"], message: "Informe um CPF válido." });
  }
  if (data.accountType === "company" && !/^[A-Z0-9]{14}$/.test(data.identity)) {
    context.addIssue({ code: "custom", path: ["identity"], message: "Informe um CNPJ com 14 posições." });
  }
  if (data.accountType === "company" &&
      (!data.responsibleName || !/^\d{11}$/.test(data.responsibleIdentity))) {
    context.addIssue({ code: "custom", path: ["responsibleIdentity"], message: "Informe o nome e CPF do responsável legal." });
  }
  if (data.bankAgencyDigit && !/^[0-9Xx]$/.test(data.bankAgencyDigit)) {
    context.addIssue({ code: "custom", path: ["bankAgencyDigit"], message: "O dígito da agência deve ter um caractere." });
  }
  const birthDate = new Date(`${data.responsibleBirthDate}T00:00:00.000Z`);
  const oldestAllowedBirthDate = new Date();
  oldestAllowedBirthDate.setUTCFullYear(oldestAllowedBirthDate.getUTCFullYear() - 120);
  if (birthDate.getTime() > Date.now() || birthDate < oldestAllowedBirthDate) {
    context.addIssue({ code: "custom", path: ["responsibleBirthDate"], message: "Informe uma data de nascimento válida." });
  }
});

export async function createOrganizerSafe2PaySubaccount(formData: FormData) {
  const { supabase, profile } = await requireOrganizer();
  const parsed = subaccountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/painel/recebimentos?erro=validacao");

  const admin = createSupabaseAdminClient();
  const [{ data: settings, error: settingsError }, { data: existing, error: existingError }] = await Promise.all([
    admin.from("safe2pay_settings")
      .select("payout_frequency_code, payout_day, marketplace_ready_acknowledged, fee_policy_acknowledged")
      .eq("singleton", true)
      .single(),
    supabase.from("safe2pay_subaccounts")
      .select("safe2pay_subaccount_id")
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),
  ]);
  if (settingsError) throw new Error("Não foi possível verificar as configurações de recebimento.");
  if (existingError) throw new Error("Não foi possível verificar a subconta desta organização.");
  if (existing) redirect("/painel/recebimentos?erro=existente");
  if (!settings?.payout_frequency_code || !settings.marketplace_ready_acknowledged || !settings.fee_policy_acknowledged) {
    redirect("/painel/recebimentos?erro=configuracao");
  }

  const data = parsed.data;
  let subaccountId: number;
  try {
    subaccountId = await createSafe2PaySubaccount({
      accountType: data.accountType,
      name: data.name,
      commercialName: data.commercialName || undefined,
      identity: data.identity,
      email: data.email,
      responsibleName: data.responsibleName || data.name,
      responsibleIdentity: data.responsibleIdentity || data.identity,
      responsibleBirthDate: data.responsibleBirthDate,
      responsiblePhone: data.responsiblePhone,
      address: {
        zipCode: data.zipCode,
        street: data.street,
        number: data.number,
        district: data.district,
        city: data.city,
        state: data.state,
      },
      bank: data.bank,
      accountTypeCode: data.accountTypeCode,
      bankAgency: data.bankAgency,
      bankAgencyDigit: data.bankAgencyDigit || undefined,
      bankAccount: data.bankAccount,
      bankAccountDigit: data.bankAccountDigit.toUpperCase(),
      payoutFrequencyCode: settings.payout_frequency_code,
      payoutDay: settings.payout_day ?? undefined,
    });
  } catch (error) {
    console.error("Could not create Safe2Pay organizer subaccount", {
      organizationId: profile.organization_id,
      message: error instanceof Error ? error.message : "unknown_error",
    });
    redirect("/painel/recebimentos?erro=safe2pay");
  }

  const { error: saveError } = await admin.from("safe2pay_subaccounts").insert({
    organization_id: profile.organization_id,
    safe2pay_subaccount_id: subaccountId,
    account_type: data.accountType,
    status: "pending_review",
  });
  if (saveError) {
    console.error("Safe2Pay subaccount was created but could not be linked locally", {
      organizationId: profile.organization_id,
      safe2paySubaccountId: subaccountId,
      code: saveError.code,
    });
    redirect("/painel/recebimentos?erro=salvar");
  }

  revalidatePath("/painel/recebimentos");
  redirect("/painel/recebimentos?sucesso=criada");
}
