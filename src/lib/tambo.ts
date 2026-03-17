/**
 * @file tambo.ts
 * @description Central configuration for Walkthru Earth AI — components, tools, and shared provider config
 */

import type { TamboComponent, TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { dataTableSchema, InteractableDataTable } from "@/components/tambo/data-table";
import { DatasetCard, datasetCardSchema } from "@/components/tambo/dataset-card";
import { geoMapSchema, InteractableGeoMap } from "@/components/tambo/geo-map";
import { graphSchema, InteractableGraph } from "@/components/tambo/graph";
import { InteractableH3Map } from "@/components/tambo/h3-map";
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
    name: "GeoMap",
    description:
      "deck.gl map supporting multiple geometry types. INTERACTABLE: AI can update props at runtime. " +
      "Pass `queryId` from runSQL — zero token cost. Auto-detects layer type from column names, or set layerType explicitly. " +
      "SQL patterns per type: " +
      "H3: SELECT h3_h3_to_string(h3_index) AS hex, <metric> AS value ... ; " +
      "Points: SELECT lat, lng, <metric> AS value ... ; " +
      "GeoJSON: SELECT ST_AsGeoJSON(geometry) AS geometry, <metric> AS value ... ; " +
      "Arcs: SELECT source_lat, source_lng, dest_lat, dest_lng, <metric> AS value ... ; " +
      "When user says 'zoom into Cairo' or 'change colors', UPDATE the existing map — do NOT create a new one. " +
      "Props: layerType, latitude/longitude/zoom (view), colorMetric (legend), colorScheme, extruded (3D).",
    component: InteractableGeoMap,
    propsSchema: geoMapSchema,
  },
  {
    name: "H3Map",
    description:
      "Alias for GeoMap with layerType=h3. Use GeoMap instead for new maps. " +
      "Kept for backward compatibility with existing threads.",
    component: InteractableH3Map,
    propsSchema: geoMapSchema,
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
      "Interactive paginated data table. INTERACTABLE: AI can update visibleColumns and title at runtime. " +
      "PREFERRED: pass queryId from runSQL (auto-derives columns/rows — zero token cost). " +
      "When user says 'hide hex column' or 'only show population columns', UPDATE the existing table — do NOT create a new one.",
    component: InteractableDataTable,
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
      "Interactive chart (bar/line/pie). INTERACTABLE: AI can update chartType, axes, and queryId at runtime. " +
      "PREFERRED: pass queryId from runSQL + xColumn + yColumns + chartType (zero token cost). " +
      "When user says 'switch to line chart' or 'show pop_2100 instead', UPDATE the existing chart — do NOT create a new one.",
    component: InteractableGraph,
    propsSchema: graphSchema,
  },
  {
    name: "DataCard",
    description: "Selectable option cards with descriptions and links. Use for navigation choices.",
    component: DataCard,
    propsSchema: dataCardSchema,
  },
];

/* ── Shared provider config ───────────────────────────────────────── */

/** Base props shared by all TamboProvider instances across pages. */
export const tamboProviderConfig = {
  apiKey: process.env.NEXT_PUBLIC_TAMBO_API_KEY!,
  components,
  tools,
  tamboUrl: process.env.NEXT_PUBLIC_TAMBO_URL,
  autoGenerateThreadName: true,
  autoGenerateNameThreshold: 2,
} as const;
