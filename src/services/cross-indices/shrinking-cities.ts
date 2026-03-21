import type { CrossIndexDefinition } from "./types";

export const shrinkingCities: CrossIndexDefinition = {
  id: "shrinking-cities",
  name: "Shrinking Cities (Population Decline)",
  description: "Areas where population is projected to decline by 2100. Growth ratio < 1.",
  datasets: ["population"],
  joinColumn: "h3_index",
  computedColumns: [{ name: "growth_ratio", formula: "pop_2100 / pop_2025" }],
  equivalentSQL:
    "FROM population\n" +
    "SELECT h3_index, pop_2025, pop_2100,\n" +
    "  pop_2100 / NULLIF(pop_2025, 0) AS growth_ratio\n" +
    "WHERE pop_2025 >= 10 AND pop_2100 < pop_2025",
  focusRegion: { name: "East Asia", lat: 36, lng: 128, zoom: 3 },
};
