export const raceDistances = [
  {
    key: "5",
    distance: "5 km",
    level: "Iniciante",
    title: "Primeiros passos",
    description: "Estreie nas corridas de rua ou experimente um ritmo mais rápido.",
  },
  {
    key: "10",
    distance: "10 km",
    level: "Intermediário",
    title: "Ganhe resistência",
    description: "Sustente seu ritmo por mais tempo e busque uma nova marca pessoal.",
  },
  {
    key: "21",
    distance: "21 km",
    level: "Avançado",
    title: "Meia maratona",
    description: "Coloque seu preparo e a consistência dos treinos à prova.",
  },
  {
    key: "42",
    distance: "42 km+",
    level: "Extremo",
    title: "Maratona e ultra",
    description: "Encare percursos longos que exigem resistência e estratégia.",
  },
] as const;

type DistanceKey = (typeof raceDistances)[number]["key"];

export function matchesRaceDistance(categoryName: string, distance: DistanceKey) {
  const name = categoryName.toLowerCase();
  const kilometers = Array.from(
    name.matchAll(/(?<![\p{L}\d.,])(\d+(?:[.,]\d+)?)\s*(?:-\s*)?k(?:m)?\b/gu),
    ([, value]) => Number(value.replace(",", ".")),
  );

  if (kilometers.length) {
    return kilometers.some((km) => {
      if (distance === "21") return km >= 21 && km <= 21.1;
      if (distance === "42") return km >= 42;
      return km === Number(distance);
    });
  }

  const halfMarathon = /\bmeia[\s-]+maratona\b/g;
  if (distance === "21") return /\bmeia[\s-]+maratona\b/.test(name);
  return distance === "42" &&
    /\b(?:maratona|ultra(?:maratona)?)\b/.test(name.replace(halfMarathon, ""));
}
