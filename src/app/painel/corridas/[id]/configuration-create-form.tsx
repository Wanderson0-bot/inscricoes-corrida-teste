"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Choice = { id: string; name: string };
type Kind = "category" | "team" | "coupon";

export function ConfigurationCreateForm({ raceId, kind, teams = [] }: { raceId: string; kind: Kind; teams?: Choice[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const title = kind === "category" ? "Adicionar categoria" : kind === "team" ? "Adicionar equipe" : "Criar cupom";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = kind === "coupon"
      ? { ...Object.fromEntries(data), teamIds: data.getAll("teamIds") }
      : Object.fromEntries(data);
    setBusy(true);
    setMessage("");
    setSuccess(false);
    try {
      const response = await fetch(`/api/painel/corridas/${raceId}/cadastros/${kind}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        setMessage(typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "Não foi possível salvar. Confira os dados e tente novamente.");
        return;
      }
      form.reset();
      setMessage(`${title} salvo com sucesso.`);
      setSuccess(true);
      router.refresh();
    } catch {
      setMessage("Não foi possível conectar ao servidor. Os dados foram mantidos no formulário.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="form-grid compact-form config-create-form" onSubmit={(event) => void submit(event)}>
    <input type="hidden" name="raceId" value={raceId} />
    {kind === "category" && <><label>Nome<input name="name" required maxLength={100} /></label><div className="form-pair"><label>Preço (R$)<input name="price" type="number" step="0.01" min="0" required /></label><label>Vagas<input name="capacity" type="number" min="1" required /></label></div></>}
    {kind === "team" && <label>Nome da equipe<input name="name" required maxLength={100} /></label>}
    {kind === "coupon" && <><label>Código<input name="code" required minLength={2} maxLength={32} /></label><div className="form-pair"><label>Tipo<select name="discountType"><option value="percentage">Percentual</option><option value="fixed">Valor fixo (R$)</option></select></label><label>Desconto<input name="discountValue" type="number" min="0.01" step="0.01" required /></label></div><label>Usos máximos (opcional)<input name="usageLimit" type="number" min="1" step="1" /></label><fieldset><legend>Equipes permitidas (vazio para todas)</legend>{teams.map((team) => <label className="check-label" key={team.id}><input type="checkbox" name="teamIds" value={team.id} /><span>{team.name}</span></label>)}</fieldset></>}
    {message && <p className={success ? "notice" : "error-message"} role={success ? "status" : "alert"}>{message}</p>}
    <button className="button button-secondary" disabled={busy}>{busy ? "Salvando…" : title}</button>
  </form>;
}
