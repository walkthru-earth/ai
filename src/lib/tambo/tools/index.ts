/**
 * Tool registry - aggregates all tool registrations.
 * To add a new tool: create a file in this directory, import and add here.
 */

import type { TamboTool } from "@tambo-ai/react";
import { describeArcGISLayerTool, exploreArcGISServiceTool } from "./arcgis";
import { getCrossIndexTool } from "./cross-index";
import { dismissPanelsTool } from "./dashboard";
import { buildParquetUrlTool, describeDatasetTool, listDatasetsTool } from "./dataset-tools";
import { runSQLTool } from "./run-sql";
import { suggestAnalysisTool } from "./suggest";

export const tools: TamboTool[] = [
  runSQLTool,
  listDatasetsTool,
  buildParquetUrlTool,
  describeDatasetTool,
  getCrossIndexTool,
  suggestAnalysisTool,
  exploreArcGISServiceTool,
  describeArcGISLayerTool,
  dismissPanelsTool,
];
