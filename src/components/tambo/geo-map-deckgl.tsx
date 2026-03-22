import { A5Layer, H3HexagonLayer } from "@deck.gl/geo-layers";
import { ArcLayer, GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import {
  GeoArrowArcLayer,
  GeoArrowPathLayer,
  GeoArrowPolygonLayer,
  GeoArrowScatterplotLayer,
} from "@geoarrow/deck.gl-layers";
import type { GeoArrowGeomType, GeoArrowResult } from "@walkthru-earth/objex-utils";
import { buildGeoArrowTables } from "@walkthru-earth/objex-utils";
import { Field, FixedSizeList, Float64, makeData, makeVector, Table, vectorFromArray } from "apache-arrow";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import React, { useEffect, useMemo, useRef } from "react";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";
import { consumeFlyTo, useFlyToVersion } from "@/services/query-store";

/* ── Types ──────────────────────────────────────────────────────── */

export type ColorScheme = "blue-red" | "viridis" | "plasma" | "warm" | "cool" | "spectral";

export type LayerType = "h3" | "a5" | "scatterplot" | "geojson" | "arc" | "wkb";

export interface LayerConfig {
  id?: string;
  type: LayerType;
  data: any[];
  colorScheme?: ColorScheme;
  opacity?: number;
  minVal?: number;
  maxVal?: number;
  /** Raw column typed arrays from Arrow for zero-copy GeoArrow rendering */
  columnArrays?: Record<string, ArrayLike<any>>;
  /** Arrow IPC bytes for true zero-copy deserialization */
  arrowIPC?: Uint8Array;
  /** Raw WKB geometry arrays for objex-utils buildGeoArrowTables (true zero-copy) */
  wkbArrays?: Uint8Array[];
  /** Column name mappings for GeoArrow layer construction */
  columnMapping?: {
    hexColumn?: string;
    pentagonColumn?: string;
    valueColumn?: string;
    latColumn?: string;
    lngColumn?: string;
    geometryColumn?: string;
    sourceLatColumn?: string;
    sourceLngColumn?: string;
    destLatColumn?: string;
    destLngColumn?: string;
  };
}

export type Basemap = "auto" | "dark" | "light";

export interface HoverInfo {
  x: number;
  y: number;
  object: Record<string, unknown>;
  layerType: LayerType;
}

export interface DeckGLMapProps {
  latitude: number;
  longitude: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
  layerConfigs: LayerConfig[];
  extruded: boolean;
  minVal: number;
  maxVal: number;
  colorScheme?: ColorScheme;
  basemap?: Basemap;
  fitBounds?: [[number, number], [number, number]] | null;
  onFeatureClick?: (feature: any, layerType: LayerType) => void;
  onBoundsChange?: (bbox: [number, number, number, number]) => void;
  onViewStateChange?: (view: {
    latitude: number;
    longitude: number;
    zoom: number;
    pitch: number;
    bearing: number;
  }) => void;
}

/* ── Color ramps ────────────────────────────────────────────────── */

const SCHEMES: Record<string, [number, number, number][]> = {
  "blue-red": [
    [5, 113, 176],
    [84, 174, 173],
    [166, 217, 106],
    [254, 224, 139],
    [252, 141, 89],
    [215, 48, 39],
  ],
  viridis: [
    [68, 1, 84],
    [59, 82, 139],
    [33, 145, 140],
    [94, 201, 98],
    [253, 231, 37],
  ],
  plasma: [
    [13, 8, 135],
    [126, 3, 168],
    [204, 71, 120],
    [248, 149, 64],
    [240, 249, 33],
  ],
  warm: [
    [254, 224, 139],
    [253, 174, 97],
    [244, 109, 67],
    [215, 48, 39],
    [165, 0, 38],
  ],
  cool: [
    [247, 252, 253],
    [204, 236, 230],
    [102, 194, 164],
    [35, 139, 69],
    [0, 68, 27],
  ],
  spectral: [
    [94, 79, 162],
    [50, 136, 189],
    [102, 194, 165],
    [254, 224, 139],
    [244, 109, 67],
    [158, 1, 66],
  ],
};

export function valueToColor(
  v: number,
  min: number,
  max: number,
  scheme: ColorScheme = "blue-red",
): [number, number, number, number] {
  const stops = SCHEMES[scheme] ?? SCHEMES["blue-red"];
  // Guard against NaN/undefined values — fall back to midpoint color
  if (!Number.isFinite(v) || !Number.isFinite(min) || !Number.isFinite(max)) {
    const mid = stops[Math.floor(stops.length / 2)];
    return [mid[0], mid[1], mid[2], 200];
  }
  const range = max - min || 1;
  const t = Math.max(0, Math.min(1, (v - min) / range));
  const idx = t * (stops.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, stops.length - 1);
  const f = idx - lo;
  return [
    Math.round(stops[lo][0] + (stops[hi][0] - stops[lo][0]) * f),
    Math.round(stops[lo][1] + (stops[hi][1] - stops[lo][1]) * f),
    Math.round(stops[lo][2] + (stops[hi][2] - stops[lo][2]) * f),
    200,
  ];
}

/* ── Theme ──────────────────────────────────────────────────────── */

const CARTO_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const CARTO_LIGHT = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

function useIsDark(): boolean {
  const [dark, setDark] = React.useState(() =>
    typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : true,
  );

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setDark(root.classList.contains("dark"));
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return dark;
}

/* ── RTL text plugin ────────────────────────────────────────────── */

const RTL_PLUGIN_URL = "https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.3.0/dist/mapbox-gl-rtl-text.js";
let rtlPluginLoaded = false;
function ensureRTLPlugin() {
  if (rtlPluginLoaded) return;
  rtlPluginLoaded = true;
  if (!maplibregl.getRTLTextPluginStatus || maplibregl.getRTLTextPluginStatus() === "unavailable") {
    maplibregl.setRTLTextPlugin(RTL_PLUGIN_URL, true).catch((err) => {
      console.warn("RTL text plugin failed to load:", err);
      rtlPluginLoaded = false;
    });
  }
}

/* ── GeoArrow zero-copy table builders ──────────────────────────── */

/**
 * Wrap an existing Float64Array as an Arrow Vector without copying.
 * Uses makeData to reference the same memory buffer.
 */
function wrapFloat64(arr: ArrayLike<any>) {
  const f64 = arr instanceof Float64Array ? arr : Float64Array.from(arr as any, Number);
  const data = makeData({ type: new Float64(), data: f64, length: f64.length });
  return makeVector(data);
}

/**
 * Build a FixedSizeList(2) point geometry column by interleaving lat/lng.
 * One Float64Array allocation (2*N), no JS object per row.
 */
function buildPointGeomVector(latArr: ArrayLike<any>, lngArr: ArrayLike<any>) {
  const len = Math.min(latArr.length, lngArr.length);
  // Interleave [lng0, lat0, lng1, lat1, ...] — one typed array allocation
  const coords = new Float64Array(len * 2);
  for (let i = 0; i < len; i++) {
    coords[i * 2] = Number(lngArr[i]); // x = longitude
    coords[i * 2 + 1] = Number(latArr[i]); // y = latitude
  }

  const childField = new Field("xy", new Float64());
  const childData = makeData({ type: new Float64(), data: coords, length: len * 2 });
  const listData = makeData({
    type: new FixedSizeList(2, childField),
    child: childData,
    length: len,
  });
  return makeVector(listData);
}

/** Build a GeoArrow-compatible Table with FixedSizeList(2) point geometry from lat/lng typed arrays */
function buildGeoArrowPointTable(
  latArr: ArrayLike<any>,
  lngArr: ArrayLike<any>,
  extraColumns: Record<string, ArrayLike<any>>,
): Table {
  const geomCol = buildPointGeomVector(latArr, lngArr);
  const tableData: Record<string, any> = { geom: geomCol };
  for (const [name, arr] of Object.entries(extraColumns)) {
    // Wrap numeric typed arrays without copying; strings need vectorFromArray
    if (arr instanceof Float64Array || arr instanceof Float32Array || arr instanceof Int32Array) {
      tableData[name] = wrapFloat64(arr);
    } else {
      tableData[name] = vectorFromArray(Array.from(arr));
    }
  }
  return new Table(tableData);
}

/** Build a GeoArrow Arc Table with source/target FixedSizeList(2) point columns */
function buildGeoArrowArcTable(
  srcLatArr: ArrayLike<any>,
  srcLngArr: ArrayLike<any>,
  dstLatArr: ArrayLike<any>,
  dstLngArr: ArrayLike<any>,
  extraColumns: Record<string, ArrayLike<any>>,
): Table {
  const srcGeom = buildPointGeomVector(srcLatArr, srcLngArr);
  const dstGeom = buildPointGeomVector(dstLatArr, dstLngArr);

  const tableData: Record<string, any> = { source: srcGeom, target: dstGeom };
  for (const [name, arr] of Object.entries(extraColumns)) {
    if (arr instanceof Float64Array || arr instanceof Float32Array || arr instanceof Int32Array) {
      tableData[name] = wrapFloat64(arr);
    } else {
      tableData[name] = vectorFromArray(Array.from(arr));
    }
  }
  return new Table(tableData);
}

/**
 * Build GeoArrow layers from WKB arrays using objex-utils (true zero-copy).
 * WKB binary → DataView reads → pre-allocated Float64Array → Arrow Table.
 * No intermediate JS objects, no GeoJSON parsing.
 */
function buildWkbGeoArrowResults(
  wkbArrays: Uint8Array[],
  attributes: Map<string, { values: any[]; type: string }>,
  knownGeomType?: GeoArrowGeomType,
): GeoArrowResult[] {
  if (wkbArrays.length === 0) return [];
  return buildGeoArrowTables(wkbArrays, attributes, knownGeomType);
}

/** Check if columnArrays has the required columns for GeoArrow rendering */
function canUseGeoArrow(config: LayerConfig): boolean {
  // If we have IPC bytes or columnArrays, we can use GeoArrow
  const hasArrays = !!config.columnArrays;
  const hasIPC = !!config.arrowIPC;
  if (!hasArrays && !hasIPC) return false;

  const cols = config.columnArrays ?? {};
  const mapping = config.columnMapping ?? {};

  switch (config.type) {
    case "scatterplot": {
      const lat = mapping.latColumn ?? "lat";
      const lng = mapping.lngColumn ?? "lng";
      return (lat in cols && lng in cols) || hasIPC;
    }
    case "h3":
      // H3 uses standard H3HexagonLayer — GeoArrowH3HexagonLayer is experimental and unreliable.
      // deck.gl generates hexagon polygons from hex strings internally, no GeoArrow benefit.
      return false;
    case "a5":
      // A5 uses deck.gl A5Layer — generates pentagon polygons from cell IDs on GPU.
      return false;
    case "arc": {
      const sLat = mapping.sourceLatColumn ?? "source_lat";
      const sLng = mapping.sourceLngColumn ?? "source_lng";
      const dLat = mapping.destLatColumn ?? "dest_lat";
      const dLng = mapping.destLngColumn ?? "dest_lng";
      return (sLat in cols && sLng in cols && dLat in cols && dLng in cols) || hasIPC;
    }
    case "wkb":
      return !!config.wkbArrays && config.wkbArrays.length > 0;
    case "geojson":
      // GeoJSON with WKB data can use GeoArrow via objex-utils
      return !!config.wkbArrays && config.wkbArrays.length > 0;
    default:
      return false;
  }
}

/* ── Layer factory ──────────────────────────────────────────────── */

const SKIP_HOVER_KEYS = new Set(["geom", "geometry", "source", "target", "__geo_wkb"]);

function extractHoverProps(info: any, layerType: LayerType): Record<string, unknown> | null {
  if (!info?.object) return null;
  const obj = info.object;
  // GeoArrow layers: data is in Arrow table, extract from index
  if (info.index != null && info.data?.data) {
    const table = info.data.data;
    const props: Record<string, unknown> = {};
    const schema = table.schema;
    if (schema?.fields && typeof table.getChild === "function") {
      for (const field of schema.fields) {
        const name = field.name;
        if (SKIP_HOVER_KEYS.has(name)) continue;
        const col = table.getChild(name);
        if (col) {
          const val = col.get(info.index);
          props[name] = typeof val === "bigint" ? Number(val) : val;
        }
      }
      if (Object.keys(props).length > 0) return props;
    }
    // Fallback: GeoArrow object might be a StructRow or proxy with toJSON/toArray
    if (typeof obj.toJSON === "function") {
      const json = obj.toJSON();
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(json)) {
        if (SKIP_HOVER_KEYS.has(k) || k.startsWith("_")) continue;
        result[k] = typeof v === "bigint" ? Number(v) : v;
      }
      return Object.keys(result).length > 0 ? result : null;
    }
  }
  // Standard layers: object is a JS object
  if (layerType === "geojson" && obj.properties) return obj.properties;
  // H3, A5, scatterplot, arc: return all props except internal keys
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("_") || SKIP_HOVER_KEYS.has(k)) continue;
    result[k] = v;
  }
  return Object.keys(result).length > 0 ? result : null;
}

