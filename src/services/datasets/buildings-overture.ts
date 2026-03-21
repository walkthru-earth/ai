import type { DatasetDefinition } from "./types";
import { S3_BASE } from "./types";

export const buildingsOvertureDataset: DatasetDefinition = {
  id: "buildings-overture",
  name: "Overture Buildings Index",
  description:
    "Building aggregations from Overture Maps (separate from Global Building Atlas which uses different source data). " +
    "Use buildParquetUrl('buildings-overture') to resolve latest release. " +
    "Schema evolving — use DESCRIBE on the Parquet file to explore available columns.",
  columns: ["h3_index"],
  columnDescriptions: {
    h3_index: "H3 hexagonal cell identifier (BigInt)",
  },
  urlPattern: `${S3_BASE}/indices/buildings-index/v1/release={release}/h3/h3_res={h3_res}/data.parquet`,
  h3ResRange: [1, 10],
  defaultH3Res: 4,
  category: "overture",
};
