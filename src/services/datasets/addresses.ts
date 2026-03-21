import type { DatasetDefinition } from "./types";
import { S3_BASE } from "./types";

export const addressesDataset: DatasetDefinition = {
  id: "addresses",
  name: "Overture Addresses Index",
  description:
    "Address point aggregations from Overture Maps. " +
    "Address count and unique postcode count per H3 cell. " +
    "Use buildParquetUrl('addresses') to resolve latest release.",
  columns: ["h3_index", "address_count", "unique_postcodes"],
  columnDescriptions: {
    h3_index: "H3 hexagonal cell identifier (BigInt)",
    address_count: "Number of address points in H3 cell",
    unique_postcodes: "Number of unique postcodes/ZIP codes in cell",
  },
  urlPattern: `${S3_BASE}/indices/addresses-index/v1/release={release}/h3/h3_res={h3_res}/data.parquet`,
  h3ResRange: [1, 10],
  defaultH3Res: 4,
  category: "overture",
};
