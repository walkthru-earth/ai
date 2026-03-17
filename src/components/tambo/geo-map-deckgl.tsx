"use client";

import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { ArcLayer, GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import React, { useEffect, useMemo, useRef } from "react";

/* ── Types ──────────────────────────────────────────────────────── */

export type ColorScheme = "blue-red" | "viridis" | "plasma" | "warm" | "cool" | "spectral";

export type LayerType = "h3" | "scatterplot" | "geojson" | "arc";

export interface LayerConfig {
  type: LayerType;
  data: any[];
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

  for (const config of configs) {
    switch (config.type) {
      case "h3":
        if (config.data.length > 0) {
          result.push(
            new H3HexagonLayer({
              id: "h3-hexagons",
              data: config.data,
              pickable: true,
              filled: true,
              extruded,
              highPrecision: "auto",
              coverage: 0.92,
              getHexagon: (d: any) => d.hex ?? "",
              getFillColor: (d: any) =>
                d.value != null ? valueToColor(d.value, minVal, maxVal, colorScheme) : [100, 150, 255, 120],
              getElevation: (d: any) => {
                if (!extruded || d.value == null) return 0;
                const range = maxVal - minVal || 1;
                const t = (d.value - minVal) / range;
                return t * 500;
              },
              elevationScale: 50,
              opacity: 0.85,
              onClick: (info: any) => {
                const hex = info?.object?.hex;
                if (hex && onFeatureClick) onFeatureClick(hex, "h3");
              },
              updateTriggers: {
                getFillColor: [minVal, maxVal, colorScheme],
                getElevation: [minVal, maxVal, extruded],
              },
            }),
          );
        }
        break;

      case "scatterplot":
        if (config.data.length > 0) {
          result.push(
            new ScatterplotLayer({
              id: "scatter-points",
              data: config.data,
              pickable: true,
              filled: true,
              stroked: true,
              getPosition: (d: any) => [d.lng ?? 0, d.lat ?? 0],
              getRadius: (d: any) => {
                if (d.radius != null) return d.radius;
                if (d.value == null) return 8000;
                const range = maxVal - minVal || 1;
                return 3000 + ((d.value - minVal) / range) * 30000;
              },
              getFillColor: (d: any) =>
                d.value != null ? valueToColor(d.value, minVal, maxVal, colorScheme) : [100, 150, 255, 150],
              getLineColor: [255, 255, 255, 40],
              lineWidthMinPixels: 1,
              radiusMinPixels: 3,
              radiusMaxPixels: 20,
              onClick: (info: any) => {
                if (info?.object && onFeatureClick) onFeatureClick(info.object, "scatterplot");
              },
              updateTriggers: {
                getFillColor: [minVal, maxVal, colorScheme],
                getRadius: [minVal, maxVal],
              },
            }),
          );
        }
        break;

      case "geojson":
        if (config.data.length > 0) {
          result.push(
            new GeoJsonLayer<any>({
              id: "geojson-layer",
              data: { type: "FeatureCollection", features: config.data },
              pickable: true,
              stroked: true,
              filled: true,
              extruded,
              lineWidthMinPixels: 1,
              getLineWidth: 2,
              getFillColor: (f: any) => {
                const v = f.properties?.value;
                return v != null ? valueToColor(v, minVal, maxVal, colorScheme) : [100, 150, 255, 120];
              },
              getLineColor: (f: any) => {
                const v = f.properties?.value;
                return v != null ? valueToColor(v, minVal, maxVal, colorScheme) : [80, 130, 230, 200];
              },
              getElevation: (f: any) => {
                if (!extruded) return 0;
                const v = f.properties?.value;
                if (v == null) return 0;
                const range = maxVal - minVal || 1;
                return ((v - minVal) / range) * 500;
              },
              getPointRadius: 100,
              pointRadiusMinPixels: 3,
              pointRadiusMaxPixels: 20,
              onClick: (info: any) => {
                if (info?.object && onFeatureClick) onFeatureClick(info.object, "geojson");
              },
              updateTriggers: {
                getFillColor: [minVal, maxVal, colorScheme],
                getLineColor: [minVal, maxVal, colorScheme],
                getElevation: [minVal, maxVal, extruded],
              },
            }),
          );
        }
        break;

      case "arc":
        if (config.data.length > 0) {
          result.push(
            new ArcLayer({
              id: "arc-layer",
              data: config.data,
              pickable: true,
              getSourcePosition: (d: any) => [d.sourceLng ?? 0, d.sourceLat ?? 0],
              getTargetPosition: (d: any) => [d.destLng ?? 0, d.destLat ?? 0],
              getSourceColor: (d: any) =>
                d.value != null ? valueToColor(d.value, minVal, maxVal, colorScheme) : [100, 150, 255, 200],
              getTargetColor: (d: any) =>
                d.value != null ? valueToColor(d.value, minVal, maxVal, colorScheme) : [255, 150, 100, 200],
              getWidth: 2,
              widthMinPixels: 1,
              widthMaxPixels: 8,
              onClick: (info: any) => {
                if (info?.object && onFeatureClick) onFeatureClick(info.object, "arc");
              },
              updateTriggers: {
                getSourceColor: [minVal, maxVal, colorScheme],
                getTargetColor: [minVal, maxVal, colorScheme],
              },
            }),
          );
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

    const overlay = new MapboxOverlay({ interleaved: true, layers });

    map.once("load", () => {
      map.addControl(overlay);
      map.addControl(new maplibregl.NavigationControl(), "top-right");
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
