/**
 * setLayerProperty - surgical, path-based layer editor.
 *
 * Solves the "AI serialized a 2KB nested expression and mistyped one bracket"
 * problem. The AI targets ONE property at a time (or batches several) by path,
 * and passes only the value it wants to set. Auto-validates via style-spec and
 * rolls back on error so the AI gets immediate, actionable feedback.
 *
 * Supports dot paths into `paint`/`layout`, plus top-level props like
 * `minzoom`, `maxzoom`, `filter`, `source-layer`, `source`.
 */

import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { getStyle, setStyle } from "@/services/style-store";
import { parseJsonValue } from "./utils";

const ALLOWED_TOP_LEVEL = new Set([
  "minzoom",
  "maxzoom",
  "filter",
  "source",
  "source-layer",
  "paint",
  "layout",
  "metadata",
]);

type Patch = {
  path: string;
  valueJson?: unknown;
  unset?: boolean;
};

/** Apply one patch to a layer object, returning the new layer (immutable). */
function applyPatch(
  layer: Record<string, unknown>,
  patch: Patch,
): { ok: true; layer: Record<string, unknown>; applied: unknown } | { ok: false; error: string } {
  const rawPath = patch.path.trim();
  if (!rawPath) return { ok: false, error: "path is required" };
  const segments = rawPath.split(".").filter(Boolean);
  if (segments.length === 0) return { ok: false, error: `Invalid path: '${patch.path}'` };

  const head = segments[0];
  if (!ALLOWED_TOP_LEVEL.has(head) && head !== "id" && head !== "type") {
    return {
      ok: false,
      error: `Top-level path '${head}' is not editable. Allowed: ${[...ALLOWED_TOP_LEVEL].join(", ")}.`,
    };
  }
  if (head === "id" || head === "type") {
    return {
      ok: false,
      error: `Cannot change '${head}' via setLayerProperty. Use updateLayer with action='add'/'remove'.`,
    };
  }

  // Clone down the path so we don't mutate the live style
  const next: Record<string, unknown> = { ...layer };
  let cursor: Record<string, unknown> = next;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    const existing = cursor[key];
    const cloned: Record<string, unknown> =
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    cursor[key] = cloned;
    cursor = cloned;
  }

  const leaf = segments[segments.length - 1];
  let applied: unknown;

  if (patch.unset) {
    delete cursor[leaf];
  } else {
    const parsed = parseJsonValue(patch.valueJson);
    if (!parsed.ok) return { ok: false, error: `path '${patch.path}': ${parsed.error}` };
    cursor[leaf] = parsed.value;
    applied = parsed.value;
  }

  // Prune now-empty paint/layout objects so validator stays happy
  for (const container of ["paint", "layout"] as const) {
    const obj = next[container];
    if (obj && typeof obj === "object" && !Array.isArray(obj) && Object.keys(obj).length === 0) {
      delete next[container];
    }
  }

  return { ok: true, layer: next, applied };
}

async function setLayerPropertyFn(input: { layerId: string; patches: Patch[]; validate?: boolean }) {
  const style = getStyle();
  if (!style) return { success: false, error: "No style loaded" };

  const { layerId, patches } = input;
  if (!patches || patches.length === 0) {
    return {
      success: false,
      error: "Provide at least one patch. Example: patches=[{path:'paint.fill-color',valueJson:'\"#ff0000\"'}]",
    };
  }

  const layers = [...style.layers];
  const idx = layers.findIndex((l) => l.id === layerId);
  if (idx === -1) return { success: false, error: `Layer '${layerId}' not found` };

  let working = layers[idx] as unknown as Record<string, unknown>;
  const appliedPatches: Array<{ path: string; value?: unknown; unset?: boolean }> = [];

  for (const patch of patches) {
    const res = applyPatch(working, patch);
    if (!res.ok) return { success: false, error: res.error, appliedPatches };
    working = res.layer;
    appliedPatches.push(patch.unset ? { path: patch.path, unset: true } : { path: patch.path, value: res.applied });
  }

  // Build candidate style with the new layer
  layers[idx] = working as unknown as (typeof layers)[number];
  const candidateStyle = { ...style, layers };

  // Default: validate and roll back if invalid. Opt out with validate:false.
  const shouldValidate = input.validate !== false;
  if (shouldValidate) {
    const errors = validateStyleMin(candidateStyle as Parameters<typeof validateStyleMin>[0]);
    const layerErrors = (errors || []).filter(
      (e: { identifier?: string }) => !e.identifier || e.identifier === layerId,
    );
    if (layerErrors.length > 0) {
      return {
        success: false,
        error: `Validation failed, changes NOT applied: ${layerErrors
          .slice(0, 5)
          .map((e: { message: string }) => e.message)
          .join("; ")}`,
        appliedPatches,
      };
    }
  }

  setStyle(candidateStyle);
  return {
    success: true,
    layerId,
    appliedPatches,
    layerCount: layers.length,
  };
}

export const setLayerPropertyTool: TamboTool = {
  name: "setLayerProperty",
  description:
    "PREFERRED for single-property edits. Surgically set one or more properties on a layer by dot-path. " +
    "Far more reliable than updateLayer for nested expressions because the AI only serializes the VALUE, not the whole paint/layout object. " +
    "Auto-validates via MapLibre spec; rolls back on error. " +
    "Common paths: 'paint.fill-color', 'paint.fill-opacity', 'layout.visibility', 'minzoom', 'maxzoom', 'filter', 'source-layer'. " +
    "Zoom range ('show at zoom 3-5 only'): set minzoom=3 AND maxzoom=5 in one call with two patches. " +
    "Hide a layer: path='layout.visibility', valueJson='\"none\"'. " +
    "Preserve existing expressions: first inspectStyle(target='layer'), then pass the new full value (including the preserved expression) as valueJson.",
  tool: setLayerPropertyFn,
  inputSchema: z.object({
    layerId: z.string().describe("The layer to edit"),
    patches: z
      .array(
        z.object({
          path: z
            .string()
            .describe("Dot path into the layer. e.g. 'paint.fill-color', 'layout.visibility', 'minzoom', 'filter'."),
          valueJson: z
            .string()
            .optional()
            .describe(
              'JSON-encoded value. Strings MUST be quoted: \'"#ff0000"\'. Numbers: \'3\'. Expressions: \'["case",["==",["get","kind"],"motorway"],"#ff0000","#888"]\'. Omit with unset:true to delete.',
            ),
          unset: z.boolean().optional().describe("If true, delete the key at path instead of setting it."),
        }),
      )
      .min(1)
      .describe("One or more patches applied in order."),
    validate: z.boolean().optional().describe("Validate via style-spec and roll back on error. Default true."),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
    layerId: z.string().optional(),
    appliedPatches: z
      .array(
        z.object({
          path: z.string(),
          value: z.unknown().optional(),
          unset: z.boolean().optional(),
        }),
      )
      .optional(),
    layerCount: z.number().optional(),
  }),
};
