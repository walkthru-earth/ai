import type { CrossIndexDefinition } from "./types";

export const verticalLiving: CrossIndexDefinition = {
  id: "vertical-living",
  name: "Vertical Living Index",
  description: "Buildings per person - reveals how vertically people live. High values = dense high-rises.",
  datasets: ["building", "population"],
  joinColumn: "h3_index",
  computedColumns: [{ name: "bldg_per_person", formula: "building_count / pop_2025" }],
  equivalentSQL:
    "FROM building b JOIN population p USING (h3_index)\n" +
    "SELECT b.h3_index, b.building_count, b.avg_height_m, p.pop_2025,\n" +
    "  b.building_count / p.pop_2025 AS bldg_per_person\n" +
    "WHERE p.pop_2025 > 0 AND b.building_count > 0",
  focusRegion: { name: "Pearl River Delta, China", lat: 22.5, lng: 114, zoom: 4 },
};
