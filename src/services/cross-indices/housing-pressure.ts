import type { CrossIndexDefinition } from "./types";

export const housingPressure: CrossIndexDefinition = {
  id: "housing-pressure",
  name: "Housing Pressure Index",
  description:
    "Population growth 2025-2100 cross-referenced with buildings per person. Identifies areas where population is outgrowing housing.",
  datasets: ["building", "population"],
  joinColumn: "h3_index",
  computedColumns: [
    { name: "growth_ratio", formula: "pop_2100 / pop_2025" },
    { name: "bldg_per_person", formula: "building_count / pop_2025" },
  ],
  equivalentSQL:
    "FROM population p LEFT JOIN building b USING (h3_index)\n" +
    "SELECT p.h3_index, p.pop_2025, p.pop_2100,\n" +
    "  p.pop_2100 / NULLIF(p.pop_2025, 0) AS growth_ratio,\n" +
    "  b.building_count / NULLIF(p.pop_2025, 0) AS bldg_per_person\n" +
    "WHERE p.pop_2025 >= 10",
  focusRegion: { name: "Sub-Saharan Africa", lat: 0, lng: 25, zoom: 2.5 },
};
