/**
 * ObjexViewer component registration - 3D raster/point-cloud viewer.
 */

import type { TamboComponent } from "@tambo-ai/react";
import { InteractableObjexViewer, objexViewerSchema } from "@/components/tambo/objex-viewer";

export const objexViewerComponent: TamboComponent = {
  name: "ObjexViewer",
  description:
    "3D viewer via iframe (walkthru.earth/objex). INTERACTABLE: AI can update url and title. " +
    "Supported formats: .tif/.tiff (GeoTIFF/COG), .laz (point cloud), .pmtiles (vector/raster tiles), .fgb (FlatGeobuf). " +
    "Pass the raw data URL. The component builds the Objex iframe URL automatically. " +
    "Example URL: https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop/walkthru-earth/dem-terrain/GEDTM30/gedtm30.tif " +
    "When user provides a .tif, .laz, .pmtiles, or .fgb URL, use ObjexViewer. " +
    "Do NOT use for .parquet files. Use GeoMap + runSQL for those.",
  component: InteractableObjexViewer,
  propsSchema: objexViewerSchema,
};
