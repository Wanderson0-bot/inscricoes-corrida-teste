"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useState } from "react";

type Choice = { id: string; name: string };
type CouponChoice = { id: string; code: string; discount_type: string; discount_value: number };
type PixPayment = { qrCode: string; qrCodeUrl: string; expiresAt: string };

export function ManualRegistrationForm({
  raceId, categories, teams, coupons,
}: { raceId: string; categories: Choice[]; teams: Choice[]; coupons: CouponChoice[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [payment, setPayment] = useState<PixPayment | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  async function submit(formData: FormData, form: HTMLFormElement) {
    setBusy(true);
    setMessage("");
    setSuccess(false);
    setPayment(null);
    try {
      const response = await fetch(`/api/painel/corridas/${raceId}/inscricoes/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...Object.fromEntries(formData), privacyConsent: formData.has("privacyConsent") }),
      });
      const result: unknown = await response.json();
      if (!response.ok || typeof result !== "object" || result === null) {
        const error = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error : "Não foi possível salvar a inscrição. Revise os dados e tente novamente.";
        setMessage(error);
        return;
      }
      const data = result as { amountCents?: number; payment?: PixPayment | null };
      form.reset();
      setPayment(data.payment ?? null);
      setSuccess(true);
      setMessage(data.amountCents === 0
        ? "Inscrição salva. O valor ficou zerado após o desconto, então não há cobrança Pix."
        : "Inscrição salva e cobrança Pix criada. O formulário está pronto para o próximo atleta.");
      router.refresh();
    } catch {
      setMessage("Não foi possível conectar ao servidor. Seus dados permanecem no formulário.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="manual-registration-layout">
      <div className="manual-registration-toolbar">
        <button type="button" className="button button-primary" onClick={() => { setIsOpen(true); setMessage(""); }}>Nova inscrição manual</button>
        {isOpen && <button type="button" className="button button-outline" onClick={() => setIsOpen(false)} disabled={busy}>Fechar formulário</button>}
      </div>
      {isOpen && <form className="form-grid manual-registration-form" onSubmit={(event) => {
        event.preventDefault();
        void submit(new FormData(event.currentTarget), event.currentTarget);
      }}>
        <div className="form-pair">
          <label>Nome completo<input name="participantName" autoComplete="name" required minLength={2} maxLength={160} /></label>
        </div>
        <div className="form-pair">
          <label>Data de nascimento<input name="birthDate" type="date" required max={new Date().toISOString().slice(0, 10)} /></label>
          <label>Sexo (opcional)<select name="sex" defaultValue=""><option value="">Não informado</option><option value="female">Feminino</option><option value="male">Masculino</option><option value="other">Outro</option><option value="prefer_not_to_say">Prefere não informar</option></select></label>
        </div>
        <div className="form-pair">
          <label>E-mail<input name="participantEmail" type="email" autoComplete="email" required maxLength={254} /></label>
          <label>CPF<input name="participantIdentity" inputMode="numeric" placeholder="000.000.000-00" required minLength={11} maxLength={14} /></label>
          <label>Telefone<input name="participantPhone" type="tel" autoComplete="tel" placeholder="(00) 00000-0000" required maxLength={16} /></label>
        </div>
        <div className="form-pair">
          <label>Categoria<select name="categoryId" required defaultValue=""><option value="" disabled>Selecione</option>{categories.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Equipe (opcional)<select name="teamId" defaultValue=""><option value="">Sem equipe</option>{teams.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        </div>
        <label>Cupom de desconto (opcional)<select name="couponCode" defaultValue=""><option value="">Sem cupom</option>{coupons.map((item) => <option value={item.code} key={item.id}>{item.code}</option>)}</select></label>
        <fieldset className="billing-address-fields">
          <legend>Endereço do atleta para a cobrança Pix</legend>
          <div className="form-pair"><label>CEP<input name="zipCode" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" required maxLength={9} /></label><label>Estado (UF)<input name="state" autoComplete="address-level1" placeholder="SP" required minLength={2} maxLength={2} /></label></div>
          <div className="form-pair"><label>Rua<input name="street" autoComplete="street-address" required maxLength={120} /></label><label>Número<input name="number" required maxLength={16} /></label></div>
          <div className="form-pair"><label>Bairro<input name="neighborhood" required maxLength={80} /></label><label>Cidade<input name="city" autoComplete="address-level2" required maxLength={80} /></label></div>
          <p className="small muted">CPF e endereço são enviados à Safe2Pay para processar o Pix e não são armazenados pela Let&apos;sRun.</p>
        </fieldset>
        <label className="check-label"><input name="privacyConsent" type="checkbox" required value="true" /><span>Confirmo que o atleta autorizou o uso destes dados para a inscrição e o pagamento.</span></label>
        {message && <p className={success ? "notice" : "error-message"} role={success ? "status" : "alert"}>{message}</p>}
        <button className="button button-primary" disabled={busy || categories.length === 0}>{busy ? "Salvando e gerando Pix…" : "Salvar inscrição"}</button>
      </form>}
      {payment && (
        <aside className="pix-payment-card">
          <p className="eyebrow">Pagamento Pix</p>
          <h3>Mostre o QR Code ao atleta</h3>
          <Image src={payment.qrCodeUrl} alt="QR Code Pix da inscrição" width={240} height={240} unoptimized />
          <label>Código Pix copia e cola<textarea readOnly rows={5} value={payment.qrCode} /></label>
          <p className="small muted">Válido até {new Date(payment.expiresAt).toLocaleString("pt-BR")}.</p>
          <button type="button" className="button button-secondary" onClick={() => void navigator.clipboard.writeText(payment.qrCode)}>Copiar código Pix</button>
        </aside>
      )}
    </div>
  );
}
