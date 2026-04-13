/**
 * Style Store - reactive state management for MapLibre style JSON.
 *
 * Similar pattern to query-store.ts but holds a single StyleSpecification.
 * AI tools modify the style, the map renders it, users can export it.
 */

import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import { useSyncExternalStore } from "react";

/* ── Store State ─────────────────────────────────────────────────── */

let currentStyle: StyleSpecification | null = null;
let styleVersion = 0;

const listeners = new Set<() => void>();
function emit() {
  styleVersion++;
  for (const fn of listeners) fn();
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/* ── Public API ──────────────────────────────────────────────────── */

/** Get the current style (non-reactive, for tools). */
export function getStyle(): StyleSpecification | null {
  return currentStyle;
}

/** Replace the full style. Notifies all subscribers. */
export function setStyle(style: StyleSpecification): void {
  currentStyle = style;
  emit();
}

/** Reactive hook for components (via useSyncExternalStore). */
export function useStyle(): StyleSpecification | null {
  return useSyncExternalStore(
    subscribe,
    () => currentStyle,
    () => null,
  );
}

/** Reactive version counter for triggering effects. */
export function useStyleVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => styleVersion,
    () => 0,
  );
}

/* ── Load / Export ───────────────────────────────────────────────── */

/** Fetch a style JSON from URL, validate, and set as current. */
export async function loadStyleFromUrl(url: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
    const json = await res.json();
    // Basic validation: must have version and layers
    if (!json.version || !Array.isArray(json.layers)) {
      return { ok: false, error: "Invalid style JSON: missing 'version' or 'layers'" };
    }
    setStyle(json as StyleSpecification);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Export current style as formatted JSON string. */
export function exportStyleJSON(): string | null {
  if (!currentStyle) return null;
  return JSON.stringify(currentStyle, null, 2);
}

/** Trigger a browser file download from a Blob. */
export function downloadStyleJSON(): void {
  const json = exportStyleJSON();
  if (!json) return;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "style.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ── Layer Helpers ───────────────────────────────────────────────── */

/** Get a layer by ID from the current style. */
export function getLayerById(layerId: string) {
  return currentStyle?.layers.find((l) => l.id === layerId) ?? null;
}

/** Get a source by ID from the current style. */
export function getSourceById(sourceId: string) {
  if (!currentStyle?.sources) return null;
  return currentStyle.sources[sourceId] ?? null;
}

/** Get a summary of all sources and layers for @mention listing. */
export function getStyleInventory(): {
  sources: { id: string; type: string }[];
  layers: { id: string; type: string; source?: string }[];
} {
  if (!currentStyle) return { sources: [], layers: [] };
  const sources = Object.entries(currentStyle.sources || {}).map(([id, src]) => ({
    id,
    type: ((src as Record<string, unknown>).type as string) || "unknown",
  }));
  const layers = currentStyle.layers.map((l) => ({
    id: l.id,
    type: l.type,
    source: "source" in l ? (l.source as string) : undefined,
  }));
  return { sources, layers };
}

/**
 * Compact style fingerprint for AI context (token-optimized).
 * ~1 token per layer instead of ~20. Format: "id:type:source" per line.
 * AI uses inspectLayer/inspectSource tools to read full details on demand.
 */
export function getCompactStyleFingerprint(): string {
  if (!currentStyle) return "No style loaded.";

  const lines: string[] = [];

  // Root info (1 line)
  const name = currentStyle.name || "Untitled";
  lines.push(
    `style: ${name} | v${currentStyle.version} | ${Object.keys(currentStyle.sources || {}).length}src ${currentStyle.layers.length}layers`,
  );

  // Sources (compact: id=type)
  if (currentStyle.sources) {
    const srcParts: string[] = [];
    for (const [id, src] of Object.entries(currentStyle.sources)) {
      const type = (src as Record<string, unknown>).type || "?";
      srcParts.push(`${id}=${type}`);
    }
    if (srcParts.length > 0) lines.push(`sources: ${srcParts.join(", ")}`);
  }

  // Layers (compact: id:type<source)
  // Group consecutive layers by source for further compression
  const layerParts: string[] = [];
  let lastSource = "";
  for (const l of currentStyle.layers) {
    const src = "source" in l && l.source ? String(l.source) : "";
    const srcTag = src && src !== lastSource ? `<${src}` : "";
    layerParts.push(`${l.id}:${l.type}${srcTag}`);
    if (src) lastSource = src;
  }
  lines.push(`layers: ${layerParts.join(" | ")}`);

  // Source-layers (so AI knows what's available, prevents hallucinating names)
  const sourceLayerMap: Record<string, Set<string>> = {};
  for (const l of currentStyle.layers) {
    const src = "source" in l && l.source ? String(l.source) : "";
    const sl = "source-layer" in l ? String((l as Record<string, unknown>)["source-layer"]) : "";
    if (src && sl) {
      if (!sourceLayerMap[src]) sourceLayerMap[src] = new Set();
      sourceLayerMap[src].add(sl);
    }
  }
  const slParts: string[] = [];
  for (const [src, sls] of Object.entries(sourceLayerMap)) {
    slParts.push(`${src}:[${[...sls].join(",")}]`);
  }
  if (slParts.length > 0) lines.push(`source-layers: ${slParts.join(" ")}`);

  // Root props that exist
  const rootProps: string[] = [];
  if (currentStyle.sprite) rootProps.push("sprite");
  if (currentStyle.glyphs) rootProps.push("glyphs");
  const styleExt = currentStyle as unknown as Record<string, unknown>;
  if (styleExt.terrain) rootProps.push("terrain");
  if (styleExt.sky) rootProps.push("sky");
  if (styleExt.light) rootProps.push("light");
  if (rootProps.length > 0) lines.push(`has: ${rootProps.join(", ")}`);

  return lines.join("\n");
}

/* ── Default Style ───────────────────────────────────────────────── */

/** Minimal empty style to start with when no URL is provided. */
export const EMPTY_STYLE: StyleSpecification = {
  version: 8,
  name: "Untitled Style",
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#1a1a2e",
      },
    },
  ],
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sprite: "https://demotiles.maplibre.org/styles/osm-bright-gl-style/sprite",
};
