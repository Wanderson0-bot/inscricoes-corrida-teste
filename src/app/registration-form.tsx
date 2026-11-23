"use client";

import Image from "next/image";
import { useState } from "react";

type Choice = { id: string; name: string };
type PixPayment = { qrCode: string; qrCodeUrl: string; expiresAt: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function RegistrationForm({
  raceId,
  categories,
  teams,
}: {
  raceId: string;
  categories: Array<Choice & { price_cents: number; capacity: number }>;
  teams: Choice[];
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<PixPayment | null>(null);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    let result: Response;
    let body: unknown;
    try {
      result = await fetch("/api/public/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raceId,
          categoryId: formData.get("categoryId"),
          teamId: formData.get("teamId"),
          couponCode: formData.get("couponCode"),
          participantName: formData.get("participantName"),
          participantIdentity: formData.get("participantIdentity"),
          participantEmail: formData.get("participantEmail"),
          participantPhone: formData.get("participantPhone"),
          zipCode: formData.get("zipCode"),
          street: formData.get("street"),
          number: formData.get("number"),
          district: formData.get("district"),
          city: formData.get("city"),
          state: formData.get("state"),
          privacyConsent: formData.get("privacyConsent") === "on",
        }),
      });
      body = await result.json();
    } catch {
      setBusy(false);
      setMessage("Não foi possível conectar ao serviço de inscrição. Tente novamente.");
      return;
    }

    if (!result.ok || !isRecord(body)) {
      setBusy(false);
      setMessage(isRecord(body) && typeof body.error === "string"
        ? body.error
        : "Não foi possível iniciar a inscrição. Tente novamente.");
      return;
    }

    if (body.amountCents === 0 && typeof body.registrationId === "string") {
      window.location.assign(`/pagamento/retorno?status=gratuita&inscricao=${encodeURIComponent(body.registrationId)}`);
      return;
    }

    if (
      typeof body.registrationId !== "string" ||
      !isRecord(body.payment) ||
      typeof body.payment.qrCode !== "string" ||
      typeof body.payment.qrCodeUrl !== "string" ||
      typeof body.payment.expiresAt !== "string"
    ) {
      setBusy(false);
      setMessage("A inscrição foi recebida, mas o código Pix não pôde ser exibido. Aguarde a confirmação ou contate o organizador.");
      return;
    }

    setPayment({
      qrCode: body.payment.qrCode,
      qrCodeUrl: body.payment.qrCodeUrl,
      expiresAt: body.payment.expiresAt,
    });
    setMessage("Inscrição criada. Pague com o QR Code ou copie e cole o código Pix.");
    setBusy(false);
  }

  if (categories.length === 0) {
    return <p className="notice">As inscrições para esta corrida ainda não estão abertas.</p>;
  }

  return (
    <>
      <form
        className="form-grid"
        action={(formData) => {
          void submit(formData);
        }}
      >
        <label>
          Nome completo
          <input name="participantName" autoComplete="name" placeholder="Ex.: Nome Sobrenome" required minLength={2} maxLength={160} />
        </label>
        <label>
          CPF
          <input name="participantIdentity" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" required minLength={11} maxLength={14} />
        </label>
        <label>
          E-mail
          <input name="participantEmail" type="email" autoComplete="email" placeholder="Ex.: usuario@exemplo.com" required maxLength={254} />
        </label>
        <label>
          Telefone
          <input name="participantPhone" type="tel" autoComplete="tel" placeholder="Ex.: (00) 00000-0000" required maxLength={16} />
        </label>
        <fieldset className="billing-address-fields">
          <legend>Endereço para o pagamento Pix</legend>
          <div className="form-pair">
            <label>CEP<input name="zipCode" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" required maxLength={9} /></label>
            <label>Estado (UF)<input name="state" autoComplete="address-level1" placeholder="SP" required minLength={2} maxLength={2} /></label>
          </div>
          <div className="form-pair">
            <label>Rua<input name="street" autoComplete="street-address" required maxLength={150} /></label>
            <label>Número<input name="number" required maxLength={15} /></label>
          </div>
          <div className="form-pair">
            <label>Bairro<input name="district" required maxLength={60} /></label>
            <label>Cidade<input name="city" autoComplete="address-level2" required maxLength={100} /></label>
          </div>
        </fieldset>
        <label>
          Categoria
          <select name="categoryId" required defaultValue="">
            <option value="" disabled>Escolha uma categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} · {(category.price_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · {category.capacity} vagas
              </option>
            ))}
          </select>
        </label>
        {teams.length > 0 && (
          <label>
            Equipe (opcional)
            <select name="teamId" defaultValue="">
              <option value="">Sem equipe</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
        )}
        <label>
          Cupom (opcional)
          <input name="couponCode" autoCapitalize="characters" placeholder="Ex.: SEUCUPOM" maxLength={32} />
        </label>
        <label className="check-label">
          <input name="privacyConsent" type="checkbox" required disabled={busy || payment !== null} />
          <span>Li e aceito a <a href="/privacidade" target="_blank" rel="noreferrer">política de privacidade</a>.</span>
        </label>
        <p className="muted small">
          CPF e endereço são enviados à Safe2Pay para processar o Pix e não são armazenados pela Let&apos;sRun.
        </p>
        {message && <p className={payment ? "notice" : "error-message"} role={payment ? "status" : "alert"}>{message}</p>}
        <button className="button button-primary" disabled={busy || payment !== null}>
          {busy ? "Preparando pagamento..." : "Continuar para pagamento"}
        </button>
      </form>
      {payment && (
        <aside className="pix-payment-card">
          <p className="eyebrow">Pagamento Pix</p>
          <h3>Escaneie o QR Code ou use o Pix copia e cola</h3>
          <Image src={payment.qrCodeUrl} alt="QR Code Pix da inscrição" width={240} height={240} unoptimized />
          <label>Código Pix copia e cola<textarea readOnly rows={5} value={payment.qrCode} /></label>
          <p className="small muted">Válido até {new Date(payment.expiresAt).toLocaleString("pt-BR")}.</p>
          <button type="button" className="button button-secondary" onClick={() => void navigator.clipboard.writeText(payment.qrCode)}>Copiar código Pix</button>
        </aside>
      )}
    </>
  );
}
