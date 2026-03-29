/**
 * runSQL tool - the most critical tool. Executes DuckDB SQL and returns queryId.
 * Tune this description carefully - it controls how the AI writes SQL.
 */

import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { runQuery } from "@/services/duckdb-wasm";

export const runSQLTool: TamboTool = {
  name: "runSQL",
  description:
    "Execute DuckDB SQL (v1.5 WASM) against remote Parquet files, GeoJSON, or WFS endpoints. " +
    "Returns queryId for GeoMap/Graph/DataTable components (zero token cost). " +
    "See DuckDB notes for queryId rules, syntax, and query patterns.",
  tool: runQuery,
  inputSchema: z.object({
    sql: z
      .string()
      .describe(
        "DuckDB SQL. HTTPS URLs in FROM. Use LIMIT from queryLimit in context. ONE statement. " +
          "H3 maps: h3_h3_to_string(h3_index) AS hex, <metric> AS value. " +
          "Geometry: SELECT * (auto-detected, lat/lng auto-generated). " +
          "See DuckDB notes for full rules.",
      ),
  }),
  outputSchema: z.object({
    queryId: z.string().describe("Store ID for components - pass to GeoMap/Graph/DataTable."),
    columns: z.array(z.string()),
    rowCount: z.number(),
    duration: z.number(),
    sampleRows: z.array(z.object({})),
    geometryNote: z
      .string()
      .optional()
      .describe("When present, lat/lng are AUTO-GENERATED from geometry. Don't reference in follow-up SQL."),
  }),
};
