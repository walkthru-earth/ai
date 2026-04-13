/**
 * Context builder for the MapLibre Style Editor.
 *
 * Token optimization strategy:
 * - Context sends a compact fingerprint (~50-100 tokens) instead of full style (~2000+)
 * - AI uses inspectStyle tool on-demand to read layer/source details before modifying
 * - Spec reference is static (~1200 tokens), sent once per conversation
 * - Shortbread schema included only when a VersaTiles style is loaded (~400 tokens)
 * - Behavior rules are compact imperatives (~800 tokens)
 */

import { getCompactStyleFingerprint, getStyle } from "@/services/style-store";
import { styleEditorBehavior } from "./behavior";
import { maplibreSpecReference } from "./maplibre-spec";
import { shortbreadSchemaReference } from "./shortbread-schema";

/** Detect if the current style uses VersaTiles/Shortbread tiles. */
function isShortbreadStyle(): boolean {
  const style = getStyle();
  if (!style?.sources) return false;
  for (const src of Object.values(style.sources)) {
    const s = src as Record<string, unknown>;
    // VersaTiles source ID or tile URL pattern
    if (typeof s.tiles === "object" && Array.isArray(s.tiles)) {
      for (const tile of s.tiles) {
        if (typeof tile === "string" && tile.includes("versatiles")) return true;
      }
    }
    if (typeof s.url === "string" && s.url.includes("versatiles")) return true;
  }
  // Also detect by source ID naming convention
  for (const id of Object.keys(style.sources)) {
    if (id.includes("shortbread") || id.includes("versatiles")) return true;
  }
  return false;
}

export function buildStyleEditorContext() {
  return {
    styleEditorContext: () => {
      const context: Record<string, unknown> = {
        platform: "walkthru.earth/style-editor",
        behavior: styleEditorBehavior,
        maplibreStyleSpec: maplibreSpecReference,
        currentStyle: getCompactStyleFingerprint(),
      };

      // Only include Shortbread schema when relevant (saves ~400 tokens otherwise)
      if (isShortbreadStyle()) {
        context.tileSchema = shortbreadSchemaReference;
      }

      return context;
    },
  };
}
