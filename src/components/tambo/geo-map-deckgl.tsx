"use client";

import { H3HexagonLayer } from "@deck.gl/geo-layers";
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

/* ── Types ──────────────────────────────────────────────────────── */

export type ColorScheme = "blue-red" | "viridis" | "plasma" | "warm" | "cool" | "spectral";

export type LayerType = "h3" | "scatterplot" | "geojson" | "arc" | "wkb";

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

export interface DeckGLMapProps {
  latitude: number;
  longitude: number;
  zoom: number;
  layerConfigs: LayerConfig[];
  extruded: boolean;
  minVal: number;
  maxVal: number;
  colorScheme?: ColorScheme;
  basemap?: Basemap;
  fitBounds?: [[number, number], [number, number]] | null;
  onFeatureClick?: (feature: any, layerType: LayerType) => void;
  onBoundsChange?: (bbox: [number, number, number, number]) => void;
  onViewStateChange?: (view: { latitude: number; longitude: number; zoom: number }) => void;
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

function buildLayers(
  configs: LayerConfig[],
  minVal: number,
  maxVal: number,
  colorScheme: ColorScheme,
  extruded: boolean,
  onFeatureClick?: (feature: any, layerType: LayerType) => void,
): any[] {
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
              onClick: (info: any) => {
                const hex = info?.object?.hex;
                if (hex && onFeatureClick) onFeatureClick(hex, "h3");
              },
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
                onClick: (info: any) => {
                  if (info?.object && onFeatureClick) onFeatureClick(info.object, "scatterplot");
                },
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
                onClick: (info: any) => {
                  if (info?.object && onFeatureClick) onFeatureClick(info.object, "scatterplot");
                },
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
              // Ensure value column is included
              if (valCol in config.columnArrays && !attrs.has("value")) {
                attrs.set("value", {
                  values: Array.from(config.columnArrays[valCol]),
                  type: "DOUBLE",
                });
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
                    onClick: (info: any) => {
                      if (info?.object && onFeatureClick) onFeatureClick(info.object, "geojson");
                    },
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
                    onClick: (info: any) => {
                      if (info?.object && onFeatureClick) onFeatureClick(info.object, "geojson");
                    },
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
                    onClick: (info: any) => {
                      if (info?.object && onFeatureClick) onFeatureClick(info.object, "geojson");
                    },
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
                onClick: (info: any) => {
                  if (info?.object && onFeatureClick) onFeatureClick(info.object, "arc");
                },
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
                onClick: (info: any) => {
                  if (info?.object && onFeatureClick) onFeatureClick(info.object, "arc");
                },
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

export default function DeckGLMap({
  latitude,
  longitude,
  zoom,
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
  const prevViewRef = useRef({ latitude, longitude, zoom });
  const prevDataCountRef = useRef(0);
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;
  const onFeatureClickRef = useRef(onFeatureClick);
  onFeatureClickRef.current = onFeatureClick;
  const onViewStateChangeRef = useRef(onViewStateChange);
  onViewStateChangeRef.current = onViewStateChange;

  const totalDataCount = layerConfigs.reduce((sum, c) => sum + c.data.length, 0);

  const layers = useMemo(
    () => buildLayers(layerConfigs, minVal, maxVal, colorScheme, extruded, onFeatureClickRef.current),
    [layerConfigs, minVal, maxVal, colorScheme, extruded],
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
      pitch: extruded ? 45 : 0,
      bearing: extruded ? -15 : 0,
      attributionControl: false,
    });

    const overlay = new MapboxOverlay({ interleaved: true, layers: [] });

    map.once("load", () => {
      map.addControl(overlay);
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      // Apply layers only after map viewport is ready
      overlay.setProps({ layers });
    });

    let boundsTimer: ReturnType<typeof setTimeout>;
    map.on("moveend", () => {
      clearTimeout(boundsTimer);
      boundsTimer = setTimeout(() => {
        const b = map.getBounds();
        const c = map.getCenter();
        onBoundsChangeRef.current?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
        onViewStateChangeRef.current?.({
          latitude: c.lat,
          longitude: c.lng,
          zoom: map.getZoom(),
        });
      }, 300);
    });

    mapRef.current = map;
    overlayRef.current = overlay;

    return () => {
      clearTimeout(boundsTimer);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Update layers when data/styling changes
  useEffect(() => {
    overlayRef.current?.setProps({ layers });
  }, [layers]);

  // 3. Switch basemap style when theme changes or basemap prop changes
  const resolvedDark = basemap === "auto" ? isDark : basemap === "dark";
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const newStyle = resolvedDark ? CARTO_DARK : CARTO_LIGHT;
    const currentStyle = (map.getStyle() as any)?.name;
    if ((resolvedDark && currentStyle === "Dark Matter") || (!resolvedDark && currentStyle === "Positron")) return;
    map.setStyle(newStyle);
    map.once("styledata", () => {
      if (overlayRef.current) {
        overlayRef.current.setProps({ layers });
      }
    });
  }, [resolvedDark, layers]);

  // 4. Auto-fitBounds on first data load (0→N), driven by GeoMap passing explicit bounds
  useEffect(() => {
    if (!mapRef.current || !fitBoundsProp || totalDataCount === 0) return;
    if (prevDataCountRef.current > 0) {
      prevDataCountRef.current = totalDataCount;
      return;
    }
    prevDataCountRef.current = totalDataCount;

    mapRef.current.fitBounds(fitBoundsProp, {
      padding: { top: 40, bottom: 40, left: 40, right: 40 },
      maxZoom: 14,
      duration: 1200,
      pitch: extruded ? 45 : 0,
      bearing: extruded ? -15 : 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalDataCount, fitBoundsProp]);

  // 5. FlyTo when AI explicitly changes lat/lng/zoom props
  useEffect(() => {
    if (!mapRef.current) return;
    const prev = prevViewRef.current;
    const changed = prev.latitude !== latitude || prev.longitude !== longitude || prev.zoom !== zoom;
    prevViewRef.current = { latitude, longitude, zoom };
    if (!changed) return;
    mapRef.current.flyTo({
      center: [longitude, latitude],
      zoom,
      pitch: extruded ? 45 : 0,
      bearing: extruded ? -15 : 0,
      duration: 1500,
    });
  }, [latitude, longitude, zoom, extruded]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }} />;
}
