"use client";

import { withTamboInteractable } from "@tambo-ai/react";
import { Map } from "lucide-react";
import dynamic from "next/dynamic";
import * as React from "react";
import { useMemo } from "react";
import { z } from "zod";
import { setCrossFilter, useQueryResult } from "@/services/query-store";
import { useInDashboardPanel } from "./panel-context";

/* ── Schema ────────────────────────────────────────────────────────── */

export const h3MapSchema = z.object({
  title: z.string().optional().describe("Map title"),
  queryId: z
    .string()
    .optional()
    .describe(
      "ID from runSQL result — the map reads data directly from the query store. " +
        "The query MUST include a 'hex' column (from h3_h3_to_string) and a 'value' column. " +
        "This is the PREFERRED way to pass data — zero token cost, instant render.",
    ),
  hexColumn: z.string().optional().describe("Column name for H3 hex string in query result (default: 'hex')"),
  valueColumn: z.string().optional().describe("Column name for the numeric value to color by (default: 'value')"),
  latitude: z.number().optional().describe("Center latitude"),
  longitude: z.number().optional().describe("Center longitude"),
  zoom: z.number().optional().describe("Zoom level (default 4)"),
  colorMetric: z.string().optional().describe("Legend label for the color metric (e.g. 'Population Density')"),
  colorScheme: z
    .enum(["blue-red", "viridis", "plasma", "warm", "cool", "spectral"])
    .optional()
    .describe("Color palette"),
  extruded: z.boolean().optional().describe("3D extrusion based on value"),
});

type H3MapProps = z.infer<typeof h3MapSchema>;

/* ── deck.gl (dynamic import to avoid SSR) ─────────────────────────── */

const DeckGLMap = dynamic(() => import("./h3-map-deckgl"), { ssr: false });

/* ── Percentile-based range (5th–95th) ─────────────────────────────── */

function computePercentileRange(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  const sorted = [...values].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.05)];
  const hi = sorted[Math.floor(sorted.length * 0.95)];
  if (lo === hi) return { min: lo, max: lo + 1 };
  return { min: lo, max: hi };
}

/* ── Main component ────────────────────────────────────────────────── */

