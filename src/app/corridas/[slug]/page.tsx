import { notFound } from "next/navigation";
import Link from "next/link";
import { connection } from "next/server";
import { RegistrationForm } from "@/app/registration-form";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import styles from "../../race-detail.module.css";

export const instant = false;

function isMissingRegulationColumn(error: { code?: string; message?: string } | null) {
  return !!error && (error.code === "42703" || error.code === "PGRST204" || /regulation/i.test(error.message ?? ""));
}

export default async function RacePage({ params }: PageProps<"/corridas/[slug]">) {
  await connection();
  const { slug } = await params;
  const supabase = createSupabasePublicClient();
  let { data: race, error } = await supabase
    .from("races")
    .select("id, name, description, regulation, location, starts_at, registration_opens_at, registration_closes_at")
    .eq("slug", slug)
    .eq("published", true)
    .single();

  if (isMissingRegulationColumn(error)) {
    const fallback = await supabase
      .from("races")
      .select("id, name, description, location, starts_at, registration_opens_at, registration_closes_at")
      .eq("slug", slug)
      .eq("published", true)
      .single();
    race = fallback.data ? { ...fallback.data, regulation: "" } : null;
    error = fallback.error;
  }

  if (error && error.code !== "PGRST116") {
    console.error("Failed to load public race", { code: error.code, message: error.message });
    throw new Error("Não foi possível carregar os dados da corrida.");
  }
  if (!race) notFound();

  const [categoriesResult, teamsResult] = await Promise.all([
    supabase
      .from("race_categories")
      .select("id, name, price_cents, capacity")
      .eq("race_id", race.id)
      .order("price_cents"),
    supabase.from("race_teams").select("id, name").eq("race_id", race.id).order("name"),
  ]);
  if (categoriesResult.error || teamsResult.error) {
    throw new Error("Não foi possível carregar categorias e equipes da corrida.");
  }
  const categories = categoriesResult.data;
  const teams = teamsResult.data;
  const { data: registrationOpen, error: registrationWindowError } = await supabase.rpc(
    "is_race_registration_open",
    { p_race_id: race.id },
  );
  if (registrationWindowError) throw new Error("Não foi possível verificar o período de inscrição.");

  return (
    <main className={`container page-section ${styles.screen}`}>
      <Link className="back-link" href="/corridas">← Todas as corridas</Link>
      <div className="race-detail-hero">
        <p className="eyebrow">{race.location || "Brasil"} · {new Date(race.starts_at).toLocaleDateString("pt-BR", { dateStyle: "long" })}</p>
        <h1>{race.name}</h1>
        <p className="lede">{race.description || "Escolha sua categoria e garanta sua vaga."}</p>
      </div>
      {race.regulation && <section className="race-regulation-card"><p className="eyebrow">Informações da prova</p><h2>Regulamento</h2><div className="race-regulation-copy">{race.regulation}</div></section>}
      <section className="registration-panel">
        <div>
          <p className="eyebrow">Inscrição</p>
          <h2>Garanta sua vaga</h2>
          <p className="muted">Preencha seus dados para gerar o Pix pela Safe2Pay.</p>
          <p className="privacy-note">Usaremos seus dados somente para gerenciar esta inscrição e informações relacionadas à corrida.</p>
        </div>
        {!registrationOpen
          ? <p className="notice">As inscrições para esta corrida não estão abertas.</p>
          : <RegistrationForm raceId={race.id} categories={categories ?? []} teams={teams ?? []} />}
      </section>
    </main>
  );
}
