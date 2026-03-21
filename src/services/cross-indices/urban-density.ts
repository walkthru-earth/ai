import type { CrossIndexDefinition } from "./types";

export const urbanDensity: CrossIndexDefinition = {
  id: "urban-density",
  name: "Urban Density Index",
  description: "Buildings + population combined. Shows density of built environment relative to population.",
  datasets: ["building", "population"],
  joinColumn: "h3_index",
  computedColumns: [],
  equivalentSQL:
    "FROM building b JOIN population p USING (h3_index)\n" +
    "SELECT b.h3_index, b.building_count, b.building_density, b.avg_height_m, p.pop_2025, p.pop_2050",
  focusRegion: { name: "Nile Delta, Egypt", lat: 30.5, lng: 31.2, zoom: 4 },
};
