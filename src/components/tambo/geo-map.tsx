"use client";

import { withTamboInteractable } from "@tambo-ai/react";
import { Map } from "lucide-react";
import dynamic from "next/dynamic";
import * as React from "react";
import { useMemo } from "react";
import { z } from "zod";
import { setCrossFilter, useQueryResult } from "@/services/query-store";
import type { Basemap, LayerConfig, LayerType } from "./geo-map-deckgl";
import { useInDashboardPanel } from "./panel-context";

/* ── Schema ────────────────────────────────────────────────────────── */

export const geoMapSchema = z.object({
  title: z.string().optional().describe("Map title"),
  queryId: z
    .string()
    .optional()
    .describe(
      "ID from runSQL result — the map reads data directly from the query store. Zero token cost, instant render.",
    ),
  layerType: z
    .enum(["h3", "scatterplot", "geojson", "arc"])
    .optional()
    .describe(
      "Layer type. Auto-detected from column names if omitted: " +
        "hex/h3_index→h3, lat+lng→scatterplot, geometry→geojson, source_lat+dest_lat→arc",
    ),
  // H3
  hexColumn: z.string().optional().describe("H3 hex string column (default: 'hex'). For layerType=h3."),
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
  colorScheme: z
    .enum(["blue-red", "viridis", "plasma", "warm", "cool", "spectral"])
    .optional()
    .describe("Color palette"),
  extruded: z.boolean().optional().describe("3D extrusion based on value"),
  basemap: z
    .enum(["auto", "dark", "light"])
    .optional()
    .describe("Basemap style. 'auto' follows system theme (default), 'dark' or 'light' override."),
});

export type GeoMapProps = z.infer<typeof geoMapSchema>;

/* ── deck.gl (dynamic import to avoid SSR) ─────────────────────────── */

const DeckGLMap = dynamic(() => import("./geo-map-deckgl"), { ssr: false });

/* ── Utilities ─────────────────────────────────────────────────────── */

function computePercentileRange(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  const sorted = [...values].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.05)];
  const hi = sorted[Math.floor(sorted.length * 0.95)];
  if (lo === hi) return { min: lo, max: lo + 1 };
  return { min: lo, max: hi };
}

