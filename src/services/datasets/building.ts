import type { DatasetDefinition } from "./types";
import { S3_BASE } from "./types";

export const buildingDataset: DatasetDefinition = {
  id: "building",
  name: "Global Building Atlas",
  description:
    "2.75 billion buildings worldwide. Count, density, height (avg/max/std), volume, volume density, footprint (total/avg), coverage ratio per H3 cell.",
  columns: [
    "h3_index",
    "building_count",
    "building_density",
    "total_footprint_m2",
    "coverage_ratio",
    "avg_height_m",
    "max_height_m",
    "height_std_m",
    "total_volume_m3",
    "volume_density_m3_per_km2",
    "avg_footprint_m2",
  ],
  columnDescriptions: {
    h3_index: "H3 hexagonal cell identifier (BigInt)",
    building_count: "Number of buildings in H3 cell",
    building_density: "Buildings per square kilometer",
    total_footprint_m2: "Total building footprint area (square meters)",
    coverage_ratio: "Ground covered by buildings (0-1)",
    avg_height_m: "Average building height (meters)",
    max_height_m: "Maximum building height in cell (meters)",
    height_std_m: "Standard deviation of building heights (meters)",
    total_volume_m3: "Total building volume (cubic meters)",
    volume_density_m3_per_km2: "Building volume per square kilometer (m³/km²)",
    avg_footprint_m2: "Average building footprint (square meters)",
  },
  urlPattern: `${S3_BASE}/indices/building/v2/h3/h3_res={h3_res}/data.parquet`,
  h3ResRange: [3, 8],
  defaultH3Res: 5,
  category: "building",
};
