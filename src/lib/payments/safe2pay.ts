import { getSafe2PayConfig } from "@/lib/env";

type JsonRecord = Record<string, unknown>;

export type Safe2PayPaymentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired"
  | "refunded";

export type Safe2PayAddress = {
  zipCode: string;
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
};

export type Safe2PaySubaccountInput = {
  accountType: "individual" | "company";
  name: string;
  commercialName?: string;
  identity: string;
  email: string;
  responsibleName: string;
  responsibleIdentity: string;
  responsibleBirthDate: string;
  responsiblePhone: string;
  address: Safe2PayAddress;
  bank: string;
  accountTypeCode: "CC" | "PP";
  bankAgency: string;
  bankAgencyDigit?: string;
  bankAccount: string;
  bankAccountDigit: string;
  payoutFrequencyCode: "1" | "6" | "7";
  payoutDay?: number;
};

export type Safe2PayTransaction = {
  id: string;
  reference: string;
  statusCode: string;
  message: string;
  paymentMethod: string;
  amountCents: number;
  gatewayFeeCents: number | null;
  netAmountCents: number | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Safe2Pay response omitted ${field}`);
  }
  return value;
}

function integerId(value: unknown, field: string): string {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Safe2Pay response contained an invalid ${field}`);
  }
  return String(parsed);
}

function moneyToCents(value: unknown, field: string): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Safe2Pay response contained an invalid ${field}`);
  }
  return Math.round(amount * 100);
}

function optionalMoneyToCents(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  return moneyToCents(value, field);
}

async function safe2PayRequest(url: string, init: RequestInit = {}): Promise<JsonRecord> {
  const { apiKey } = getSafe2PayConfig();
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "X-API-KEY": apiKey,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Safe2Pay returned invalid JSON (${response.status})`);
  }
  if (!response.ok) throw new Error(`Safe2Pay request failed (${response.status})`);
  if (!isRecord(body) || body.HasError !== false) {
    throw new Error("Safe2Pay rejected the request");
  }
  return body;
}

export async function createSafe2PayPixCharge(input: {
  registrationId: string;
  raceName: string;
  categoryName: string;
  amountCents: number;
  identity: string;
  name: string;
  email: string;
  phone: string;
  address: Safe2PayAddress;
  callbackUrl: string;
  organizerReceiverId: number;
  platformReceiverId: number;
}) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error("Invalid Safe2Pay charge amount");
  }
  const callbackUrl = new URL(input.callbackUrl);
  if (callbackUrl.protocol !== "https:") {
    throw new Error("Safe2Pay requires a publicly reachable HTTPS callback URL");
  }
  if (!Number.isSafeInteger(input.organizerReceiverId) || !Number.isSafeInteger(input.platformReceiverId)) {
    throw new Error("Invalid Safe2Pay receiver ID");
  }

  const { application } = getSafe2PayConfig();
  const body = await safe2PayRequest("https://payment.safe2pay.com.br/v2/payment", {
    method: "POST",
    body: JSON.stringify({
      IsSandbox: false,
      Application: application,
      CallbackUrl: callbackUrl.toString(),
      PaymentMethod: "6",
      Reference: input.registrationId,
      Customer: {
        Name: input.name,
        Identity: input.identity.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
        Email: input.email,
        Phone: input.phone.replace(/\D/g, ""),
        Address: {
          ZipCode: input.address.zipCode.replace(/\D/g, ""),
          Street: input.address.street,
          Number: input.address.number,
          District: input.address.district,
          CityName: input.address.city,
          StateInitials: input.address.state.toUpperCase(),
          CountryName: "Brasil",
        },
      },
      Products: [{
        Code: input.registrationId,
        Description: `${input.raceName} - ${input.categoryName}`.slice(0, 200),
        UnitPrice: input.amountCents / 100,
        Quantity: 1,
      }],
      PaymentObject: { Expiration: 1800 },
      Splits: [
        { CodeTaxType: 1, IdReceiver: input.organizerReceiverId, Amount: 95 },
        { CodeTaxType: 1, IdReceiver: input.platformReceiverId, Amount: 5 },
      ],
    }),
  });

  if (!isRecord(body.ResponseDetail)) throw new Error("Safe2Pay response omitted transaction details");
  const details = body.ResponseDetail;
  const qrCodeUrl = requiredString(details.QrCode, "Pix QR Code URL");
  const qrUrl = new URL(qrCodeUrl);
  if (qrUrl.protocol !== "https:" || qrUrl.hostname !== "images.safe2pay.com.br") {
    throw new Error("Safe2Pay returned an unexpected Pix QR Code URL");
  }

  return {
    transactionId: integerId(details.IdTransaction, "transaction ID"),
    qrCodeUrl,
    pixCopyPaste: requiredString(details.Key, "Pix copy-and-paste code"),
  };
}

