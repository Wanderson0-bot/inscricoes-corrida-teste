import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireOrganizer } from "@/lib/auth";
import { ManualRegistrationForm } from "./manual-registration-form";
import styles from "../../../organizer.module.css";

export const instant = false;
const pageSize = 25;
type Props = PageProps<"/painel/corridas/[id]/inscricoes">;

export default async function RaceRegistrationsPage({ params, searchParams }: Props) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const { supabase } = await requireOrganizer();
  const queryValue = (key: string) => {
    const value = query?.[key];
    return typeof value === "string" ? value : "";
  };
  const [{ data: race }, { data: categories }, { data: teams }, { data: coupons }] = await Promise.all([
    supabase.from("races").select("id, name").eq("id", id).single(),
    supabase.from("race_categories").select("id, name").eq("race_id", id).order("name"),
    supabase.from("race_teams").select("id, name").eq("race_id", id).order("name"),
    supabase.from("race_coupons").select("id, code, discount_type, discount_value").eq("race_id", id).eq("enabled", true).order("code"),
  ]);
  if (!race) notFound();

  const [total, online, manual, paid, pending] = await Promise.all([
    supabase.from("registrations").select("id", { count: "exact", head: true }).eq("race_id", id),
    supabase.from("registrations").select("id", { count: "exact", head: true }).eq("race_id", id).eq("source", "online"),
    supabase.from("registrations").select("id", { count: "exact", head: true }).eq("race_id", id).eq("source", "manual"),
    supabase.from("registrations").select("id", { count: "exact", head: true }).eq("race_id", id).eq("status", "paid"),
    supabase.from("registrations").select("id", { count: "exact", head: true }).eq("race_id", id).eq("status", "pending"),
  ]);

  const searchValue = queryValue("busca");
  const currentPage = Math.max(1, Math.min(10000, Number.parseInt(queryValue("pagina") || "1", 10) || 1));
  const sourceValue = queryValue("origem");
  const source = ["online", "manual"].includes(sourceValue) ? sourceValue : "";
  const paymentValue = queryValue("pagamento");
  const paymentStatus = ["approved", "pending", "rejected", "cancelled", "refunded"].includes(paymentValue) ? paymentValue : "";
  const categoryValue = queryValue("categoria");
  const categoryId = (categories ?? []).some((item) => item.id === categoryValue) ? categoryValue : "";
  const search = searchValue.trim().slice(0, 80).replace(/[,%()\\]/g, "");
  let registrationsQuery = supabase.from("registrations")
    .select("id, participant_name, participant_email, participant_phone, amount_cents, status, source, created_at, category_id, payments(provider, provider_payment_id, status, payment_method), race_categories(name)", { count: "exact" })
    .eq("race_id", id).order("created_at", { ascending: false });
  if (source) registrationsQuery = registrationsQuery.eq("source", source);
  if (paymentStatus) registrationsQuery = registrationsQuery.eq("payments.status", paymentStatus);
  if (categoryId) registrationsQuery = registrationsQuery.eq("category_id", categoryId);
  if (search) {
    const searchTerm = search.replace(/[%_*]/g, "");
    registrationsQuery = registrationsQuery.or(`participant_name.ilike.%${searchTerm}%,participant_email.ilike.%${searchTerm}%`);
  }
  const from = (currentPage - 1) * pageSize;
  const { data: registrations, count } = await registrationsQuery.range(from, from + pageSize - 1);
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const buildPageUrl = (page: number) => {
    const params = new URLSearchParams();
    if (searchValue) params.set("busca", searchValue);
    if (source) params.set("origem", source);
    if (paymentStatus) params.set("pagamento", paymentStatus);
    if (categoryId) params.set("categoria", categoryId);
    params.set("pagina", String(page));
    return `/painel/corridas/${id}/inscricoes?${params.toString()}`;
  };

  return (
    <main className={`container page-section ${styles.screen}`}>
      <Link className="back-link" href={`/painel/corridas/${id}?secao=inscricoes`}>← Gerenciar corrida</Link>
      <header className="dashboard-top race-admin-heading">
        <div><p className="eyebrow">Inscrições da corrida</p><h1>{race.name}</h1><p className="muted">Atletas online e cadastrados presencialmente.</p></div>
        <div className="export-links"><a href={`/api/painel/exportacao?corrida=${id}&tipo=inscricoes`}>Exportar CSV</a><a href={`/api/painel/exportacao?corrida=${id}&tipo=pagamentos`}>Pagamentos CSV</a></div>
      </header>

      <section className="registration-stat-grid" aria-label="Indicadores de inscrições">
        {[{ label: "Total de inscrições", value: total.count }, { label: "Online", value: online.count }, { label: "Manuais", value: manual.count }, { label: "Pagas", value: paid.count }, { label: "Pendentes", value: pending.count }].map((stat) => <article className="management-card" key={stat.label}><span className="muted">{stat.label}</span><strong>{stat.value ?? 0}</strong></article>)}
      </section>

      <section className="management-card manual-registration-panel">
        <div className="section-heading"><div><p className="eyebrow">Cadastro assistido</p><h2>Nova inscrição</h2></div></div>
        <ManualRegistrationForm raceId={id} categories={categories ?? []} teams={teams ?? []} coupons={coupons ?? []} />
      </section>

      <section className="management-card registrations-panel">
        <div className="section-heading"><div><p className="eyebrow">Lista de atletas</p><h2>{count ?? 0} resultados</h2></div></div>
        <form className="registration-filters" method="get">
          <label>Nome ou e-mail<input name="busca" defaultValue={searchValue} placeholder="Buscar atleta ou e-mail" /></label>
          <label>Categoria<select name="categoria" defaultValue={categoryId}><option value="">Todas</option>{(categories ?? []).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Origem<select name="origem" defaultValue={source}><option value="">Todas</option><option value="online">Online</option><option value="manual">Manual</option></select></label>
          <label>Pagamento<select name="pagamento" defaultValue={paymentStatus}><option value="">Todas</option><option value="approved">Pago</option><option value="pending">Pendente</option><option value="rejected">Recusado</option><option value="cancelled">Cancelado</option><option value="refunded">Estornado</option></select></label>
          <button className="button button-secondary">Filtrar</button>
        </form>
        {(registrations ?? []).length ? <div className="table-wrap"><table className="registrations-table">
          <thead><tr><th>Atleta</th><th>Categoria</th><th>Data</th><th>Origem</th><th>Pagamento</th><th>Situação</th><th>Ações</th></tr></thead>
          <tbody>{(registrations ?? []).map((registration) => {
            const payment = Array.isArray(registration.payments) ? registration.payments[0] : registration.payments;
            const category = Array.isArray(registration.race_categories) ? registration.race_categories[0] : registration.race_categories;
            return <tr key={registration.id}>
              <td><strong>{registration.participant_name}</strong><span>{registration.participant_email}</span><span>{registration.participant_phone || "Telefone não informado"}</span></td>
              <td>{category?.name ?? "—"}</td>
              <td>{new Date(registration.created_at).toLocaleDateString("pt-BR")}</td>
              <td><span className={`origin-pill origin-${registration.source}`}>{registration.source === "manual" ? "Manual" : "Online"}</span></td>
              <td>{payment ? <>{payment.payment_method === "pix" ? "Pix" : "Pagamento"} · {payment.provider === "pagarme" ? "Pagar.me (histórico)" : "Safe2Pay"}<span>{payment.provider_payment_id ?? ""}</span></> : "—"}</td>
              <td><span className={`status-pill status-${payment?.status ?? registration.status}`}>{payment?.status === "approved" ? "Pago" : payment?.status === "refunded" ? "Estornado" : payment?.status ?? registration.status}</span></td>
              <td><a href={`mailto:${registration.participant_email}`}>Contatar</a></td>
            </tr>;
          })}</tbody>
        </table></div> : <p className="muted empty-state">Nenhuma inscrição encontrada com esses filtros.</p>}
        <nav className="pagination-nav" aria-label="Paginação">
          <span className="muted">Página {Math.min(currentPage, totalPages)} de {totalPages}</span>
          <div>{currentPage > 1 && <Link className="button button-outline" href={buildPageUrl(currentPage - 1)}>Anterior</Link>}{currentPage < totalPages && <Link className="button button-outline" href={buildPageUrl(currentPage + 1)}>Próxima</Link>}</div>
        </nav>
      </section>
    </main>
  );
}
