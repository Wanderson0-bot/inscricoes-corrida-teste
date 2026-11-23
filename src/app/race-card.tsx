import Link from "next/link";

type RaceCardProps = {
  race: {
    name: string;
    slug: string;
    location: string | null;
    starts_at: string;
  };
  categories: { name: string; price_cents: number }[];
  coverImageUrl: string | null;
  headingLevel?: "h2" | "h3";
};

export function RaceCard({ race, categories, coverImageUrl, headingLevel = "h2" }: RaceCardProps) {
  const dateParts = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  }).formatToParts(new Date(race.starts_at));
  const day = dateParts.find((part) => part.type === "day")?.value;
  const month = dateParts.find((part) => part.type === "month")?.value.replace(".", "").toUpperCase();
  const sortedCategories = [...categories].sort((left, right) => left.price_cents - right.price_cents);
  const lowestPrice = sortedCategories[0]?.price_cents ?? null;
  const Heading = headingLevel;

  return (
    <Link className="race-card" href={`/corridas/${race.slug}`}>
      <div
        className={`race-card-cover${coverImageUrl ? " has-image" : ""}`}
        style={coverImageUrl ? { backgroundImage: `linear-gradient(rgba(18, 38, 105, 0.18), rgba(18, 38, 105, 0.18)), url("${coverImageUrl}")` } : undefined}
        aria-hidden="true"
      >
        {!coverImageUrl && <span className="race-cover-placeholder">Sua próxima linha de chegada</span>}
      </div>
      <time className="race-date-badge" dateTime={race.starts_at}>
        <strong>{day}</strong>
        <span>{month}</span>
      </time>
      <div className="race-card-content">
        <Heading className="race-card-title">{race.name}</Heading>
        <span className="race-location">
          <svg aria-hidden="true" viewBox="0 0 16 16">
            <path d="M8 14s5-4.5 5-8A5 5 0 0 0 3 6c0 3.5 5 8 5 8Z" />
            <circle cx="8" cy="6" r="1.5" />
          </svg>
          {race.location || "Brasil"}
        </span>
        {categories.length > 0 && (
          <span className="race-categories" aria-label="Categorias disponíveis">
            {sortedCategories.slice(0, 4).map((category, index) => (
              <span className={`race-category${index === 0 ? " race-category-primary" : ""}`} key={category.name}>{category.name}</span>
            ))}
          </span>
        )}
        <span className="race-card-footer">
          <span className="race-starting-price">
            {lowestPrice === null
              ? "Categorias em breve"
              : <>a partir de <strong>{(lowestPrice / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong></>}
          </span>
          <span className="race-card-cta">Ver prova <span aria-hidden="true">→</span></span>
        </span>
      </div>
    </Link>
  );
}
