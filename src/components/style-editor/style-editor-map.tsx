/**
 * Full-bleed MapLibre GL JS map that renders the current style from style-store.
 * Shows source/layer info popup on feature click for @mentioning in chat.
 */

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { EMPTY_STYLE, useStyle, useStyleVersion } from "@/services/style-store";

export interface FeatureInfo {
  layerId: string;
  sourceId: string;
  sourceType: string;
  properties: Record<string, unknown>;
  lngLat: { lng: number; lat: number };
}

interface StyleEditorMapProps {
  onFeatureClick?: (info: FeatureInfo) => void;
  className?: string;
}

export function StyleEditorMap({ onFeatureClick, className = "" }: StyleEditorMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const style = useStyle();
  const styleVersion = useStyleVersion();
  const [mapReady, setMapReady] = useState(false);

  // Initialize map once on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once, style/onFeatureClick read via refs
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: style || EMPTY_STYLE,
      center: [0, 20],
      zoom: 1.5,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    map.on("load", () => {
      setMapReady(true);
    });

    // Click handler to identify features
    map.on("click", (e) => {
      const features = map.queryRenderedFeatures(e.point);
      if (features.length > 0 && onFeatureClick) {
        const f = features[0];
        onFeatureClick({
          layerId: f.layer.id,
          sourceId: (f.layer.source as string) || "",
          sourceType: f.layer.type,
          properties: f.properties || {},
          lngLat: { lng: e.lngLat.lng, lat: e.lngLat.lat },
        });
      }
    });

    // Cursor feedback (throttled via rAF to avoid expensive queryRenderedFeatures on every pixel)
    let cursorRafId = 0;
    map.on("mousemove", (e) => {
      cancelAnimationFrame(cursorRafId);
      cursorRafId = requestAnimationFrame(() => {
        const features = map.queryRenderedFeatures(e.point);
        map.getCanvas().style.cursor = features.length > 0 ? "pointer" : "";
      });
    });

    mapRef.current = map;

    return () => {
      cancelAnimationFrame(cursorRafId);
      map.remove();
      mapRef.current = null;
    };
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update style when store changes (after initial mount)
  // biome-ignore lint/correctness/useExhaustiveDependencies: styleVersion forces re-run on store writes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !style) return;

    try {
      map.setStyle(style, { diff: true });
    } catch {
      // If diff fails, try full replacement
      try {
        map.setStyle(style);
      } catch (e) {
        console.warn("StyleEditorMap: failed to apply style", e);
      }
    }
  }, [style, styleVersion, mapReady]);

  return <div ref={mapContainerRef} className={`w-full h-full ${className}`} style={{ minHeight: "100%" }} />;
}
