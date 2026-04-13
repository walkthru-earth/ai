/**
 * validateStyle tool - run MapLibre style spec validation on the current style.
 */

import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { getStyle } from "@/services/style-store";

async function validateStyleFn() {
  const style = getStyle();
  if (!style) return { valid: false, errorMessages: ["No style loaded"], errorCount: 1 };

  const errors = validateStyleMin(style as any);
  if (!errors || errors.length === 0) {
    return { valid: true, errorMessages: [], errorCount: 0 };
  }

  return {
    valid: false,
    errorCount: errors.length,
    errorMessages: errors.slice(0, 10).map((e: any) => {
      const id = e.identifier ? ` [${e.identifier}]` : "";
      return `${e.message}${id}`;
    }),
  };
}

export const validateStyleTool: TamboTool = {
  name: "validateStyle",
  description:
    "Validate the current MapLibre style against the spec. Returns error messages. " +
    "Call this after making changes to catch issues before they break the map.",
  tool: validateStyleFn,
  inputSchema: z.object({}),
  outputSchema: z.object({
    valid: z.boolean().describe("Whether the style is valid"),
    errorCount: z.number().describe("Number of validation errors"),
    errorMessages: z.array(z.string()).describe("Error messages (max 10)"),
  }),
};
