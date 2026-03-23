/**
 * ArcGIS FeatureServer tools — explore service catalogs and describe/pre-load layers.
 *
 * Token-efficient design:
 * - Service listings use compact format (names only, baseUrl separate)
 * - Layer describe auto-runs SQL and returns queryId (zero-token data bridge)
 * - Column names as flat string, not objects
 * - Auto-describes single-layer services and layer URLs to reduce round-trips
 */

import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { registerRemoteJSON, runQuery } from "@/services/duckdb-wasm";

// ── Shared types ──────────────────────────────────────────────────────────────

interface ArcGISField {
  name: string;
  type: string;
  alias?: string;
  domain?: {
    type: string;
    name?: string;
    codedValues?: Array<{ code: string | number; name: string }>;
  };
}

interface ArcGISLayerInfo {
  name: string;
  geometryType: string;
  maxRecordCount: number;
  fields: ArcGISField[];
  capabilities?: string;
  description?: string;
  extent?: {
    spatialReference?: { wkid: number; latestWkid?: number };
  };
}

interface ArcGISServiceInfo {
  layers?: Array<{ id: number; name: string; geometryType?: string; type?: string }>;
  tables?: Array<{ id: number; name: string }>;
  description?: string;
  maxRecordCount?: number;
}

interface ArcGISCatalogInfo {
  services?: Array<{ name: string; type: string }>;
  folders?: string[];
}

// ── Shared helpers ────────────────────────────────────────────────────────────

type UrlLevel = "catalog" | "folder" | "service" | "layer";

