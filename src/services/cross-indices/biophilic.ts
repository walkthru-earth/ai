import type { CrossIndexDefinition } from "./types";

export const biophilic: CrossIndexDefinition = {
  id: "biophilic",
  name: "Biophilic Index — Nature Access per Capita",
  description:
    "How much nature surrounds each person? Parks, recreation, protected areas, agriculture, and water bodies " +
    "divided by population. Research shows 120 min/week in nature reduces cortisol 21%. " +
    "High = abundant nature per person. Low = nature-deprived. " +
    "Height = population — tall deprived cells are the most nature-starved communities.",
  datasets: ["base", "population"],
  joinColumn: "h3_index",
  computedColumns: [
    {
      name: "nature_count",
      formula: "n_lu_park + n_lu_recreation + n_lu_protected + n_lu_agriculture + n_lu_horticulture + water_count",
    },
    { name: "nature_per_capita", formula: "nature_count / pop_2025" },
    {
      name: "nature_ratio",
      formula: "nature_count / (nature_count + n_lu_residential + n_lu_developed + infra_count)",
    },
  ],
  equivalentSQL:
    "-- Biophilic Index: nature features per capita\n" +
    "SELECT ba.h3_index, h3_h3_to_string(ba.h3_index) AS hex,\n" +
    "  (ba.n_lu_park + ba.n_lu_recreation + ba.n_lu_protected\n" +
    "   + ba.n_lu_agriculture + ba.n_lu_horticulture + ba.water_count) AS nature_count,\n" +
    "  p.pop_2025,\n" +
    "  nature_count::FLOAT / NULLIF(p.pop_2025, 0) AS nature_per_capita\n" +
    "FROM base ba\n" +
    "JOIN population p USING (h3_index)\n" +
    "WHERE p.pop_2025 > 0\n" +
    "LIMIT 500",
  focusRegion: { name: "Nile Delta, Egypt", lat: 30, lng: 31, zoom: 3.5 },
};
