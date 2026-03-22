import type { CrossIndexDefinition } from "./types";

export const waterSecurity: CrossIndexDefinition = {
  id: "water-security",
  name: "Water Security Score",
  description:
    "Where is water scarce relative to people? 6 signals across 5 datasets. " +
    "Signals: (1) natural water per capita — rivers, lakes, streams (30%); " +
    "(2) engineered water infra — treatment plants, pipes, reservoirs (15%); " +
    "(3) precipitation (20%); " +
    "(4) ground permeability — sealed concrete prevents aquifer recharge (10%); " +
    "(5) terrain slope — steep = runoff, flat = retention (10%); " +
    "(6) population growth pressure 2025-2050 (15%).",
  datasets: ["base", "population", "weather", "building", "terrain"],
  joinColumn: "h3_index",
  computedColumns: [
    { name: "natural_score", formula: "log(1 + water_count / pop_2025 * 10000) / log(1 + max_wpc)" },
    { name: "infra_score", formula: "log(1 + n_water_infra + n_reservoir) / log(1 + max_infra)" },
    { name: "precip_score", formula: "LEAST(GREATEST(precipitation_mm_6hr, 0) / 20.0, 1)" },
    { name: "permeability_score", formula: "1 - LEAST(coverage_ratio, 1)" },
    { name: "retention_score", formula: "GREATEST(0, 1 - slope / 20.0)" },
    { name: "growth_pressure", formula: "GREATEST(0, LEAST(1, 1 - (pop_2050 / pop_2025 - 1) / 1.5))" },
    {
      name: "water_score",
      formula:
        "0.30 * natural_score + 0.15 * infra_score + 0.20 * precip_score + 0.10 * permeability_score + 0.10 * retention_score + 0.15 * growth_pressure",
    },
  ],
  equivalentSQL:
    "-- Water Security (6-signal composite across 5 indices)\n" +
    "SELECT p.h3_index, h3_h3_to_string(p.h3_index) AS hex,\n" +
    "  p.pop_2025, p.pop_2050,\n" +
    "  ba.water_count, ba.n_river, ba.n_lake, ba.n_reservoir, ba.n_water_infra,\n" +
    "  GREATEST(w.precipitation_mm_6hr, 0) AS precip_mm,\n" +
    "  b.coverage_ratio,\n" +
    "  te.slope AS slope_deg\n" +
    "FROM population p\n" +
    "LEFT JOIN base ba USING (h3_index)\n" +
    "LEFT JOIN weather w USING (h3_index)\n" +
    "LEFT JOIN building b USING (h3_index)\n" +
    "LEFT JOIN terrain te USING (h3_index)\n" +
    "WHERE p.pop_2025 > 100\n" +
    "LIMIT {queryLimit}",
  focusRegion: { name: "Middle East & North Africa", lat: 15, lng: 45, zoom: 2.5 },
};
