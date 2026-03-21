/**
 * Graph component registration — interactive charts (10 types).
 */

import type { TamboComponent } from "@tambo-ai/react";
import { graphSchema, InteractableGraph } from "@/components/tambo/graph";

export const graphComponent: TamboComponent = {
  name: "Graph",
  description:
    "Interactive chart (bar/line/area/pie/scatter/radar/radialBar/treemap/composed/funnel). INTERACTABLE: AI can update chartType, axes, xLabel, yLabel at runtime. " +
    "PREFERRED: pass queryId from runSQL + xColumn + yColumns + chartType (zero token cost). " +
    "CHART TYPE SELECTION: line for time-series (weather forecast, population trend), bar for ranking/comparison, " +
    "area for cumulative/stacked data, pie for proportions, scatter for correlation (e.g. height vs population), " +
    "composed for overlaying metrics (e.g. bar=precip + line=temp). Multiple yColumns overlay on same chart. " +
    "For population timeline: UNPIVOT wide columns → use xColumn='year', yColumns=['population']. " +
    "UPDATE vs NEW: Update for SAME data (switch chart type, change axes). CREATE NEW for DIFFERENT data/filter/metric. " +
    "NEVER change queryId via update_component_props — always create new. " +
    "ALWAYS set xLabel and yLabel to explain axes.",
  component: InteractableGraph,
  propsSchema: graphSchema,
};
