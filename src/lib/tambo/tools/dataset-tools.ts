/**
 * Dataset tools - listDatasets, buildParquetUrl, describeDataset.
 * Related trio for dataset discovery and URL construction.
 */

import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { buildParquetUrl, describeDataset, listDatasets } from "@/services/datasets";

export const listDatasetsTool: TamboTool = {
  name: "listDatasets",
  description: "List available datasets. Filter by category: weather, terrain, building, population, overture.",
  tool: listDatasets,
  inputSchema: z.object({
    category: z.string().optional().describe("Filter: weather, terrain, building, population, or overture"),
  }),
  outputSchema: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      columns: z.array(z.string()),
      category: z.string(),
      defaultH3Res: z.number(),
      h3ResRange: z.array(z.number()),
    }),
  ),
};

export const buildParquetUrlTool: TamboTool = {
  name: "buildParquetUrl",
  description:
    "Build direct Parquet URL for a dataset at given H3 resolution. Auto-resolves weather date and Overture release.",
  tool: buildParquetUrl,
  inputSchema: z.object({
    dataset: z
      .string()
      .describe(
        "Dataset ID: weather, terrain, building, population, places, transportation, base, addresses, buildings-overture",
      ),
    h3Res: z
      .number()
      .optional()
      .describe("H3 res - weather 1-5, building 3-8, population 1-8, terrain 1-10, overture 1-10"),
  }),
  outputSchema: z.object({
    url: z.string(),
    h3Res: z.number(),
    sql: z.string(),
  }),
};

export const describeDatasetTool: TamboTool = {
  name: "describeDataset",
  description: "Get column names, descriptions, H3 res range, and sample SQL for a dataset.",
  tool: describeDataset,
  inputSchema: z.object({
    dataset: z.string().describe("Dataset ID"),
  }),
  outputSchema: z.object({
    name: z.string(),
    description: z.string(),
    columns: z.array(z.object({ name: z.string(), description: z.string() })),
    category: z.string(),
    h3ResRange: z.array(z.number()),
    sampleUrl: z.string(),
    equivalentSQL: z.string(),
  }),
};
