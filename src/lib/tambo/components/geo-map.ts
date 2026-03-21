/**
 * GeoMap + H3Map component registrations — the primary map visualization.
 * GeoMap description is the longest — own file for independent tuning.
 */

import type { TamboComponent } from "@tambo-ai/react";
import { geoMapSchema, InteractableGeoMap } from "@/components/tambo/geo-map";
import { InteractableH3Map } from "@/components/tambo/h3-map";

export const geoMapComponent: TamboComponent = {
  name: "GeoMap",
  description:
    "deck.gl map supporting multiple geometry types. INTERACTABLE: AI can update props at runtime. " +
    "Pass `queryId` from runSQL — zero token cost. Auto-detects layer type from column names, or set layerType explicitly. " +
    "SQL patterns per type: " +
    "H3: SELECT h3_h3_to_string(h3_index) AS hex, <metric> AS value ... (deck.gl renders hexagons from hex string); " +
    "A5: SELECT printf('%x', a5_lonlat_to_cell(lng, lat, res)) AS pentagon, <metric> AS value, " +
    "list_extract(a5_cell_to_lonlat(a5_lonlat_to_cell(lng, lat, res)), 1) AS lng, " +
    "list_extract(a5_cell_to_lonlat(a5_lonlat_to_cell(lng, lat, res)), 2) AS lat ... (deck.gl renders pentagons from cell ID); " +
    "Points: SELECT lat, lng, <metric> AS value ... ; " +
    "Native geometry (BEST for spatial analysis): Parquet files with GEOMETRY columns auto-render — just SELECT * FROM file. " +
    "ST_Buffer, ST_Intersection, spatial joins all produce GEOMETRY — auto-rendered as polygon/line/point via zero-copy WKB. NO ST_AsGeoJSON needed. " +
    "GeoJSON: SELECT ST_AsGeoJSON(geometry) AS geometry, <metric> AS value ... (LAST RESORT — prefer native geometry auto-detection); " +
    "Arcs: SELECT source_lat, source_lng, dest_lat, dest_lng, <metric> AS value ... ; " +
    "MULTI-LAYER: set `layers` array (max 5). Each layer has id, queryId, layerType, column mappings, colorScheme, opacity, visible. " +
    "To add a layer: update_component_props with layers array including existing + new layer. " +
    "To remove a layer: update with layers array excluding that layer. " +
    "To toggle visibility: set visible=false on a layer. " +
    "UPDATE vs NEW: Update existing map ONLY for view changes (zoom, colors, pitch, bearing, toggle layer). " +
    "NEVER change queryId via update_component_props — it won't re-render the data. " +
    "CREATE NEW map when user asks for DIFFERENT data, filter, or metric (e.g. 'filter to my cell', 'show wind'). " +
    "Props: layerType, latitude/longitude/zoom (view), pitch (0-85, camera tilt), bearing (-180 to 180, rotation), colorMetric (legend), colorScheme, extruded (3D), basemap ('auto' always — never override), layers (multi-layer). " +
    "CINEMATIC VIEWS: pitch=45-60 + bearing=-15 to -30 for dramatic 3D city perspectives. Combine with extruded=true for immersive building/population views. " +
    "COLOR SCHEME HINTS: 'warm' for temperature, 'cool' for precip/humidity, 'viridis' for density/count, " +
    "'spectral' for diverging data (growth vs decline), 'plasma' for elevation, 'blue-red' for anomalies. " +
    "Use extruded=true for 3D when showing building height or population density — it reveals magnitude intuitively.",
  component: InteractableGeoMap,
  propsSchema: geoMapSchema,
};

export const h3MapComponent: TamboComponent = {
  name: "H3Map",
  description:
    "Alias for GeoMap with layerType=h3. Use GeoMap instead for new maps. " +
    "Kept for backward compatibility with existing threads.",
  component: InteractableH3Map,
  propsSchema: geoMapSchema,
};
