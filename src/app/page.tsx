import Link from "next/link";
import { connection } from "next/server";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { SponsorForm } from "@/app/sponsor-form";
import { RaceCard } from "@/app/race-card";
import { raceDistances } from "@/lib/race-distances";
import styles from "./home.module.css";

export const instant = false;

export default async function Home() {
  await connection();

  const supabase = createSupabasePublicClient();
  const { data: races, error } = await supabase
    .from("races")
    .select("id, name, slug, location, starts_at, cover_image_path, race_categories(name, price_cents)")
    .eq("published", true)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(6);

  return (
    <main className={styles.screen}>
      <section className="hero">
        <div className="container hero-content">
          <div className="hero-copy-block">
            <p className="eyebrow">Encontre seu próximo desafio</p>
            <h1>Sua próxima corrida começa aqui.</h1>
            <p className="hero-copy">
              Corridas incríveis, inscrição simples e tudo o que você precisa para chegar preparado.
            </p>
            <div className="hero-actions">
              <Link className="button button-light" href="/corridas">Explorar corridas <span aria-hidden="true">→</span></Link>
              <Link className="button button-outline" href="#patrocinio">Junte-se a nós</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="container section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Calendário aberto</p>
            <h2>Corridas em destaque</h2>
          </div>
          <Link className="text-link" href="/corridas">Ver todas <span aria-hidden="true">→</span></Link>
        </div>
        {error ? (
          <p className="notice">Não foi possível carregar as corridas agora.</p>
        ) : races?.length ? (
          <div className="race-grid">
            {races.map((race) => (
              <RaceCard
                key={race.id}
                race={race}
                categories={race.race_categories ?? []}
                coverImageUrl={race.cover_image_path ? supabase.storage.from("race-covers").getPublicUrl(race.cover_image_path).data.publicUrl : null}
                headingLevel="h3"
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">↗</span>
            <p>As próximas corridas aparecem por aqui.</p>
            <span className="muted">Volte em breve para encontrar seu próximo desafio.</span>
          </div>
        )}
      </section>

      <section className={styles.distanceSection} aria-labelledby="distance-heading">
        <div className="container">
          <div className={styles.organizerHeading}>
            <h2 id="distance-heading">Encontre sua distância</h2>
            <p>Do seu primeiro quilômetro aos grandes desafios, escolha o percurso ideal para o seu ritmo.</p>
          </div>
          <ul className={styles.distanceGrid}>
            {raceDistances.map(({ key, distance, level, title, description }) => (
              <li key={key}>
                <Link className={styles.distanceCard} href={`/corridas?distancia=${key}`}>
                  <div className={styles.distanceCardHeader}>
                    <span className="race-category race-category-primary">{level}</span>
                    <span className={styles.distanceArrow} aria-hidden="true">→</span>
                  </div>
                  <h3><strong>{distance}</strong>{title}</h3>
                  <p>{description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.organizerSection}>
        <div className="container">
          <div className={styles.organizerHeading}>
            <p className="eyebrow">Para quem faz acontecer</p>
            <h2>Da criação da corrida ao acompanhamento das inscrições.</h2>
            <p>Um caminho simples para organizar sua prova e acompanhar cada etapa pelo painel.</p>
          </div>
          <ol className={styles.organizerSteps}>
            <li className={styles.organizerStep}>
              <span className={styles.stepNumber}>01</span>
              <h3>Crie sua conta</h3>
              <p>Cadastre sua organização para acessar o painel de organizador.</p>
            </li>
            <li className={styles.organizerStep}>
              <span className={styles.stepNumber}>02</span>
              <h3>Configure sua corrida</h3>
              <p>Defina data, local, categorias, vagas, preços, equipes e cupons.</p>
            </li>
            <li className={styles.organizerStep}>
              <span className={styles.stepNumber}>03</span>
              <h3>Publique e receba inscrições</h3>
              <p>Deixe sua prova visível no calendário e receba inscrições com pagamento pela Safe2Pay.</p>
            </li>
            <li className={styles.organizerStep}>
              <span className={styles.stepNumber}>04</span>
              <h3>Acompanhe pelo painel</h3>
              <p>Consulte inscrições e pagamentos confirmados e exporte os dados dos participantes.</p>
            </li>
          </ol>
          <div className={styles.organizerActions}>
            <Link className="button button-primary" href="/cadastro-organizador">Quero ser um organizador</Link>
            <Link className="button button-outline" href="/entrar">Acesso do organizador</Link>
          </div>
        </div>
      </section>

      <section className="sponsor-section" id="patrocinio">
        <div className="container sponsor-section-inner">
          <p className="eyebrow">Seja um patrocinador</p>
          <div className="sponsor-section-content">
            <div className="sponsor-section-copy">
              <h2>Sua marca em destaque!</h2>
              <p>
                Conecte sua marca ao universo da corrida, Divulgue seus produtos e serviços em nossa plataforma e alcance um público apaixonado por esporte, saúde e qualidade de vida.
              </p>
            </div>
            <SponsorForm />
          </div>
        </div>
      </section>
    </main>
  );
}
