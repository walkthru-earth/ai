/**
 * Style Editor Page - AI-powered MapLibre style editor.
 * Loads style from ?style= query param or starts with empty style.
 */

import { TamboProvider } from "@tambo-ai/react";
import { useEffect, useMemo } from "react";
import { StyleEditorLayout } from "@/components/style-editor/style-editor-layout";
import { buildStyleEditorContext, styleEditorProviderConfig, styleEditorSuggestions } from "@/lib/tambo-style-editor";
import { useAnonymousUserKey } from "@/lib/use-anonymous-user-key";
import { EMPTY_STYLE, getStyle, getStyleInventory, loadStyleFromUrl, setStyle } from "@/services/style-store";

/** Dynamic resource listing for @mentions (sources and layers). */
async function listStyleResources(search?: string) {
  const inventory = getStyleInventory();
  const items = [
    ...inventory.sources.map((s) => ({
      uri: `style://source/${s.id}`,
      name: `${s.id} (${s.type} source)`,
      mimeType: "application/json",
    })),
    ...inventory.layers.map((l) => ({
      uri: `style://layer/${l.id}`,
      name: `${l.id} [${l.type}]${l.source ? ` from ${l.source}` : ""}`,
      mimeType: "application/json",
    })),
  ];

  if (search) {
    const q = search.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }
  return items;
}

/** Fetch resource content for @mentioned source or layer. */
async function getStyleResource(uri: string) {
  const style = getStyle();
  if (!style) return { uri, text: "No style loaded" };

  // Parse URI: style://source/id or style://layer/id
  const match = uri.match(/^style:\/\/(source|layer)\/(.+)$/);
  if (!match) return { uri, text: `Unknown resource: ${uri}` };

  const [, type, id] = match;

  if (type === "source") {
    const source = style.sources?.[id];
    if (!source) return { uri, text: `Source '${id}' not found` };
    return {
      uri,
      text: JSON.stringify({ id, ...(source as Record<string, unknown>) }, null, 2),
      mimeType: "application/json",
    };
  }

  if (type === "layer") {
    const layer = style.layers.find((l) => l.id === id);
    if (!layer) return { uri, text: `Layer '${id}' not found` };
    return { uri, text: JSON.stringify(layer, null, 2), mimeType: "application/json" };
  }

  return { uri, text: `Unknown type: ${type}` };
}

export default function StyleEditorPage() {
  const userKey = useAnonymousUserKey();
  const contextHelpers = useMemo(() => buildStyleEditorContext(), []);
  const suggestions = useMemo(() => styleEditorSuggestions, []);

  // Load style from URL param or set empty style on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const styleUrl = params.get("style");

    if (styleUrl) {
      loadStyleFromUrl(styleUrl).then((result) => {
        if (!result.ok) {
          console.warn("Failed to load style from URL:", result.error);
          if (!getStyle()) setStyle(EMPTY_STYLE);
        }
      });
    } else if (!getStyle()) {
      setStyle(EMPTY_STYLE);
    }
  }, []);

  return (
    <TamboProvider
      {...styleEditorProviderConfig}
      userKey={userKey}
      contextHelpers={contextHelpers}
      listResources={listStyleResources}
      getResource={getStyleResource}
    >
      <StyleEditorLayout suggestions={suggestions} />
    </TamboProvider>
  );
}
