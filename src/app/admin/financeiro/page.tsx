import Link from "next/link";
import { connection } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";
import { updateSafe2PaySettings, updateSafe2PaySubaccountStatus } from "./actions";

export const instant = false;

function first<T>(value: T[] | T | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function formatMoney(cents: number | null | undefined) {
  return ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function PlatformFinancePage({ searchParams }: PageProps<"/admin/financeiro">) {
  await connection();
  const query = await searchParams;
  const { supabase } = await requirePlatformAdmin();
  const [settingsResult, subaccountsResult, summaryResult, paymentsResult] = await Promise.all([
    supabase.from("safe2pay_settings")
      .select("payments_enabled, platform_receiver_id, payout_frequency_code, payout_day, marketplace_ready_acknowledged, fee_policy_acknowledged, updated_at")
      .eq("singleton", true)
      .single(),
    supabase.from("safe2pay_subaccounts")
      .select("organization_id, safe2pay_subaccount_id, account_type, status, verified_at, created_at, organizations(name)")
      .order("created_at", { ascending: false }),
    supabase.rpc("get_platform_finance_summary"),
    supabase.from("payments")
      .select("provider, provider_payment_id, amount_cents, status, updated_at, registrations!inner(participant_name, organizations(name))")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if (settingsResult.error || subaccountsResult.error || summaryResult.error || paymentsResult.error) {
    throw new Error("Não foi possível carregar o painel financeiro da plataforma.");
  }

  const settings = settingsResult.data;
  const summary = first(summaryResult.data);
  const errors: Record<string, string> = {
    validacao: "Confira os dados enviados.",
    configuracao: "Não é possível ativar pagamentos sem chave Safe2Pay, recebedor, frequência, confirmação de ativação Marketplace e confirmação de tarifas.",
    salvar: "Não foi possível salvar a alteração.",
    subconta: "Não foi possível localizar a subconta.",
    confirmacao: "Confirme a aprovação da subconta no painel Safe2Pay antes de ativá-la.",
    "nao-pronta": "A consulta Safe2Pay não confirmou Pix habilitado e repasses disponíveis para esta subconta.",
    verificacao: "Não foi possível verificar a subconta na Safe2Pay.",
  };
  const errorMessage = typeof query?.erro === "string" ? errors[query.erro] : null;
  const successMessage = query?.sucesso === "configuracao"
    ? "Configurações Safe2Pay atualizadas."
    : query?.sucesso === "subconta"
      ? "Status da subconta atualizado."
      : null;
  const apiKeyConfigured = !!process.env.SAFE2PAY_API_KEY?.trim();

  return (
    <main className="container page-section">
      <Link className="back-link" href="/">← Let&apos;sRun</Link>
      <header className="dashboard-top">
        <div><p className="eyebrow">Administração da plataforma</p><h1>Financeiro Safe2Pay</h1><p className="muted">O split de pagamentos é fixo: 95% para o organizador e 5% para a Let&apos;sRun.</p></div>
      </header>
      {errorMessage && <p className="error-message" role="alert">{errorMessage}</p>}
      {successMessage && <p className="notice" role="status">{successMessage}</p>}

      <section className="registration-stat-grid" aria-label="Resumo financeiro">
        {[
          { label: "Cobranças Safe2Pay", value: summary?.safe2pay_payment_count ?? 0 },
          { label: "Valor registrado Safe2Pay", value: formatMoney(summary?.safe2pay_gross_cents) },
          { label: "Comissão líquida Let'sRun", value: formatMoney(summary?.safe2pay_commission_cents) },
          { label: "Tarifas Safe2Pay reportadas", value: formatMoney(summary?.safe2pay_gateway_fee_cents) },
          { label: "Pagamentos históricos Pagar.me", value: summary?.historical_pagarme_payment_count ?? 0 },
          { label: "Valores históricos Pagar.me", value: formatMoney(summary?.historical_pagarme_amount_cents) },
        ].map((item) => <article className="management-card" key={item.label}><span className="muted">{item.label}</span><strong>{item.value}</strong></article>)}
      </section>

      <section className="management-card">
        <p className="eyebrow">Configuração global</p>
        <h2>Ativação de novas cobranças</h2>
        <p className="muted">A chave Safe2Pay fica somente no servidor. PIX não tem ambiente sandbox; não use este painel para cobranças de teste.</p>
        <p className="small">{apiKeyConfigured ? "Chave de API configurada no servidor." : "SAFE2PAY_API_KEY não está configurada no servidor."}</p>
        <form action={updateSafe2PaySettings} className="form-grid compact-form">
          <label>ID do recebedor da Let&apos;sRun<input name="platformReceiverId" inputMode="numeric" defaultValue={settings.platform_receiver_id ?? ""} /></label>
          <label>Frequência de repasse
            <select name="payoutFrequencyCode" defaultValue={settings.payout_frequency_code ?? ""}>
              <option value="">Selecione antes de criar subcontas</option>
              <option value="1">Mensal</option>
              <option value="6">Semanal</option>
              <option value="7">Diário</option>
            </select>
          </label>
          <label>Dia do repasse mensal/semanal
            <input name="payoutDay" type="number" min={settings.payout_frequency_code === "6" ? 2 : 1} max={settings.payout_frequency_code === "6" ? 6 : 31} defaultValue={settings.payout_day ?? ""} />
          </label>
          <label className="check-label"><input name="marketplaceReadyAcknowledged" type="checkbox" defaultChecked={settings.marketplace_ready_acknowledged} /><span>Confirmei que a conta Marketplace Safe2Pay está habilitada para receber Pix e executar split.</span></label>
          <label className="check-label"><input name="feePolicyAcknowledged" type="checkbox" defaultChecked={settings.fee_policy_acknowledged} /><span>Revisei o contrato e as tarifas padrão da Safe2Pay, inclusive o custo relacionado à frequência de repasse.</span></label>
          <label className="check-label"><input name="paymentsEnabled" type="checkbox" defaultChecked={settings.payments_enabled} /><span>Permitir novas cobranças Pix via Safe2Pay.</span></label>
          <button className="button button-secondary">Salvar configuração</button>
        </form>
        <p className="small muted">O provedor não documenta um campo de aprovação da subconta na API. A ativação exige conferência administrativa no painel Safe2Pay e consulta de Pix/repasses disponíveis.</p>
      </section>

      <section className="management-card">
        <p className="eyebrow">Organizadores</p>
        <h2>Subcontas Safe2Pay</h2>
        {(subaccountsResult.data ?? []).length ? <div className="table-wrap"><table className="registrations-table">
          <thead><tr><th>Organização</th><th>ID Safe2Pay</th><th>Tipo</th><th>Status interno</th><th>Revisão</th><th>Ação</th></tr></thead>
          <tbody>{subaccountsResult.data.map((subaccount) => {
            const organization = first(subaccount.organizations);
            return <tr key={subaccount.organization_id}>
              <td>{organization?.name ?? subaccount.organization_id}</td>
              <td>{subaccount.safe2pay_subaccount_id}</td>
              <td>{subaccount.account_type === "company" ? "PJ" : "PF"}</td>
              <td>{subaccount.status === "active" ? "Ativa" : subaccount.status === "suspended" ? "Suspensa" : "Pendente"}</td>
              <td>{subaccount.verified_at ? new Date(subaccount.verified_at).toLocaleDateString("pt-BR") : "—"}</td>
              <td>
                <form action={updateSafe2PaySubaccountStatus} className="form-grid compact-form">
                  <input type="hidden" name="organizationId" value={subaccount.organization_id} />
                  {subaccount.status === "active"
                    ? <><input type="hidden" name="status" value="suspended" /><button className="button button-outline">Suspender</button></>
                    : <><input type="hidden" name="status" value="active" /><label className="check-label"><input name="confirmed" type="checkbox" required /><span>Confirmei aprovação e repasses no painel Safe2Pay.</span></label><button className="button button-secondary">Verificar e ativar</button></>}
                </form>
              </td>
            </tr>;
          })}</tbody>
        </table></div> : <p className="muted">Ainda não há subcontas cadastradas.</p>}
      </section>

      <section className="management-card">
        <p className="eyebrow">Histórico financeiro</p>
        <h2>Pagamentos recentes</h2>
        <p className="muted">Registros antigos continuam disponíveis para consulta e não geram chamadas à API Pagar.me.</p>
        {(paymentsResult.data ?? []).length ? <div className="table-wrap"><table className="registrations-table">
          <thead><tr><th>Gateway</th><th>Inscrição</th><th>Participante</th><th>Valor</th><th>Status</th><th>Atualizado</th></tr></thead>
          <tbody>{paymentsResult.data.map((payment, index) => {
            const registration = first(payment.registrations);
            return <tr key={`${payment.provider}-${payment.provider_payment_id ?? index}`}>
              <td>{payment.provider === "pagarme" ? "Pagar.me (histórico)" : "Safe2Pay"}</td>
              <td>{payment.provider_payment_id ?? "—"}</td>
              <td>{registration?.participant_name ?? "—"}</td>
              <td>{formatMoney(payment.amount_cents)}</td>
              <td>{payment.status}</td>
              <td>{new Date(payment.updated_at).toLocaleString("pt-BR")}</td>
            </tr>;
          })}</tbody>
        </table></div> : <p className="muted">Nenhum pagamento registrado.</p>}
      </section>
    </main>
  );
}
