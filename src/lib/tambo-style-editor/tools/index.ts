/**
 * Tool registry for the Style Editor.
 */

import type { TamboTool } from "@tambo-ai/react";
import { inspectStyleTool } from "./inspect";
import { loadStyleUrlTool } from "./load-style-url";
import { setLayerPropertyTool } from "./set-layer-property";
import { setStyleTool } from "./set-style";
import { updateLayerTool } from "./update-layer";
import { updateMapSettingsTool } from "./update-map-settings";
import { updateSourceTool } from "./update-source";
import { validateStyleTool } from "./validate-style";

export const styleEditorTools: TamboTool[] = [
  inspectStyleTool,
  setLayerPropertyTool,
  updateLayerTool,
  updateSourceTool,
  updateMapSettingsTool,
  validateStyleTool,
  setStyleTool,
  loadStyleUrlTool,
];
