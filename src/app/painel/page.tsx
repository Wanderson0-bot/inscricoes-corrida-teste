import Link from "next/link";
import { connection } from "next/server";
import { signOut } from "@/app/actions";
import { RaceActions } from "./race-actions";
import { requireOrganizer } from "@/lib/auth";
import styles from "./organizer.module.css";

export const instant = false;

export default async function DashboardPage({ searchParams }: PageProps<"/painel">) {
  await connection();
  const query = await searchParams;
  const { supabase } = await requireOrganizer();
  const { data: races, error } = await supabase
    .from("races")
    .select("id, name, slug, starts_at, published")
    .order("created_at", { ascending: false });

  return (
    <main className={`container page-section ${styles.screen}`}>
      <div className="dashboard-top">
        <div>
          <p className="eyebrow">Painel do organizador</p>
          <h1>Suas corridas.</h1>
        </div>
        <div className="dashboard-actions">
          <Link className="button button-primary" href="/painel/corridas/nova">Criar corrida <span aria-hidden="true">+</span></Link>
          <form action={signOut}><button className="button button-quiet">Sair</button></form>
        </div>
      </div>

      {query?.erro === "corrida-com-inscricoes" && <p className="notice" role="alert">Esta corrida tem inscrições e não pode ser excluída para preservar o histórico.</p>}
      {query?.erro === "excluir-corrida" && <p className="error-message" role="alert">Não foi possível excluir esta corrida. Atualize a página e tente novamente.</p>}
      {query?.["corrida-excluida"] && <p className="notice" role="status">Corrida excluída com sucesso.</p>}
      {error ? (
        <p className="notice">Não foi possível carregar as corridas.</p>
      ) : races?.length ? (
        <div className="dashboard-race-list">
          {races.map((race) => (
            <article className="dashboard-race" key={race.id}>
              <Link className="dashboard-race-main" href={`/painel/corridas/${race.id}`}>
                <span className="status-dot" data-published={race.published} />
                <span className="dashboard-race-info">
                  <strong>{race.name}</strong>
                  <span>{new Date(race.starts_at).toLocaleDateString("pt-BR", { dateStyle: "long" })}</span>
                </span>
                <span className="status-pill">{race.published ? "Publicada" : "Rascunho"}</span>
              </Link>
              <RaceActions raceId={race.id} raceName={race.name} />
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state dashboard-empty">
          <span className="empty-icon" aria-hidden="true">+</span>
          <p>Seu calendário começa com uma corrida.</p>
          <Link className="text-link" href="/painel/corridas/nova">Criar primeira corrida <span aria-hidden="true">→</span></Link>
        </div>
      )}
    </main>
  );
}
