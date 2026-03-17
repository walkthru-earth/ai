"use client";

import { useTambo } from "@tambo-ai/react";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveGridLayout, useContainerWidth } from "react-grid-layout";
import { cn } from "@/lib/utils";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { GripVertical, Maximize2, Minimize2, X } from "lucide-react";
import Image from "next/image";

interface DashboardCanvasProps {
  className?: string;
}

/** Detect touch-primary device (mobile/tablet). */
function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window);
  }, []);
  return isTouch;
}

/**
 * Dashboard Canvas — collects ALL AI-generated components from the thread
 * and renders them as draggable, resizable panels in a responsive grid.
 *
 * Uses useMemo (not useEffect+state) so panels always reflect the LATEST
 * renderedComponent from Tambo — critical for streaming prop updates.
 *
 * Mobile: dragging/resizing disabled, single-column, smaller row height,
 * bottom padding for chat bottom sheet.
 */
export function DashboardCanvas({ className }: DashboardCanvasProps) {
  const { messages, currentThreadId } = useTambo();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [savedLayouts, setSavedLayouts] = useState<Record<string, any[]>>({});
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const prevThreadRef = useRef<string | null | undefined>(null);
  const { width, containerRef } = useContainerWidth({ initialWidth: 800 });
  const isTouch = useIsTouchDevice();

  // Reset on thread change
  if (prevThreadRef.current !== currentThreadId) {
    prevThreadRef.current = currentThreadId;
    if (dismissedIds.size > 0) setDismissedIds(new Set());
    if (Object.keys(savedLayouts).length > 0) setSavedLayouts({});
    if (maximizedId) setMaximizedId(null);
  }

  // Derive panels from messages on every render — always reflects latest streamed props
  const panels = useMemo(() => {
    const result: { id: string; component: React.ReactNode; componentName?: string }[] = [];
    for (const msg of messages) {
      for (const content of msg.content) {
        if (content.type === "component" && content.renderedComponent) {
          const panelId = content.id || `${msg.id}-comp`;
          if (!dismissedIds.has(panelId)) {
            result.push({
              id: panelId,
              component: content.renderedComponent,
              componentName: (content as any).componentName ?? "",
            });
          }
        }
      }
    }
    return result;
  }, [messages, dismissedIds]);

  const removePanel = useCallback((id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
    setMaximizedId((prev) => (prev === id ? null : prev));
  }, []);

  const toggleMaximize = useCallback((id: string) => {
    setMaximizedId((prev) => (prev === id ? null : id));
  }, []);

  // Determine panel height based on component type
  const panelHeight = (name: string, isFirst: boolean, isMobile: boolean): number => {
    const n = name.toLowerCase();
    if (isMobile) {
      // Shorter panels on mobile
      if (n.includes("h3map") || n.includes("map")) return 4;
      if (n.includes("graph")) return 3;
      if (n.includes("datatable") || n.includes("table")) return 3;
      if (n.includes("statscard") || n.includes("stat")) return 2;
      return 3;
    }
    if (n.includes("h3map") || n.includes("map")) return 5;
    if (n.includes("graph")) return 4;
    if (n.includes("datatable") || n.includes("table")) return 3;
    if (n.includes("querydisplay") || n.includes("query")) return 3;
    if (n.includes("insightcard") || n.includes("insight")) return 3;
    if (n.includes("datasetcard") || n.includes("dataset")) return 3;
    if (n.includes("statscard") || n.includes("stat")) return 2;
    if (n.includes("statsgrid")) return 3;
    return isFirst ? 5 : 3;
  };

  const isMobile = width > 0 && width < 600;

  // Generate layouts — responsive per breakpoint
  const layouts = useMemo(() => {
    // Large: maps full-width, others 2-column
    let yOffset = 0;
    const lg: any[] = panels.map((panel, i) => {
      const existing = savedLayouts.lg?.find((l) => l.i === panel.id);
      if (existing) return existing;

      const name = panel.componentName || "";
      const h = panelHeight(name, i === 0, false);
      const isMap = name.toLowerCase().includes("map") || name.toLowerCase().includes("h3map");

      if (i === 0 || isMap) {
        const item = { i: panel.id, x: 0, y: yOffset, w: 12, h, minW: 4, minH: 2 };
        yOffset += h;
        return item;
      }
      const col = (i - 1) % 2;
      const item = {
        i: panel.id,
        x: col * 6,
        y: yOffset,
        w: 6,
        h,
        minW: 3,
        minH: 2,
      };
      if (col === 1) yOffset += h;
      return item;
    });

    // Small (mobile): all full-width, single column, shorter heights
    let smY = 0;
    const sm: any[] = panels.map((panel, i) => {
      const name = panel.componentName || "";
      const h = panelHeight(name, i === 0, true);
      const item = { i: panel.id, x: 0, y: smY, w: 4, h, minW: 4, minH: 2 };
      smY += h;
      return item;
    });

    // Medium: maps full-width, others 2-column (narrower)
    let mdY = 0;
    const md: any[] = panels.map((panel, i) => {
      const name = panel.componentName || "";
      const h = panelHeight(name, i === 0, false);
      const isMap = name.toLowerCase().includes("map") || name.toLowerCase().includes("h3map");

      if (i === 0 || isMap) {
        const item = { i: panel.id, x: 0, y: mdY, w: 8, h, minW: 4, minH: 2 };
        mdY += h;
        return item;
      }
      const col = (i - 1) % 2;
      const item = { i: panel.id, x: col * 4, y: mdY, w: 4, h, minW: 3, minH: 2 };
      if (col === 1) mdY += h;
      return item;
    });

    return { lg, md, sm };
  }, [panels, savedLayouts, panelHeight]);

  const handleLayoutChange = useCallback((...args: any[]) => {
    const all = args[1] ?? {};
    setSavedLayouts(all);
  }, []);

  // Empty state
  if (panels.length === 0) {
    return (
      <div
        ref={containerRef}
        data-canvas-space="true"
        className={cn("h-full flex-1 flex flex-col items-center justify-center", className)}
      >
        <div className="text-center space-y-6 px-8 flex flex-col items-center">
          <Image src="/walkthru-icon.svg" alt="walkthru.earth" width={48} height={48} className="opacity-20" />
          <h1 className="text-4xl sm:text-5xl tracking-tight text-muted-foreground/30 leading-[1.05]">
            Walkthru
            <br />
            <span className="italic">world&apos;s data</span>
          </h1>
        </div>
      </div>
    );
  }

  // Maximized single panel
  if (maximizedId) {
    const panel = panels.find((p) => p.id === maximizedId);
    if (panel) {
      return (
        <div
          ref={containerRef}
          data-canvas-space="true"
          className={cn("h-full flex-1 flex flex-col overflow-hidden", className)}
        >
          <div className="flex items-center gap-2 px-3 py-1 border-b border-border/30 bg-muted/10 flex-shrink-0">
            <span className="text-xs text-muted-foreground/60">
              {panels.length} panel{panels.length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => setMaximizedId(null)}
              className="ml-auto p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground/40 hover:text-muted-foreground"
            >
              <Minimize2 className="w-3 h-3" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">{panel.component}</div>
        </div>
      );
    }
  }

  return (
    <div
      ref={containerRef}
      data-canvas-space="true"
      className={cn("h-full flex-1 overflow-auto", isMobile && "pb-[240px]", className)}
    >
      {width > 0 && (
        <ResponsiveGridLayout
          {...({
            width,
            layouts,
            breakpoints: { lg: 900, md: 600, sm: 0 },
            cols: { lg: 12, md: 8, sm: 4 },
            rowHeight: isMobile ? 70 : 80,
            margin: (isMobile ? [8, 8] : [12, 12]) as [number, number],
            containerPadding: (isMobile ? [8, 8] : [16, 16]) as [number, number],
            onLayoutChange: handleLayoutChange,
            draggableHandle: ".panel-drag-handle",
            draggableCancel: ".panel-content",
            isResizable: !isTouch,
            isDraggable: !isTouch,
            useCSSTransforms: true,
          } as any)}
        >
          {panels.map((panel) => (
            <div
              key={panel.id}
              className="rounded-xl border border-border bg-card overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Panel header — compact bar */}
              <div className="flex items-center px-1.5 py-0.5 border-b border-border/30 bg-muted/10 flex-shrink-0">
                {!isTouch && (
                  <div className="panel-drag-handle cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted/50 transition-colors">
                    <GripVertical className="w-3 h-3 text-muted-foreground/30" />
                  </div>
                )}
                <div className="flex-1" />
                <button
                  onClick={() => toggleMaximize(panel.id)}
                  className="p-1 sm:p-0.5 rounded hover:bg-muted/50 transition-colors text-muted-foreground/30 hover:text-muted-foreground"
                >
                  <Maximize2 className="w-2.5 h-2.5" />
                </button>
                <button
                  onClick={() => removePanel(panel.id)}
                  className="p-1 sm:p-0.5 rounded hover:bg-destructive/20 transition-colors text-muted-foreground/30 hover:text-destructive"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
              {/* Panel content — panel-content class prevents grid drag, lets map pan freely */}
              <div className="panel-content flex-1 min-h-0 overflow-auto">{panel.component}</div>
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
