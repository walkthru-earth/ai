import type { CrossIndexDefinition } from "./types";

export const fifteenMinCity: CrossIndexDefinition = {
  id: "fifteen-min-city",
  name: "15-Minute City Score",
  description:
    "Carlos Moreno's 15-minute city - 7 signals across 4 datasets. " +
    "Signals: (1) amenity diversity - Shannon entropy across 13 POI categories (20%); " +
    "(2) essential services - penalizes cells missing healthcare, education, food, or shopping (15%); " +
    "(3) walkability - human-scale vs car-scale roads (20%); " +
    "(4) cycling infrastructure - cycleways (10%); " +
    "(5) transit density - bus/rail/metro stops (15%); " +
    "(6) green space access - parks and recreation (10%); " +
    "(7) terrain flatness - steep = less accessible (10%). " +
    "Grades: A (>=70%) Excellent, B (>=50%) Good, C (>=30%) Fair, D (<30%) Car-dependent.",
  datasets: ["places", "transportation", "base", "terrain"],
  joinColumn: "h3_index",
  computedColumns: [
    { name: "diversity", formula: "Shannon H' / ln(13) -- normalized 0-1" },
    { name: "essentials", formula: "(has_health + has_education + has_food + has_shopping) / 4" },
    { name: "walkability", formula: "human_scale_segments / (human + car_scale)" },
    { name: "cycle_score", formula: "log(1 + n_cycleway) / log(1 + max_cycleway)" },
    { name: "transit_score", formula: "log(1 + n_transit) / log(1 + max_transit)" },
    { name: "green_score", formula: "log(1 + n_lu_park + n_lu_recreation) / log(1 + max_green)" },
    { name: "slope_factor", formula: "GREATEST(0, 1 - slope / 15.0)" },
    {
      name: "city15_score",
      formula:
        "0.20 * diversity + 0.15 * essentials + 0.20 * walkability + 0.10 * cycle_score + 0.15 * transit_score + 0.10 * green_score + 0.10 * slope_factor",
    },
  ],
  equivalentSQL:
    "-- 15-Minute City (7-signal composite across 4 indices)\n" +
    "SELECT pl.h3_index, h3_h3_to_string(pl.h3_index) AS hex,\n" +
    "  pl.place_count, pl.n_health_care, pl.n_education, pl.n_food_and_drink, pl.n_shopping,\n" +
    "  tr.segment_count, tr.n_cycleway,\n" +
    "  te.slope AS slope_deg,\n" +
    "  ba.n_transit, ba.n_lu_park, ba.n_lu_recreation\n" +
    "FROM places pl\n" +
    "JOIN transportation tr USING (h3_index)\n" +
    "LEFT JOIN terrain te USING (h3_index)\n" +
    "LEFT JOIN base ba USING (h3_index)\n" +
    "WHERE pl.place_count > 0\n" +
    "LIMIT {queryLimit}",
  focusRegion: { name: "Paris, France", lat: 48.8, lng: 2.3, zoom: 4 },
};
