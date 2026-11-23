import { createHash } from "node:crypto";
import { lookupSafe2PayTransaction, mapSafe2PayStatus } from "@/lib/payments/safe2pay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function handleCallback(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    return Response.json({ error: "Invalid callback token." }, { status: 401 });
  }

  const callbackTokenHash = createHash("sha256").update(token).digest("hex");
  const admin = createSupabaseAdminClient();
  const { data: payment, error: paymentError } = await admin.from("payments")
    .select("provider_payment_id, provider_reference, amount_cents")
    .eq("provider", "safe2pay")
    .eq("callback_token_hash", callbackTokenHash)
    .single();
  if (paymentError?.code === "PGRST116") {
    return Response.json({ error: "Payment callback was not found." }, { status: 404 });
  }
  if (paymentError || !payment?.provider_reference) {
    console.error("Could not load Safe2Pay callback payment", { code: paymentError?.code ?? "missing_reference" });
    return Response.json({ error: "Payment callback could not be processed." }, { status: 500 });
  }

  let transaction;
  try {
    transaction = await lookupSafe2PayTransaction(payment.provider_reference);
  } catch (error) {
    console.error("Could not verify Safe2Pay callback against the API", {
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return Response.json({ error: "Payment status could not be verified." }, { status: 502 });
  }
  if (!transaction) {
    return Response.json({ error: "Safe2Pay transaction is not available yet." }, { status: 503 });
  }
  if (
    transaction.reference !== payment.provider_reference ||
    transaction.paymentMethod !== "6" ||
    transaction.amountCents !== payment.amount_cents ||
    (payment.provider_payment_id && payment.provider_payment_id !== transaction.id)
  ) {
    console.error("Safe2Pay callback transaction did not match the stored payment", {
      reference: payment.provider_reference,
      transactionId: transaction.id,
    });
    return Response.json({ error: "Safe2Pay transaction does not match the payment." }, { status: 422 });
  }

  const status = mapSafe2PayStatus(transaction);
  if (!status) {
    console.error("Safe2Pay returned an unmapped Pix status", {
      transactionId: transaction.id,
      statusCode: transaction.statusCode,
      message: transaction.message,
    });
    return Response.json({ error: "Safe2Pay returned an unsupported payment status." }, { status: 422 });
  }

  const { error: recordError } = await admin.rpc("record_safe2pay_notification", {
    p_callback_token_hash: callbackTokenHash,
    p_provider_payment_id: transaction.id,
    p_provider_status: status,
    p_provider_status_code: transaction.statusCode || "unknown",
    p_provider_status_message: transaction.message,
    p_amount_cents: transaction.amountCents,
    p_gateway_fee_cents: transaction.gatewayFeeCents,
    p_net_amount_cents: transaction.netAmountCents,
  });
  if (recordError) {
    console.error("Safe2Pay notification could not be recorded", {
      transactionId: transaction.id,
      code: recordError.code,
    });
    return Response.json({ error: "Payment notification could not be processed." }, { status: 500 });
  }
  return Response.json({ received: true });
}

export async function GET(request: Request) {
  return handleCallback(request);
}

export async function POST(request: Request) {
  return handleCallback(request);
}
