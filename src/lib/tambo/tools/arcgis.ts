/**
 * ArcGIS FeatureServer tool — fetches layer metadata, pre-loads GeoJSON into
 * DuckDB-WASM via registerFileBuffer, and returns ready-to-run SQL.
 */

import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { registerRemoteJSON } from "@/services/duckdb-wasm";

interface ArcGISField {
  name: string;
  type: string;
  alias?: string;
}

interface ArcGISLayerInfo {
  name: string;
  geometryType: string;
  maxRecordCount: number;
  fields: ArcGISField[];
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
  if (esriType.includes("Point")) return "Point";
  if (esriType.includes("Polyline")) return "LineString";
  if (esriType.includes("Polygon")) return "Polygon";
  if (esriType.includes("MultiPoint")) return "MultiPoint";
  return esriType;
}

async function describeArcGISLayer({ url }: { url: string }) {
  // Normalize URL: strip trailing slash, ensure it ends with layer index
  let layerUrl = url.replace(/\/+$/, "");
  if (/\/FeatureServer$/i.test(layerUrl)) {
    layerUrl += "/0";
  }

  // Fetch layer metadata
  const metaResp = await fetch(`${layerUrl}?f=json`);
  if (!metaResp.ok) throw new Error(`Failed to fetch ArcGIS metadata: HTTP ${metaResp.status}`);
  const info: ArcGISLayerInfo = await metaResp.json();
  if (!info.fields?.length) throw new Error("Invalid ArcGIS response — no fields. Check the URL.");

  // Count total features
  let totalCount: number | null = null;
  try {
    const countResp = await fetch(`${layerUrl}/query?where=1%3D1&returnCountOnly=true&f=json`);
    if (countResp.ok) totalCount = (await countResp.json()).count ?? null;
  } catch {
    /* optional */
  }

  const geomType = mapEsriGeomType(info.geometryType || "");
  const maxPerRequest = info.maxRecordCount || 1000;
  const fetchCount = totalCount != null ? Math.min(totalCount, 10000) : maxPerRequest;

  // Build GeoJSON URL (%2A = * to avoid DuckDB glob error)
  const geojsonUrl = `${layerUrl}/query?where=1%3D1&outFields=%2A&f=geojson&resultRecordCount=${fetchCount}`;

  // Pre-load GeoJSON into DuckDB-WASM via registerFileBuffer
  // (DuckDB-WASM httpfs truncates responses from some servers like ArcGIS)
  const slug = info.name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  let localPath: string;
  try {
    localPath = await registerRemoteJSON(geojsonUrl, slug);
  } catch {
    // Fallback to direct URL if fetch fails
    localPath = geojsonUrl;
  }

  // Columns
  const columns = info.fields
    .filter((f) => f.type !== "esriFieldTypeGeometry")
    .map((f) => ({
      name: f.name,
      type: mapEsriType(f.type),
      alias: f.alias && f.alias !== f.name ? f.alias : undefined,
    }));

  // Ready-to-run SQL using the local virtual file
  const sampleSql =
    `WITH fc AS (\n` +
    `  SELECT unnest(features) AS f\n` +
    `  FROM read_json_auto('${localPath}')\n` +
    `)\n` +
    `SELECT\n` +
    `  f.id AS feature_id,\n` +
    `  unnest(f.properties),\n` +
    `  ST_GeomFromGeoJSON(to_json(f.geometry)) AS geometry\n` +
    `FROM fc\n` +
    `LIMIT 10000`;

  return {
    name: info.name,
    geometryType: geomType,
    totalFeatures: totalCount,
    maxPerRequest,
    localPath,
    columns,
    sampleSql,
    paginationNote:
      totalCount != null && totalCount > maxPerRequest
        ? `Layer has ${totalCount.toLocaleString()} features but ArcGIS returns max ${maxPerRequest} per request. Use &resultOffset=N to paginate.`
        : undefined,
  };
}

export const describeArcGISLayerTool: TamboTool = {
  name: "describeArcGISLayer",
  description:
    "Fetch ArcGIS FeatureServer layer metadata and pre-load data into DuckDB-WASM. " +
    "Use when user provides an ArcGIS FeatureServer URL. " +
    "Returns schema, record count, and ready-to-run SQL (sampleSql). " +
    "Data is pre-loaded — the sampleSql reads from a local virtual file (localPath), no network needed. " +
    "For follow-up queries on the same layer, reuse localPath in read_json_auto(localPath).",
  tool: describeArcGISLayer,
  inputSchema: z.object({
    url: z.string().describe("ArcGIS FeatureServer layer URL, e.g. https://services.arcgis.com/.../FeatureServer/0"),
  }),
  outputSchema: z.object({
    name: z.string().describe("Layer name"),
    geometryType: z.string().describe("Geometry type: Point, LineString, Polygon, etc."),
    totalFeatures: z.number().nullable().describe("Total feature count"),
    maxPerRequest: z.number().describe("Max features per ArcGIS request"),
    localPath: z.string().describe("Virtual file path in DuckDB — use in read_json_auto(localPath) for all queries"),
    columns: z.array(
      z.object({
        name: z.string(),
        type: z.string().describe("DuckDB type"),
        alias: z.string().optional(),
      }),
    ),
    sampleSql: z.string().describe("Ready-to-run Pattern A SQL — reads from pre-loaded local file"),
    paginationNote: z.string().optional(),
  }),
};
