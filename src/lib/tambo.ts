/**
 * @file tambo.ts
 * @description Central configuration for Walkthru Earth AI — components + tools
 */

import type { TamboComponent, TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { DataTable, dataTableSchema } from "@/components/tambo/data-table";
import { DatasetCard, datasetCardSchema } from "@/components/tambo/dataset-card";
import { Graph, graphSchema } from "@/components/tambo/graph";
import { H3Map, h3MapSchema } from "@/components/tambo/h3-map";
import { InsightCard, insightCardSchema } from "@/components/tambo/insight-card";
import { QueryDisplay, queryDisplaySchema } from "@/components/tambo/query-display";
import { StatsCard, statsCardSchema } from "@/components/tambo/stats-card";
import { StatsGrid, statsGridSchema } from "@/components/tambo/stats-grid";
import { DataCard, dataCardSchema } from "@/components/ui/card-data";
import { runQuery } from "@/services/duckdb-wasm";
import {
  buildParquetUrl,
  describeDataset,
  getCrossIndex,
  listDatasets,
  suggestAnalysis,
} from "@/services/walkthru-data";

/* ── Tools ─────────────────────────────────────────────────────────── */

export const tools: TamboTool[] = [
  {
    name: "runSQL",
    description:
      "Execute a DuckDB SQL query in-browser via DuckDB-WASM. H3 extension is pre-loaded. RULES: (1) Use HTTPS URLs in FROM clause. (2) DO NOT write INSTALL or LOAD — pre-loaded. (3) Always LIMIT (max 500). (4) h3_index is BIGINT. For H3Map, only need: h3_h3_to_string(h3_index) AS hex, <metric> AS value — NO lat/lng needed, deck.gl renders H3 polygons from hex string. (5) ONE statement per call (no semicolons). (6) Weather: res 5 only. Building: res 3-8. Population: res 1-8. Terrain: res 1-10. (7) Use h3_cell_area(h3_index, 'km^2') for area (NOT h3_cell_area_km2). (8) NEVER use h3_cell_to_latlng().lat — it returns a DOUBLE[2] list, NOT a struct. If you need lat/lng: list_extract(h3_cell_to_latlng(h3_index), 1) AS lat, list_extract(h3_cell_to_latlng(h3_index), 2) AS lng. But prefer passing lat/lng as H3Map props instead. (9) Use h3_grid_ring NOT h3_k_ring (deprecated). Use h3_grid_disk NOT h3_k_ring_distances.",
    tool: runQuery,
    inputSchema: z.object({
      sql: z
        .string()
        .describe(
          "DuckDB SQL query. Use HTTPS Parquet URLs in FROM. Include LIMIT 500. " +
            "For maps: SELECT h3_h3_to_string(h3_index) AS hex, <metric> AS value FROM ...",
        ),
    }),
    outputSchema: z.object({
      queryId: z.string(),
      columns: z.array(z.string()),
      rowCount: z.number(),
      duration: z.number(),
      sampleRows: z.array(z.object({})),
    }),
  },
  {
    name: "listDatasets",
    description:
      "List all available Walkthru Earth datasets. Optionally filter by category: weather, terrain, building, population.",
    tool: listDatasets,
    inputSchema: z.object({
      category: z.string().optional(),
    }),
    outputSchema: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        columns: z.array(z.string()),
        category: z.string(),
        defaultH3Res: z.number(),
        h3ResRange: z.array(z.number()),
      }),
    ),
  },
  {
    name: "buildParquetUrl",
    description:
      "Build the direct Parquet file URL for a given dataset and H3 resolution. Returns the URL, dataset info, and equivalent SQL.",
    tool: buildParquetUrl,
    inputSchema: z.object({
      dataset: z.string().describe("Dataset ID: weather, terrain, building, or population"),
      h3Res: z.number().optional().describe("H3 resolution (1-7)"),
    }),
    outputSchema: z.object({
      url: z.string(),
      h3Res: z.number(),
      sql: z.string(),
    }),
  },
  {
    name: "describeDataset",
    description:
      "Get detailed metadata about a dataset including all column names with descriptions, H3 resolution range, and equivalent SQL.",
    tool: describeDataset,
    inputSchema: z.object({
      dataset: z.string(),
    }),
    outputSchema: z.object({
      name: z.string(),
      description: z.string(),
      columns: z.array(z.object({ name: z.string(), description: z.string() })),
      category: z.string(),
      h3ResRange: z.array(z.number()),
      sampleUrl: z.string(),
      equivalentSQL: z.string(),
    }),
  },
  {
    name: "getCrossIndex",
    description:
      "Get details about a cross-index analysis joining multiple datasets. Available: urban-density, housing-pressure, landslide-risk, vertical-living, population-growth, shrinking-cities.",
    tool: getCrossIndex,
    inputSchema: z.object({
      analysis: z.enum([
        "urban-density",
        "housing-pressure",
        "landslide-risk",
        "vertical-living",
        "population-growth",
        "shrinking-cities",
      ]),
    }),
    outputSchema: z.object({
      name: z.string(),
      description: z.string(),
      datasets: z.array(z.string()),
      joinColumn: z.string(),
      computedColumns: z.array(z.object({ name: z.string(), formula: z.string() })),
      equivalentSQL: z.string(),
      focusRegion: z.object({
        name: z.string(),
        lat: z.number(),
        lng: z.number(),
        zoom: z.number(),
      }),
    }),
  },
  {
    name: "suggestAnalysis",
    description:
      "Given a natural language question about cities, climate, population, or terrain, suggest the best datasets and analysis approach.",
    tool: suggestAnalysis,
    inputSchema: z.object({
      question: z.string(),
    }),
    outputSchema: z.object({
      suggestedDatasets: z.array(z.string()),
      suggestedCrossIndex: z.string().nullable(),
      columns: z.array(z.string()),
      explanation: z.string(),
      sampleSQL: z.string(),
    }),
  },
];

