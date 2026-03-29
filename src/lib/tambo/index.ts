/**
 * Tambo configuration aggregator - single entry point for all pages.
 * Import from "@/lib/tambo" resolves here.
 */

import { components } from "./components";
import { tools } from "./tools";

export { buildContextHelpers } from "./context";
export { buildInitialSuggestions } from "./suggestions";
export { components, tools };

/** Base props shared by all TamboProvider instances across pages. */
export const tamboProviderConfig = {
  apiKey: import.meta.env.VITE_TAMBO_API_KEY as string,
  components,
  tools,
  tamboUrl: import.meta.env.VITE_TAMBO_URL,
  autoGenerateThreadName: true,
  autoGenerateNameThreshold: 2,
} as const;
