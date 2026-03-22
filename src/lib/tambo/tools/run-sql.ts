/**
 * runSQL tool — the most critical tool. Executes DuckDB SQL and returns queryId.
 * Tune this description carefully — it controls how the AI writes SQL.
 */

import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { runQuery } from "@/services/duckdb-wasm";

export const runSQLTool: TamboTool = {
  name: "runSQL",
  description:
    "Execute DuckDB SQL (v1.5 WASM) against remote Parquet files, GeoJSON, or WFS endpoints. " +
    "Returns queryId for GeoMap/Graph/DataTable components (zero token cost). " +
    "CRITICAL: queryId (qr_N) is a CLIENT-SIDE store reference — NOT a DuckDB table. " +
    "SELECT ... FROM qr_1 WILL ALWAYS FAIL ('Table not found'). " +
    "To derive new data: include ALL needed columns in the ORIGINAL query, or re-run the full SQL with modifications. " +
    "GeoJSON/WFS: Use read_json_auto('url') + unnest(features) + ST_GeomFromGeoJSON for FeatureCollections (URL must be CORS-enabled). " +
    "See context for DuckDB rules, dataset URLs, and query patterns.",
  tool: runQuery,
  inputSchema: z.object({
    sql: z
      .string()
      .describe(
        "DuckDB SQL. HTTPS URLs in FROM. Use LIMIT from queryLimit in context. ONE statement. " +
          "NEVER write FROM qr_N — queryId is NOT a table, it WILL error. Include all needed columns upfront. " +
          "H3 maps: h3_h3_to_string(h3_index) AS hex, <metric> AS value. " +
          "Geometry: SELECT * (auto-detected, lat/lng auto-generated). " +
          "GeoJSON/WFS: see Pattern A / Pattern B in DuckDB notes. " +
          "OOM: push WHERE h3_index=X into Parquet scan. See context for full rules.",
      ),
  }),
  outputSchema: z.object({
    queryId: z.string().describe("Client-side store ID for components. NOT a DuckDB table — never use in SQL FROM."),
    columns: z.array(z.string()),
    rowCount: z.number(),
    duration: z.number(),
    sampleRows: z.array(z.object({})),
    geometryNote: z
      .string()
      .optional()
      .describe("When present, lat/lng are AUTO-GENERATED from geometry — don't reference in follow-up SQL."),
  }),
};
