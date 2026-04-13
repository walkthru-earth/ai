/**
 * updateMapSettings tool - modify root-level style properties.
 * Uses JSON strings for complex nested objects (light, sky, terrain, transition).
 */

import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { getStyle, setStyle } from "@/services/style-store";
import { safeParseJson } from "./utils";

async function updateMapSettingsFn(input: {
  name?: string;
  sprite?: string;
  glyphs?: string;
  center?: number[];
  zoom?: number;
  bearing?: number;
  pitch?: number;
  lightJson?: string;
  skyJson?: string;
  terrainJson?: string;
  transitionJson?: string;
}) {
  const style = getStyle();
  if (!style) return { success: false, error: "No style loaded" };

  const updates: Record<string, unknown> = {};

  // Simple scalar fields
  if (input.name !== undefined && input.name !== null) updates.name = input.name;
  if (input.sprite !== undefined && input.sprite !== null) updates.sprite = input.sprite;
  if (input.glyphs !== undefined && input.glyphs !== null) updates.glyphs = input.glyphs;
  if (input.center !== undefined && input.center !== null) updates.center = input.center;
  if (input.zoom !== undefined && input.zoom !== null) updates.zoom = input.zoom;
  if (input.bearing !== undefined && input.bearing !== null) updates.bearing = input.bearing;
  if (input.pitch !== undefined && input.pitch !== null) updates.pitch = input.pitch;

  // JSON string fields for complex objects
  if (input.lightJson) {
    const light = safeParseJson(input.lightJson);
    if (light) updates.light = light;
  }
  if (input.skyJson) {
    const sky = safeParseJson(input.skyJson);
    if (sky) updates.sky = sky;
  }
  if (input.terrainJson) {
    const terrain = safeParseJson(input.terrainJson);
    if (terrain) updates.terrain = terrain;
  }
  if (input.transitionJson) {
    const transition = safeParseJson(input.transitionJson);
    if (transition) updates.transition = transition;
  }

  if (Object.keys(updates).length === 0) {
    return { success: false, error: "No valid settings provided." };
  }

  setStyle({ ...style, ...updates } as any);
  return {
    success: true,
    updatedSettings: Object.keys(updates),
  };
}

export const updateMapSettingsTool: TamboTool = {
  name: "updateMapSettings",
  description:
    "Modify root-level MapLibre style properties. Does NOT modify sources or layers (use updateSource/updateLayer).",
  tool: updateMapSettingsFn,
  inputSchema: z.object({
    name: z.string().optional().describe("Style display name"),
    sprite: z.string().optional().describe("Sprite URL (base, no extension)"),
    glyphs: z.string().optional().describe("Glyphs URL template with {fontstack} and {range}"),
    center: z.array(z.number()).optional().describe("[lng, lat] default center"),
    zoom: z.number().optional().describe("Default zoom level 0-24"),
    bearing: z.number().optional().describe("Default bearing in degrees"),
    pitch: z.number().optional().describe("Default pitch 0-85 degrees"),
    lightJson: z
      .string()
      .optional()
      .describe('Light config as JSON string: {"anchor":"viewport","color":"#fff","intensity":0.5}'),
    skyJson: z
      .string()
      .optional()
      .describe('Sky config as JSON string: {"sky-color":"#88c6fc","horizon-color":"#fff"}'),
    terrainJson: z
      .string()
      .optional()
      .describe('Terrain config as JSON string: {"source":"dem-source","exaggeration":1.5}'),
    transitionJson: z.string().optional().describe('Transition config as JSON string: {"duration":300,"delay":0}'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
    updatedSettings: z.array(z.string()).optional(),
  }),
};
