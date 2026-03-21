/**
 * getCrossIndex tool — retrieves cross-dataset analysis patterns.
 * Edit the enum list when adding new cross-indices.
 */

import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { getCrossIndex } from "@/services/cross-indices";

export const getCrossIndexTool: TamboTool = {
  name: "getCrossIndex",
  description:
    "Get cross-dataset analysis details — join pattern, weights, SQL template. " +
    "11 analyses: urban-density, housing-pressure, landslide-risk, vertical-living, population-growth, shrinking-cities, " +
    "walkability, fifteen-min-city, biophilic, heat-vulnerability, water-security.",
  tool: getCrossIndex,
  inputSchema: z.object({
    analysis: z.enum([
      "urban-density",
      "housing-pressure",
      "landslide-risk",
      "vertical-living",
      "population-growth",
      "shrinking-cities",
      "walkability",
      "fifteen-min-city",
      "biophilic",
      "heat-vulnerability",
      "water-security",
    ]),
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
