import type { DatasetDefinition } from "./types";
import { S3_BASE } from "./types";

export const addressesDataset: DatasetDefinition = {
  id: "addresses",
  name: "Overture Addresses Index",
  description:
    "Address point aggregations from Overture Maps. " +
    "Use buildParquetUrl('addresses') to resolve latest release. " +
    "Schema evolving — use DESCRIBE on the Parquet file to explore available columns.",
  columns: ["h3_index"],
  columnDescriptions: {
    h3_index: "H3 hexagonal cell identifier (BigInt)",
  },
  urlPattern: `${S3_BASE}/indices/addresses-index/v1/release={release}/h3/h3_res={h3_res}/data.parquet`,
  h3ResRange: [1, 10],
  defaultH3Res: 4,
  category: "overture",
};
