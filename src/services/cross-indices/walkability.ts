import type { CrossIndexDefinition } from "./types";

export const walkability: CrossIndexDefinition = {
  id: "walkability",
  name: "Walkability Index",
  description:
    "5-signal walkability composite across 4 datasets. " +
    "Signals: (1) road type ratio — footways, cycleways, paths vs motorways, arterials (35%); " +
    "(2) pedestrian infrastructure — crosswalks, sidewalks from base environment (15%); " +
    "(3) barrier penalty — fences, walls, gates that block movement (10%); " +
    "(4) terrain slope — steep = hard to walk (15%); " +
    "(5) destination density — a walkable road to nowhere isn't walkable (25%).",
  datasets: ["transportation", "base", "terrain", "places"],
  joinColumn: "h3_index",
  computedColumns: [
    {
      name: "road_ratio",
      formula:
        "(n_footway + n_pedestrian + n_steps + n_path + n_cycleway + n_living_street) / NULLIF(n_footway + n_pedestrian + n_steps + n_path + n_cycleway + n_living_street + n_motorway + n_trunk + n_primary + n_secondary, 0)",
    },
    { name: "ped_score", formula: "log(1 + base.n_pedestrian) / log(1 + max_ped) -- log-normalized" },
    { name: "barrier_penalty", formula: "1 - log(1 + base.n_barrier) / log(1 + max_barrier) -- inverted" },
    { name: "slope_factor", formula: "GREATEST(0, 1 - slope / 15.0)" },
    { name: "dest_score", formula: "log(1 + place_count) / log(1 + max_places) -- log-normalized" },
    {
      name: "walk_score",
      formula:
        "0.35 * road_ratio + 0.15 * ped_score + 0.10 * barrier_penalty + 0.15 * slope_factor + 0.25 * dest_score",
    },
  ],
  equivalentSQL:
    "-- Walkability Index (5-signal composite, all at same h3_res e.g. 5)\n" +
    "SELECT tr.h3_index, h3_h3_to_string(tr.h3_index) AS hex,\n" +
    "  tr.segment_count,\n" +
    "  -- Signal 1: Road type ratio (human-scale / total)\n" +
    "  (tr.n_footway + tr.n_pedestrian + tr.n_steps + tr.n_path + tr.n_cycleway + tr.n_living_street)::FLOAT\n" +
    "    / NULLIF(tr.n_footway + tr.n_pedestrian + tr.n_steps + tr.n_path + tr.n_cycleway + tr.n_living_street\n" +
    "            + tr.n_motorway + tr.n_trunk + tr.n_primary + tr.n_secondary, 0) AS road_ratio,\n" +
    "  ba.n_pedestrian AS ped_infra, ba.n_barrier,\n" +
    "  te.slope AS slope_deg,\n" +
    "  pl.place_count\n" +
    "FROM transportation tr\n" +
    "LEFT JOIN base ba USING (h3_index)\n" +
    "LEFT JOIN terrain te USING (h3_index)\n" +
    "LEFT JOIN places pl USING (h3_index)\n" +
    "WHERE tr.segment_count > 0\n" +
    "LIMIT 500",
  focusRegion: { name: "Amsterdam, Netherlands", lat: 52.37, lng: 4.9, zoom: 5 },
};
