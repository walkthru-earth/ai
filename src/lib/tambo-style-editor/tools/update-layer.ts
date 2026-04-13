/**
 * updateLayer tool - add, update, or remove a layer in the current style.
 * This is the primary tool for incremental style modifications.
 *
 * The `layerJson` parameter is a JSON STRING because MapLibre layer specs are
 * dynamic objects with hundreds of possible keys. Tambo structured output can't
 * represent z.record() or free-form objects, so we accept a string and parse it.
 */

import type { LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { getStyle, setStyle } from "@/services/style-store";
import { safeParseJson } from "./utils";

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

async function updateLayerFn(input: {
  action: "add" | "update" | "remove";
  layerId: string;
  layerJson?: string;
  beforeId?: string;
}) {
  const style = getStyle();
  if (!style) return { success: false, error: "No style loaded" };

  const { action, layerId, beforeId } = input;
  const layers = [...style.layers];

  if (action === "remove") {
    const idx = layers.findIndex((l) => l.id === layerId);
    if (idx === -1) return { success: false, error: `Layer '${layerId}' not found` };
    layers.splice(idx, 1);
    setStyle({ ...style, layers });
    return { success: true, action: "removed", layerId, layerCount: layers.length };
  }

  const layer = input.layerJson ? safeParseJson(input.layerJson) : null;

  if (action === "add") {
    if (!layer || !layer.type) {
      return {
        success: false,
        error:
          'layerJson must be valid JSON with "type". Example: {"type":"fill","source":"mysrc","paint":{"fill-color":"#ff0000"}}',
      };
    }
    if (layers.some((l) => l.id === layerId)) {
      return { success: false, error: `Layer '${layerId}' already exists. Use action='update' to modify.` };
    }
    // Validate source-layer exists: check against source-layers used by other layers in the style
    const requestedSourceLayer = layer["source-layer"] as string | undefined;
    const requestedSource = layer.source as string | undefined;
    if (requestedSourceLayer && requestedSource) {
      const knownSourceLayers = new Set(
        layers
          .filter((l) => "source" in l && l.source === requestedSource && "source-layer" in l)
          .map((l) => String((l as Record<string, unknown>)["source-layer"])),
      );
      if (knownSourceLayers.size > 0 && !knownSourceLayers.has(requestedSourceLayer)) {
        return {
          success: false,
          error:
            `Source-layer '${requestedSourceLayer}' not found in source '${requestedSource}'. ` +
            `Known source-layers: ${[...knownSourceLayers].join(", ")}. ` +
            "Call inspectStyle(target='source-layers') to discover available source-layers.",
        };
      }
    }
    const newLayer = { id: layerId, ...layer } as LayerSpecification;
    if (beforeId) {
      const idx = layers.findIndex((l) => l.id === beforeId);
      if (idx === -1) {
        layers.push(newLayer);
      } else {
        layers.splice(idx, 0, newLayer);
      }
    } else {
      layers.push(newLayer);
    }
    setStyle({ ...style, layers });
    return { success: true, action: "added", layerId, layerCount: layers.length };
  }

  if (action === "update") {
    const idx = layers.findIndex((l) => l.id === layerId);
    if (idx === -1) return { success: false, error: `Layer '${layerId}' not found` };
    if (!layer) {
      return {
        success: false,
        error: 'layerJson must be valid JSON. Example: {"paint":{"fill-color":"#ff0000"}}',
      };
    }
    layers[idx] = deepMerge(layers[idx] as unknown as Record<string, unknown>, {
      ...layer,
      id: layerId,
    }) as unknown as LayerSpecification;
    setStyle({ ...style, layers });
    return {
      success: true,
      action: "updated",
      layerId,
      updatedProperties: Object.keys(layer),
    };
  }

  return { success: false, error: `Unknown action: ${action}` };
}

export const updateLayerTool: TamboTool = {
  name: "updateLayer",
  description:
    "Add, update, or remove a layer in the MapLibre style. " +
    "For 'add': layerJson must include type, source, paint. " +
    "For 'update': layerJson contains only changed properties (deep-merged). " +
    "For 'remove': just layerId, no layerJson needed.",
  tool: updateLayerFn,
  inputSchema: z.object({
    action: z.enum(["add", "update", "remove"]).describe("add: new layer, update: modify existing, remove: delete"),
    layerId: z.string().describe("Unique layer ID"),
    layerJson: z
      .string()
      .optional()
      .describe(
        "JSON string of layer properties. Examples: " +
          '{"type":"fill","source":"countries","source-layer":"countries","paint":{"fill-color":"#ff0000","fill-opacity":0.8}} for add. ' +
          '{"paint":{"fill-color":["case",["==",["get","ADM0_A3"],"EGY"],"#e31a1c","#d9d9d9"]}} for update.',
      ),
    beforeId: z.string().optional().describe("Insert before this layer ID (controls z-order)"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
    action: z.string().optional(),
    layerId: z.string().optional(),
    layerCount: z.number().optional(),
    updatedProperties: z.array(z.string()).optional(),
  }),
};
