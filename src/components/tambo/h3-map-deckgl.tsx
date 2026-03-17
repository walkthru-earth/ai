"use client";

import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import React, { useEffect, useMemo, useRef } from "react";

interface HexData {
  id?: string;
  hex?: string;
  value?: number;
  label?: string;
}

interface MarkerData {
  id?: string;
  lat?: number;
  lng?: number;
  value?: number;
  label?: string;
}

type ColorScheme = "blue-red" | "viridis" | "plasma" | "warm" | "cool" | "spectral";

interface DeckGLMapProps {
  latitude: number;
  longitude: number;
  zoom: number;
  hexagons?: HexData[];
  markers?: MarkerData[];
  extruded: boolean;
  minVal: number;
  maxVal: number;
  colorScheme?: ColorScheme;
  onHexClick?: (hex: string) => void;
  onBoundsChange?: (bbox: [number, number, number, number]) => void;
}

/** Color ramps — each is an array of [R,G,B] stops evenly distributed 0→1 */
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

function valueToColor(
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

// Load RTL text plugin once (for Arabic, Hebrew, etc.)
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

export default function DeckGLMap({
  latitude,
  longitude,
  zoom,
  hexagons,
  markers,
  extruded,
  minVal,
  maxVal,
  colorScheme = "blue-red",
  onHexClick,
  onBoundsChange,
}: DeckGLMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const isDark = useIsDark();
  // Track hex count to detect first data load vs updates
  const prevHexCountRef = useRef(0);
  // Track latest lat/lng/zoom to detect AI-driven view changes
  const prevViewRef = useRef({ latitude, longitude, zoom });
  // Store latest onBoundsChange in ref to avoid re-creating map when callback changes
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;

  const layers = useMemo(() => {
    const result: any[] = [];

    if (hexagons && hexagons.length > 0) {
      result.push(
        new H3HexagonLayer({
          id: "h3-hexagons",
          data: hexagons,
          pickable: true,
          filled: true,
          extruded,
          highPrecision: "auto",
          coverage: 0.92,
          getHexagon: (d: HexData) => d.hex ?? "",
          getFillColor: (d: HexData) =>
            d.value != null ? valueToColor(d.value, minVal, maxVal, colorScheme) : [100, 150, 255, 120],
          getElevation: (d: HexData) => {
            if (!extruded || d.value == null) return 0;
            const range = maxVal - minVal || 1;
            const t = (d.value - minVal) / range;
            return t * 500;
          },
          elevationScale: 50,
          opacity: 0.85,
          onClick: (info: any) => {
            const hex = info?.object?.hex;
            if (hex && onHexClick) onHexClick(hex);
          },
          updateTriggers: {
            getFillColor: [minVal, maxVal, colorScheme],
            getElevation: [minVal, maxVal, extruded],
          },
        }),
      );
    }

    if (markers && markers.length > 0) {
      result.push(
        new ScatterplotLayer({
          id: "scatter-markers",
          data: markers,
          pickable: true,
          filled: true,
          stroked: true,
          getPosition: (d: MarkerData) => [d.lng ?? 0, d.lat ?? 0],
          getRadius: (d: MarkerData) => {
            if (d.value == null) return 8000;
            const range = maxVal - minVal || 1;
            return 3000 + ((d.value - minVal) / range) * 30000;
          },
          getFillColor: (d: MarkerData) =>
            d.value != null ? valueToColor(d.value, minVal, maxVal, colorScheme) : [100, 150, 255, 150],
          getLineColor: [255, 255, 255, 40],
          lineWidthMinPixels: 1,
          radiusMinPixels: 3,
          radiusMaxPixels: 20,
          updateTriggers: {
            getFillColor: [minVal, maxVal],
            getRadius: [minVal, maxVal],
          },
        }),
      );
    }

    return result;
  }, [hexagons, markers, extruded, minVal, maxVal, colorScheme, onHexClick]);

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

    // Emit bbox on pan/zoom (debounced) for spatial cross-filtering
    let boundsTimer: ReturnType<typeof setTimeout>;
    map.on("moveend", () => {
      clearTimeout(boundsTimer);
      boundsTimer = setTimeout(() => {
        if (!onBoundsChangeRef.current) return;
        const b = map.getBounds();
        onBoundsChangeRef.current([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
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
    // Only run once on mount — all other updates handled by separate effects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Update layers when data/styling changes
  useEffect(() => {
    overlayRef.current?.setProps({ layers });
  }, [layers]);

  // 3. Switch basemap style when theme changes
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const newStyle = isDark ? CARTO_DARK : CARTO_LIGHT;
    // Only switch if style actually changed
    const currentStyle = (map.getStyle() as any)?.name;
    if ((isDark && currentStyle === "Dark Matter") || (!isDark && currentStyle === "Positron")) return;
    map.setStyle(newStyle);
    map.once("styledata", () => {
      if (overlayRef.current) {
        overlayRef.current.setProps({ layers });
      }
    });
  }, [isDark, layers]);

  // 4. Auto-fitBounds ONLY on first data load (0→N hexagons), not on re-renders
  const hexCount = hexagons?.length ?? 0;
  useEffect(() => {
    if (!mapRef.current || hexCount === 0) return;
    // Only fitBounds when data first appears (was 0, now has data)
    if (prevHexCountRef.current > 0) {
      prevHexCountRef.current = hexCount;
      return;
    }
    prevHexCountRef.current = hexCount;
    const map = mapRef.current;

    import("h3-js")
      .then((h3) => {
        let minLat = 90;
        let maxLat = -90;
        let minLng = 180;
        let maxLng = -180;

        for (const hex of hexagons!) {
          if (!hex.hex) continue;
          try {
            const [lat, lng] = h3.cellToLatLng(hex.hex);
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
          } catch {
            /* invalid hex */
          }
        }

        if (minLat > maxLat) return;

        map.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          {
            padding: { top: 40, bottom: 40, left: 40, right: 40 },
            maxZoom: 14,
            duration: 1200,
            pitch: extruded ? 45 : 0,
            bearing: extruded ? -15 : 0,
          },
        );
      })
      .catch(() => {
        map.flyTo({
          center: [longitude, latitude],
          zoom,
          pitch: extruded ? 45 : 0,
          bearing: extruded ? -15 : 0,
          duration: 1200,
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hexCount]);

  // 5. FlyTo when AI explicitly changes lat/lng/zoom props (e.g., "zoom into Cairo")
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
