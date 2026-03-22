/**
 * getCrossIndex tool — retrieves cross-dataset analysis patterns.
 * Enum is derived from CROSS_INDEX_IDS — no manual sync needed.
 */

import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { CROSS_INDEX_IDS, getCrossIndex } from "@/services/cross-indices";

export const getCrossIndexTool: TamboTool = {
  name: "getCrossIndex",
  description:
    "Get cross-dataset analysis details — join pattern, weights, SQL template. " +
    "11 analyses: urban-density, housing-pressure, landslide-risk, vertical-living, population-growth, shrinking-cities, " +
    "walkability, fifteen-min-city, biophilic, heat-vulnerability, water-security.",
  tool: getCrossIndex,
  inputSchema: z.object({
    analysis: z.enum(CROSS_INDEX_IDS as [string, ...string[]]),
  }),
  outputSchema: z.object({
    name: z.string(),
    description: z.string(),
    datasets: z.array(z.string()),
    joinColumn: z.string(),
    computedColumns: z.array(z.object({ name: z.string(), formula: z.string() })),
    equivalentSQL: z.string(),
    focusRegion: z.object({ name: z.string(), lat: z.number(), lng: z.number(), zoom: z.number() }),
  }),
};
