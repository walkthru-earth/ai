import { withTamboInteractable } from "@tambo-ai/react";
import { Expand, Shrink } from "lucide-react";
import * as React from "react";
import { useCallback, useState } from "react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { useInDashboardPanel } from "./panel-context";

/* ── Schema ────────────────────────────────────────────────────────── */

export const objexViewerSchema = z.object({
  title: z.string().optional().describe("Title describing the visualization"),
  url: z
    .string()
    .describe(
      "The data URL to visualize. Supported formats: .tif/.tiff (GeoTIFF/COG), .laz (point cloud), .pmtiles (vector/raster tiles), .fgb (FlatGeobuf). " +
        "This gets embedded into the Objex viewer iframe. " +
        "Example: https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop/walkthru-earth/dem-terrain/GEDTM30/gedtm30.tif",
    ),
  caption: z.string().optional().describe("Optional caption below the viewer"),
});

type ObjexViewerProps = z.infer<typeof objexViewerSchema>;

const OBJEX_BASE = "https://walkthru.earth/objex/";

/* ── Component ─────────────────────────────────────────────────────── */

export const ObjexViewer = React.forwardRef<HTMLDivElement, ObjexViewerProps>(({ title, url, caption }, ref) => {
  const inPanel = useInDashboardPanel();
  const [expanded, setExpanded] = useState(false);

  const iframeSrc = `${OBJEX_BASE}?url=${encodeURIComponent(url)}`;

  const toggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border overflow-hidden bg-card flex flex-col",
        expanded ? "fixed inset-4 z-50" : inPanel ? "h-full" : "h-[480px]",
      )}
    >
      {/* Header - hidden in dashboard panels (panel already has its own title bar) */}
      {title && !inPanel && (
        <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between flex-shrink-0">
          <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
          <button
            type="button"
            onClick={toggleExpand}
            className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground"
          >
            {expanded ? <Shrink className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
          </button>
        </div>
      )}

      {/* Iframe */}
      <iframe
        src={iframeSrc}
        className="flex-1 w-full min-h-0 border-0"
        allow="fullscreen; webgl; webgl2"
        title={title ?? "Objex Viewer"}
      />

      {/* Caption */}
      {caption && (
        <div className="px-3 py-1.5 border-t bg-muted/10 flex-shrink-0">
          <span className="text-xs text-muted-foreground">{caption}</span>
        </div>
      )}

      {/* Backdrop for expanded mode */}
      {expanded && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss pattern
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: backdrop dismiss pattern
        // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss pattern
        <div className="fixed inset-0 bg-background/80 -z-10" onClick={toggleExpand} />
      )}
    </div>
  );
});
ObjexViewer.displayName = "ObjexViewer";

/** Interactable ObjexViewer - AI can update url, title at runtime */
export const InteractableObjexViewer = withTamboInteractable(ObjexViewer, {
  componentName: "ObjexViewer",
  description:
    "3D raster/terrain viewer via iframe. AI can update url and title at runtime. " +
    "Use when the user wants to visualize GeoTIFF, COG, or raster terrain files in 3D.",
  propsSchema: objexViewerSchema,
});
