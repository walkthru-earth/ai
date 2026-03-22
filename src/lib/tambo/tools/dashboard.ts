/**
 * Dashboard management tools — clear/dismiss panels from the dashboard.
 */

import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { requestDismissPanel } from "@/services/query-store";

function dismissPanels(input: { target: string }): { success: boolean; message: string } {
  requestDismissPanel(input.target);
  const label = input.target === "all" ? "all panels" : `"${input.target}" panel(s)`;
  return { success: true, message: `Dismissed ${label} from the dashboard.` };
}

export const dismissPanelsTool: TamboTool = {
  name: "dismissPanels",
  description:
    "Dismiss/remove panels from the dashboard. " +
    "Use when user says 'clear dashboard', 'remove the map', 'close the chart', 'start fresh', etc. " +
    'target: "all" clears everything. Or pass a component type: "GeoMap", "Graph", "DataTable", "StatsCard", "StatsGrid", "InsightCard".',
  tool: dismissPanels,
  inputSchema: z.object({
    target: z
      .string()
      .describe(
        'What to dismiss. "all" = clear entire dashboard. ' +
          'Or a component type name: "GeoMap", "Graph", "DataTable", "StatsCard", "StatsGrid", "InsightCard", "DatasetCard", "QueryDisplay". ' +
          "Matches case-insensitively against panel component names.",
      ),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
};
