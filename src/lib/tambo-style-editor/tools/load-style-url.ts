/**
 * loadStyleUrl tool - fetch and apply a style JSON from a remote URL.
 */

import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { getStyle, loadStyleFromUrl } from "@/services/style-store";

async function loadStyleUrlFn(input: { url: string }) {
  const result = await loadStyleFromUrl(input.url);
  if (!result.ok) return { success: false, error: result.error };

  const style = getStyle();
  return {
    success: true,
    sourceCount: Object.keys(style?.sources || {}).length,
    layerCount: style?.layers.length || 0,
    sourceIds: Object.keys(style?.sources || {}),
    layerIds: style?.layers.map((l) => l.id) || [],
  };
}

export const loadStyleUrlTool: TamboTool = {
  name: "loadStyleUrl",
  description:
    "Fetch a MapLibre/Mapbox style JSON from a URL and load it into the editor. " +
    "The map will update immediately. Returns the list of sources and layers found. " +
    "VersaTiles presets: https://tiles.versatiles.org/assets/styles/{name}/style.json " +
    "where name = colorful, eclipse, graybeard, neutrino, shadow, satellite, terrain. " +
    "Add /en.json for English labels instead of /style.json.",
  tool: loadStyleUrlFn,
  inputSchema: z.object({
    url: z.string().describe("URL to a MapLibre/Mapbox style JSON file"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
    sourceCount: z.number().optional(),
    layerCount: z.number().optional(),
    sourceIds: z.array(z.string()).optional(),
    layerIds: z.array(z.string()).optional(),
  }),
};
