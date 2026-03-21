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
    "Execute DuckDB SQL (v1.5 WASM) against remote Parquet files. " +
    "Returns queryId for GeoMap/Graph/DataTable components (zero token cost). " +
    "CRITICAL: queryId (qr_N) is a CLIENT-SIDE store reference — NOT a DuckDB table. " +
    "FROM qr_1 WILL FAIL. To compute stats from previous results, re-query the Parquet URL. " +
    "See context for DuckDB rules, dataset URLs, and query patterns.",
  tool: runQuery,
  inputSchema: z.object({
    sql: z
      .string()
      .describe(
        "DuckDB SQL. HTTPS Parquet URLs in FROM. LIMIT 500. ONE statement. " +
          "NEVER use queryId (qr_N) in FROM — it is NOT a table. Re-query the Parquet URL instead. " +
          "H3 maps: h3_h3_to_string(h3_index) AS hex, <metric> AS value. " +
          "Geometry files: SELECT * (lat/lng auto-generated). " +
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
