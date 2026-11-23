import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  createCourtesyRule, deleteCategory, deleteCoupon, deleteTeam, grantCourtesy, updateCategory, updateCoupon, updateRace, updateTeam,
} from "@/app/actions";
import { requireOrganizer } from "@/lib/auth";
import { ConfigurationCreateForm } from "./configuration-create-form";
import styles from "../../organizer.module.css";

export const instant = false;
type CourtesyProgress = { rule_id: string; paid_count: number; granted_count: number; eligible_count: number; remaining_to_next: number };
function isCourtesyProgress(value: unknown): value is CourtesyProgress {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.rule_id === "string" && typeof row.paid_count === "number" && typeof row.granted_count === "number" && typeof row.eligible_count === "number" && typeof row.remaining_to_next === "number";
}

const sections = [
  ["overview", "Visão geral"], ["details", "Detalhes da corrida"], ["categories", "Categorias, preços e vagas"],
  ["teams", "Equipes participantes"], ["coupons", "Cupons de desconto"], ["registrations", "Inscrições"],
  ["finance", "Financeiro e pagamentos"], ["regulation", "Regulamento"], ["courtesies", "Cortesias"],
] as const;

function isMissingRegulationColumn(error: { code?: string; message?: string } | null) {
  return !!error && (error.code === "42703" || error.code === "PGRST204" || /regulation/i.test(error.message ?? ""));
}

