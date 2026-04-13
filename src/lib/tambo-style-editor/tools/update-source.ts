/**
 * updateSource tool - add, update, or remove a source in the current style.
 * Uses JSON string parameter for the same reason as updateLayer.
 */

import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { getStyle, setStyle } from "@/services/style-store";
import { safeParseJson } from "./utils";

async function updateSourceFn(input: { action: "add" | "update" | "remove"; sourceId: string; sourceJson?: string }) {
  const style = getStyle();
  if (!style) return { success: false, error: "No style loaded" };

  const { action, sourceId } = input;
  const source = input.sourceJson ? safeParseJson(input.sourceJson) : null;
  const sources = { ...(style.sources || {}) };

  if (action === "remove") {
    if (!sources[sourceId]) return { success: false, error: `Source '${sourceId}' not found` };
    const dependentLayers = style.layers.filter((l) => "source" in l && l.source === sourceId);
    if (dependentLayers.length > 0) {
      return {
        success: false,
        error: `Cannot remove '${sourceId}', ${dependentLayers.length} layer(s) depend on it: ${dependentLayers.map((l) => l.id).join(", ")}`,
      };
    }
    delete sources[sourceId];
    setStyle({ ...style, sources });
    return { success: true, action: "removed", sourceId, sourceCount: Object.keys(sources).length };
  }

  if (action === "add") {
    if (sources[sourceId]) {
      return { success: false, error: `Source '${sourceId}' already exists. Use action='update'.` };
    }
    if (!source || !source.type) {
      return {
        success: false,
        error:
          'sourceJson must be valid JSON with "type". Example: {"type":"vector","url":"https://example.com/tiles.json"}',
      };
    }
    sources[sourceId] = source as any;
    setStyle({ ...style, sources });
    return {
      success: true,
      action: "added",
      sourceId,
      sourceType: source.type as string,
      sourceCount: Object.keys(sources).length,
    };
  }

  if (action === "update") {
    if (!sources[sourceId]) return { success: false, error: `Source '${sourceId}' not found` };
    if (!source) {
      return { success: false, error: "sourceJson must be valid JSON with properties to update." };
    }
    sources[sourceId] = { ...(sources[sourceId] as any), ...source } as any;
    setStyle({ ...style, sources });
    return { success: true, action: "updated", sourceId, updatedProperties: Object.keys(source) };
  }

  return { success: false, error: `Unknown action: ${action}` };
}

export const updateSourceTool: TamboTool = {
  name: "updateSource",
  description:
    "Add, update, or remove a data source. " +
    "Source types: vector, raster, raster-dem, geojson, image, video. " +
    "Cannot remove a source with dependent layers.",
  tool: updateSourceFn,
  inputSchema: z.object({
    action: z.enum(["add", "update", "remove"]).describe("add: new source, update: modify, remove: delete"),
    sourceId: z.string().describe("Unique source ID"),
    sourceJson: z
      .string()
      .optional()
      .describe(
        "JSON string of source spec. Examples: " +
          '{"type":"vector","url":"https://demotiles.maplibre.org/tiles/tiles.json"} or ' +
          '{"type":"geojson","data":"https://example.com/data.geojson"} or ' +
          '{"type":"raster","tiles":["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],"tileSize":256}',
      ),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
    action: z.string().optional(),
    sourceId: z.string().optional(),
    sourceType: z.string().optional(),
    sourceCount: z.number().optional(),
    updatedProperties: z.array(z.string()).optional(),
  }),
};
