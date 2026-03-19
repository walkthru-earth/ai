import { withTamboInteractable } from "@tambo-ai/react";
import { ChevronDown, ChevronUp, Eye, EyeOff, Layers, Map } from "lucide-react";
import * as React from "react";
import { lazy, Suspense, useMemo } from "react";
import { z } from "zod";
import { setCrossFilter, useQueryResult } from "@/services/query-store";
import type { Basemap, ColorScheme, LayerConfig, LayerType } from "./geo-map-deckgl";
import { useInDashboardPanel } from "./panel-context";

/* ── Schema ────────────────────────────────────────────────────────── */

const COLOR_SCHEMES = ["blue-red", "viridis", "plasma", "warm", "cool", "spectral"] as const;

const layerEntrySchema = z.object({
  id: z.string().describe("Unique layer ID for add/remove/update"),
  queryId: z.string().describe("Query result to render"),
  layerType: z
    .enum(["h3", "a5", "scatterplot", "geojson", "arc", "wkb"])
    .optional()
    .describe("Layer type. Auto-detected from column names if omitted."),
  hexColumn: z.string().optional().describe("H3 hex string column (default: 'hex'). For layerType=h3."),
  pentagonColumn: z.string().optional().describe("A5 pentagon cell ID column (default: 'pentagon'). For layerType=a5."),
  valueColumn: z.string().optional().describe("Numeric value column for coloring (default: 'value')."),
  latColumn: z.string().optional().describe("Latitude column (default: 'lat'). For layerType=scatterplot."),
  lngColumn: z.string().optional().describe("Longitude column (default: 'lng'). For layerType=scatterplot."),
  geometryColumn: z
    .string()
    .optional()
    .describe("GeoJSON geometry column (default: 'geometry'). For layerType=geojson."),
  sourceLatColumn: z.string().optional().describe("Source latitude column (default: 'source_lat'). For layerType=arc."),
  sourceLngColumn: z
    .string()
    .optional()
    .describe("Source longitude column (default: 'source_lng'). For layerType=arc."),
  destLatColumn: z
    .string()
    .optional()
    .describe("Destination latitude column (default: 'dest_lat'). For layerType=arc."),
  destLngColumn: z
    .string()
    .optional()
    .describe("Destination longitude column (default: 'dest_lng'). For layerType=arc."),
  colorScheme: z.enum(COLOR_SCHEMES).optional().describe("Color palette for this layer"),
  colorMetric: z.string().optional().describe("Legend label for this layer's color metric"),
  opacity: z.number().optional().describe("Layer opacity 0-1 (default 0.85)"),
  visible: z.boolean().optional().describe("Whether this layer is visible (default true)"),
});

export const geoMapSchema = z.object({
  title: z.string().optional().describe("Map title"),
  queryId: z
    .string()
    .optional()
    .describe(
      "ID from runSQL result — the map reads data directly from the query store. Zero token cost, instant render. " +
        "For single-layer maps. Use `layers` array for multi-layer.",
    ),
  layerType: z
    .enum(["h3", "a5", "scatterplot", "geojson", "arc", "wkb"])
    .optional()
    .describe(
      "Layer type. Auto-detected from column names if omitted: " +
        "pentagon/a5_cell->a5, hex/h3_index->h3, lat+lng->scatterplot, geometry->geojson, source_lat+dest_lat->arc, native geometry->wkb",
    ),
  // H3
  hexColumn: z.string().optional().describe("H3 hex string column (default: 'hex'). For layerType=h3."),
  // A5
  pentagonColumn: z.string().optional().describe("A5 pentagon cell ID column (default: 'pentagon'). For layerType=a5."),
  valueColumn: z
    .string()
    .optional()
    .describe("Numeric value column for coloring (default: 'value'). Used by all layer types."),
  // Points
  latColumn: z.string().optional().describe("Latitude column (default: 'lat'). For layerType=scatterplot."),
  lngColumn: z.string().optional().describe("Longitude column (default: 'lng'). For layerType=scatterplot."),
  radiusColumn: z.string().optional().describe("Optional radius column for point sizing. For layerType=scatterplot."),
  labelColumn: z.string().optional().describe("Optional label column for tooltip. For layerType=scatterplot."),
  // GeoJSON
  geometryColumn: z
    .string()
    .optional()
    .describe("GeoJSON geometry column (default: 'geometry'). For layerType=geojson. Use ST_AsGeoJSON() in SQL."),
  // Arcs
  sourceLatColumn: z.string().optional().describe("Source latitude column (default: 'source_lat'). For layerType=arc."),
  sourceLngColumn: z
    .string()
    .optional()
    .describe("Source longitude column (default: 'source_lng'). For layerType=arc."),
  destLatColumn: z
    .string()
    .optional()
    .describe("Destination latitude column (default: 'dest_lat'). For layerType=arc."),
  destLngColumn: z
    .string()
    .optional()
    .describe("Destination longitude column (default: 'dest_lng'). For layerType=arc."),
  // Shared view
  latitude: z.number().optional().describe("Center latitude"),
  longitude: z.number().optional().describe("Center longitude"),
  zoom: z.number().optional().describe("Zoom level (default 4)"),
  colorMetric: z.string().optional().describe("Legend label for the color metric (e.g. 'Population Density')"),
  colorScheme: z.enum(COLOR_SCHEMES).optional().describe("Color palette"),
  extruded: z.boolean().optional().describe("3D extrusion based on value"),
  basemap: z
    .enum(["auto", "dark", "light"])
    .optional()
    .describe("Basemap style. 'auto' follows system theme (default), 'dark' or 'light' override."),
  // Multi-layer
  layers: z
    .array(layerEntrySchema)
    .optional()
    .describe(
      "Multiple layers on the same map. Each has its own queryId and styling. " +
        "Max 5 layers. When set, queryId/layerType/column props are ignored (use per-layer props instead). " +
        "To add a layer: update_component_props with layers array including existing + new layer. " +
        "To remove a layer: update with layers array excluding that layer. " +
        "To toggle visibility: set visible=false on a layer.",
    ),
});