// Single-instance: module-level state shared across all DeckGLMap instances
let lastHoverLayerId: string | null = null;
let lastHoverIndex: number | null = null;

function buildLayers(
  configs: LayerConfig[],
  minVal: number,
  maxVal: number,
  colorScheme: ColorScheme,
  extruded: boolean,
  onFeatureClick?: (feature: any, layerType: LayerType) => void,
  onHover?: (info: HoverInfo | null) => void,
  isTouch?: boolean,
): any[] {
  // On touch: click toggles tooltip (since hover doesn't work on mobile)
  const makeClickHandler = (origClick: (info: any) => void, lt: LayerType) => {
    return (info: any) => {
      origClick(info);
      if (isTouch && onHover) {
        const props = info?.object ? extractHoverProps(info, lt) : null;
        // Toggle: if clicking same spot, dismiss
        onHover(props ? { x: info.x, y: info.y, object: props, layerType: lt } : null);
      }
    };
  };

  const makeHoverHandler = (layerId: string, lt: LayerType) => {
    return (info: any) => {
      if (!onHover) return;
      const idx = info?.index ?? null;
      // Skip if hovering the same feature on the same layer
      if (idx === lastHoverIndex && layerId === lastHoverLayerId) return;
      lastHoverIndex = idx;
      lastHoverLayerId = layerId;
      const props = info?.object ? extractHoverProps(info, lt) : null;
      onHover(props ? { x: info.x, y: info.y, object: props, layerType: lt } : null);
    };
  };

  const result: any[] = [];

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    const layerId = config.id ?? `${config.type}-${i}`;
    const scheme = config.colorScheme ?? colorScheme;
    const lo = config.minVal ?? minVal;
    const hi = config.maxVal ?? maxVal;
    const layerOpacity = config.opacity ?? 0.85;
    const useGeoArrow = canUseGeoArrow(config);

    switch (config.type) {
      case "h3":
        if (config.data.length > 0) {
          result.push(
            new H3HexagonLayer({
              id: `h3-${layerId}`,
              data: config.data,
              pickable: true,
              filled: true,
              extruded,
              highPrecision: "auto",
              coverage: 0.92,
              getHexagon: (d: any) => d.hex ?? "",
              getFillColor: (d: any) =>
                d.value != null ? valueToColor(d.value, lo, hi, scheme) : [100, 150, 255, 120],
              getElevation: (d: any) => {
                if (!extruded || d.value == null) return 0;
                const range = hi - lo || 1;
                const t = (d.value - lo) / range;
                return t * 500;
              },
              elevationScale: 50,
              opacity: layerOpacity,
              onClick: makeClickHandler((info: any) => {
                const hex = info?.object?.hex;
                if (hex && onFeatureClick) onFeatureClick(hex, "h3");
              }, "h3"),
              onHover: makeHoverHandler(layerId, "h3"),
              updateTriggers: {
                getFillColor: [lo, hi, scheme],
                getElevation: [lo, hi, extruded],
              },
            }),
          );
        }
        break;

      case "a5":
        if (config.data.length > 0) {
          result.push(
            new A5Layer({
              id: `a5-${layerId}`,
              data: config.data,
              pickable: true,
              filled: true,
              extruded,
              getPentagon: (d: any) => d.pentagon ?? "",
              getFillColor: (d: any) =>
                d.value != null ? valueToColor(d.value, lo, hi, scheme) : [100, 150, 255, 120],
              getElevation: (d: any) => {
                if (!extruded || d.value == null) return 0;
                const range = hi - lo || 1;
                const t = (d.value - lo) / range;
                return t * 500;
              },
              elevationScale: 50,
              opacity: layerOpacity,
              onClick: makeClickHandler((info: any) => {
                const pentagon = info?.object?.pentagon;
                if (pentagon && onFeatureClick) onFeatureClick(pentagon, "a5");
              }, "a5"),
              onHover: makeHoverHandler(layerId, "a5"),
              updateTriggers: {
                getFillColor: [lo, hi, scheme],
                getElevation: [lo, hi, extruded],
              },
            }),
          );
        }
        break;

      case "scatterplot":
        if (config.data.length > 0) {
          if (useGeoArrow) {
            // Zero-copy GeoArrow Scatterplot layer
            const cols = config.columnArrays!;
            const latCol = config.columnMapping?.latColumn ?? "lat";
            const lngCol = config.columnMapping?.lngColumn ?? "lng";
            const valCol = config.columnMapping?.valueColumn ?? "value";
            const extra: Record<string, ArrayLike<any>> = {};
            if (valCol in cols) extra.value = cols[valCol];
            // Include all other columns for picking info
            for (const [k, v] of Object.entries(cols)) {
              if (k !== latCol && k !== lngCol && !(k in extra)) extra[k] = v;
            }
            const table = buildGeoArrowPointTable(cols[latCol], cols[lngCol], extra);

            result.push(
              new GeoArrowScatterplotLayer({
                id: `scatter-ga-${layerId}`,
                data: table,
                getPosition: table.getChild("geom")!,
                pickable: true,
                filled: true,
                stroked: true,
                getRadius: ({ index, data }: any) => {
                  const v = data.data.getChild("value")?.get(index);
                  if (v == null) return 8000;
                  const range = hi - lo || 1;
                  return 3000 + ((Number(v) - lo) / range) * 30000;
                },
                getFillColor: ({ index, data }: any) => {
                  const v = data.data.getChild("value")?.get(index);
                  return v != null ? valueToColor(Number(v), lo, hi, scheme) : [100, 150, 255, 150];
                },
                getLineColor: [255, 255, 255, 40],
                lineWidthMinPixels: 1,
                radiusMinPixels: 3,
                radiusMaxPixels: 20,
                opacity: layerOpacity,
                onClick: makeClickHandler((info: any) => {
                  if (info?.object && onFeatureClick) onFeatureClick(info.object, "scatterplot");
                }, "scatterplot"),
                onHover: makeHoverHandler(layerId, "scatterplot"),
                updateTriggers: {
                  getFillColor: [lo, hi, scheme],
                  getRadius: [lo, hi],
                },
              }),
            );
          } else {
            // Standard Scatterplot layer (fallback)
            result.push(
              new ScatterplotLayer({
                id: `scatter-${layerId}`,
                data: config.data,
                pickable: true,
                filled: true,
                stroked: true,
                getPosition: (d: any) => [d.lng ?? 0, d.lat ?? 0],
                getRadius: (d: any) => {
                  if (d.radius != null) return d.radius;
                  if (d.value == null) return 8000;
                  const range = hi - lo || 1;
                  return 3000 + ((d.value - lo) / range) * 30000;
                },
                getFillColor: (d: any) =>
                  d.value != null ? valueToColor(d.value, lo, hi, scheme) : [100, 150, 255, 150],
                getLineColor: [255, 255, 255, 40],
                lineWidthMinPixels: 1,
                radiusMinPixels: 3,
                radiusMaxPixels: 20,
                opacity: layerOpacity,
                onClick: makeClickHandler((info: any) => {
                  if (info?.object && onFeatureClick) onFeatureClick(info.object, "scatterplot");
                }, "scatterplot"),
                onHover: makeHoverHandler(layerId, "scatterplot"),
                updateTriggers: {
                  getFillColor: [lo, hi, scheme],
                  getRadius: [lo, hi],
                },
              }),
            );
          }
        }
        break;

      case "wkb":
      case "geojson":
        if (config.data.length > 0 || (config.wkbArrays && config.wkbArrays.length > 0)) {
          if (useGeoArrow && config.wkbArrays) {
            // Zero-copy WKB → GeoArrow via objex-utils (no parsing, direct binary reads)
            const attrs = new Map<string, { values: any[]; type: string }>();
            if (config.columnArrays) {
              const valCol = config.columnMapping?.valueColumn ?? "value";
              for (const [name, arr] of Object.entries(config.columnArrays)) {
                if (name === config.columnMapping?.geometryColumn) continue;
                attrs.set(name, {
                  values: Array.from(arr),
                  type: arr instanceof Float64Array ? "DOUBLE" : "VARCHAR",
                });
              }
              // Ensure value column is accessible under "value" key for GeoArrow color rendering
              if (valCol !== "value" && valCol in config.columnArrays) {
                attrs.set("value", attrs.get(valCol)!);
              }
            }

            const geoResults = buildWkbGeoArrowResults(config.wkbArrays, attrs);
            for (const gr of geoResults) {
              const geoLayerType = gr.geometryType;
              if (geoLayerType === "point" || geoLayerType === "multipoint") {
                result.push(
                  new GeoArrowScatterplotLayer({
                    id: `wkb-scatter-${layerId}-${geoLayerType}`,
                    data: gr.table,
                    getPosition: gr.table.getChild("geometry")!,
                    pickable: true,
                    filled: true,
                    stroked: true,
                    getFillColor: ({ index, data }: any) => {
                      const v = data.data.getChild("value")?.get(index);
                      return v != null ? valueToColor(Number(v), lo, hi, scheme) : [100, 150, 255, 150];
                    },
                    getRadius: ({ index, data }: any) => {
                      const v = data.data.getChild("value")?.get(index);
                      if (v == null) return 8000;
                      const range = hi - lo || 1;
                      return 3000 + ((Number(v) - lo) / range) * 30000;
                    },
                    getLineColor: [255, 255, 255, 40],
                    lineWidthMinPixels: 1,
                    radiusMinPixels: 3,
                    radiusMaxPixels: 20,
                    opacity: layerOpacity,
                    onClick: makeClickHandler((info: any) => {
                      if (info?.object && onFeatureClick) onFeatureClick(info.object, "geojson");
                    }, "geojson"),
                    onHover: makeHoverHandler(layerId, "wkb"),
                    updateTriggers: { getFillColor: [lo, hi, scheme], getRadius: [lo, hi] },
                  }),
                );
              } else if (geoLayerType === "linestring" || geoLayerType === "multilinestring") {
                result.push(
                  new GeoArrowPathLayer({
                    id: `wkb-path-${layerId}-${geoLayerType}`,
                    data: gr.table,
                    getPath: gr.table.getChild("geometry")!,
                    pickable: true,
                    getColor: ({ index, data }: any) => {
                      const v = data.data.getChild("value")?.get(index);
                      return v != null ? valueToColor(Number(v), lo, hi, scheme) : [100, 150, 255, 200];
                    },
                    getWidth: 2,
                    widthMinPixels: 1,
                    widthMaxPixels: 8,
                    opacity: layerOpacity,
                    onClick: makeClickHandler((info: any) => {
                      if (info?.object && onFeatureClick) onFeatureClick(info.object, "geojson");
                    }, "geojson"),
                    onHover: makeHoverHandler(layerId, "wkb"),
                    updateTriggers: { getColor: [lo, hi, scheme] },
                  }),
                );
              } else if (geoLayerType === "polygon" || geoLayerType === "multipolygon") {
                result.push(
                  new GeoArrowPolygonLayer({
                    id: `wkb-poly-${layerId}-${geoLayerType}`,
                    data: gr.table,
                    getPolygon: gr.table.getChild("geometry")!,
                    pickable: true,
                    stroked: true,
                    filled: true,
                    extruded,
                    lineWidthMinPixels: 1,
                    getLineWidth: 2,
                    getFillColor: ({ index, data }: any) => {
                      const v = data.data.getChild("value")?.get(index);
                      return v != null ? valueToColor(Number(v), lo, hi, scheme) : [100, 150, 255, 120];
                    },
                    getLineColor: ({ index, data }: any) => {
                      const v = data.data.getChild("value")?.get(index);
                      return v != null ? valueToColor(Number(v), lo, hi, scheme) : [80, 130, 230, 200];
                    },
                    getElevation: ({ index, data }: any) => {
                      if (!extruded) return 0;
                      const v = data.data.getChild("value")?.get(index);
                      if (v == null) return 0;
                      const range = hi - lo || 1;
                      return ((Number(v) - lo) / range) * 500;
                    },
                    elevationScale: 50,
                    opacity: layerOpacity,
                    onClick: makeClickHandler((info: any) => {
                      if (info?.object && onFeatureClick) onFeatureClick(info.object, "geojson");
                    }, "geojson"),
                    onHover: makeHoverHandler(layerId, "wkb"),
                    updateTriggers: {
                      getFillColor: [lo, hi, scheme],
                      getLineColor: [lo, hi, scheme],
                      getElevation: [lo, hi, extruded],
                    },
                  }),
                );
              }
            }
          } else {
            // Standard GeoJSON layer (fallback — parsed geometry)
            result.push(
              new GeoJsonLayer<any>({
                id: `geojson-${layerId}`,
                data: { type: "FeatureCollection", features: config.data },
                pickable: true,
                stroked: true,
                filled: true,
                extruded,
                lineWidthMinPixels: 1,
                getLineWidth: 2,
                getFillColor: (f: any) => {
                  const v = f.properties?.value;
                  return v != null ? valueToColor(v, lo, hi, scheme) : [100, 150, 255, 120];
                },
                getLineColor: (f: any) => {
                  const v = f.properties?.value;
                  return v != null ? valueToColor(v, lo, hi, scheme) : [80, 130, 230, 200];
                },
                getElevation: (f: any) => {
                  if (!extruded) return 0;
                  const v = f.properties?.value;
                  if (v == null) return 0;
                  const range = hi - lo || 1;
                  return ((v - lo) / range) * 500;
                },
                getPointRadius: 100,
                pointRadiusMinPixels: 3,
                pointRadiusMaxPixels: 20,
                opacity: layerOpacity,
                onClick: (info: any) => {
                  if (info?.object && onFeatureClick) onFeatureClick(info.object, "geojson");
                },
                onHover: makeHoverHandler(layerId, "geojson"),
                updateTriggers: {
                  getFillColor: [lo, hi, scheme],
                  getLineColor: [lo, hi, scheme],
                  getElevation: [lo, hi, extruded],
                },
              }),
            );
          }
        }
        break;

      case "arc":
        if (config.data.length > 0) {
          if (useGeoArrow) {
            // Zero-copy GeoArrow Arc layer
            const cols = config.columnArrays!;
            const sLatCol = config.columnMapping?.sourceLatColumn ?? "source_lat";
            const sLngCol = config.columnMapping?.sourceLngColumn ?? "source_lng";
            const dLatCol = config.columnMapping?.destLatColumn ?? "dest_lat";
            const dLngCol = config.columnMapping?.destLngColumn ?? "dest_lng";
            const valCol = config.columnMapping?.valueColumn ?? "value";
            const extra: Record<string, ArrayLike<any>> = {};
            if (valCol in cols) extra.value = cols[valCol];
            const table = buildGeoArrowArcTable(cols[sLatCol], cols[sLngCol], cols[dLatCol], cols[dLngCol], extra);

            result.push(
              new GeoArrowArcLayer({
                id: `arc-ga-${layerId}`,
                data: table,
                getSourcePosition: table.getChild("source")!,
                getTargetPosition: table.getChild("target")!,
                pickable: true,
                getSourceColor: ({ index, data }: any) => {
                  const v = data.data.getChild("value")?.get(index);
                  return v != null ? valueToColor(Number(v), lo, hi, scheme) : [100, 150, 255, 200];
                },
                getTargetColor: ({ index, data }: any) => {
                  const v = data.data.getChild("value")?.get(index);
                  return v != null ? valueToColor(Number(v), lo, hi, scheme) : [255, 150, 100, 200];
                },
                getWidth: 2,
                widthMinPixels: 1,
                widthMaxPixels: 8,
                opacity: layerOpacity,
                onClick: makeClickHandler((info: any) => {
                  if (info?.object && onFeatureClick) onFeatureClick(info.object, "arc");
                }, "arc"),
                onHover: makeHoverHandler(layerId, "arc"),
                updateTriggers: {
                  getSourceColor: [lo, hi, scheme],
                  getTargetColor: [lo, hi, scheme],
                },
              }),
            );
          } else {
            // Standard Arc layer (fallback)
            result.push(
              new ArcLayer({
                id: `arc-${layerId}`,
                data: config.data,
                pickable: true,
                getSourcePosition: (d: any) => [d.sourceLng ?? 0, d.sourceLat ?? 0],
                getTargetPosition: (d: any) => [d.destLng ?? 0, d.destLat ?? 0],
                getSourceColor: (d: any) =>
                  d.value != null ? valueToColor(d.value, lo, hi, scheme) : [100, 150, 255, 200],
                getTargetColor: (d: any) =>
                  d.value != null ? valueToColor(d.value, lo, hi, scheme) : [255, 150, 100, 200],
                getWidth: 2,
                widthMinPixels: 1,
                widthMaxPixels: 8,
                opacity: layerOpacity,
                onClick: makeClickHandler((info: any) => {
                  if (info?.object && onFeatureClick) onFeatureClick(info.object, "arc");
                }, "arc"),
                onHover: makeHoverHandler(layerId, "arc"),
                updateTriggers: {
                  getSourceColor: [lo, hi, scheme],
                  getTargetColor: [lo, hi, scheme],
                },
              }),
            );
          }
        }
        break;
    }
  }

  return result;
}