/** Auto-detect layer type from query result column names */
function detectLayerType(columns: string[], explicitType?: LayerType): LayerType {
  if (explicitType) return explicitType;
  const cols = new Set(columns.map((c) => c.toLowerCase()));

  if (cols.has("hex") || cols.has("h3_index")) return "h3";
  if ((cols.has("source_lat") || cols.has("source_latitude")) && (cols.has("dest_lat") || cols.has("dest_latitude")))
    return "arc";
  if (cols.has("geometry") || cols.has("geojson") || cols.has("wkb_geometry") || cols.has("geom")) return "geojson";
  if (cols.has("lat") || cols.has("latitude") || cols.has("lng") || cols.has("longitude")) return "scatterplot";
  return "h3"; // fallback for existing H3 datasets
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

/* ── Main component ────────────────────────────────────────────────── */

export const GeoMap = React.forwardRef<HTMLDivElement, GeoMapProps>((props, ref) => {
  const {
    title,
    queryId,
    layerType: explicitLayerType,
    hexColumn = "hex",
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
  } = props;
  const inPanel = useInDashboardPanel();

  const queryResult = useQueryResult(queryId);

  // Detect layer type and transform data
  const { layerConfigs, detectedType, center, bounds, values, featureCount } = useMemo(() => {
    if (!queryId || !queryResult || queryResult.rows.length === 0) {
      return {
        layerConfigs: [] as LayerConfig[],
        detectedType: explicitLayerType ?? ("h3" as LayerType),
        center: null as { lat: number; lng: number } | null,
        bounds: null as [[number, number], [number, number]] | null,
        values: [] as number[],
        featureCount: 0,
      };
    }

    const columns = Object.keys(queryResult.rows[0]);
    const type = detectLayerType(columns, explicitLayerType);
    const vals: number[] = [];
    let latSum = 0;
    let lngSum = 0;
    let coordCount = 0;
    let minLat = 90;
    let maxLat = -90;
    let minLng = 180;
    let maxLng = -180;

    const updateBounds = (lat: number, lng: number) => {
      latSum += lat;
      lngSum += lng;
      coordCount++;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    };

    const data: any[] = [];

    switch (type) {
      case "h3": {
        for (const row of queryResult.rows) {
          const hex = row[hexColumn];
          const val = row[valueColumn];
          if (typeof hex === "string" && hex.length > 0) {
            const numVal = typeof val === "number" ? val : 0;
            data.push({ hex, value: numVal });
            vals.push(numVal);
            // Try to get lat/lng for centering
            const lat = resolveColumn(row, "lat", "latitude") as number | undefined;
            const lng = resolveColumn(row, "lng", "longitude") as number | undefined;
            if (typeof lat === "number" && typeof lng === "number") {
              updateBounds(lat, lng);
            } else if (Array.isArray(row.latlng) && row.latlng.length === 2) {
              updateBounds(row.latlng[0] as number, row.latlng[1] as number);
            }
          }
        }
        break;
      }
      case "scatterplot": {
        for (const row of queryResult.rows) {
          const lat = resolveColumn(row, latColumn, "lat", "latitude") as number | undefined;
          const lng = resolveColumn(row, lngColumn, "lng", "longitude") as number | undefined;
          if (typeof lat === "number" && typeof lng === "number") {
            const val = row[valueColumn];
            const numVal = typeof val === "number" ? val : undefined;
            const item: any = { lat, lng, value: numVal };
            if (radiusColumn && typeof row[radiusColumn] === "number") item.radius = row[radiusColumn];
            data.push(item);
            if (numVal != null) vals.push(numVal);
            updateBounds(lat, lng);
          }
        }
        break;
      }
      case "geojson": {
        for (const row of queryResult.rows) {
          const geomStr = row[geometryColumn];
          if (typeof geomStr === "string") {
            try {
              const geom = JSON.parse(geomStr);
              const val = row[valueColumn];
              const numVal = typeof val === "number" ? val : undefined;
              const feature = {
                type: "Feature",
                geometry: geom,
                properties: { ...row, value: numVal },
              };
              data.push(feature);
              if (numVal != null) vals.push(numVal);
              // Extract centroid for bounds
              const coords = extractFirstCoord(geom);
              if (coords) updateBounds(coords[1], coords[0]);
            } catch {
              /* invalid GeoJSON */
            }
          }
        }
        break;
      }
      case "arc": {
        for (const row of queryResult.rows) {
          const sLat = resolveColumn(row, sourceLatColumn, "source_lat", "source_latitude") as number | undefined;
          const sLng = resolveColumn(row, sourceLngColumn, "source_lng", "source_longitude") as number | undefined;
          const dLat = resolveColumn(row, destLatColumn, "dest_lat", "dest_latitude") as number | undefined;
          const dLng = resolveColumn(row, destLngColumn, "dest_lng", "dest_longitude") as number | undefined;
          if (
            typeof sLat === "number" &&
            typeof sLng === "number" &&
            typeof dLat === "number" &&
            typeof dLng === "number"
          ) {
            const val = row[valueColumn];
            const numVal = typeof val === "number" ? val : undefined;
            data.push({ sourceLat: sLat, sourceLng: sLng, destLat: dLat, destLng: dLng, value: numVal });
            if (numVal != null) vals.push(numVal);
            updateBounds(sLat, sLng);
            updateBounds(dLat, dLng);
          }
        }
        break;
      }
    }

    const computedCenter = coordCount > 0 ? { lat: latSum / coordCount, lng: lngSum / coordCount } : null;
    const computedBounds: [[number, number], [number, number]] | null =
      coordCount > 0 && minLat <= maxLat
        ? [
            [minLng, minLat],
            [maxLng, maxLat],
          ]
        : null;

    return {
      layerConfigs: data.length > 0 ? [{ type, data }] : [],
      detectedType: type,
      center: computedCenter,
      bounds: computedBounds,
      values: vals,
      featureCount: data.length,
    };
  }, [
    queryId,
    queryResult,
    explicitLayerType,
    hexColumn,
    valueColumn,
    latColumn,
    lngColumn,
    radiusColumn,
    geometryColumn,
    sourceLatColumn,
    sourceLngColumn,
    destLatColumn,
    destLngColumn,
  ]);

  // For H3, compute bounds async via h3-js (hex strings don't have direct lat/lng)
  const [h3Bounds, setH3Bounds] = React.useState<[[number, number], [number, number]] | null>(null);
  React.useEffect(() => {
    if (detectedType !== "h3" || layerConfigs.length === 0) {
      setH3Bounds(null);
      return;
    }
    const hexData = layerConfigs[0].data;
    if (hexData.length === 0) return;
    // If we already computed bounds from lat/lng columns, skip h3-js
    if (bounds) {
      setH3Bounds(null);
      return;
    }
    import("h3-js")
      .then((h3) => {
        let minLat = 90;
        let maxLat = -90;
        let minLng = 180;
        let maxLng = -180;
        for (const d of hexData) {
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
  }, [detectedType, layerConfigs, bounds]);

  const finalBounds = bounds ?? h3Bounds;

  const hasData = featureCount > 0;
  const { min: minVal, max: maxVal } = computePercentileRange(values);

  const centerLat = latitude ?? center?.lat ?? 0;
  const centerLng = longitude ?? center?.lng ?? 0;

  // Cross-filter: feature click
  const handleFeatureClick = React.useCallback(
    (feature: any, lt: LayerType) => {
      if (!queryId) return;
      if (lt === "h3") {
        setCrossFilter({
          sourceQueryId: queryId,
          sourceComponent: "GeoMap",
          filterType: "value",
          column: hexColumn,
          values: [feature],
        });
      } else {
        setCrossFilter({
          sourceQueryId: queryId,
          sourceComponent: "GeoMap",
          filterType: "value",
          column: valueColumn,
          values: [feature?.value ?? feature],
        });
      }
    },
    [queryId, hexColumn, valueColumn],
  );

  // Cross-filter: bbox
  const handleBoundsChange = React.useCallback(
    async (bbox: [number, number, number, number]) => {
      const [west, south, east, north] = bbox;
      if (!queryId || !hasData) return;

      if (detectedType === "h3") {
        // H3: use h3-js to compute which hexes are visible
        try {
          const h3 = await import("h3-js");
          const hexData = layerConfigs[0]?.data ?? [];
          const visibleHexes = hexData
            .filter((h: any) => {
              const [lat, lng] = h3.cellToLatLng(h.hex);
              return lat >= south && lat <= north && lng >= west && lng <= east;
            })
            .map((h: any) => h.hex);
          if (visibleHexes.length > 0 && visibleHexes.length < hexData.length) {
            setCrossFilter({
              sourceQueryId: queryId,
              sourceComponent: "GeoMap",
              filterType: "bbox",
              column: hexColumn,
              values: visibleHexes,
              bbox,
            });
          } else if (visibleHexes.length === hexData.length) {
            setCrossFilter({
              sourceQueryId: queryId,
              sourceComponent: "GeoMap",
              filterType: "bbox",
              column: hexColumn,
              values: [],
              bbox,
            });
          }
        } catch {
          /* h3-js not available */
        }
      } else if (detectedType === "scatterplot") {
        const pointData = layerConfigs[0]?.data ?? [];
        const visible = pointData.filter(
          (d: any) => d.lat >= south && d.lat <= north && d.lng >= west && d.lng <= east,
        );
        setCrossFilter({
          sourceQueryId: queryId,
          sourceComponent: "GeoMap",
          filterType: "bbox",
          column: latColumn,
          values: visible.map((d: any) => d.value).filter((v: any) => v != null),
          bbox,
        });
      }
      // GeoJSON and arc bbox filtering can be added later
    },
    [queryId, detectedType, layerConfigs, hexColumn, latColumn, hasData],
  );

  // Feature count label
  const countLabel = useMemo(() => {
    switch (detectedType) {
      case "h3":
        return `${featureCount.toLocaleString()} hex`;
      case "scatterplot":
        return `${featureCount.toLocaleString()} points`;
      case "geojson":
        return `${featureCount.toLocaleString()} features`;
      case "arc":
        return `${featureCount.toLocaleString()} arcs`;
      default:
        return `${featureCount.toLocaleString()} items`;
    }
  }, [detectedType, featureCount]);

  // Loading state
  if (!queryId) {
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
    <div ref={ref} className="rounded-xl border overflow-hidden bg-card w-full h-full flex flex-col">
      {/* Header — hidden when inside dashboard panel */}
      {title && !inPanel && (
        <div className="px-3 py-1.5 border-b bg-muted/30 flex items-center gap-2 flex-shrink-0">
          <Map className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground truncate">{title}</span>
          {colorMetric && <span className="text-xs text-muted-foreground ml-auto font-mono">{colorMetric}</span>}
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
        {hasData ? (
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
        ) : (
          <div className="h-full flex items-center justify-center bg-muted/30 text-muted-foreground">
            <p className="text-base">Loading {queryId}...</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="px-3 py-1 border-t bg-muted/10 flex items-center gap-2 flex-shrink-0">
        {values.length > 0 && (
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
    </div>
  );
});
GeoMap.displayName = "GeoMap";

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
    "Interactive deck.gl map supporting multiple geometry types (H3 hexagons, scatter points, GeoJSON polygons/lines, arcs). " +
    "AI can update view (latitude, longitude, zoom), color scheme, basemap (dark/light/auto), extruded mode, and layer type at runtime. " +
    "When user says 'zoom into Cairo', update latitude/longitude/zoom. " +
    "When user says 'switch to light map', update basemap to 'light'.",
  propsSchema: geoMapSchema,
});