export type GeoMapProps = z.infer<typeof geoMapSchema>;

/* ── deck.gl (lazy-loaded) ──────────────────────────────────────────── */

const DeckGLMap = lazy(() => import("./geo-map-deckgl"));

/* ── Utilities ─────────────────────────────────────────────────────── */

const MAX_LAYERS = 5;

function computePercentileRange(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  const sorted = [...values].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.05)];
  const hi = sorted[Math.floor(sorted.length * 0.95)];
  if (lo === hi) return { min: lo, max: lo + 1 };
  return { min: lo, max: hi };
}

/**
 * Auto-detect layer type from query result column names.
 * Priority order (fastest → slowest rendering):
 *   1. h3 — GPU-native polygon generation from cell IDs (no geometry data needed)
 *   2. wkb — handled before this function (see WKB fast path above)
 *   3. scatterplot — GeoArrow interleave from lat/lng typed arrays
 *   4. arc — GeoArrow source/target points from coordinate arrays
 *   5. geojson — JSON.parse of geometry strings (LAST RESORT)
 */
function detectLayerType(columns: string[], explicitType?: LayerType): LayerType {
  if (explicitType) return explicitType;
  const cols = new Set(columns.map((c) => c.toLowerCase()));

  // Priority 1a: A5 cell IDs → deck.gl A5Layer generates pentagon polygons on GPU
  if (cols.has("pentagon") || cols.has("a5_cell") || cols.has("a5_index")) return "a5";
  // Priority 1b: H3 cell IDs → deck.gl generates hexagon polygons on GPU
  if (cols.has("hex") || cols.has("h3_index")) return "h3";
  // Priority 2: Arc source/dest coordinates → GeoArrow arcs (before scatterplot — synthetic lat/lng would misdetect arcs)
  if ((cols.has("source_lat") || cols.has("source_latitude")) && (cols.has("dest_lat") || cols.has("dest_latitude")))
    return "arc";
  // Priority 3: lat/lng coordinates → GeoArrow scatterplot
  if (cols.has("lat") || cols.has("latitude") || cols.has("lng") || cols.has("longitude")) return "scatterplot";
  // Priority 5: GeoJSON string geometry → standard GeoJsonLayer (JSON.parse)
  if (cols.has("geometry") || cols.has("geojson") || cols.has("wkb_geometry") || cols.has("geom")) return "geojson";
  return "h3"; // fallback for existing H3 datasets
}

