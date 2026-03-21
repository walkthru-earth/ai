import type { CrossIndexDefinition } from "./types";

export const landslideRisk: CrossIndexDefinition = {
  id: "landslide-risk",
  name: "Buildings on Unstable Ground",
  description: "Terrain slope x building count. Highlights areas where buildings exist on steep terrain.",
  datasets: ["terrain", "building"],
  joinColumn: "h3_index",
  computedColumns: [],
  equivalentSQL:
    "FROM terrain t JOIN building b USING (h3_index)\n" +
    "SELECT t.h3_index, t.elev, t.slope, t.tri, b.building_count, b.avg_height_m\n" +
    "WHERE b.building_count > 0",
  focusRegion: { name: "Himalayan Region", lat: 28, lng: 85, zoom: 3.5 },
};
