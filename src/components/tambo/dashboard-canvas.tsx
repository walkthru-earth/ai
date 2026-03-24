import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTambo } from "@tambo-ai/react";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveGridLayout, useContainerWidth } from "react-grid-layout";
import { readStorage, writeStorage } from "@/lib/storage";
import { basePath, cn } from "@/lib/utils";
import {
  consumeDismissRequest,
  consumeRestoreRequest,
  syncDismissedPanelIds,
  useDismissVersion,
  useRestoreVersion,
} from "@/services/query-store";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { GripVertical, Maximize2, Minimize2, X } from "lucide-react";
import { PanelContext } from "./panel-context";

interface DashboardCanvasProps {
  className?: string;
  /** Overlay content (e.g. floating toolbar) — hidden when a panel is maximized */
  children?: React.ReactNode;
}

/** Panel height in grid rows (×80px). Maps get 2× default height. */
function panelHeight(name: string): number {
  const n = name.toLowerCase();
  if (n.includes("h3map") || n.includes("map")) return 10;
  if (n.includes("graph")) return 5;
  if (n.includes("datatable") || n.includes("table")) return 5;
  if (n.includes("querydisplay") || n.includes("query")) return 3;
  if (n.includes("insightcard") || n.includes("insight")) return 3;
  if (n.includes("datasetcard") || n.includes("dataset")) return 3;
  if (n.includes("timeslider")) return 2;
  if (n.includes("statsgrid") || n.includes("statscard") || n.includes("stat")) return 2;
  return 4;
}

/** Whether a component is a map (floats to top of panel order). */
function isMapComponent(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("map") || n.includes("h3map");
}

/** Whether a component is compact (should never be full-width first panel). */
function isCompactComponent(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("statscard") ||
    n.includes("statsgrid") ||
    n.includes("insightcard") ||
    n.includes("datasetcard") ||
    n.includes("querydisplay") ||
    n.includes("datacard") ||
    n.includes("timeslider")
  );
}

function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window);
  }, []);
  return isTouch;
}