/** Coerce a value to number — handles DuckDB Arrow edge cases where numbers arrive as strings (e.g. '"10"') */
function toNum(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    // Strip embedded quotes (Arrow serialization artifact: '"10"' → '10')
    const n = Number(val.replace(/"/g, ""));
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

/** Resolve a column name with fallbacks */
function resolveColumn(row: Record<string, unknown>, ...candidates: string[]): unknown {
  for (const c of candidates) {
    if (c in row) return row[c];
  }
  return undefined;
}

const LEGEND_GRADIENTS: Record<string, string> = {
  "blue-red": "linear-gradient(90deg, #0571b0, #54aead, #a6d96a, #fee08b, #fc8d59, #d73027)",
  viridis: "linear-gradient(90deg, #440154, #31688e, #35b779, #fde725)",
  plasma: "linear-gradient(90deg, #0d0887, #7e03a8, #cc4778, #f89540, #f0f921)",
  warm: "linear-gradient(90deg, #fee08b, #fdae61, #f46d43, #d73027, #a50026)",
  cool: "linear-gradient(90deg, #f7fcfd, #ccece6, #66c2a4, #238b45, #00441b)",
  spectral: "linear-gradient(90deg, #5e4fa2, #3288bd, #66c2a5, #fee08b, #f46d43, #9e0142)",
};

/* ── Bounds accumulator ──────────────────────────────────────────── */

interface BoundsAccumulator {
  latSum: number;
  lngSum: number;
  coordCount: number;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function createBoundsAccumulator(): BoundsAccumulator {
  return { latSum: 0, lngSum: 0, coordCount: 0, minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 };
}

function updateBoundsAcc(acc: BoundsAccumulator, lat: number, lng: number) {
  acc.latSum += lat;
  acc.lngSum += lng;
  acc.coordCount++;
  if (lat < acc.minLat) acc.minLat = lat;
  if (lat > acc.maxLat) acc.maxLat = lat;
  if (lng < acc.minLng) acc.minLng = lng;
  if (lng > acc.maxLng) acc.maxLng = lng;
}

function finalizeBounds(acc: BoundsAccumulator) {
  const center = acc.coordCount > 0 ? { lat: acc.latSum / acc.coordCount, lng: acc.lngSum / acc.coordCount } : null;
  const bounds: [[number, number], [number, number]] | null =
    acc.coordCount > 0 && acc.minLat <= acc.maxLat
      ? [
          [acc.minLng, acc.minLat],
          [acc.maxLng, acc.maxLat],
        ]
      : null;
  return { center, bounds };
}

/* ── Transform one query result into a LayerConfig ───────────────── */

interface TransformResult {
  layerConfig: LayerConfig | null;
  type: LayerType;
  values: number[];
  featureCount: number;
}

function transformQueryToLayer(
  rows: Record<string, unknown>[],
  opts: {
    id: string;
    layerType?: LayerType;
    hexColumn: string;
    pentagonColumn: string;
    valueColumn: string;
    latColumn: string;
    lngColumn: string;
    radiusColumn?: string;
    geometryColumn: string;
    sourceLatColumn: string;
    sourceLngColumn: string;
    destLatColumn: string;
    destLngColumn: string;
    colorScheme?: ColorScheme;
    opacity?: number;
    columnArrays?: Record<string, ArrayLike<any>>;
    arrowIPC?: Uint8Array;
    wkbArrays?: Uint8Array[];
  },
  boundsAcc: BoundsAccumulator,
): TransformResult {
  if (rows.length === 0 && !(opts.wkbArrays && opts.wkbArrays.length > 0)) {
    return { layerConfig: null, type: opts.layerType ?? "h3", values: [], featureCount: 0 };
  }

  // Priority 2: WKB binary → GeoArrow zero-copy rendering (no JSON parse, no JS objects)
  // Auto-detected GEOMETRY/WKB columns are extracted as Uint8Array[] by runQuery().
  // buildGeoArrowTables() reads WKB headers to determine geom type (point/line/polygon)
  // and builds Arrow Tables directly from binary — true zero-copy to GPU.
  if (opts.wkbArrays && opts.wkbArrays.length > 0) {
    const vals: number[] = [];
    // Use lat/lng from rows (auto-injected by runQuery geometry wrapping) for bounds
    for (const row of rows) {
      const lat = resolveColumn(row, opts.latColumn, "lat", "latitude") as number | undefined;
      const lng = resolveColumn(row, opts.lngColumn, "lng", "longitude") as number | undefined;
      if (typeof lat === "number" && typeof lng === "number") {
        updateBoundsAcc(boundsAcc, lat, lng);
      }
      const val = row[opts.valueColumn];
      if (val != null) vals.push(toNum(val));
    }
    const { min, max } = computePercentileRange(vals);
    return {
      layerConfig: {
        id: opts.id,
        type: "wkb" as LayerType,
        data: [], // WKB path uses wkbArrays, not JS data array
        wkbArrays: opts.wkbArrays,
        colorScheme: opts.colorScheme,
        opacity: opts.opacity,
        minVal: min,
        maxVal: max,
        columnArrays: opts.columnArrays,
        arrowIPC: opts.arrowIPC,
        columnMapping: {
          hexColumn: opts.hexColumn,
          valueColumn: opts.valueColumn,
          latColumn: opts.latColumn,
          lngColumn: opts.lngColumn,
          geometryColumn: opts.geometryColumn,
          sourceLatColumn: opts.sourceLatColumn,
          sourceLngColumn: opts.sourceLngColumn,
          destLatColumn: opts.destLatColumn,
          destLngColumn: opts.destLngColumn,
        },
      },
      type: "wkb",
      values: vals,
      featureCount: opts.wkbArrays.length,
    };
  }

  // Remaining paths by priority:
  // Priority 1: H3/A5 cell IDs → GPU-native polygon generation (deck.gl generates geometry)
  // Priority 3: lat/lng columns → GeoArrow interleave (single Float64Array allocation)
  // Priority 4: Arc coordinates → GeoArrow source/target points
  // Priority 5: GeoJSON strings → standard GeoJsonLayer (JSON.parse — LAST RESORT)
  const columns = Object.keys(rows[0]);
  const type = detectLayerType(columns, opts.layerType);
  const vals: number[] = [];
  const data: any[] = [];

  switch (type) {
    case "a5": {
      const pentCol = opts.pentagonColumn ?? "pentagon";
      for (const row of rows) {
        const pentagon = row[pentCol];
        const val = row[opts.valueColumn];
        if (pentagon != null) {
          const numVal = toNum(val);
          // A5Layer accepts bigint or hex string — pass as string
          data.push({ pentagon: String(pentagon), value: numVal });
          vals.push(numVal);
          const lat = resolveColumn(row, "lat", "latitude") as number | undefined;
          const lng = resolveColumn(row, "lng", "longitude") as number | undefined;
          if (typeof lat === "number" && typeof lng === "number") {
            updateBoundsAcc(boundsAcc, lat, lng);
          }
        }
      }
      break;
    }
    case "h3": {
      for (const row of rows) {
        const hex = row[opts.hexColumn];
        const val = row[opts.valueColumn];
        if (typeof hex === "string" && hex.length > 0) {
          const numVal = toNum(val);
          data.push({ hex, value: numVal });
          vals.push(numVal);
          const lat = resolveColumn(row, "lat", "latitude") as number | undefined;
          const lng = resolveColumn(row, "lng", "longitude") as number | undefined;
          if (typeof lat === "number" && typeof lng === "number") {
            updateBoundsAcc(boundsAcc, lat, lng);
          } else if (Array.isArray(row.latlng) && row.latlng.length === 2) {
            updateBoundsAcc(boundsAcc, row.latlng[0] as number, row.latlng[1] as number);
          }
        }
      }
      break;
    }
    case "scatterplot": {
      for (const row of rows) {
        const lat = resolveColumn(row, opts.latColumn, "lat", "latitude") as number | undefined;
        const lng = resolveColumn(row, opts.lngColumn, "lng", "longitude") as number | undefined;
        if (typeof lat === "number" && typeof lng === "number") {
          const val = row[opts.valueColumn];
          const numVal = val != null ? toNum(val) : undefined;
          const item: any = { lat, lng, value: numVal };
          if (opts.radiusColumn && typeof row[opts.radiusColumn] === "number") item.radius = row[opts.radiusColumn];
          data.push(item);
          if (numVal != null) vals.push(numVal);
          updateBoundsAcc(boundsAcc, lat, lng);
        }
      }
      break;
    }
    case "geojson": {
      for (const row of rows) {
        const geomStr = row[opts.geometryColumn];
        if (typeof geomStr === "string") {
          try {
            const geom = JSON.parse(geomStr);
            const val = row[opts.valueColumn];
            const numVal = val != null ? toNum(val) : undefined;
            const feature = {
              type: "Feature",
              geometry: geom,
              properties: { ...row, value: numVal },
            };
            data.push(feature);
            if (numVal != null) vals.push(numVal);
            const coords = extractFirstCoord(geom);
            if (coords) updateBoundsAcc(boundsAcc, coords[1], coords[0]);
          } catch {
            /* invalid GeoJSON */
          }
        }
      }
      break;
    }
    case "arc": {
      for (const row of rows) {
        const sLat = resolveColumn(row, opts.sourceLatColumn, "source_lat", "source_latitude") as number | undefined;
        const sLng = resolveColumn(row, opts.sourceLngColumn, "source_lng", "source_longitude") as number | undefined;
        const dLat = resolveColumn(row, opts.destLatColumn, "dest_lat", "dest_latitude") as number | undefined;
        const dLng = resolveColumn(row, opts.destLngColumn, "dest_lng", "dest_longitude") as number | undefined;
        if (
          typeof sLat === "number" &&
          typeof sLng === "number" &&
          typeof dLat === "number" &&
          typeof dLng === "number"
        ) {
          const val = row[opts.valueColumn];
          const numVal = val != null ? toNum(val) : undefined;
          data.push({ sourceLat: sLat, sourceLng: sLng, destLat: dLat, destLng: dLng, value: numVal });
          if (numVal != null) vals.push(numVal);
          updateBoundsAcc(boundsAcc, sLat, sLng);
          updateBoundsAcc(boundsAcc, dLat, dLng);
        }
      }
      break;
    }
  }

  const { min, max } = computePercentileRange(vals);

  return {
    layerConfig:
      data.length > 0
        ? {
            id: opts.id,
            type,
            data,
            colorScheme: opts.colorScheme,
            opacity: opts.opacity,
            minVal: min,
            maxVal: max,
            columnArrays: opts.columnArrays,
            arrowIPC: opts.arrowIPC,
            columnMapping: {
              hexColumn: opts.hexColumn,
              pentagonColumn: opts.pentagonColumn,
              valueColumn: opts.valueColumn,
              latColumn: opts.latColumn,
              lngColumn: opts.lngColumn,
              geometryColumn: opts.geometryColumn,
              sourceLatColumn: opts.sourceLatColumn,
              sourceLngColumn: opts.sourceLngColumn,
              destLatColumn: opts.destLatColumn,
              destLngColumn: opts.destLngColumn,
            },
          }
        : null,
    type,
    values: vals,
    featureCount: data.length,
  };
}

/* ── Main component ────────────────────────────────────────────────── */

export const GeoMap = React.forwardRef<HTMLDivElement, GeoMapProps>((props, ref) => {
  const {
    title,
    queryId,
    layerType: explicitLayerType,
    hexColumn = "hex",
    pentagonColumn = "pentagon",
    valueColumn = "value",
    latColumn = "lat",
    lngColumn = "lng",
    radiusColumn,
    geometryColumn = "geometry",
    sourceLatColumn = "source_lat",
    sourceLngColumn = "source_lng",
    destLatColumn = "dest_lat",
    destLngColumn = "dest_lng",
    latitude,
    longitude,
    zoom = 4,
    colorMetric,
    colorScheme = "blue-red",
    extruded = false,
    basemap = "auto",
    layers: layersProp,
  } = props;
  const inPanel = useInDashboardPanel();

  // Multi-layer mode: determine if using `layers` array or single `queryId`
  const isMultiLayer = layersProp != null && layersProp.length > 0;

  // Layer control overrides (persisted to localStorage)
  const storageKey = isMultiLayer ? `geomap-layers:${layersProp?.map((l) => l.id).join(",")}` : undefined;

  const [layerOverrides, setLayerOverrides] = React.useState<z.infer<typeof layerEntrySchema>[] | null>(() => {
    if (!storageKey || typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Effective layers = overrides (if same IDs) or original prop
  const effectiveLayers = useMemo(() => {
    if (!isMultiLayer || !layersProp) return layersProp;
    if (!layerOverrides) return layersProp;
    // Validate override IDs still match props (AI may have changed layers)
    const propIds = new Set(layersProp.map((l) => l.id));
    const overrideIds = new Set(layerOverrides.map((l) => l.id));
    if (propIds.size !== overrideIds.size || ![...propIds].every((id) => overrideIds.has(id))) {
      return layersProp; // IDs changed, discard stale overrides
    }
    return layerOverrides;
  }, [isMultiLayer, layersProp, layerOverrides]);

  const handleUpdateLayers = React.useCallback(
    (updated: z.infer<typeof layerEntrySchema>[]) => {
      setLayerOverrides(updated);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch {
          /* quota exceeded */
        }
      }
    },
    [storageKey],
  );

  const visibleLayers = useMemo(
    () =>
      isMultiLayer
        ? ((effectiveLayers ?? layersProp)?.filter((l) => l.visible !== false).slice(0, MAX_LAYERS) ?? [])
        : [],
    [isMultiLayer, effectiveLayers, layersProp],
  );

  // Fixed-slot hooks for up to MAX_LAYERS query results (React hooks can't be called conditionally)
  const qr0 = useQueryResult(isMultiLayer ? visibleLayers[0]?.queryId : queryId);
  const qr1 = useQueryResult(isMultiLayer ? visibleLayers[1]?.queryId : undefined);
  const qr2 = useQueryResult(isMultiLayer ? visibleLayers[2]?.queryId : undefined);
  const qr3 = useQueryResult(isMultiLayer ? visibleLayers[3]?.queryId : undefined);
  const qr4 = useQueryResult(isMultiLayer ? visibleLayers[4]?.queryId : undefined);
  const queryResults = [qr0, qr1, qr2, qr3, qr4];

  // Transform data: multi-layer or single-layer
  const { layerConfigs, legendEntries, center, bounds, allValues, totalFeatureCount, primaryType } = useMemo(() => {
    const boundsAcc = createBoundsAccumulator();
    const configs: LayerConfig[] = [];
    const legends: { colorScheme: ColorScheme; colorMetric?: string; min: number; max: number; count: number }[] = [];
    let allVals: number[] = [];
    let totalCount = 0;
    let firstType: LayerType = explicitLayerType ?? "h3";

    if (isMultiLayer) {
      for (let i = 0; i < visibleLayers.length; i++) {
        const layer = visibleLayers[i];
        const qr = queryResults[i];
        if (!qr || (qr.rows.length === 0 && !qr.wkbArrays?.length)) continue;

        const result = transformQueryToLayer(
          qr.rows,
          {
            id: layer.id,
            layerType: layer.layerType as LayerType | undefined,
            hexColumn: layer.hexColumn ?? "hex",
            pentagonColumn: (layer as any).pentagonColumn ?? "pentagon",
            valueColumn: layer.valueColumn ?? "value",
            latColumn: layer.latColumn ?? "lat",
            lngColumn: layer.lngColumn ?? "lng",
            geometryColumn: layer.geometryColumn ?? "geometry",
            sourceLatColumn: layer.sourceLatColumn ?? "source_lat",
            sourceLngColumn: layer.sourceLngColumn ?? "source_lng",
            destLatColumn: layer.destLatColumn ?? "dest_lat",
            destLngColumn: layer.destLngColumn ?? "dest_lng",
            colorScheme: (layer.colorScheme as ColorScheme) ?? colorScheme,
            opacity: layer.opacity,
            columnArrays: qr.columnArrays,
            arrowIPC: qr.arrowIPC,
            wkbArrays: qr.wkbArrays,
          },
          boundsAcc,
        );

        if (result.layerConfig) {
          configs.push(result.layerConfig);
          if (configs.length === 1) firstType = result.type;
          const { min, max } = computePercentileRange(result.values);
          legends.push({
            colorScheme: (layer.colorScheme as ColorScheme) ?? colorScheme,
            colorMetric: layer.colorMetric,
            min,
            max,
            count: result.featureCount,
          });
        }
        allVals = allVals.concat(result.values);
        totalCount += result.featureCount;
      }
    } else {
      // Single-layer mode (backward compat)
      const qr = qr0;
      if (queryId && qr && qr.rows.length > 0) {
        const result = transformQueryToLayer(
          qr.rows,
          {
            id: "default",
            layerType: explicitLayerType,
            hexColumn,
            pentagonColumn,
            valueColumn,
            latColumn,
            lngColumn,
            radiusColumn,
            geometryColumn,
            sourceLatColumn,
            sourceLngColumn,
            destLatColumn,
            destLngColumn,
            columnArrays: qr.columnArrays,
            arrowIPC: qr.arrowIPC,
            wkbArrays: qr.wkbArrays,
          },
          boundsAcc,
        );
        if (result.layerConfig) {
          configs.push(result.layerConfig);
          firstType = result.type;
        }
        allVals = result.values;
        totalCount = result.featureCount;
      }
    }

    const { center: c, bounds: b } = finalizeBounds(boundsAcc);

    return {
      layerConfigs: configs,
      legendEntries: legends,
      center: c,
      bounds: b,
      allValues: allVals,
      totalFeatureCount: totalCount,
      primaryType: firstType,
    };
  }, [
    isMultiLayer,
    visibleLayers,
    queryId,
    ...queryResults,
    explicitLayerType,
    hexColumn,
    pentagonColumn,
    valueColumn,
    latColumn,
    lngColumn,
    radiusColumn,
    geometryColumn,
    sourceLatColumn,
    sourceLngColumn,
    destLatColumn,
    destLngColumn,
    colorScheme,
  ]);

  // For H3, compute bounds async via h3-js (hex strings don't have direct lat/lng)
  const [h3Bounds, setH3Bounds] = React.useState<[[number, number], [number, number]] | null>(null);
  const hasH3Layer = layerConfigs.some((c) => c.type === "h3");
  React.useEffect(() => {
    if (!hasH3Layer || layerConfigs.length === 0) {
      setH3Bounds(null);
      return;
    }
    // If we already computed bounds from lat/lng columns, skip h3-js
    if (bounds) {
      setH3Bounds(null);
      return;
    }
    // Gather all H3 hex data across layers
    const allHexData = layerConfigs.filter((c) => c.type === "h3").flatMap((c) => c.data);
    if (allHexData.length === 0) return;

    import("h3-js")
      .then((h3) => {
        let minLat = 90;
        let maxLat = -90;
        let minLng = 180;
        let maxLng = -180;
        for (const d of allHexData) {
          if (!d.hex) continue;
          try {
            const [lat, lng] = h3.cellToLatLng(d.hex);
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
          } catch {
            /* invalid hex */
          }
        }
        if (minLat <= maxLat) {
          setH3Bounds([
            [minLng, minLat],
            [maxLng, maxLat],
          ]);
        }
      })
      .catch(() => {});
  }, [hasH3Layer, layerConfigs, bounds]);

  const finalBounds = bounds ?? h3Bounds;

  const hasData = totalFeatureCount > 0;
  const { min: minVal, max: maxVal } = computePercentileRange(allValues);

  const centerLat = latitude ?? center?.lat ?? 0;
  const centerLng = longitude ?? center?.lng ?? 0;

  // Cross-filter: feature click — emit for the first layer's queryId (or single queryId)
  const primaryQueryId = isMultiLayer ? visibleLayers[0]?.queryId : queryId;
  const primaryHexColumn = isMultiLayer ? (visibleLayers[0]?.hexColumn ?? "hex") : hexColumn;
  const primaryValueColumn = isMultiLayer ? (visibleLayers[0]?.valueColumn ?? "value") : valueColumn;

  const handleFeatureClick = React.useCallback(
    (feature: any, lt: LayerType) => {
      if (!primaryQueryId) return;
      if (lt === "h3") {
        setCrossFilter({
          sourceQueryId: primaryQueryId,
          sourceComponent: "GeoMap",
          filterType: "value",
          column: primaryHexColumn,
          values: [feature],
        });
      } else if (lt === "a5") {
        setCrossFilter({
          sourceQueryId: primaryQueryId,
          sourceComponent: "GeoMap",
          filterType: "value",
          column: isMultiLayer ? (visibleLayers[0]?.pentagonColumn ?? "pentagon") : pentagonColumn,
          values: [feature],
        });
      } else {
        setCrossFilter({
          sourceQueryId: primaryQueryId,
          sourceComponent: "GeoMap",
          filterType: "value",
          column: primaryValueColumn,
          values: [feature?.value ?? feature],
        });
      }
    },
    [primaryQueryId, primaryHexColumn, primaryValueColumn],
  );

  // Cross-filter: bbox — applies to all layers
  const handleBoundsChange = React.useCallback(
    async (bbox: [number, number, number, number]) => {
      const [west, south, east, north] = bbox;
      if (!primaryQueryId || !hasData) return;

      // Emit bbox cross-filter for each layer's queryId
      const layerQueryIds = isMultiLayer ? visibleLayers.map((l) => l.queryId) : queryId ? [queryId] : [];

      for (let i = 0; i < layerQueryIds.length; i++) {
        const lqid = layerQueryIds[i];
        const config = layerConfigs[i];
        if (!config) continue;

        if (config.type === "h3") {
          try {
            const h3 = await import("h3-js");
            const hexData = config.data ?? [];
            const hCol = isMultiLayer ? (visibleLayers[i]?.hexColumn ?? "hex") : hexColumn;
            const visibleHexes = hexData
              .filter((h: any) => {
                const [lat, lng] = h3.cellToLatLng(h.hex);
                return lat >= south && lat <= north && lng >= west && lng <= east;
              })
              .map((h: any) => h.hex);
            if (visibleHexes.length > 0 && visibleHexes.length < hexData.length) {
              setCrossFilter({
                sourceQueryId: lqid,
                sourceComponent: "GeoMap",
                filterType: "bbox",
                column: hCol,
                values: visibleHexes,
                bbox,
              });
            } else if (visibleHexes.length === hexData.length) {
              setCrossFilter({
                sourceQueryId: lqid,
                sourceComponent: "GeoMap",
                filterType: "bbox",
                column: hCol,
                values: [],
                bbox,
              });
            }
          } catch {
            /* h3-js not available */
          }
        } else if (config.type === "scatterplot") {
          const pointData = config.data ?? [];
          const lCol = isMultiLayer ? (visibleLayers[i]?.latColumn ?? "lat") : latColumn;
          const visible = pointData.filter(
            (d: any) => d.lat >= south && d.lat <= north && d.lng >= west && d.lng <= east,
          );
          setCrossFilter({
            sourceQueryId: lqid,
            sourceComponent: "GeoMap",
            filterType: "bbox",
            column: lCol,
            values: visible.map((d: any) => d.value).filter((v: any) => v != null),
            bbox,
          });
        }
      }
    },
    [primaryQueryId, isMultiLayer, visibleLayers, queryId, layerConfigs, hexColumn, latColumn, hasData],
  );

  // Feature count label
  const countLabel = useMemo(() => {
    if (isMultiLayer) {
      return `${totalFeatureCount.toLocaleString()} features (${layerConfigs.length} layers)`;
    }
    switch (primaryType) {
      case "a5":
        return `${totalFeatureCount.toLocaleString()} pentagons`;
      case "h3":
        return `${totalFeatureCount.toLocaleString()} hex`;
      case "wkb":
        return `${totalFeatureCount.toLocaleString()} geometries`;
      case "scatterplot":
        return `${totalFeatureCount.toLocaleString()} points`;
      case "geojson":
        return `${totalFeatureCount.toLocaleString()} features`;
      case "arc":
        return `${totalFeatureCount.toLocaleString()} arcs`;
      default:
        return `${totalFeatureCount.toLocaleString()} items`;
    }
  }, [primaryType, totalFeatureCount, isMultiLayer, layerConfigs.length]);

  // Loading state
  const hasAnyQueryId = isMultiLayer ? visibleLayers.length > 0 : !!queryId;
  if (!hasAnyQueryId) {
    return (
      <div
        ref={ref}
        className="rounded-xl border bg-muted/30 animate-pulse flex items-center justify-center h-full min-h-[200px]"
      >
        <p className="text-base text-muted-foreground">Waiting for query...</p>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`rounded-xl border overflow-hidden bg-card w-full flex flex-col ${inPanel ? "h-full" : "h-[420px]"}`}
    >
      {/* Header — hidden when inside dashboard panel */}
      {title && !inPanel && (
        <div className="px-3 py-1.5 border-b bg-muted/30 flex items-center gap-2 flex-shrink-0">
          <Map className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground truncate">{title}</span>
          {colorMetric && !isMultiLayer && (
            <span className="text-xs text-muted-foreground ml-auto font-mono">{colorMetric}</span>
          )}
        </div>
      )}

      {/* Map */}
      <div
        className="relative flex-1 min-h-[200px]"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        {/* Layer control — only for multi-layer maps */}
        {isMultiLayer && effectiveLayers && effectiveLayers.length > 1 && (
          <LayerControlPanel layers={effectiveLayers} onUpdateLayers={handleUpdateLayers} />
        )}
        {hasData ? (
          <Suspense
            fallback={
              <div className="h-full flex items-center justify-center bg-muted/30 text-muted-foreground">
                <p className="text-base">Loading map...</p>
              </div>
            }
          >
            <DeckGLMap
              latitude={centerLat}
              longitude={centerLng}
              zoom={zoom}
              layerConfigs={layerConfigs}
              extruded={extruded}
              minVal={minVal}
              maxVal={maxVal}
              colorScheme={colorScheme}
              basemap={basemap as Basemap}
              fitBounds={finalBounds}
              onFeatureClick={handleFeatureClick}
              onBoundsChange={handleBoundsChange}
            />
          </Suspense>
        ) : (
          <div className="h-full flex items-center justify-center bg-muted/30 text-muted-foreground">
            <p className="text-base">Loading...</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-3 py-1 border-t bg-muted/10 flex flex-col gap-1 flex-shrink-0">
        {isMultiLayer && legendEntries.length > 0 ? (
          /* Multi-layer: stacked legend entries */
          legendEntries.map((entry, i) => (
            <div key={visibleLayers[i]?.id ?? i} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono">
                {entry.min.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>
              <div
                className="flex-1 h-2 rounded-full max-w-[200px]"
                style={{ background: LEGEND_GRADIENTS[entry.colorScheme] }}
              />
              <span className="text-xs text-muted-foreground font-mono">
                {entry.max.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              </span>
              {entry.colorMetric && (
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{entry.colorMetric}</span>
              )}
              <span className="text-xs text-muted-foreground ml-auto">{entry.count.toLocaleString()}</span>
            </div>
          ))
        ) : (
          /* Single-layer legend */
          <div className="flex items-center gap-2">
            {allValues.length > 0 && (
              <>
                <span className="text-xs text-muted-foreground font-mono">
                  {minVal.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
                <div
                  className="flex-1 h-2 rounded-full max-w-[200px]"
                  style={{ background: LEGEND_GRADIENTS[colorScheme] }}
                />
                <span className="text-xs text-muted-foreground font-mono">
                  {maxVal.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </span>
              </>
            )}
            {colorMetric && (
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{colorMetric}</span>
            )}
            {hasData && <span className="text-xs text-muted-foreground ml-auto">{countLabel}</span>}
          </div>
        )}
        {isMultiLayer && hasData && (
          <div className="flex justify-end">
            <span className="text-xs text-muted-foreground">{countLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
});
GeoMap.displayName = "GeoMap";

/* ── Layer Control Panel ─────────────────────────────────────────── */

type LayerEntry = z.infer<typeof layerEntrySchema>;

interface LayerControlPanelProps {
  layers: LayerEntry[];
  onUpdateLayers: (updated: LayerEntry[]) => void;
}

function LayerControlPanel({ layers, onUpdateLayers }: LayerControlPanelProps) {
  const [open, setOpen] = React.useState(false);

  const toggleVisibility = (idx: number) => {
    const updated = layers.map((l, i) => (i === idx ? { ...l, visible: l.visible === false ? true : false } : l));
    onUpdateLayers(updated);
  };

  const setOpacity = (idx: number, opacity: number) => {
    const updated = layers.map((l, i) => (i === idx ? { ...l, opacity } : l));
    onUpdateLayers(updated);
  };

  const moveLayer = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= layers.length) return;
    const updated = [...layers];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    onUpdateLayers(updated);
  };

  return (
    <div className="absolute top-2 left-2 z-10" onPointerDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-card/90 border shadow-sm text-xs font-medium text-foreground backdrop-blur-sm hover:bg-muted/80 transition-colors"
      >
        <Layers className="w-3 h-3" />
        <span>{layers.length}</span>
      </button>

      {open && (
        <div className="mt-1 w-52 rounded-md border bg-card/95 shadow-lg backdrop-blur-sm overflow-hidden">
          <div className="px-2 py-1 border-b bg-muted/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Layers
          </div>
          <div className="max-h-48 overflow-y-auto">
            {layers.map((layer, i) => {
              const isVisible = layer.visible !== false;
              const opacity = layer.opacity ?? 0.85;
              return (
                <div key={layer.id} className="px-2 py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-1.5">
                    {/* Visibility toggle */}
                    <button
                      type="button"
                      onClick={() => toggleVisibility(i)}
                      className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground"
                    >
                      {isVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 opacity-40" />}
                    </button>
                    {/* Label */}
                    <span
                      className={`flex-1 text-xs truncate ${isVisible ? "text-foreground" : "text-muted-foreground/50"}`}
                    >
                      {layer.colorMetric || layer.id}
                    </span>
                    {/* Reorder */}
                    <button
                      type="button"
                      onClick={() => moveLayer(i, -1)}
                      disabled={i === 0}
                      className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground disabled:opacity-20"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveLayer(i, 1)}
                      disabled={i === layers.length - 1}
                      className="p-0.5 rounded hover:bg-muted/60 text-muted-foreground disabled:opacity-20"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                  {/* Opacity slider */}
                  {isVisible && (
                    <div className="flex items-center gap-1.5 mt-1 pl-5">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={opacity}
                        onChange={(e) => setOpacity(i, Number.parseFloat(e.target.value))}
                        className="flex-1 h-1 accent-foreground"
                      />
                      <span className="text-[10px] text-muted-foreground w-6 text-right font-mono">
                        {Math.round(opacity * 100)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Helper: extract first coordinate from GeoJSON geometry ─────── */

function extractFirstCoord(geom: any): [number, number] | null {
  if (!geom?.type) return null;
  switch (geom.type) {
    case "Point":
      return geom.coordinates as [number, number];
    case "MultiPoint":
    case "LineString":
      return geom.coordinates?.[0] as [number, number];
    case "MultiLineString":
    case "Polygon":
      return geom.coordinates?.[0]?.[0] as [number, number];
    case "MultiPolygon":
      return geom.coordinates?.[0]?.[0]?.[0] as [number, number];
    default:
      return null;
  }
}

/* ── Interactable wrapper ──────────────────────────────────────── */

export const InteractableGeoMap = withTamboInteractable(GeoMap, {
  componentName: "GeoMap",
  description:
    "Interactive deck.gl map supporting multiple geometry types (H3 hexagons, A5 pentagons, scatter points, GeoJSON polygons/lines, arcs, native WKB geometry). " +
    "AUTO-ROUTING: Query results are automatically routed to the best layer type. " +
    "GEOMETRY columns → wkb (zero-copy GeoArrow polygon/line/point). A5 cells → a5 (GPU pentagons). H3 cells → h3 (GPU hexagons). lat/lng → scatterplot. No manual layerType needed. " +
    "Supports multiple simultaneous layers via `layers` array — each layer has its own queryId, layerType, columns, colorScheme, and visibility. " +
    "AI can update view (latitude, longitude, zoom), color scheme, basemap (dark/light/auto), extruded mode, and layer type at runtime. " +
    "To add a layer: update_component_props with layers array including existing layers + the new one. " +
    "To remove a layer: update with layers array excluding that layer. " +
    "To toggle visibility: set visible=false on a layer. " +
    "When user says 'zoom into Cairo', update latitude/longitude/zoom. " +
    "When user says 'switch to light map', update basemap to 'light'. " +
    "When user says 'add population layer', add a new entry to the layers array.",
  propsSchema: geoMapSchema,
});
