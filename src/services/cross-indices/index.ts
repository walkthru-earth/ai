/**
 * Cross-index registry — aggregates all cross-index definitions and exports getCrossIndex tool.
 */

import { biophilic } from "./biophilic";
import { fifteenMinCity } from "./fifteen-min-city";
import { heatVulnerability } from "./heat-vulnerability";
import { housingPressure } from "./housing-pressure";
import { landslideRisk } from "./landslide-risk";
import { populationGrowth } from "./population-growth";
import { shrinkingCities } from "./shrinking-cities";
import type { CrossIndexDefinition, CrossIndexInput } from "./types";
import { urbanDensity } from "./urban-density";
import { verticalLiving } from "./vertical-living";
import { walkability } from "./walkability";
import { waterSecurity } from "./water-security";

/* ── Registry ────────────────────────────────────────────────────── */

const CROSS_INDICES: Record<string, CrossIndexDefinition> = {
  "urban-density": urbanDensity,
  "housing-pressure": housingPressure,
  "landslide-risk": landslideRisk,
  "vertical-living": verticalLiving,
  "population-growth": populationGrowth,
  "shrinking-cities": shrinkingCities,
  walkability: walkability,
  "fifteen-min-city": fifteenMinCity,
  biophilic: biophilic,
  "heat-vulnerability": heatVulnerability,
  "water-security": waterSecurity,
};

export const CROSS_INDEX_IDS = Object.keys(CROSS_INDICES) as string[];

/* ── Tool: Get cross-index analysis ──────────────────────────────── */

export async function getCrossIndex(input: CrossIndexInput): Promise<CrossIndexDefinition> {
  const result = CROSS_INDICES[input.analysis];
  if (!result) {
    throw new Error(`Unknown analysis: ${input.analysis}. Available: ${CROSS_INDEX_IDS.join(", ")}`);
  }
  // Dynamically replace LIMIT 500 in equivalentSQL with user's configured queryLimit
  const { getSettings } = await import("@/lib/settings-store");
  const { queryLimit } = getSettings();
  return {
    ...result,
    equivalentSQL: result.equivalentSQL.replace(/LIMIT 500/g, `LIMIT ${queryLimit}`),
  };
}

// Re-export types
export type { CrossIndexDefinition, CrossIndexInput };