function detectUrlLevel(url: string): { level: UrlLevel; normalized: string } {
  const cleaned = url.replace(/[?#].*$/, "").replace(/\/+$/, "");
  if (/\/FeatureServer\/\d+$/i.test(cleaned)) return { level: "layer", normalized: cleaned };
  if (/\/FeatureServer$/i.test(cleaned)) return { level: "service", normalized: cleaned };
  if (/\/rest\/services\/?$/i.test(cleaned)) return { level: "catalog", normalized: cleaned };
  if (/\/rest\/services\/.+/i.test(cleaned) && !/FeatureServer/i.test(cleaned))
    return { level: "folder", normalized: cleaned };
  return { level: "catalog", normalized: cleaned };
}

function extractCatalogBase(url: string): string | null {
  const m = url.match(/(https?:\/\/[^?#]+\/rest\/services)\/?/i);
  return m ? m[1] : null;
}

function mapEsriType(esriType: string): string {
  if (esriType.includes("String")) return "VARCHAR";
  if (esriType.includes("Double") || esriType.includes("Single")) return "DOUBLE";
  if (esriType.includes("Integer") || esriType.includes("SmallInteger")) return "INTEGER";
  if (esriType.includes("Date")) return "TIMESTAMP";
  if (esriType.includes("OID")) return "INTEGER";
  return "VARCHAR";
}

function mapEsriGeomType(esriType: string): string {
  if (!esriType) return "";
  if (esriType.includes("Point") && !esriType.includes("Multi")) return "Point";
  if (esriType.includes("Polyline")) return "LineString";
  if (esriType.includes("Polygon")) return "Polygon";
  if (esriType.includes("MultiPoint")) return "MultiPoint";
  return esriType;
}

function matchesSearch(name: string, search: string): boolean {
  const normalized = name.replace(/[_\-/]/g, " ").toLowerCase();
  const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.every((t) => normalized.includes(t));
}

const MAX_LIST_ITEMS = 50;

// ── Category detection ────────────────────────────────────────────────────────

const CATEGORY_PATTERNS: Array<{ name: string; keywords: RegExp }> = [
  { name: "Transportation & Safety", keywords: /collision|speed|camera|traffic|road|pedestrian|crossing/i },
  { name: "Census & Demographics", keywords: /census|population|demographic|income|household|language|immigrant/i },
  { name: "Elections & Governance", keywords: /election|voting|ward|elected|official/i },
  { name: "Transit", keywords: /transit|bus|transpo|shuttle|lrt|o-?train/i },
  { name: "Health", keywords: /covid|health|disease|vaccination|hospital/i },
  { name: "Buildings & Permits", keywords: /building|permit|zoning|construction|3d_building/i },
  { name: "Infrastructure & Utilities", keywords: /water|sewer|storm|infrastructure|hydrant|pipe/i },
  { name: "Recreation & Culture", keywords: /park|recreation|bike|trail|sport|art|library|museum/i },
  { name: "Environment", keywords: /tree|forest|green|environment|climate|energy/i },
];

function categorizeServices(services: Array<{ name: string }>): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  let categorized = 0;

  for (const svc of services) {
    for (const cat of CATEGORY_PATTERNS) {
      if (cat.keywords.test(svc.name.replace(/[_-]/g, " "))) {
        counts.set(cat.name, (counts.get(cat.name) ?? 0) + 1);
        categorized++;
        break;
      }
    }
  }

  const result = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const uncategorized = services.length - categorized;
  if (uncategorized > 0) result.push({ name: "Other", count: uncategorized });
  return result;
}

// ── Core describe + auto-run logic ────────────────────────────────────────────

interface LayerResult {
  name: string;
  geometryType: string;
  featureCount: number | null;
  localPath: string;
  queryId: string | null;
  columns: string;
  columnTypes: string;
  codedValueDomains?: string;
  spatialReference: number | null;
  paginationNote?: string;
}

async function describeAndLoadLayer(layerUrl: string): Promise<LayerResult> {
  const metaResp = await fetch(`${layerUrl}?f=json`);
  if (!metaResp.ok) throw new Error(`ArcGIS HTTP ${metaResp.status}`);
  const info: ArcGISLayerInfo = await metaResp.json();
  if (!info.fields?.length) throw new Error("No fields — check URL");

  // Count features
  let featureCount: number | null = null;
  try {
    const countResp = await fetch(`${layerUrl}/query?where=1%3D1&returnCountOnly=true&f=json`);
    if (countResp.ok) featureCount = (await countResp.json()).count ?? null;
  } catch {
    /* optional */
  }

  const geomType = mapEsriGeomType(info.geometryType || "");
  const maxPerRequest = info.maxRecordCount || 1000;
  const fetchCount = featureCount != null ? Math.min(featureCount, 10000) : maxPerRequest;
  const geojsonUrl = `${layerUrl}/query?where=1%3D1&outFields=%2A&f=geojson&resultRecordCount=${fetchCount}`;

  // Pre-load into DuckDB-WASM
  const slug = info.name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  let localPath: string;
  try {
    localPath = await registerRemoteJSON(geojsonUrl, slug);
  } catch {
    localPath = geojsonUrl;
  }

  // Compact column info: "name:TYPE, name:TYPE, ..."
  const fields = info.fields.filter((f) => f.type !== "esriFieldTypeGeometry");
  const columns = fields.map((f) => f.name).join(", ");
  const columnTypes = fields.map((f) => `${f.name}:${mapEsriType(f.type)}`).join(", ");

  // Coded value domains: compact "field(N codes)" format
  const domains = info.fields
    .filter((f) => f.domain?.type === "codedValue" && f.domain.codedValues?.length)
    .map((f) => `${f.name}(${f.domain?.codedValues?.length ?? 0} codes)`);

  const spatialReference = info.extent?.spatialReference?.latestWkid ?? info.extent?.spatialReference?.wkid ?? null;

  // Auto-run the sample query → get queryId (zero-token data bridge)
  const sql =
    `WITH fc AS (SELECT unnest(features) AS f FROM read_json_auto('${localPath}'))` +
    ` SELECT f.id AS feature_id, unnest(f.properties), ST_GeomFromGeoJSON(to_json(f.geometry)) AS geometry` +
    ` FROM fc LIMIT 10000`;

  let queryId: string | null = null;
  try {
    const result = await runQuery({ sql });
    queryId = result.queryId;
  } catch {
    /* AI can retry with runSQL */
  }

  return {
    name: info.name,
    geometryType: geomType,
    featureCount,
    localPath,
    queryId,
    columns,
    columnTypes,
    codedValueDomains: domains.length ? domains.join(", ") : undefined,
    spatialReference,
    paginationNote:
      featureCount != null && featureCount > maxPerRequest
        ? `${featureCount.toLocaleString()} features, max ${maxPerRequest}/request — paginate with resultOffset`
        : undefined,
  };
}

// ── exploreArcGISService ──────────────────────────────────────────────────────

async function exploreArcGISService({ url, search }: { url: string; search?: string }) {
  const { level, normalized } = detectUrlLevel(url);

  // ── Layer URL → auto-describe + auto-run ──
  if (level === "layer") {
    try {
      const layer = await describeAndLoadLayer(normalized);
      return {
        level: "layer" as const,
        url: normalized,
        layer,
        hint: layer.queryId
          ? `"${layer.name}" (${layer.geometryType}, ${layer.featureCount?.toLocaleString() ?? "?"} features) loaded as ${layer.queryId}. Render GeoMap + DataTable with this queryId immediately.`
          : `"${layer.name}" described but query failed. Use localPath "${layer.localPath}" with runSQL Pattern A.`,
      };
    } catch (err) {
      return {
        level: "layer" as const,
        url: normalized,
        hint: `Failed: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  }

  // ── Service → list layers, auto-describe if single spatial layer ──
  if (level === "service") {
    const resp = await fetch(`${normalized}?f=json`);
    if (!resp.ok) {
      return { level: "service" as const, url: normalized, hint: `HTTP ${resp.status} — check URL` };
    }
    const info: ArcGISServiceInfo = await resp.json();

    let layers = (info.layers ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      geometryType: mapEsriGeomType(l.geometryType ?? ""),
    }));
    const tables = (info.tables ?? []).map((t) => t.name);

    if (search) {
      layers = layers.filter((l) => matchesSearch(l.name, search));
    }

    // Auto-shortcut: single spatial layer → describe + auto-run
    const spatialLayers = layers.filter((l) => l.geometryType);
    if (spatialLayers.length === 1 && !search) {
      try {
        const layer = await describeAndLoadLayer(`${normalized}/${spatialLayers[0].id}`);
        return {
          level: "service" as const,
          url: normalized,
          layer,
          tables: tables.length ? tables : undefined,
          hint: layer.queryId
            ? `"${layer.name}" (${layer.geometryType}, ${layer.featureCount?.toLocaleString() ?? "?"} features) loaded as ${layer.queryId}. Render GeoMap + DataTable immediately.`
            : `"${layer.name}" described. Use localPath "${layer.localPath}" with runSQL.`,
        };
      } catch {
        /* fall through */
      }
    }

    // Multi-layer service — return compact listing
    const layerList = layers
      .slice(0, MAX_LIST_ITEMS)
      .map((l) => `${l.id}: ${l.name}${l.geometryType ? ` (${l.geometryType})` : ""}`);

    return {
      level: "service" as const,
      url: normalized,
      layerList,
      tables: tables.length ? tables : undefined,
      hint: `${layers.length} layer(s)${tables.length ? `, ${tables.length} table(s)` : ""}. Call describeArcGISLayer with URL + layer id (e.g. ${normalized}/0).`,
    };
  }

  // ── Catalog or folder → compact service listing + categories ──
  const resp = await fetch(`${normalized}?f=json`);
  if (!resp.ok) {
    return { level: level as "catalog" | "folder", url: normalized, hint: `HTTP ${resp.status} — check URL` };
  }
  const info: ArcGISCatalogInfo = await resp.json();
  const catalogBase = extractCatalogBase(normalized) ?? normalized;

  const allServices = (info.services ?? []).filter((s) => s.type === "FeatureServer");
  const totalOnServer = allServices.length;

  let filtered = allServices;
  if (search) {
    filtered = filtered.filter((s) => matchesSearch(s.name, search));
  }

  const matchCount = filtered.length;
  // Compact: just names (AI constructs URL as baseUrl + name + /FeatureServer)
  const serviceNames = filtered.slice(0, MAX_LIST_ITEMS).map((s) => s.name);

  const folders = info.folders ?? [];
  const categories = !search && totalOnServer > 10 ? categorizeServices(allServices) : undefined;

  let hint = search ? `${matchCount} of ${totalOnServer} services match "${search}".` : `${totalOnServer} services.`;

  if (categories?.length) {
    hint += ` Themes: ${categories.map((c) => `${c.name}(${c.count})`).join(", ")}.`;
  }

  hint += ` To explore a service: exploreArcGISService with ${catalogBase}/{name}/FeatureServer.`;
  hint += " To search: add search param.";

  if (folders.length) {
    hint += ` Folders: ${folders.slice(0, 5).join(", ")}${folders.length > 5 ? "..." : ""}.`;
  }

  return {
    level: level as "catalog" | "folder",
    url: normalized,
    baseUrl: catalogBase,
    serviceNames,
    categories,
    hint,
  };
}

const layerSchema = z.object({
  name: z.string(),
  geometryType: z.string().describe("Point, LineString, Polygon"),
  featureCount: z.number().nullable(),
  localPath: z.string().describe("DuckDB virtual path — use in read_json_auto() for custom queries"),
  queryId: z
    .string()
    .nullable()
    .describe("Pre-executed query result — pass directly to GeoMap/Graph/DataTable. null if query failed."),
  columns: z.string().describe("Comma-separated column names"),
  columnTypes: z.string().describe("Compact name:TYPE pairs"),
  codedValueDomains: z
    .string()
    .optional()
    .describe("Fields with coded values, e.g. 'material(7 codes), status(3 codes)'"),
  spatialReference: z.number().nullable().describe("CRS WKID"),
  paginationNote: z.string().optional(),
});

const exploreOutputSchema = z.object({
  level: z.enum(["catalog", "folder", "service", "layer"]),
  url: z.string(),
  // Catalog/folder level (compact)
  baseUrl: z.string().optional().describe("Catalog base — construct service URL as baseUrl/{name}/FeatureServer"),
  serviceNames: z.array(z.string()).optional().describe("Service names (construct URL with baseUrl)"),
  categories: z
    .array(z.object({ name: z.string(), count: z.number() }))
    .optional()
    .describe("Auto-detected themes"),
  // Service level (compact)
  layerList: z.array(z.string()).optional().describe("Compact 'id: name (geomType)' entries"),
  tables: z.array(z.string()).optional().describe("Non-spatial table names"),
  // Auto-described layer (from layer URL or single-layer service)
  layer: layerSchema.optional().describe("Auto-loaded layer with queryId ready for rendering"),
  hint: z.string().describe("Next steps for AI"),
});

export const exploreArcGISServiceTool: TamboTool = {
  name: "exploreArcGISService",
  description:
    "Browse ArcGIS REST services. Auto-detects URL level. " +
    "SMART: auto-loads single-layer services and layer URLs — returns queryId ready for GeoMap/DataTable (no runSQL needed). " +
    "Catalogs return categorized service names (compact). Supports tokenized keyword search. " +
    "Use for ANY ArcGIS URL.",
  tool: exploreArcGISService,
  inputSchema: z.object({
    url: z.string().describe("ArcGIS REST URL at any level"),
    search: z.string().optional().describe("Keyword filter (tokenized, e.g. 'red light')"),
  }),
  outputSchema: exploreOutputSchema,
};

// ── describeArcGISLayer ───────────────────────────────────────────────────────

async function describeArcGISLayer({ url }: { url: string }) {
  let layerUrl = url.replace(/\/+$/, "").replace(/[?#].*$/, "");
  if (/\/FeatureServer$/i.test(layerUrl)) layerUrl += "/0";
  return describeAndLoadLayer(layerUrl);
}

export const describeArcGISLayerTool: TamboTool = {
  name: "describeArcGISLayer",
  description:
    "Describe + pre-load an ArcGIS layer into DuckDB-WASM and auto-run the query. " +
    "Returns queryId ready for GeoMap/DataTable — no separate runSQL call needed. " +
    "Use after exploreArcGISService identifies a specific layer in a multi-layer service. " +
    "For custom queries, use localPath with runSQL.",
  tool: describeArcGISLayer,
  inputSchema: z.object({
    url: z.string().describe("ArcGIS FeatureServer layer URL (e.g. .../FeatureServer/0)"),
  }),
  outputSchema: layerSchema,
};