export default async function ManageRacePage({ params, searchParams }: PageProps<"/painel/corridas/[id]">) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const requestedSection = typeof query?.secao === "string" ? query.secao : "overview";
  const activeSection = sections.some(([key]) => key === requestedSection) ? requestedSection : "overview";
  const { supabase, profile } = await requireOrganizer();
  let { data: race, error: raceError } = await supabase.from("races")
    .select("id, name, slug, description, regulation, location, starts_at, published, cover_image_path")
    .eq("id", id).single();
  if (isMissingRegulationColumn(raceError)) {
    const fallback = await supabase.from("races")
      .select("id, name, slug, description, location, starts_at, published, cover_image_path")
      .eq("id", id).single();
    race = fallback.data ? { ...fallback.data, regulation: "" } : null;
    raceError = fallback.error;
  }
  if (raceError?.code === "PGRST116" || (!race && !raceError)) notFound();
  if (raceError) {
    console.error("Failed to load managed race", { code: raceError.code, message: raceError.message });
    throw new Error("Não foi possível carregar os dados desta corrida.");
  }
  if (!race) notFound();

  const [categoriesResult, teamsResult, couponsResult, rulesResult, counts, progressResult, subaccountResult] = await Promise.all([
    supabase.from("race_categories").select("id, name, price_cents, capacity").eq("race_id", id).order("name"),
    supabase.from("race_teams").select("id, name").eq("race_id", id).order("name"),
    supabase.from("race_coupons").select("id, code, discount_type, discount_value, usage_limit, enabled, race_coupon_teams(team_id)").eq("race_id", id).order("code"),
    supabase.from("courtesy_rules").select("id, team_id, coupon_id, paid_entries_required, maximum_courtesies").eq("race_id", id),
    Promise.all([
      supabase.from("registrations").select("id", { count: "exact", head: true }).eq("race_id", id),
      supabase.from("registrations").select("id", { count: "exact", head: true }).eq("race_id", id).eq("status", "paid"),
      supabase.from("registrations").select("id", { count: "exact", head: true }).eq("race_id", id).eq("status", "pending"),
    ]),
    supabase.rpc("get_courtesy_progress", { p_race_id: id }),
    supabase.from("safe2pay_subaccounts").select("safe2pay_subaccount_id, status").eq("organization_id", profile.organization_id).maybeSingle(),
  ]);
  const categories = categoriesResult.data ?? [];
  const teams = teamsResult.data ?? [];
  const coupons = couponsResult.data ?? [];
  const rules = rulesResult.data ?? [];
  const errors = [categoriesResult.error, teamsResult.error, couponsResult.error, rulesResult.error, subaccountResult.error].some(Boolean);
  const [totalCount, paidCount, pendingCount] = counts;
  const progressRows = progressResult.data;
  const base = `/painel/corridas/${id}`;
  const backTo = (section: string) => `${base}?secao=${section}`;
  const formatMoney = (amount: number) => (amount / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <main className={`container page-section ${styles.screen}`}>
      <Link className="back-link" href="/painel">← Todas as corridas</Link>
      <header className="dashboard-top race-admin-heading">
        <div><p className="eyebrow">{race.published ? "Página pública ativa" : "Rascunho"}</p><h1>{race.name}</h1><p className="muted">{new Date(race.starts_at).toLocaleDateString("pt-BR", { dateStyle: "long" })} · {race.location || "Local não informado"}</p></div>
        {race.published && <Link className="button button-outline" href={`/corridas/${race.slug}`} target="_blank">Ver página pública ↗</Link>}
      </header>
      {query?.erro && <p className="error-message" role="alert">
        {query.erro === "imagem-invalida"
          ? "A imagem precisa ser JPG, PNG ou WebP e ter no máximo 5 MB."
          : query.erro === "upload-imagem"
            ? "Não foi possível enviar ou salvar a imagem. Tente novamente."
          : "Não foi possível salvar esta alteração. Confira os dados e tente novamente."}
      </p>}
      {errors && <p className="notice" role="status">Algumas informações não puderam ser carregadas. Atualize a página e tente novamente.</p>}

      <nav className="race-section-nav" aria-label="Seções de gerenciamento da corrida">
        {sections.map(([key, label]) => <Link href={backTo(key)} key={key} aria-current={activeSection === key ? "page" : undefined}>{label}</Link>)}
      </nav>

      {activeSection === "overview" && <section className="management-card race-overview-section">
        <p className="eyebrow">Resumo da corrida</p><h2>Visão geral</h2>
        <div className="registration-stat-grid">
          {[{ label: "Inscrições", value: totalCount.count }, { label: "Pagas", value: paidCount.count }, { label: "Pendentes", value: pendingCount.count }, { label: "Categorias", value: categories.length }, { label: "Equipes", value: teams.length }].map((item) => <article className="management-card" key={item.label}><span className="muted">{item.label}</span><strong>{item.value ?? 0}</strong></article>)}
        </div>
        <p className="muted">Use as seções acima para configurar a corrida e administrar os atletas.</p>
        <Link className="button button-primary" href={`${base}/inscricoes`}>Abrir inscrições</Link>
      </section>}

      {activeSection === "details" && <section className="management-card">
        <p className="eyebrow">Configuração</p><h2>Detalhes da corrida</h2>
        <form action={updateRace} className="form-grid compact-form">
          <input type="hidden" name="raceId" value={race.id} />
          <input type="hidden" name="regulation" value={race.regulation} />
          <label>Nome<input name="name" defaultValue={race.name} required minLength={2} maxLength={160} /></label>
          <label>Endereço público<input name="slug" defaultValue={race.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>
          <label>Data e horário<input name="startsAt" type="datetime-local" defaultValue={new Date(race.starts_at).toISOString().slice(0, 16)} required /></label>
          <label>Local<input name="location" defaultValue={race.location} maxLength={240} /></label>
          {race.cover_image_path && <div className="race-cover-preview" role="img" aria-label={`Imagem de capa atual da corrida ${race.name}`} style={{ backgroundImage: `url("${supabase.storage.from("race-covers").getPublicUrl(race.cover_image_path).data.publicUrl}")` }} />}
          <label>Imagem de capa (JPG, PNG ou WebP; até 5 MB)<input name="coverImage" type="file" accept="image/jpeg,image/png,image/webp" /></label>
          <label>Descrição<textarea name="description" rows={4} defaultValue={race.description} maxLength={4000} /></label>
          <label className="check-label"><input name="published" type="checkbox" defaultChecked={race.published} /><span>Publicar a página da corrida</span></label>
          <button className="button button-secondary">Salvar detalhes</button>
        </form>
      </section>}

      {activeSection === "categories" && <section className="management-card">
        <p className="eyebrow">Categorias</p><h2>Preços e vagas</h2>
        {categories.length ? <ul className="compact-list">{categories.map((category) => <li key={category.id}>
          <details className="record-editor"><summary><strong>{category.name}</strong><span>{formatMoney(category.price_cents)} · {category.capacity} vagas</span></summary>
            <form action={updateCategory} className="form-grid compact-form"><input type="hidden" name="raceId" value={race.id} /><input type="hidden" name="categoryId" value={category.id} />
              <label>Categoria<input name="name" defaultValue={category.name} required maxLength={100} /></label>
              <div className="form-pair"><label>Preço (R$)<input name="price" type="number" step="0.01" min="0" defaultValue={(category.price_cents / 100).toFixed(2)} required /></label><label>Vagas<input name="capacity" type="number" min="1" defaultValue={category.capacity} required /></label></div>
              <button className="button button-secondary">Salvar categoria</button>
            </form>
            <form action={deleteCategory} className="compact-delete-form"><input type="hidden" name="raceId" value={race.id} /><input type="hidden" name="categoryId" value={category.id} /><button className="button button-outline">Excluir categoria</button></form>
          </details>
        </li>)}</ul> : <p className="muted">Nenhuma categoria cadastrada.</p>}
        <h3>Adicionar categoria</h3>
        <ConfigurationCreateForm raceId={race.id} kind="category" />
      </section>}

      {activeSection === "teams" && <section className="management-card">
        <p className="eyebrow">Equipes</p><h2>Equipes participantes</h2>
        {teams.length ? <ul className="compact-list">{teams.map((team) => <li key={team.id}><details className="record-editor"><summary><strong>{team.name}</strong><span>Editar equipe</span></summary><form action={updateTeam} className="form-grid compact-form"><input type="hidden" name="raceId" value={race.id} /><input type="hidden" name="teamId" value={team.id} /><label>Nome da equipe<input name="name" defaultValue={team.name} required maxLength={100} /></label><button className="button button-secondary">Salvar equipe</button></form><form action={deleteTeam} className="compact-delete-form"><input type="hidden" name="raceId" value={race.id} /><input type="hidden" name="teamId" value={team.id} /><button className="button button-outline">Excluir equipe</button></form></details></li>)}</ul> : <p className="muted">Nenhuma equipe cadastrada.</p>}
        <ConfigurationCreateForm raceId={race.id} kind="team" />
      </section>}

      {activeSection === "coupons" && <section className="management-card">
        <p className="eyebrow">Descontos</p><h2>Cupons de desconto</h2>
        {coupons.length ? <ul className="compact-list">{coupons.map((coupon) => {
          const allowedIds = coupon.race_coupon_teams.map((relation) => relation.team_id);
          const allowedNames = teams.filter((team) => allowedIds.includes(team.id)).map((team) => team.name);
          return <li key={coupon.id}><details className="record-editor"><summary><strong>{coupon.code}</strong><span>{coupon.discount_type === "percentage" ? `${coupon.discount_value}%` : formatMoney(coupon.discount_value)} · {allowedIds.length ? allowedNames.join(", ") : "todas as equipes"}</span></summary>
            <form action={updateCoupon} className="form-grid compact-form"><input type="hidden" name="raceId" value={race.id} /><input type="hidden" name="couponId" value={coupon.id} /><label>Código<input name="code" defaultValue={coupon.code} required minLength={2} maxLength={32} /></label><div className="form-pair"><label>Tipo<select name="discountType" defaultValue={coupon.discount_type}><option value="percentage">Percentual</option><option value="fixed">Valor fixo (R$)</option></select></label><label>Desconto<input name="discountValue" type="number" min="0.01" step="0.01" defaultValue={coupon.discount_type === "fixed" ? (coupon.discount_value / 100).toFixed(2) : coupon.discount_value} required /></label></div><label>Usos máximos<input name="usageLimit" type="number" min="1" step="1" defaultValue={coupon.usage_limit ?? ""} /></label><fieldset><legend>Equipes permitidas</legend>{teams.map((team) => <label className="check-label" key={team.id}><input type="checkbox" name="teamIds" value={team.id} defaultChecked={allowedIds.includes(team.id)} /><span>{team.name}</span></label>)}</fieldset><button className="button button-secondary">Salvar cupom</button></form>
            <form action={deleteCoupon} className="compact-delete-form"><input type="hidden" name="raceId" value={race.id} /><input type="hidden" name="couponId" value={coupon.id} /><button className="button button-outline">Excluir cupom</button></form>
          </details></li>;
        })}</ul> : <p className="muted">Nenhum cupom cadastrado.</p>}
        <ConfigurationCreateForm raceId={race.id} kind="coupon" teams={teams} />
      </section>}

      {activeSection === "registrations" && <section className="management-card"><p className="eyebrow">Atletas</p><h2>Inscrições online e manuais</h2><p className="muted">Pesquise, filtre, pagine e cadastre atletas pela área de inscrições.</p><Link className="button button-primary" href={`${base}/inscricoes`}>Abrir área de inscrições</Link></section>}

      {activeSection === "finance" && <section className="management-card">
        <p className="eyebrow">Financeiro</p><h2>Pagamentos e split</h2>
        <p className="muted">Novas cobranças Pix usam exclusivamente a Safe2Pay e são confirmadas após consulta autenticada da transação. Nenhuma ação manual marca uma inscrição como paga.</p>
        <div className="split-status-card">
          <strong>{subaccountResult.data?.status === "active" ? "Subconta Safe2Pay ativa" : subaccountResult.data ? "Subconta aguardando revisão" : "Subconta não cadastrada"}</strong>
          <span>{subaccountResult.data?.status === "active"
            ? `O split das novas cobranças será de 95% para a organização e 5% para a Let'sRun, quando a plataforma estiver habilitada.`
            : "A organização não receberá novas cobranças até cadastrar e ter a subconta Safe2Pay ativada pela administração."}</span>
        </div>
        {subaccountResult.data && <p className="small muted">ID Safe2Pay: {subaccountResult.data.safe2pay_subaccount_id}</p>}
        <Link className="button button-secondary" href="/painel/recebimentos">Gerenciar recebimentos</Link>
        <div className="export-links"><a href={`/api/painel/exportacao?corrida=${race.id}&tipo=pagamentos`}>Exportar pagamentos CSV</a><a href={`/api/painel/exportacao?corrida=${race.id}&tipo=inscricoes`}>Exportar inscrições CSV</a></div>
      </section>}

      {activeSection === "regulation" && <section className="management-card"><p className="eyebrow">Informações ao atleta</p><h2>Regulamento</h2><form action={updateRace} className="form-grid compact-form"><input type="hidden" name="raceId" value={race.id} /><input type="hidden" name="name" value={race.name} /><input type="hidden" name="slug" value={race.slug} /><input type="hidden" name="startsAt" value={new Date(race.starts_at).toISOString().slice(0, 16)} /><input type="hidden" name="location" value={race.location} /><input type="hidden" name="description" value={race.description} /><input type="hidden" name="published" value={race.published ? "on" : ""} /><label>Texto do regulamento<textarea name="regulation" rows={16} defaultValue={race.regulation} maxLength={20000} placeholder="Regras, percurso, retirada de kit, segurança e demais informações da prova." /></label><button className="button button-secondary">Salvar regulamento</button></form></section>}

      {activeSection === "courtesies" && <section className="management-card"><p className="eyebrow">Benefícios</p><h2>Regras e progresso de cortesias</h2>
        {rules.length ? <div className="courtesy-list">{rules.map((rule) => {
          const progress = Array.isArray(progressRows) ? progressRows.find((row: unknown): row is CourtesyProgress => isCourtesyProgress(row) && row.rule_id === rule.id) : undefined;
          const paid = progress?.paid_count ?? 0; const granted = progress?.granted_count ?? 0; const remaining = Math.max(0, (progress?.eligible_count ?? 0) - granted);
          const team = teams.find((item) => item.id === rule.team_id); const coupon = coupons.find((item) => item.id === rule.coupon_id);
          return <article className="courtesy-item" key={rule.id}><strong>{team?.name ?? "Equipe"} · {coupon?.code ?? "Cupom"}</strong><span>{paid} pagos de {rule.paid_entries_required} necessários · {granted}/{rule.maximum_courtesies} cortesias concedidas</span><span className="muted">{progressResult.error ? "Progresso indisponível" : remaining ? `${remaining} cortesia(s) disponível(is)` : "Sem cortesias disponíveis"}</span>
            {remaining > 0 && !progressResult.error && categories.length > 0 && <form action={grantCourtesy} className="courtesy-form"><input type="hidden" name="raceId" value={race.id} /><input type="hidden" name="ruleId" value={rule.id} /><label>Categoria<select name="categoryId" required>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label>Nome<input name="participantName" required minLength={2} maxLength={160} /></label><label>E-mail<input name="participantEmail" type="email" required maxLength={254} /></label><label className="check-label"><input name="privacyConsent" type="checkbox" required /><span>A pessoa autorizou a inscrição de cortesia.</span></label><button className="button button-secondary">Conceder cortesia</button></form>}
          </article>;
        })}</div> : <p className="muted">Nenhuma regra de cortesia cadastrada.</p>}
        {teams.length > 0 && coupons.length > 0 && <form action={createCourtesyRule} className="form-grid compact-form"><input type="hidden" name="raceId" value={race.id} /><label>Equipe<select name="teamId" required>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label><label>Cupom<select name="couponId" required>{coupons.map((coupon) => <option value={coupon.id} key={coupon.id}>{coupon.code}</option>)}</select></label><div className="form-pair"><label>Pagamentos por cortesia<input name="paidEntriesRequired" type="number" min="1" required /></label><label>Limite de cortesias<input name="maximumCourtesies" type="number" min="1" required /></label></div><button className="button button-secondary">Criar regra</button></form>}
      </section>}
    </main>
  );
}