/* ── Components ────────────────────────────────────────────────────── */

export const components: TamboComponent[] = [
  {
    name: "H3Map",
    description:
      "deck.gl H3 hex map. Pass `queryId` from runSQL result — the component reads data directly from the store (zero token cost, instant render). " +
      "The SQL query MUST have columns named `hex` (from h3_h3_to_string) and `value` (the metric). " +
      "Example SQL: SELECT h3_h3_to_string(h3_index) AS hex, pop_2025 AS value FROM '...' LIMIT 500. " +
      "Also set: latitude/longitude/zoom (map center), colorMetric (legend label), colorScheme, extruded (3D).",
    component: H3Map,
    propsSchema: h3MapSchema,
  },
  {
    name: "StatsCard",
    description: "A single metric card. Use for one key value like temperature, population count, building density.",
    component: StatsCard,
    propsSchema: statsCardSchema,
  },
  {
    name: "StatsGrid",
    description: "A responsive grid of multiple metric cards. Use when comparing several metrics at once.",
    component: StatsGrid,
    propsSchema: statsGridSchema,
  },
  {
    name: "DataTable",
    description:
      "Displays tabular data. PREFERRED: pass queryId from runSQL (auto-derives columns and rows — zero token cost). " +
      "Optionally pass visibleColumns to limit displayed columns. " +
      "Fallback: pass inline columns + rows arrays. " +
      "Cross-filtering: clicking a row highlights matching data in other components.",
    component: DataTable,
    propsSchema: dataTableSchema,
  },
  {
    name: "QueryDisplay",
    description:
      "Displays a SQL query with syntax highlighting and copy button. Use when showing the user a query or explaining how to access data.",
    component: QueryDisplay,
    propsSchema: queryDisplaySchema,
  },
  {
    name: "DatasetCard",
    description: "Shows metadata about a Walkthru Earth dataset. Use when the user asks about available data.",
    component: DatasetCard,
    propsSchema: datasetCardSchema,
  },
  {
    name: "InsightCard",
    description: "Highlights a key finding with supporting details and severity level. Use for analysis conclusions.",
    component: InsightCard,
    propsSchema: insightCardSchema,
  },
  {
    name: "Graph",
    description:
      "Renders bar, line, or pie charts. PREFERRED: pass queryId from runSQL + xColumn + yColumns + chartType (zero token cost — reads data from store). " +
      "Example: queryId='qr_1', xColumn='hex', yColumns=['pop_2025','pop_2050'], chartType='bar'. " +
      "Fallback: pass inline data object. Cross-filtering: clicking a bar highlights matching data in map/table.",
    component: Graph,
    propsSchema: graphSchema,
  },
  {
    name: "DataCard",
    description: "Selectable option cards with descriptions and links. Use for navigation choices.",
    component: DataCard,
    propsSchema: dataCardSchema,
  },
];
