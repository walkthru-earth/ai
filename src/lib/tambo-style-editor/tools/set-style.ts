/**
 * setStyle tool - replace the entire MapLibre style JSON.
 * Use for loading a new style or wholesale replacement.
 * Accepts a JSON string since full styles are dynamic free-form objects.
 */

import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { setStyle } from "@/services/style-store";

async function setStyleFn(input: { styleJson: string }) {
  let style: StyleSpecification;
  try {
    // Tambo may pass either a JSON string or an already-parsed object
    const parsed =
      typeof input.styleJson === "object" && input.styleJson !== null ? input.styleJson : JSON.parse(input.styleJson);
    if (!parsed || typeof parsed !== "object" || !parsed.version || !Array.isArray(parsed.layers)) {
      return { success: false, error: "Invalid style: JSON must have 'version' (number) and 'layers' (array)." };
    }
    style = parsed as StyleSpecification;
  } catch (e) {
    return { success: false, error: `Invalid JSON: ${String(e)}` };
  }

  setStyle(style);
  return {
    success: true,
    sourceCount: Object.keys(style.sources || {}).length,
    layerCount: style.layers.length,
    layerIds: style.layers.map((l) => l.id),
  };
}

export const setStyleTool: TamboTool = {
  name: "setStyle",
  description:
    "Replace the ENTIRE MapLibre style JSON. Use only for loading a completely new style. " +
    "For incremental edits, use updateLayer or updateSource instead. " +
    "Prefer loadStyleUrl for loading from a URL.",
  tool: setStyleFn,
  inputSchema: z.object({
    styleJson: z
      .string()
      .describe(
        "Complete MapLibre style as a JSON string. Must have version:8, sources:{}, layers:[]. " +
          'Example: {"version":8,"sources":{},"layers":[{"id":"bg","type":"background","paint":{"background-color":"#1a1a2e"}}]}',
      ),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
    sourceCount: z.number().optional(),
    layerCount: z.number().optional(),
    layerIds: z.array(z.string()).optional(),
  }),
};
