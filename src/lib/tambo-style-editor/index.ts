/**
 * Tambo configuration for the MapLibre Style Editor page.
 * Separate from main tambo config since this uses completely different tools and context.
 */

import { styleEditorTools } from "./tools";

export { buildStyleEditorContext } from "./context";
export { stylePresets } from "./presets";
export { styleEditorSuggestions } from "./suggestions";
export { styleEditorTools };

/** Base props for the Style Editor's TamboProvider. */
export const styleEditorProviderConfig = {
  apiKey: import.meta.env.VITE_TAMBO_API_KEY as string,
  components: [] as any[],
  tools: styleEditorTools,
  tamboUrl: import.meta.env.VITE_TAMBO_URL,
  autoGenerateThreadName: true,
  autoGenerateNameThreshold: 2,
} as const;