export const H3Map = React.forwardRef<HTMLDivElement, H3MapProps>((props, ref) => {
  const {
    title,
    queryId,
    hexColumn = "hex",
    valueColumn = "value",
    latitude,
    longitude,
    zoom = 4,
    colorMetric,
    colorScheme = "blue-red",
    extruded = false,
  } = props;
  const inPanel = useInDashboardPanel();

  // Read data from query store — reactive, re-renders when replay populates data
  const queryResult = useQueryResult(queryId);

  const { hexagons, center } = useMemo(() => {
    if (!queryId || !queryResult || queryResult.rows.length === 0) return { hexagons: [], center: null };

    const hexData: { hex: string; value: number }[] = [];
    let latSum = 0;
    let lngSum = 0;
    let coordCount = 0;

    for (const row of queryResult.rows) {
      const hex = row[hexColumn];
      const val = row[valueColumn];
      if (typeof hex === "string" && hex.length > 0) {
        hexData.push({
          hex,
          value: typeof val === "number" ? val : 0,
        });
        // If query included lat/lng columns, use for centering
        // Support both named columns and h3_cell_to_latlng list [lat, lng]
        let lat = row.lat as number | undefined;
        let lng = row.lng as number | undefined;
        if (lat == null && Array.isArray(row.latlng) && row.latlng.length === 2) {
          lat = row.latlng[0] as number;
          lng = row.latlng[1] as number;
        }
        if (typeof lat === "number" && typeof lng === "number") {
          latSum += lat;
          lngSum += lng;
          coordCount++;
        }
      }
    }

    const center = coordCount > 0 ? { lat: latSum / coordCount, lng: lngSum / coordCount } : null;

    return { hexagons: hexData, center };
  }, [queryId, queryResult, hexColumn, valueColumn]);

  const hasData = hexagons.length > 0;

  // Cross-filter: emit when hex clicked
  const handleHexClick = React.useCallback(
    (hex: string) => {
      if (!queryId) return;
      setCrossFilter({
        sourceQueryId: queryId,
        sourceComponent: "H3Map",
        filterType: "value",
        column: hexColumn,
        values: [hex],
      });
    },
    [queryId, hexColumn],
  );

  // Cross-filter: compute which hexes are inside viewport, emit their IDs
  const handleBoundsChange = React.useCallback(
    async (bbox: [number, number, number, number]) => {
      if (!queryId || hexagons.length === 0) return;
      const [west, south, east, north] = bbox;
      try {
        const h3 = await import("h3-js");
        const visibleHexes = hexagons
          .filter((h) => {
            const [lat, lng] = h3.cellToLatLng(h.hex);
            return lat >= south && lat <= north && lng >= west && lng <= east;
          })
          .map((h) => h.hex);
        // Only emit if we're zoomed in enough to actually filter (not showing everything)
        if (visibleHexes.length > 0 && visibleHexes.length < hexagons.length) {
          setCrossFilter({
            sourceQueryId: queryId,
            sourceComponent: "H3Map",
            filterType: "bbox",
            column: hexColumn,
            values: visibleHexes,
            bbox,
          });
        } else if (visibleHexes.length === hexagons.length) {
          // Showing all data — clear spatial filter
          setCrossFilter({
            sourceQueryId: queryId,
            sourceComponent: "H3Map",
            filterType: "bbox",
            column: hexColumn,
            values: [],
            bbox,
          });
        }
      } catch {
        /* h3-js not available — skip spatial filter */
      }
    },
    [queryId, hexColumn, hexagons],
  );

  const centerLat = latitude ?? center?.lat ?? 0;
  const centerLng = longitude ?? center?.lng ?? 0;

  // Percentile color range
  const values = hexagons.filter((h) => h.value != null).map((h) => h.value);
  const { min: minVal, max: maxVal } = computePercentileRange(values);

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

  const LEGEND_GRADIENTS: Record<string, string> = {
    "blue-red": "linear-gradient(90deg, #0571b0, #54aead, #a6d96a, #fee08b, #fc8d59, #d73027)",
    viridis: "linear-gradient(90deg, #440154, #31688e, #35b779, #fde725)",
    plasma: "linear-gradient(90deg, #0d0887, #7e03a8, #cc4778, #f89540, #f0f921)",
    warm: "linear-gradient(90deg, #fee08b, #fdae61, #f46d43, #d73027, #a50026)",
    cool: "linear-gradient(90deg, #f7fcfd, #ccece6, #66c2a4, #238b45, #00441b)",
    spectral: "linear-gradient(90deg, #5e4fa2, #3288bd, #66c2a5, #fee08b, #f46d43, #9e0142)",
  };

  return (
    <div ref={ref} className="rounded-xl border overflow-hidden bg-card w-full h-full flex flex-col">
      {/* Header — hidden when inside dashboard panel (panel provides its own) */}
      {title && !inPanel && (
        <div className="px-3 py-1.5 border-b bg-muted/30 flex items-center gap-2 flex-shrink-0">
          <Map className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground truncate">{title}</span>
          {colorMetric && <span className="text-xs text-muted-foreground ml-auto font-mono">{colorMetric}</span>}
        </div>
      )}

      {/* Map — fills remaining space between header and legend, min-h ensures it's visible */}
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
            hexagons={hexagons}
            markers={[]}
            extruded={extruded}
            minVal={minVal}
            maxVal={maxVal}
            colorScheme={colorScheme}
            onHexClick={handleHexClick}
            onBoundsChange={handleBoundsChange}
          />
        ) : (
          <div className="h-full flex items-center justify-center bg-muted/30 text-muted-foreground">
            <p className="text-base">Loading {queryId}...</p>
          </div>
        )}
      </div>

      {/* Legend — compact bar at bottom */}
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
        {hasData && (
          <span className="text-xs text-muted-foreground ml-auto">{hexagons.length.toLocaleString()} hex</span>
        )}
      </div>
    </div>
  );
});
H3Map.displayName = "H3Map";

/** Interactable H3Map — AI can update props at runtime (zoom, center, colorScheme, etc.) */
export const InteractableH3Map = withTamboInteractable(H3Map, {
  componentName: "H3Map",
  description:
    "Interactive deck.gl H3 hex map. AI can update its view (latitude, longitude, zoom), color scheme, " +
    "extruded mode, and other props at runtime without creating a new map. " +
    "Use this to respond to requests like 'zoom into Cairo' or 'switch to viridis colors'.",
  propsSchema: h3MapSchema,
});
