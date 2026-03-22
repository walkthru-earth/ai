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
    "A5: use 'pentagon' column (see DuckDB notes for A5 SQL patterns); " +
    "Points: SELECT lat, lng, <metric> AS value ... ; " +
    "Native geometry: SELECT * from Parquet with GEOMETRY — auto-renders (see DuckDB notes). " +
    "GeoJSON: SELECT ST_AsGeoJSON(geometry) AS geometry, <metric> AS value ... (LAST RESORT — prefer native geometry); " +
    "Arcs: SELECT source_lat, source_lng, dest_lat, dest_lng, <metric> AS value ... ; " +
    "MULTI-LAYER: set `layers` array (max 5). Each layer has id, queryId, layerType, column mappings, colorScheme, opacity, visible. " +
    "To add a layer: update_component_props with layers array including existing + new layer. " +
    "To remove a layer: update with layers array excluding that layer. " +
    "To toggle visibility: set visible=false on a layer. " +
    "Props: layerType, latitude/longitude/zoom (view), pitch (0-85, camera tilt), bearing (-180 to 180, rotation), colorMetric (legend), colorScheme, extruded (3D), basemap ('auto' always — never override), layers (multi-layer). " +
    "CINEMATIC VIEWS: pitch=45-60 + bearing=-15 to -30 for dramatic 3D city perspectives. Combine with extruded=true for immersive building/population views. " +
    "colorScheme: 'blue-red' | 'viridis' | 'plasma' | 'warm' | 'cool' | 'spectral' (see behavior rules for when to use each). " +
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
