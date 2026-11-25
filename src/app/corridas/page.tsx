import Link from "next/link";
import { connection } from "next/server";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { RaceCard } from "@/app/race-card";
import { matchesRaceDistance, raceDistances } from "@/lib/race-distances";
import styles from "../races.module.css";

export const instant = false;

export default async function RacesPage({ searchParams }: PageProps<"/corridas">) {
  await connection();

  const { distancia } = await searchParams;
  const selectedDistance = raceDistances.find(({ key }) => key === distancia);

  const supabase = createSupabasePublicClient();
  const { data: races, error } = await supabase
    .from("races")
    .select("id, name, slug, location, starts_at, cover_image_path, race_categories(name, price_cents)")
    .eq("published", true)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true });

  const visibleRaces = (races ?? []).flatMap((race) => {
    const categories = race.race_categories ?? [];
    if (!selectedDistance) return [{ race, categories }];

    const matchingCategories = categories.filter(({ name }) => matchesRaceDistance(name, selectedDistance.key));
    return matchingCategories.length ? [{ race, categories: matchingCategories }] : [];
  });

  return (
    <main className={`container page-section ${styles.screen}`}>
      <p className="eyebrow">Calendário</p>
      <h1>Escolha sua próxima corrida.</h1>
      <p className="lede">Encontre um percurso, escolha sua categoria e prepare o tênis.</p>
      <nav className={styles.distanceFilters} aria-label="Filtrar por distância">
        <Link href="/corridas" aria-current={selectedDistance ? undefined : "page"}>Todas</Link>
        {raceDistances.map(({ key, distance }) => (
          <Link
            key={key}
            href={`/corridas?distancia=${key}`}
            aria-current={selectedDistance?.key === key ? "page" : undefined}
          >
            {distance}
          </Link>
        ))}
      </nav>
      {error ? (
        <p className="notice">Não foi possível carregar as corridas agora.</p>
      ) : visibleRaces.length ? (
        <div className="race-grid race-grid-full">
          {visibleRaces.map(({ race, categories }) => (
            <RaceCard
              key={race.id}
              race={race}
              categories={categories}
              coverImageUrl={race.cover_image_path ? supabase.storage.from("race-covers").getPublicUrl(race.cover_image_path).data.publicUrl : null}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state"><p>
            {selectedDistance
              ? `Nenhuma corrida com percurso de ${selectedDistance.distance} no momento.`
              : "Nenhuma corrida publicada no momento."}
          </p></div>
      )}
    </main>
  );
}
