"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth";
import { verifySafe2PaySubaccount } from "@/lib/payments/safe2pay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const settingsSchema = z.object({
  platformReceiverId: z.string().trim(),
  payoutFrequencyCode: z.enum(["", "1", "6", "7"]),
  payoutDay: z.string().trim(),
});

export async function updateSafe2PaySettings(formData: FormData) {
  const { user } = await requirePlatformAdmin();
  const parsed = settingsSchema.safeParse({
    platformReceiverId: formData.get("platformReceiverId"),
    payoutFrequencyCode: formData.get("payoutFrequencyCode"),
    payoutDay: formData.get("payoutDay"),
  });
  if (!parsed.success) redirect("/admin/financeiro?erro=validacao");

  const receiverId = parsed.data.platformReceiverId
    ? Number(parsed.data.platformReceiverId)
    : null;
  const frequency = parsed.data.payoutFrequencyCode || null;
  const submittedPayoutDay = parsed.data.payoutDay ? Number(parsed.data.payoutDay) : null;
  const payoutDay = frequency === "1" || frequency === "6" ? submittedPayoutDay : null;
  const paymentsEnabled = formData.has("paymentsEnabled");
  const marketplaceReadyAcknowledged = formData.has("marketplaceReadyAcknowledged");
  const feePolicyAcknowledged = formData.has("feePolicyAcknowledged");
  if (
    (receiverId !== null && (!Number.isSafeInteger(receiverId) || receiverId <= 0)) ||
    (frequency === "6" && (payoutDay === null || !Number.isInteger(payoutDay) || payoutDay < 2 || payoutDay > 6)) ||
    (frequency === "1" && (payoutDay === null || !Number.isInteger(payoutDay) || payoutDay < 1 || payoutDay > 31)) ||
    (paymentsEnabled && (!receiverId || !frequency || !marketplaceReadyAcknowledged || !feePolicyAcknowledged || !process.env.SAFE2PAY_API_KEY?.trim()))
  ) {
    redirect("/admin/financeiro?erro=configuracao");
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("safe2pay_settings").upsert({
    singleton: true,
    payments_enabled: paymentsEnabled,
    platform_receiver_id: receiverId,
    payout_frequency_code: frequency,
    payout_day: payoutDay,
    marketplace_ready_acknowledged: marketplaceReadyAcknowledged,
    fee_policy_acknowledged: feePolicyAcknowledged,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "singleton" });
  if (error) {
    console.error("Could not save Safe2Pay settings", { code: error.code });
    redirect("/admin/financeiro?erro=salvar");
  }

  revalidatePath("/admin/financeiro");
  revalidatePath("/painel/recebimentos");
  redirect("/admin/financeiro?sucesso=configuracao");
}

export async function updateSafe2PaySubaccountStatus(formData: FormData) {
  const { user } = await requirePlatformAdmin();
  const organizationId = z.string().uuid().safeParse(formData.get("organizationId"));
  const status = z.enum(["active", "suspended"]).safeParse(formData.get("status"));
  if (!organizationId.success || !status.success) redirect("/admin/financeiro?erro=validacao");

  const admin = createSupabaseAdminClient();
  const { data: subaccount, error: subaccountError } = await admin.from("safe2pay_subaccounts")
    .select("safe2pay_subaccount_id")
    .eq("organization_id", organizationId.data)
    .single();
  if (subaccountError || !subaccount) {
    console.error("Could not load Safe2Pay subaccount for review", { code: subaccountError?.code });
    redirect("/admin/financeiro?erro=subconta");
  }

  if (status.data === "active") {
    if (formData.get("confirmed") !== "on") redirect("/admin/financeiro?erro=confirmacao");
    let verificationReady = false;
    try {
      const verification = await verifySafe2PaySubaccount(subaccount.safe2pay_subaccount_id);
      verificationReady = verification.ready;
    } catch (error) {
      console.error("Could not verify Safe2Pay subaccount", {
        organizationId: organizationId.data,
        message: error instanceof Error ? error.message : "unknown_error",
      });
      redirect("/admin/financeiro?erro=verificacao");
    }
    if (!verificationReady) redirect("/admin/financeiro?erro=nao-pronta");
  }

  const { error } = await admin.from("safe2pay_subaccounts").update({
    status: status.data,
    verified_at: status.data === "active" ? new Date().toISOString() : null,
    activated_by: status.data === "active" ? user.id : null,
    updated_at: new Date().toISOString(),
  }).eq("organization_id", organizationId.data);
  if (error) {
    console.error("Could not update Safe2Pay subaccount status", { code: error.code });
    redirect("/admin/financeiro?erro=salvar");
  }

  revalidatePath("/admin/financeiro");
  revalidatePath("/painel/recebimentos");
  redirect("/admin/financeiro?sucesso=subconta");
}
