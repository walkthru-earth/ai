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
      "Execute a DuckDB SQL query in-browser via DuckDB-WASM. H3 extension is pre-loaded. RULES: (1) Use HTTPS URLs in FROM clause. (2) DO NOT write INSTALL or LOAD — pre-loaded. (3) Always LIMIT (max 500). (4) h3_index is BIGINT. For H3Map, only need: h3_h3_to_string(h3_index) AS hex, <metric> AS value — NO lat/lng needed, deck.gl renders H3 polygons from hex string. (5) ONE statement per call (no semicolons). (6) Weather: res 0-5, hours 0 and 12. Building: res 3-8. Population: res 1-8. Terrain: res 1-10. (7) Use h3_cell_area(h3_index, 'km^2') for area (NOT h3_cell_area_km2). (8) NEVER use h3_cell_to_latlng().lat — it returns a DOUBLE[2] list, NOT a struct. If you need lat/lng: list_extract(h3_cell_to_latlng(h3_index), 1) AS lat, list_extract(h3_cell_to_latlng(h3_index), 2) AS lng. But prefer passing lat/lng as H3Map props instead. (9) Use h3_grid_ring NOT h3_k_ring (deprecated). Use h3_grid_disk NOT h3_k_ring_distances. (10) NEVER hardcode H3 hex strings — always compute them from coordinates: h3_latlng_to_cell(lat, lng, resolution)::BIGINT. Example for Cairo res 5: h3_latlng_to_cell(30.05, 31.35, 5)::BIGINT. Use h3_grid_disk(h3_latlng_to_cell(lat, lng, res)::BIGINT, radius) for area queries.",
    tool: runQuery,
    inputSchema: z.object({
      sql: z
        .string()
        .describe(
          "DuckDB SQL query. Use HTTPS Parquet URLs in FROM. Include LIMIT 500. " +
            "For maps: SELECT h3_h3_to_string(h3_index) AS hex, <metric> AS value FROM ... " +
            "CRITICAL: NEVER hardcode H3 hex strings — LLMs hallucinate wrong indices. " +
            "For area queries around a location, ALWAYS compute from lat/lng: " +
            "WITH center AS (SELECT h3_latlng_to_cell(lat, lng, res)::BIGINT AS h3) " +
            "SELECT unnest(h3_grid_disk(h3, radius))::BIGINT AS h3_index FROM center",
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
      "MULTI-LAYER: set `layers` array (max 5). Each layer has id, queryId, layerType, column mappings, colorScheme, opacity, visible. " +
      "To add a layer: update_component_props with layers array including existing + new layer. " +
      "To remove a layer: update with layers array excluding that layer. " +
      "To toggle visibility: set visible=false on a layer. " +
      "When user says 'zoom into Cairo' or 'change colors', UPDATE the existing map — do NOT create a new one. " +
      "Props: layerType, latitude/longitude/zoom (view), colorMetric (legend), colorScheme, extruded (3D), layers (multi-layer).",
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

/* ── Context helpers (shared AI context) ──────────────────────────── */

import type { GeoIP } from "@/lib/use-geo-ip";

/** Returns the current UI theme: "dark" or "light". */
function getCurrentTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Build contextHelpers for TamboProvider.
 * Includes user's theme preference and geo-IP location for personalized suggestions.
 */
export function buildContextHelpers(geo: GeoIP | null) {
  return {
    walkthruContext: () => ({
      platform: "walkthru.earth",
      userEnvironment: {
        theme: getCurrentTheme(),
        basemapHint:
          "Use basemap='auto' (follows user theme) unless user explicitly requests dark/light. " +
          "The user's current theme is " +
          getCurrentTheme() +
          ".",
        ...(geo
          ? {
              userLocation: {
                city: geo.city,
                country: geo.country,
                countryCode: geo.country_code,
                lat: geo.latitude,
                lng: geo.longitude,
                region: geo.region,
                timezone: geo.timezone,
              },
              locationHint:
                "The user is browsing from " +
                geo.city +
                ", " +
                geo.country +
                ". " +
                "Use this to personalize initial suggestions (e.g., show data for their city/region first). " +
                "Do NOT mention that you know their location unless they ask about their area.",
            }
          : {}),
      },
      behavior: [
        "BE DECISIVE. Do NOT ask clarifying questions — pick smart defaults and execute immediately.",
        "When asked 'fastest growing' — use absolute growth unless user says 'percent'. When asked 'where' — show global, not a region.",
        "Always run the SQL query AND render components in ONE response. Never say 'try refreshing' — just retry the query.",
        "If a query fails, retry once with a simpler version. Never give up and show raw SQL without also trying to execute it.",
        "Render MULTIPLE components per response: a map + a table + an insight card for rich analysis.",
        "NEVER output markdown tables, ASCII art, or separator characters like +#+#+ in chat text. Use InsightCard or DataTable components instead.",
        "Keep chat text SHORT — 1-2 sentences max. All data goes into components, not into chat text.",
      ],
      duckdbWasmNotes: [
        "H3 extension pre-loaded. NO INSTALL/LOAD in SQL. ONE statement per call.",
        "h3_index is BIGINT. For maps: SELECT h3_h3_to_string(h3_index) AS hex, <metric> AS value — NO lat/lng needed.",
        "deck.gl H3HexagonLayer renders polygons from hex string automatically.",
        "Always LIMIT 500. Use HTTPS URLs in FROM.",
        "h3_cell_area(h3_index, 'km^2') for area. NOT h3_cell_area_km2.",
        "NEVER do latlng.lat or latlng.lng — h3_cell_to_latlng() returns DOUBLE[2] list, not struct. Use list_extract() if needed. But for maps, just use hex strings.",
        "Use h3_grid_ring() NOT h3_k_ring() (deprecated). Use h3_grid_disk() NOT h3_k_ring_distances().",
      ],
      s3Base: "https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop/walkthru-earth",
      datasets: {
        terrain: "dem-terrain/v2/h3/h3_res={1-10}/data.parquet",
        building: "indices/building/v2/h3/h3_res={3-8}/data.parquet",
        population: "indices/population/v2/scenario=SSP2/h3_res={1-8}/data.parquet",
        weather: "indices/weather/model=GraphCast_GFS/date=YYYY-MM-DD/hour={0,12}/h3_res=5/data.parquet (only res 5)",
      },
      componentTips: [
        "ALL viz components use queryId from runSQL — ZERO token cost for data. Never pass inline data arrays.",
        "H3Map: queryId + hexColumn='hex' + valueColumn='value' + lat/lng/zoom + colorMetric. deck.gl renders from hex strings.",
        "Graph: queryId + xColumn + yColumns + chartType.",
        "CHART X-AXIS RULE: NEVER use raw H3 hex IDs as chart labels — they are meaningless to users. " +
          "Instead, create meaningful labels in the SQL query: " +
          "Use CASE/WHEN to bucket values (e.g. '0-1000m', '1000-3000m'), " +
          "use NTILE or ROUND for numeric ranges, " +
          "use ROW_NUMBER() for rank labels (e.g. 'Rank 1', 'Rank 2'), " +
          "or GROUP BY a meaningful column. " +
          "Example: SELECT CASE WHEN elev < 1000 THEN '0-1k' WHEN elev < 3000 THEN '1k-3k' ELSE '3k+' END AS label, COUNT(*) AS count ... GROUP BY label",
        "DataTable: queryId only (auto-derives columns/rows). Optional: visibleColumns to limit columns shown.",
        "H3Map colorScheme: 'blue-red', 'viridis', 'plasma', 'warm', 'cool', 'spectral'.",
        "Cross-filtering: zooming/panning the map filters Graph and DataTable to only show visible hexes.",
        "IMPORTANT: Reuse the SAME queryId across H3Map + Graph + DataTable for linked cross-filtering. " +
          "Include 'hex' column in the query so spatial filtering works. " +
          "Example: run ONE query with hex + value + other columns, then pass the same queryId to all 3 components.",
        "For charts linked with maps via cross-filter, 'hex' can be in the query for filtering but use a DIFFERENT column as xColumn (not hex). " +
          "If no meaningful label column exists, add one in SQL: ROW_NUMBER() OVER (ORDER BY value DESC) as rank, then use xColumn='rank'.",
      ],
    }),
  };
}

/* ── Geo-aware suggestions ────────────────────────────────────────── */

/** Build initial suggestions personalized to user's geo-IP location. Falls back to global suggestions. */
export function buildInitialSuggestions(geo: GeoIP | null) {
  const city = geo?.city;
  const country = geo?.country;
  if (city && country) {
    return [
      {
        id: "s-buildings",
        title: `Buildings in ${city}`,
        detailedSuggestion: `Show me building density in ${city}, ${country}`,
        messageId: "s-buildings",
      },
      {
        id: "s-population",
        title: "Population growth",
        detailedSuggestion: `Where is population growing fastest near ${city} by 2100?`,
        messageId: "s-population",
      },
      {
        id: "s-terrain",
        title: "Terrain analysis",
        detailedSuggestion: `Show me terrain elevation around ${city}`,
        messageId: "s-terrain",
      },
    ];
  }
  // Fallback when geo-IP is blocked or unavailable
  return [
    {
      id: "s-buildings",
      title: "Building density",
      detailedSuggestion: "Show me building density in Tokyo",
      messageId: "s-buildings",
    },
    {
      id: "s-population",
      title: "Population growth",
      detailedSuggestion: "Where is population growing fastest by 2100?",
      messageId: "s-population",
    },
    {
      id: "s-terrain",
      title: "Terrain analysis",
      detailedSuggestion: "Show me the highest elevations in the Himalayas",
      messageId: "s-terrain",
    },
  ];
}

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