/* ── Main component ─────────────────────────────────────────────── */

/* ── Tooltip formatting ─────────────────────────────────────────── */

function formatTooltipValue(val: unknown): string {
  if (val == null) return "—";
  if (typeof val === "number") {
    if (Number.isInteger(val) && Math.abs(val) >= 1000) return val.toLocaleString();
    if (!Number.isInteger(val)) return val.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  const s = String(val);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

function MapTooltip({ hover, containerRect }: { hover: HoverInfo; containerRect: DOMRect | null }) {
  const entries = Object.entries(hover.object);
  if (entries.length === 0) return null;

  // Position tooltip, keeping it within bounds
  const tooltipW = 240;
  const tooltipH = entries.length * 24 + 16;
  const cw = containerRect?.width ?? 800;
  const ch = containerRect?.height ?? 600;
  const x = hover.x + tooltipW + 16 > cw ? hover.x - tooltipW - 8 : hover.x + 12;
  const y = hover.y + tooltipH + 16 > ch ? Math.max(4, hover.y - tooltipH - 8) : hover.y + 12;

  return (
    <div
      className="absolute z-20 pointer-events-none rounded-lg border bg-card/95 shadow-lg backdrop-blur-sm overflow-hidden max-h-[60vh] overflow-y-auto"
      style={{ left: x, top: y, maxWidth: tooltipW }}
    >
      <div className="px-2.5 py-1.5 space-y-0.5">
        {entries.map(([key, val]) => (
          <div key={key} className="flex items-baseline gap-1.5 text-xs">
            <span className="text-muted-foreground truncate shrink-0 max-w-[90px]">{key}</span>
            <span className="text-foreground font-medium truncate">{formatTooltipValue(val)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DeckGLMap({
  latitude,
  longitude,
  zoom,
  pitch: pitchProp,
  bearing: bearingProp,
  layerConfigs,
  extruded,
  minVal,
  maxVal,
  colorScheme = "blue-red",
  basemap = "auto",
  fitBounds: fitBoundsProp,
  onFeatureClick,
  onBoundsChange,
  onViewStateChange,
}: DeckGLMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const isDark = useIsDark();
  const resolvedPitch = pitchProp ?? (extruded ? 45 : 0);
  const resolvedBearing = bearingProp ?? (extruded ? -15 : 0);
  const prevViewRef = useRef({ latitude, longitude, zoom });
  const prevDataCountRef = useRef(0);
  const programmaticMoveRef = useRef(false);
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;
  const onFeatureClickRef = useRef(onFeatureClick);
  onFeatureClickRef.current = onFeatureClick;
  const onViewStateChangeRef = useRef(onViewStateChange);
  onViewStateChangeRef.current = onViewStateChange;

  // Hover/tap tooltip state
  const [hoverInfo, setHoverInfo] = React.useState<HoverInfo | null>(null);
  // Right-click context menu
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; data: Record<string, unknown> } | null>(
    null,
  );
  const [ctxCopied, ctxCopy] = useCopyToClipboard(1000);
  const [isTouch, setIsTouch] = React.useState(false);
  useEffect(() => {
    setIsTouch("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  const handleHover = React.useCallback((info: HoverInfo | null) => {
    setHoverInfo(info);
    // Change cursor based on hover state
    if (mapRef.current) {
      mapRef.current.getCanvas().style.cursor = info ? "crosshair" : "";
    }
  }, []);

  const containerRectRef = useRef<DOMRect | null>(null);
  useEffect(() => {
    if (containerRef.current) {
      containerRectRef.current = containerRef.current.getBoundingClientRect();
    }
    const handleResize = () => {
      if (containerRef.current) containerRectRef.current = containerRef.current.getBoundingClientRect();
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, []);

  const totalDataCount = layerConfigs.reduce((sum, c) => sum + c.data.length, 0);

  const stableOnFeatureClick = React.useCallback(
    (...args: Parameters<NonNullable<typeof onFeatureClick>>) => onFeatureClickRef.current?.(...args),
    [],
  );

  const layers = useMemo(
    () => buildLayers(layerConfigs, minVal, maxVal, colorScheme, extruded, stableOnFeatureClick, handleHover, isTouch),
    [layerConfigs, minVal, maxVal, colorScheme, extruded, stableOnFeatureClick, handleHover, isTouch],
  );

  // 1. Initialize MapLibre + deck.gl overlay ONCE
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    ensureRTLPlugin();

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: isDark ? CARTO_DARK : CARTO_LIGHT,
      center: [longitude, latitude],
      zoom,
      pitch: resolvedPitch,
      bearing: resolvedBearing,
      attributionControl: false,
    });

    const overlay = new MapboxOverlay({ interleaved: true, layers: [] });

    map.once("load", () => {
      try {
        map.addControl(overlay);
        map.addControl(new maplibregl.NavigationControl(), "top-right");
        // Apply layers only after map viewport is ready
        overlay.setProps({ layers });
      } catch {
        /* MapLibre internal race — controls will be added on next render */
      }
    });

    let boundsTimer: ReturnType<typeof setTimeout>;
    map.on("moveend", () => {
      clearTimeout(boundsTimer);
      boundsTimer = setTimeout(() => {
        const b = map.getBounds();
        const c = map.getCenter();
        onBoundsChangeRef.current?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
        if (!programmaticMoveRef.current) {
          onViewStateChangeRef.current?.({
            latitude: c.lat,
            longitude: c.lng,
            zoom: map.getZoom(),
            pitch: map.getPitch(),
            bearing: map.getBearing(),
          });
        }
        programmaticMoveRef.current = false;
      }, 300);
    });

    // Dismiss tooltip on map interaction (natural on mobile)
    map.on("movestart", () => {
      setHoverInfo(null);
      setContextMenu(null);
    });

    mapRef.current = map;
    overlayRef.current = overlay;

    return () => {
      clearTimeout(boundsTimer);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  // 2. Update layers when data/styling changes
  useEffect(() => {
    overlayRef.current?.setProps({ layers });
  }, [layers]);

  // 3. Switch basemap style when theme changes or basemap prop changes
  const resolvedDark = basemap === "auto" ? isDark : basemap === "dark";
  const layersRef = useRef(layers);
  layersRef.current = layers;
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const newStyle = resolvedDark ? CARTO_DARK : CARTO_LIGHT;
    const currentStyle = (map.getStyle() as any)?.name;
    if ((resolvedDark && currentStyle === "Dark Matter") || (!resolvedDark && currentStyle === "Positron")) return;
    // Guard: MapLibre's setStyle crashes with "this.style is undefined" if called before
    // the initial style is loaded (race condition during rapid theme switches or first render).
    if (!map.isStyleLoaded()) {
      map.once("load", () => {
        try {
          map.setStyle(newStyle);
        } catch {
          /* MapLibre internal race — style will load on next theme change */
        }
      });
      return;
    }
    try {
      map.setStyle(newStyle);
    } catch {
      /* MapLibre internal race — style will load on next theme change */
    }
    map.once("styledata", () => {
      if (overlayRef.current) {
        overlayRef.current.setProps({ layers: layersRef.current });
      }
    });
  }, [resolvedDark]);

  // 4. Auto-fitBounds on first data load (0→N), driven by GeoMap passing explicit bounds
  useEffect(() => {
    if (!mapRef.current || !fitBoundsProp || totalDataCount === 0) {
      prevDataCountRef.current = 0;
      return;
    }
    if (prevDataCountRef.current > 0) {
      prevDataCountRef.current = totalDataCount;
      return;
    }
    prevDataCountRef.current = totalDataCount;

    programmaticMoveRef.current = true;
    mapRef.current.fitBounds(fitBoundsProp, {
      padding: { top: 40, bottom: 40, left: 40, right: 40 },
      maxZoom: 14,
      duration: 1200,
      pitch: resolvedPitch,
      bearing: resolvedBearing,
    });
  }, [totalDataCount, fitBoundsProp]);

  // 5. FlyTo when AI explicitly changes lat/lng/zoom props
  useEffect(() => {
    if (!mapRef.current) return;
    const prev = prevViewRef.current;
    const changed = prev.latitude !== latitude || prev.longitude !== longitude || prev.zoom !== zoom;
    prevViewRef.current = { latitude, longitude, zoom };
    if (!changed) return;
    programmaticMoveRef.current = true;
    mapRef.current.flyTo({
      center: [longitude, latitude],
      zoom,
      pitch: resolvedPitch,
      bearing: resolvedBearing,
      duration: 1500,
    });
  }, [latitude, longitude, zoom, extruded]);

  // 6. FlyTo from external request (e.g. DataTable "Zoom to record")
  const flyToVer = useFlyToVersion();
  useEffect(() => {
    if (!mapRef.current || flyToVer === 0) return;
    const target = consumeFlyTo();
    if (!target) return;
    programmaticMoveRef.current = true;
    mapRef.current.flyTo({
      center: [target.longitude, target.latitude],
      zoom: target.zoom ?? 12,
      duration: 1200,
    });
  }, [flyToVer]);

  const handleContextMenu = React.useCallback(
    (e: React.MouseEvent) => {
      // If hovering a feature, show context menu instead of browser default
      if (hoverInfo) {
        e.preventDefault();
        setContextMenu({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, data: hoverInfo.object });
      }
    },
    [hoverInfo],
  );

  const handleCopyFromContextMenu = React.useCallback(() => {
    if (!contextMenu) return;
    ctxCopy(JSON.stringify(contextMenu.data, null, 2));
    setTimeout(() => setContextMenu(null), 1000);
  }, [contextMenu, ctxCopy]);

  // Dismiss context menu on click anywhere
  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    window.addEventListener("click", dismiss);
    return () => window.removeEventListener("click", dismiss);
  }, [contextMenu]);

  return (
    <div className="w-full h-full absolute inset-0" onContextMenu={handleContextMenu}>
      <div ref={containerRef} className="w-full h-full absolute inset-0" />
      {hoverInfo && !contextMenu && <MapTooltip hover={hoverInfo} containerRect={containerRectRef.current} />}
      {contextMenu && (
        <div
          className="absolute z-30 rounded-lg border bg-card shadow-lg overflow-hidden"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            onClick={handleCopyFromContextMenu}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors w-full"
          >
            {ctxCopied ? "Copied!" : "Copy record"}
          </button>
        </div>
      )}
    </div>
  );
}
