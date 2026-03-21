import type { CrossIndexDefinition } from "./types";

export const populationGrowth: CrossIndexDefinition = {
  id: "population-growth",
  name: "Population Growth 2025-2100",
  description: "Where population is projected to grow most under SSP2 scenario. Growth ratio = pop_2100 / pop_2025.",
  datasets: ["population"],
  joinColumn: "h3_index",
  computedColumns: [{ name: "growth_ratio", formula: "pop_2100 / pop_2025" }],
  equivalentSQL:
    "FROM population\n" +
    "SELECT h3_index, pop_2025, pop_2050, pop_2100,\n" +
    "  pop_2100 / NULLIF(pop_2025, 0) AS growth_ratio\n" +
    "WHERE pop_2025 >= 10",
  focusRegion: { name: "Sub-Saharan Africa", lat: 0, lng: 25, zoom: 2.5 },
};
