/**
 * suggestAnalysis tool — routes natural language to best datasets/cross-indices.
 */

import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { suggestAnalysis } from "@/services/suggest-analysis";

export const suggestAnalysisTool: TamboTool = {
  name: "suggestAnalysis",
  description: "Given a question, suggest best datasets and cross-index analysis approach.",
  tool: suggestAnalysis,
  inputSchema: z.object({
    question: z.string().describe("Natural language question about cities, climate, amenities, walkability, etc."),
  }),
  outputSchema: z.object({
    suggestedDatasets: z.array(z.string()),
    suggestedCrossIndex: z.string().nullable(),
    columns: z.array(z.string()),
    explanation: z.string(),
    sampleSQL: z.string(),
  }),
};
