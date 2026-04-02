/**
 * Export tool - download query results as CSV.
 */

import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { exportQueryToCSV } from "@/services/export";

export const exportCSVTool: TamboTool = {
  name: "exportCSV",
  description:
    "Download query results as a CSV file. Call this when the user asks to export, download, or save data. " +
    "Requires a queryId from a previous runSQL call. The file downloads instantly in the browser.",
  tool: exportQueryToCSV,
  inputSchema: z.object({
    queryId: z.string().describe("queryId from a previous runSQL result"),
    filename: z.string().optional().describe("Filename without extension (default: 'export')"),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("Whether the export succeeded"),
    rowCount: z.number().describe("Number of rows exported"),
    filename: z.string().describe("The downloaded filename"),
  }),
};
