/**
 * Dataset registry — aggregates all dataset definitions and exports tool functions.
 */

import { resolveOvertureRelease, resolveWeatherPrefix } from "../resolvers";
import { addressesDataset } from "./addresses";
import { baseDataset } from "./base";
import { buildingDataset } from "./building";
import { buildingsOvertureDataset } from "./buildings-overture";
import { placesDataset } from "./places";
import { populationDataset } from "./population";
import { terrainDataset } from "./terrain";
import { transportationDataset } from "./transportation";
import type { BuildUrlInput, BuildUrlOutput, DatasetDescription, DatasetInfo, DescribeDatasetInput } from "./types";
import { weatherDataset } from "./weather";

/* ── Registry ────────────────────────────────────────────────────── */

export const DATASETS = [
  weatherDataset,
  terrainDataset,
  buildingDataset,
  populationDataset,
  placesDataset,
  transportationDataset,
  baseDataset,
  addressesDataset,
  buildingsOvertureDataset,
];

/* ── Tool: List available datasets ───────────────────────────────── */

export async function listDatasets(input?: { category?: string }): Promise<DatasetInfo[]> {
  const list = input?.category ? DATASETS.filter((d) => d.category === input.category) : DATASETS;
  return list.map(({ columnDescriptions: _, ...rest }) => rest);
}

/* ── Tool: Build a Parquet URL ───────────────────────────────────── */

export async function buildParquetUrl(input: BuildUrlInput): Promise<BuildUrlOutput> {
  const ds = DATASETS.find((d) => d.id === input.dataset);
  if (!ds) {
    throw new Error(`Unknown dataset: ${input.dataset}. Available: ${DATASETS.map((d) => d.id).join(", ")}`);
  }

  const h3Res = input.h3Res ?? ds.defaultH3Res;
  let url = ds.urlPattern.replace("{h3_res}", String(h3Res));

  if (ds.category === "weather") {
    const prefix = await resolveWeatherPrefix();
    const parts = prefix.split("/");
    const datePart = parts.find((p) => p.startsWith("date="))?.split("=")[1];
    const hourPart = parts.find((p) => p.startsWith("hour="))?.split("=")[1];
    url = url.replace("{date}", datePart ?? "latest").replace("{hour}", hourPart ?? "0");
  }

  if (ds.category === "overture") {
    const release = await resolveOvertureRelease();
    url = url.replace("{release}", release);
  }

  return { url, h3Res };
}

/* ── Tool: Describe a dataset ────────────────────────────────────── */

export async function describeDataset(input: DescribeDatasetInput): Promise<DatasetDescription> {
  const ds = DATASETS.find((d) => d.id === input.dataset);
  if (!ds) {
    throw new Error(`Unknown dataset: ${input.dataset}. Available: ${DATASETS.map((d) => d.id).join(", ")}`);
  }

  const { url } = await buildParquetUrl({ dataset: ds.id });

  return {
    name: ds.name,
    description: ds.description,
    columns: ds.columns.map((c) => ({
      name: c,
      description: ds.columnDescriptions[c] ?? "No description available",
    })),
    category: ds.category,
    h3ResRange: ds.h3ResRange,
    sampleUrl: url,
    equivalentSQL: `FROM '${url}' LIMIT 1000`,
  };
}

// Re-export types for consumers
export type { BuildUrlInput, BuildUrlOutput, DatasetDescription, DatasetInfo, DescribeDatasetInput };
