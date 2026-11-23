import Link from "next/link";
import { connection } from "next/server";
import { requireOrganizer } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Safe2PaySubaccountForm } from "./subaccount-form";
import styles from "../organizer.module.css";

export const instant = false;

export default async function OrganizerReceivablesPage({ searchParams }: PageProps<"/painel/recebimentos">) {
  await connection();
  const query = await searchParams;
  const { supabase, profile } = await requireOrganizer();
  const [{ data: subaccount, error: subaccountError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("safe2pay_subaccounts")
      .select("safe2pay_subaccount_id, account_type, status, verified_at, created_at")
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),
    createSupabaseAdminClient().from("safe2pay_settings")
      .select("payout_frequency_code, marketplace_ready_acknowledged, fee_policy_acknowledged")
      .eq("singleton", true)
      .single(),
  ]);
  if (subaccountError || settingsError) throw new Error("Não foi possível carregar as configurações de recebimento.");

  const canCreate = !!settings?.payout_frequency_code && settings.marketplace_ready_acknowledged && settings.fee_policy_acknowledged;
  const errorMessage = query?.erro === "validacao"
    ? "Revise os dados cadastrais e bancários."
    : query?.erro === "existente"
      ? "Esta organização já possui uma subconta Safe2Pay vinculada."
      : query?.erro === "configuracao"
        ? "O administrador ainda não configurou frequência de repasse e política de tarifas."
        : query?.erro === "safe2pay"
          ? "A Safe2Pay não aceitou o cadastro. Confira os dados e tente novamente."
          : query?.erro === "salvar"
            ? "A subconta foi criada na Safe2Pay, mas não pôde ser vinculada à organização. Contate o suporte antes de tentar novamente."
            : null;

  return (
    <main className={`container page-section ${styles.screen}`}>
      <Link className="back-link" href="/painel">← Painel</Link>
      <header className="dashboard-top">
        <div><p className="eyebrow">Recebimentos</p><h1>Subconta Safe2Pay</h1><p className="muted">Configure a conta que receberá a parcela de 95% dos pagamentos.</p></div>
      </header>
      {query?.sucesso === "criada" && <p className="notice" role="status">Subconta criada. Ela ficará indisponível para cobranças até a revisão e ativação administrativa.</p>}
      {errorMessage && <p className="error-message" role="alert">{errorMessage}</p>}
      {subaccount ? (
        <section className="management-card">
          <p className="eyebrow">Status da subconta</p>
          <h2>{subaccount.status === "active" ? "Ativa" : subaccount.status === "suspended" ? "Suspensa" : "Aguardando revisão"}</h2>
          <p>Identificador Safe2Pay: <strong>{subaccount.safe2pay_subaccount_id}</strong></p>
          <p>Cadastro: {subaccount.account_type === "company" ? "Pessoa jurídica" : "Pessoa física"}</p>
          <p className="muted">A API de consulta não expõe um status de aprovação. A ativação ocorre após revisão administrativa da conta e da disponibilidade de Pix e repasses.</p>
        </section>
      ) : canCreate ? (
        <section className="management-card">
          <p className="eyebrow">Cadastro de recebimento</p>
          <h2>Criar subconta Safe2Pay</h2>
          <Safe2PaySubaccountForm />
        </section>
      ) : (
        <section className="management-card">
          <p className="eyebrow">Configuração pendente</p>
          <h2>Cadastro indisponível</h2>
          <p className="muted">O administrador precisa confirmar que o Marketplace está ativo, configurar a frequência de repasse e revisar a política de tarifas antes de criar subcontas.</p>
        </section>
      )}
    </main>
  );
}
