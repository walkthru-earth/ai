/**
 * Backward-compatible H3Map alias - delegates to GeoMap with layerType="h3".
 * Existing imports and thread replays continue working.
 */

import * as React from "react";
import { GeoMap, type GeoMapProps, geoMapSchema, InteractableGeoMap } from "./geo-map";

export const h3MapSchema = geoMapSchema;

export const H3Map = React.forwardRef<HTMLDivElement, GeoMapProps>((props, ref) => (
  <GeoMap {...props} layerType="h3" ref={ref} />
));
H3Map.displayName = "H3Map";

export const InteractableH3Map = InteractableGeoMap;
