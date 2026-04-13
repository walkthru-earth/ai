/**
 * inspectStyle tool - read details of a specific layer, source, or the full style summary.
 *
 * This is the AI's "eyes" into the style. Instead of sending the full style in every
 * context message (~thousands of tokens), the AI calls this on-demand to read only
 * what it needs before making modifications.
 *
 * Token savings: context sends ~50 tokens (compact fingerprint) instead of ~2000+
 * for a full style. The AI then spends ~100 tokens per inspect call only when needed.
 */

import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { getLayerById, getSourceById, getStyle } from "@/services/style-store";

async function inspectStyleFn(input: {
  target: "layer" | "source" | "root" | "all-layers" | "all-sources" | "source-layers";
  id?: string;
}) {
  const style = getStyle();
  if (!style) return { found: false, detail: "No style loaded." };

  const { target, id } = input;

  if (target === "layer") {
    if (!id) return { found: false, detail: "Provide layer id." };
    const layer = getLayerById(id);
    if (!layer) return { found: false, detail: `Layer '${id}' not found.` };
    return { found: true, detail: JSON.stringify(layer) };
  }

  if (target === "source") {
    if (!id) return { found: false, detail: "Provide source id." };
    const source = getSourceById(id);
    if (!source) return { found: false, detail: `Source '${id}' not found.` };
    return { found: true, detail: JSON.stringify({ id, ...(source as Record<string, unknown>) }) };
  }

  if (target === "root") {
    // Return root properties (everything except sources and layers)
    const { sources: _s, layers: _l, ...root } = style;
    return { found: true, detail: JSON.stringify(root) };
  }

  if (target === "all-layers") {
    // Compact list: id, type, source, visibility, key paint props
    const summary = style.layers.map((l) => {
      const entry: Record<string, unknown> = { id: l.id, type: l.type };
      if ("source" in l && l.source) entry.source = l.source;
      if ("source-layer" in l) entry["source-layer"] = (l as any)["source-layer"];
      if ("filter" in l && l.filter) entry.filter = l.filter;
      // Include key paint values (just the property names and simple values)
      if ("paint" in l && l.paint) {
        const paintSummary: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(l.paint as Record<string, unknown>)) {
          // For simple values, include directly. For expressions, just note "expr"
          if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
            paintSummary[k] = v;
          } else {
            paintSummary[k] = "[expr]";
          }
        }
        entry.paint = paintSummary;
      }
      const layout = (l as any).layout;
      if (layout?.visibility) entry.visibility = layout.visibility;
      return entry;
    });
    return { found: true, detail: JSON.stringify(summary) };
  }

  if (target === "all-sources") {
    const summary: Record<string, unknown> = {};
    for (const [id, src] of Object.entries(style.sources || {})) {
      const s = src as Record<string, unknown>;
      // Compact: just type + key identifying property
      const entry: Record<string, unknown> = { type: s.type };
      if (s.url) entry.url = s.url;
      if (s.tiles) entry.tiles = s.tiles;
      if (s.data && typeof s.data === "string") entry.data = s.data;
      if (s.tileSize) entry.tileSize = s.tileSize;
      summary[id] = entry;
    }
    return { found: true, detail: JSON.stringify(summary) };
  }

  if (target === "source-layers") {
    // Extract source-layers used by existing layers (known to work)
    const usedSourceLayers: Record<string, string[]> = {};
    for (const l of style.layers) {
      const src = "source" in l && l.source ? String(l.source) : "";
      const sl = "source-layer" in l ? String((l as Record<string, unknown>)["source-layer"]) : "";
      if (src && sl) {
        if (!usedSourceLayers[src]) usedSourceLayers[src] = [];
        if (!usedSourceLayers[src].includes(sl)) usedSourceLayers[src].push(sl);
      }
    }

    // For vector sources with a TileJSON URL, try fetching vector_layers metadata
    const discovered: Record<string, string[]> = {};
    for (const [srcId, src] of Object.entries(style.sources || {})) {
      const s = src as Record<string, unknown>;
      if (s.type === "vector" && typeof s.url === "string") {
        try {
          const res = await fetch(s.url as string);
          if (res.ok) {
            const tileJson = await res.json();
            if (Array.isArray(tileJson.vector_layers)) {
              discovered[srcId] = tileJson.vector_layers.map((vl: Record<string, unknown>) => String(vl.id));
            }
          }
        } catch {
          // Fetch failed, rely on used source-layers only
        }
      }
    }

    const result: Record<string, { used: string[]; available?: string[] }> = {};
    const allSources = new Set([...Object.keys(usedSourceLayers), ...Object.keys(discovered)]);
    for (const src of allSources) {
      result[src] = { used: usedSourceLayers[src] || [] };
      if (discovered[src]) result[src].available = discovered[src];
    }
    return { found: true, detail: JSON.stringify(result) };
  }

  return { found: false, detail: `Unknown target: ${target}` };
}

export const inspectStyleTool: TamboTool = {
  name: "inspectStyle",
  description:
    "Read details of layers, sources, or root properties from the current style. " +
    "ALWAYS call this before modifying a layer to see its current properties. " +
    "Use target='layer' + id to read one layer. Use 'all-layers' for a compact summary of all layers with their paint values. " +
    "Use 'source' + id for one source. Use 'root' for name, sprite, glyphs, center, zoom. " +
    "IMPORTANT: Use 'source-layers' before ADDING a layer to see which source-layers actually exist in vector sources.",
  tool: inspectStyleFn,
  inputSchema: z.object({
    target: z
      .enum(["layer", "source", "root", "all-layers", "all-sources", "source-layers"])
      .describe(
        "What to inspect: 'layer' (one layer by id), 'source' (one source by id), 'root' (style root props), 'all-layers' (compact summary), 'all-sources' (compact summary), 'source-layers' (discover available source-layers in vector sources)",
      ),
    id: z.string().optional().describe("Layer or source ID. Required when target is 'layer' or 'source'."),
  }),
  outputSchema: z.object({
    found: z.boolean().describe("Whether the target was found"),
    detail: z.string().describe("JSON string with the requested details"),
  }),
};