export async function lookupSafe2PayTransaction(reference: string): Promise<Safe2PayTransaction | null> {
  const url = new URL("https://api.safe2pay.com.br/v2/transaction/reference");
  url.searchParams.set("reference", reference);
  const body = await safe2PayRequest(url.toString(), { method: "GET" });
  if (!isRecord(body.ResponseDetail) || !Array.isArray(body.ResponseDetail.Objects)) {
    throw new Error("Safe2Pay response omitted transaction search results");
  }

  const matches = body.ResponseDetail.Objects.filter(isRecord);
  if (matches.length === 0) return null;
  if (matches.length !== 1) throw new Error("Safe2Pay returned multiple transactions for one reference");
  const transaction = matches[0];
  if (requiredString(transaction.Reference, "transaction reference") !== reference) {
    throw new Error("Safe2Pay returned a different transaction reference");
  }

  return {
    id: integerId(transaction.IdTransaction, "transaction ID"),
    reference,
    statusCode: String(transaction.Status ?? ""),
    message: requiredString(transaction.Message, "transaction status"),
    paymentMethod: String(transaction.PaymentMethod ?? ""),
    amountCents: moneyToCents(transaction.Amount, "transaction amount"),
    gatewayFeeCents: optionalMoneyToCents(transaction.TaxValue, "transaction fee"),
    netAmountCents: optionalMoneyToCents(transaction.NetValue, "net transaction amount"),
  };
}

export function mapSafe2PayStatus(transaction: Pick<Safe2PayTransaction, "statusCode" | "message">): Safe2PayPaymentStatus | null {
  const message = transaction.message.trim().toLocaleLowerCase("pt-BR");
  if (message.includes("estornado") || message.includes("devolvido")) return "refunded";
  if (message.includes("expirado")) return "expired";
  if (message.includes("recusado") || message.includes("não autorizado") || message.includes("nao autorizado")) return "rejected";
  if (message.includes("cancelado") || message.includes("cancelada")) return "cancelled";
  if (message.includes("autorizado") || transaction.statusCode === "3") return "approved";
  if (message.includes("pendente") || transaction.statusCode === "1") return "pending";
  return null;
}

export async function createSafe2PaySubaccount(input: Safe2PaySubaccountInput): Promise<number> {
  const { payoutFrequencyCode, payoutDay, ...details } = input;
  const address = {
    ZipCode: details.address.zipCode.replace(/\D/g, ""),
    Street: details.address.street,
    Number: details.address.number,
    District: details.address.district,
    CityName: details.address.city,
    StateInitials: details.address.state.toUpperCase(),
    CountryName: "Brasil",
  };
  const body = await safe2PayRequest("https://api.safe2pay.com.br/v2/marketplace/add", {
    method: "POST",
    body: JSON.stringify({
      Name: details.name,
      ...(details.commercialName ? { CommercialName: details.commercialName } : {}),
      Identity: details.identity.replace(/[^a-zA-Z0-9]/g, "").toUpperCase(),
      Email: details.email,
      ResponsibleName: details.responsibleName,
      ResponsibleIdentity: details.responsibleIdentity.replace(/\D/g, ""),
      ResponsibleBirthDate: details.responsibleBirthDate,
      ResponsiblePhone: details.responsiblePhone.replace(/\D/g, ""),
      Address: address,
      BankData: {
        Bank: { Code: details.bank },
        AccountType: { Code: details.accountTypeCode },
        BankAgency: details.bankAgency,
        ...(details.bankAgencyDigit ? { BankAgencyDigit: details.bankAgencyDigit } : {}),
        BankAccount: details.bankAccount,
        BankAccountDigit: details.bankAccountDigit,
      },
      MerchantPaymentDate: {
        PlanFrequence: { Code: payoutFrequencyCode },
        ...(payoutDay ? { PaymentDay: payoutDay } : {}),
      },
    }),
  });
  if (!isRecord(body.ResponseDetail)) throw new Error("Safe2Pay response omitted subaccount details");
  return Number(integerId(body.ResponseDetail.Id, "subaccount ID"));
}

export async function verifySafe2PaySubaccount(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid Safe2Pay subaccount ID");
  const url = new URL("https://api.safe2pay.com.br/v2/marketplace/get");
  url.searchParams.set("id", String(id));
  const body = await safe2PayRequest(url.toString(), { method: "GET" });
  if (!isRecord(body.ResponseDetail)) throw new Error("Safe2Pay response omitted subaccount details");
  const details = body.ResponseDetail;
  if (Number(details.Id) !== id || !Array.isArray(details.PaymentMethods)) {
    throw new Error("Safe2Pay returned invalid subaccount details");
  }
  const pixEnabled = details.PaymentMethods.some((method) =>
    isRecord(method) && String(method.PaymentMethod) === "6" && method.IsEnabled !== false,
  );
  return {
    pixEnabled,
    transfersEnabled: details.IsTransferCheckingAccountDisabled === false,
    ready: pixEnabled && details.IsTransferCheckingAccountDisabled === false,
  };
}