function formatComponentName(name: string): string {
  if (!name) return "Panel";
  return name
    .replace(/^H3/, "")
    .replace(/Card$/, "")
    .replace(/Display$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
}

interface PanelInfo {
  id: string;
  component: React.ReactNode;
  componentName: string;
  title: string;
}

/* ── Sortable panel wrapper for touch (dnd-kit) ──────────────────── */

function SortablePanel({
  panel,
  minH,
  removePanel,
  toggleMaximize,
}: {
  panel: PanelInfo;
  minH: string;
  removePanel: (id: string) => void;
  toggleMaximize: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: panel.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border border-border bg-card overflow-hidden flex flex-col shadow-sm transition-shadow",
        minH,
        isDragging && "ring-2 ring-earth-blue/40 opacity-80 shadow-lg z-50",
      )}
    >
      {/* Header — drag handle is ONLY the grip icon area */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30 bg-muted/10 flex-shrink-0 select-none">
        <div
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className={cn(
            "p-1 -m-1 rounded touch-none",
            isDragging ? "text-earth-blue" : "text-muted-foreground/30 active:text-earth-blue",
          )}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs font-semibold text-foreground truncate flex-1">{panel.title}</span>
        <button
          onClick={() => toggleMaximize(panel.id)}
          className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground/30 hover:text-muted-foreground flex-shrink-0"
        >
          <Maximize2 className="w-2.5 h-2.5" />
        </button>
        <button
          onClick={() => removePanel(panel.id)}
          className="p-1 rounded hover:bg-destructive/20 transition-colors text-muted-foreground/30 hover:text-destructive flex-shrink-0"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>
      {/* Hide heavy content (WebGL maps) during drag to avoid context errors */}
      {isDragging ? (
        <div className="flex-1 min-h-0 flex items-center justify-center bg-muted/20 text-muted-foreground/40 text-xs">
          Moving...
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <PanelContext.Provider value={true}>{panel.component}</PanelContext.Provider>
        </div>
      )}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */

export function DashboardCanvas({ className, children }: DashboardCanvasProps) {
  const { messages, currentThreadId } = useTambo();
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const prevThreadRef = useRef<string | null | undefined>(null);
  const { width, containerRef } = useContainerWidth({ initialWidth: 800 });
  const isTouch = useIsTouchDevice();

  // Storage keys — all scoped per thread
  const orderKey = currentThreadId ? `panel-order-${currentThreadId}` : null;
  const layoutKey = currentThreadId ? `panel-layouts-${currentThreadId}` : null;
  const dismissedKey = currentThreadId ? `panel-dismissed-${currentThreadId}` : null;

  // Dismissed panels — persisted to localStorage per thread
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    if (!dismissedKey) return new Set();
    const arr = readStorage<string[]>(dismissedKey, []);
    return arr.length > 0 ? new Set(arr) : new Set();
  });

  // Panel layouts — persisted to localStorage per thread (debounced)
  const [savedLayouts, setSavedLayouts] = useState<Record<string, any[]>>(() => {
    if (!layoutKey) return {};
    return readStorage<Record<string, any[]>>(layoutKey, {});
  });
  const layoutSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    return () => clearTimeout(layoutSaveTimer.current);
  }, []);
  const [panelOrder, setPanelOrder] = useState<string[]>(() => {
    if (!orderKey) return [];
    return readStorage<string[]>(orderKey, []);
  });

  // Persist order changes to localStorage
  const prevOrderRef = useRef(panelOrder);
  useEffect(() => {
    if (!orderKey || panelOrder === prevOrderRef.current) return;
    prevOrderRef.current = panelOrder;
    writeStorage(orderKey, panelOrder);
  }, [panelOrder, orderKey]);

  // Reset on thread change — must be in useEffect to avoid setState during render
  useEffect(() => {
    if (prevThreadRef.current === currentThreadId) return;
    prevThreadRef.current = currentThreadId;
    setMaximizedId(null);

    // Load persisted panel order
    if (orderKey) {
      const parsed = readStorage<string[]>(orderKey, []);
      setPanelOrder(parsed.length > 0 ? parsed : []);
    } else {
      setPanelOrder([]);
    }

    // Load persisted layouts
    if (layoutKey) {
      setSavedLayouts(readStorage<Record<string, any[]>>(layoutKey, {}));
    } else {
      setSavedLayouts({});
    }

    // Load persisted dismissed panels
    if (dismissedKey) {
      const arr = readStorage<string[]>(dismissedKey, []);
      setDismissedIds(arr.length > 0 ? new Set(arr) : new Set());
    } else {
      setDismissedIds(new Set());
    }
  }, [currentThreadId, orderKey, layoutKey, dismissedKey]);

  // Derive panels from messages
  const panels: PanelInfo[] = useMemo(() => {
    const result: PanelInfo[] = [];
    const usedIds = new Set<string>();
    for (const msg of messages) {
      let compIdx = 0;
      for (const content of msg.content) {
        if (content.type === "component" && content.renderedComponent) {
          // Ensure unique panel ID — content.id can collide across components
          let panelId = content.id || `${msg.id}-comp-${compIdx}`;
          if (usedIds.has(panelId)) panelId = `${panelId}-${compIdx}`;
          usedIds.add(panelId);
          compIdx++;
          if (!dismissedIds.has(panelId)) {
            const name = (content as any).componentName ?? (content as any).name ?? "";
            const propsTitle = (content as any).props?.title;
            const title = typeof propsTitle === "string" && propsTitle.trim() ? propsTitle : formatComponentName(name);
            result.push({ id: panelId, component: content.renderedComponent, componentName: name, title });
          }
        }
      }
    }
    return result;
  }, [messages, dismissedIds]);

  // Keep panelOrder in sync — maps always float to top among new panels
  const panelIds = useMemo(() => panels.map((p) => p.id), [panels]);
  const panelNameById = useMemo(() => new globalThis.Map(panels.map((p) => [p.id, p.componentName || ""])), [panels]);
  useEffect(() => {
    setPanelOrder((prev) => {
      const existing = prev.filter((id) => panelIds.includes(id));
      const newIds = panelIds.filter((id) => !prev.includes(id));
      // Sort new panels: maps first, then others in original order
      const newMaps = newIds.filter((id) => isMapComponent(panelNameById.get(id) || ""));
      const newOthers = newIds.filter((id) => !isMapComponent(panelNameById.get(id) || ""));
      // Insert map panels before other existing panels (but after existing maps)
      const existingMaps = existing.filter((id) => isMapComponent(panelNameById.get(id) || ""));
      const existingOthers = existing.filter((id) => !isMapComponent(panelNameById.get(id) || ""));
      const next = [...existingMaps, ...newMaps, ...existingOthers, ...newOthers];
      if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev;
      return next;
    });
  }, [panelIds, panelNameById]);

  const orderedPanels = useMemo(() => {
    const map = new Map(panels.map((p) => [p.id, p]));
    return panelOrder.map((id) => map.get(id)).filter(Boolean) as PanelInfo[];
  }, [panels, panelOrder]);

  // Listen for AI-triggered panel dismissals (dismissPanels tool)
  const dismissVersion = useDismissVersion();
  useEffect(() => {
    if (dismissVersion === 0) return;
    const req = consumeDismissRequest();
    if (!req) return;
    setTimeout(() => {
      setDismissedIds((prev) => {
        let idsToAdd: string[];
        if (req.target === "all") {
          idsToAdd = panelIds;
        } else {
          // Match by componentName (case-insensitive) or by exact panel ID
          const t = req.target.toLowerCase();
          idsToAdd = panels
            .filter((p) => p.componentName.toLowerCase().includes(t) || p.id === req.target)
            .map((p) => p.id);
        }
        if (idsToAdd.length === 0) return prev;
        const next = new Set(prev);
        for (const id of idsToAdd) next.add(id);
        if (dismissedKey) {
          writeStorage(dismissedKey, [...next]);
        }
        return next;
      });
      setMaximizedId(null);
    }, 0);
  }, [dismissVersion, panelIds, panels, dismissedKey]);

  // Defer dismissal to next tick — withTamboInteractable unregisters during unmount
  // which triggers setState in TamboRegistryProvider; deferring avoids "update during render"
  const removePanel = useCallback(
    (id: string) => {
      setTimeout(() => {
        setDismissedIds((prev) => {
          const next = new Set(prev).add(id);
          if (dismissedKey) {
            writeStorage(dismissedKey, [...next]);
          }
          return next;
        });
        setMaximizedId((prev) => (prev === id ? null : prev));
      }, 0);
    },
    [dismissedKey],
  );

  // Sync dismissedIds to shared store so message.tsx can read dismissed state
  useEffect(() => {
    syncDismissedPanelIds(dismissedIds);
  }, [dismissedIds]);

  // Listen for restore requests from chat message "Restore to dashboard"
  const restoreVersion = useRestoreVersion();
  useEffect(() => {
    if (restoreVersion === 0) return;
    const panelId = consumeRestoreRequest();
    if (!panelId) return;
    setTimeout(() => {
      setDismissedIds((prev) => {
        if (!prev.has(panelId)) return prev;
        const next = new Set(prev);
        next.delete(panelId);
        if (dismissedKey) {
          writeStorage(dismissedKey, [...next]);
        }
        return next;
      });
    }, 0);
  }, [restoreVersion, dismissedKey]);

  const toggleMaximize = useCallback((id: string) => {
    // Defer to avoid "Cannot update component while rendering" when
    // withTamboInteractable re-registers during the same render cycle
    queueMicrotask(() => {
      setMaximizedId((prev) => (prev === id ? null : id));
    });
  }, []);

  // panelHeight is module-scoped (pure function, no closures)

  // Auto-scroll to latest panel
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const prevPanelCount = useRef(panels.length);
  useEffect(() => {
    if (panels.length > prevPanelCount.current && scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    }
    prevPanelCount.current = panels.length;
  }, [panels.length]);

  // dnd-kit sensors: touch requires 1.2s hold + 5px tolerance, pointer (mouse) instant
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 1200, tolerance: 8 },
  });
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  const sensors = useSensors(touchSensor, pointerSensor);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPanelOrder((prev) => {
        const oldIndex = prev.indexOf(String(active.id));
        const newIndex = prev.indexOf(String(over.id));
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }, []);

  // Desktop grid layouts
  // All panels full-width, stacked vertically. User can resize via drag handles.
  const layouts = useMemo(() => {
    let lgY = 0;
    const lg: any[] = orderedPanels.map((panel) => {
      const defaultH = panelHeight(panel.componentName || "");
      const existing = savedLayouts.lg?.find((l) => l.i === panel.id);
      if (existing) {
        return existing;
      }
      const item = { i: panel.id, x: 0, y: lgY, w: 12, h: defaultH, minW: 4, minH: 2 };
      lgY += defaultH;
      return item;
    });

    let mdY = 0;
    const md: any[] = orderedPanels.map((panel) => {
      const h = panelHeight(panel.componentName || "");
      const item = { i: panel.id, x: 0, y: mdY, w: 8, h, minW: 4, minH: 2 };
      mdY += h;
      return item;
    });

    let smY = 0;
    const sm: any[] = orderedPanels.map((panel) => {
      const h = panelHeight(panel.componentName || "");
      const item = { i: panel.id, x: 0, y: smY, w: 4, h, minW: 4, minH: 2 };
      smY += h;
      return item;
    });

    return { lg, md, sm };
  }, [orderedPanels, savedLayouts]);

  const handleLayoutChange = useCallback(
    (...args: any[]) => {
      const layouts = args[1] ?? {};
      setSavedLayouts(layouts);
      if (layoutKey) {
        clearTimeout(layoutSaveTimer.current);
        layoutSaveTimer.current = setTimeout(() => {
          writeStorage(layoutKey, layouts);
        }, 500);
      }
    },
    [layoutKey],
  );

  // ── Empty state ──
  if (panels.length === 0) {
    return (
      <div
        ref={containerRef}
        data-canvas-space="true"
        className={cn("h-full flex-1 flex flex-col items-center justify-center", className)}
      >
        <div className="text-center space-y-6 px-8 flex flex-col items-center">
          <img
            src={`${basePath}/walkthru-icon.svg`}
            alt="walkthru.earth"
            width={48}
            height={48}
            className="opacity-20"
          />
          <h1 className="text-4xl sm:text-5xl tracking-tight text-muted-foreground/30 leading-[1.05]">
            Walkthru
            <br />
            <span className="italic">world&apos;s data</span>
          </h1>
        </div>
      </div>
    );
  }

  // ── Maximized panel ──
  if (maximizedId) {
    const panel = panels.find((p) => p.id === maximizedId);
    if (panel) {
      return (
        <div
          ref={containerRef}
          data-canvas-space="true"
          className={cn("fixed inset-0 flex flex-col overflow-hidden z-40 bg-background", className)}
        >
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted flex-shrink-0">
            <span className="text-xs font-semibold text-foreground truncate flex-1">{panel.title}</span>
            <span className="text-[10px] text-muted-foreground/40">
              {panels.length} panel{panels.length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => setMaximizedId(null)}
              className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground/40 hover:text-muted-foreground"
            >
              <Minimize2 className="w-3 h-3" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <PanelContext.Provider value={true}>{panel.component}</PanelContext.Provider>
          </div>
        </div>
      );
    }
  }

  // ── Touch: stacked layout with dnd-kit sortable ──
  if (isTouch) {
    return (
      <div
        ref={(el) => {
          scrollRef.current = el;
          (containerRef as any).current = el;
        }}
        data-canvas-space="true"
        className={cn("h-full flex-1 overflow-auto pb-[240px]", className)}
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={panelOrder} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2 p-2">
              {orderedPanels.map((panel) => {
                const name = (panel.componentName || "").toLowerCase();
                const isMap = name.includes("map") || name.includes("h3map");
                const compact = isCompactComponent(panel.componentName || "");
                const minH = compact ? "h-auto" : "h-[280px]";
                return (
                  <SortablePanel
                    key={panel.id}
                    panel={panel}
                    minH={minH}
                    removePanel={removePanel}
                    toggleMaximize={toggleMaximize}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
        {!maximizedId && children}
      </div>
    );
  }

  // ── Desktop: responsive grid with drag/resize ──
  return (
    <div
      ref={(el) => {
        scrollRef.current = el;
        (containerRef as any).current = el;
      }}
      data-canvas-space="true"
      className={cn("h-full flex-1 overflow-auto", className)}
    >
      {width > 0 && (
        <ResponsiveGridLayout
          {...({
            width,
            layouts,
            breakpoints: { lg: 900, md: 600, sm: 0 },
            cols: { lg: 12, md: 8, sm: 4 },
            rowHeight: 80,
            margin: [12, 12] as [number, number],
            containerPadding: [16, 16] as [number, number],
            onLayoutChange: handleLayoutChange,
            draggableHandle: ".panel-drag-handle",
            draggableCancel: ".panel-content",
            isResizable: true,
            isDraggable: true,
            useCSSTransforms: true,
          } as any)}
        >
          {orderedPanels.map((panel) => (
            <div
              key={panel.id}
              className="rounded-xl border border-border bg-card overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Desktop header — entire bar is drag handle */}
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/30 bg-muted/10 flex-shrink-0 select-none panel-drag-handle cursor-grab active:cursor-grabbing">
                <GripVertical className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
                <span className="text-xs font-semibold text-foreground truncate flex-1">{panel.title}</span>
                <button
                  onClick={() => toggleMaximize(panel.id)}
                  className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground/30 hover:text-muted-foreground flex-shrink-0"
                >
                  <Maximize2 className="w-2.5 h-2.5" />
                </button>
                <button
                  onClick={() => removePanel(panel.id)}
                  className="p-1 rounded hover:bg-destructive/20 transition-colors text-muted-foreground/30 hover:text-destructive flex-shrink-0"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
              <div className="panel-content flex-1 min-h-0 overflow-auto">
                <PanelContext.Provider value={true}>{panel.component}</PanelContext.Provider>
              </div>
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
      {!maximizedId && children}
    </div>
  );
}
