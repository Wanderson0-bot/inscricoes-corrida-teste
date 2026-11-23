import { connection } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RaceCard } from "@/app/race-card";
import styles from "../races.module.css";

export const instant = false;

export default async function RacesPage() {
  await connection();

  const supabase = await createSupabaseServerClient();
  const { data: races, error } = await supabase
    .from("races")
    .select("id, name, slug, location, starts_at, cover_image_path, race_categories(name, price_cents)")
    .eq("published", true)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });

  return (
    <main className={`container page-section ${styles.screen}`}>
      <p className="eyebrow">Calendário</p>
      <h1>Escolha sua próxima corrida.</h1>
      <p className="lede">Encontre um percurso, escolha sua categoria e prepare o tênis.</p>
      {error ? (
        <p className="notice">Não foi possível carregar as corridas agora.</p>
      ) : races?.length ? (
        <div className="race-grid race-grid-full">
          {races.map((race) => (
            <RaceCard
              key={race.id}
              race={race}
              categories={race.race_categories ?? []}
              coverImageUrl={race.cover_image_path ? supabase.storage.from("race-covers").getPublicUrl(race.cover_image_path).data.publicUrl : null}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state"><p>Nenhuma corrida publicada no momento.</p></div>
      )}
    </main>
  );
}
