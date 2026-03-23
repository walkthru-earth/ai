import type { DatasetDefinition } from "./types";
import { S3_BASE } from "./types";

export const terrainDataset: DatasetDefinition = {
  id: "terrain",
  name: "Global Terrain (GEDTM 30m)",
  description:
    "Global elevation, slope, aspect, terrain ruggedness (TRI) and topographic position (TPI) from GEDTM 30m DEM. 10.5 billion cells.",
  columns: ["h3_index", "elev", "slope", "aspect", "tri", "tpi"],
  columnDescriptions: {
    h3_index: "H3 hexagonal cell identifier (BigInt)",
    elev: "Elevation above sea level (meters)",
    slope: "Terrain slope angle (degrees)",
    aspect: "Direction the slope faces (degrees, 0-360)",
    tri: "Terrain Ruggedness Index",
    tpi: "Topographic Position Index (positive=ridge, negative=valley)",
  },
  urlPattern: `${S3_BASE}/dem-terrain/v2/h3/h3_res={h3_res}/data.parquet`,
  h3ResRange: [1, 10],
  defaultH3Res: 3,
  category: "terrain",
};
