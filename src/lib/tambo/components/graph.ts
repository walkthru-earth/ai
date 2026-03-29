/**
 * Graph component registration - interactive charts (10 types).
 */

import type { TamboComponent } from "@tambo-ai/react";
import { graphSchema, InteractableGraph } from "@/components/tambo/graph";

export const graphComponent: TamboComponent = {
  name: "Graph",
  description:
    "Interactive chart. chartType: bar | line | area | pie | scatter | radar | radialBar | treemap | composed | funnel (see behavior rules for type selection). " +
    "INTERACTABLE: AI can update chartType, axes, xLabel, yLabel at runtime. " +
    "PREFERRED: pass queryId from runSQL + xColumn + yColumns + chartType (zero token cost). " +
    "composed overlays metrics (e.g. bar=precip + line=temp). Multiple yColumns overlay on same chart. " +
    "For population timeline: UNPIVOT wide columns → use xColumn='year', yColumns=['population']. " +
    "ALWAYS set xLabel and yLabel to explain axes.",
  component: InteractableGraph,
  propsSchema: graphSchema,
};
