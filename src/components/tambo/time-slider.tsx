import { withTamboInteractable } from "@tambo-ai/react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { clearTimeFilter, setTimeFilter, useQueryResult } from "@/services/query-store";
import { useInDashboardPanel } from "./panel-context";

/* ── Schema ────────────────────────────────────────────────────────── */

export const timeSliderSchema = z.object({
  queryId: z
    .string()
    .optional()
    .describe(
      "Query result containing timestamped rows (all cells x all timestamps). " +
        "The slider extracts unique sorted timestamps from this data.",
    ),
  timestampColumn: z
    .string()
    .optional()
    .describe(
      "Column name holding timestamp values. Default: 'time_label'. Must match across GeoMap and Graph queries.",
    ),
  title: z.string().optional().describe("Slider title (e.g. '5-Day Forecast')"),
  autoplay: z.boolean().optional().describe("Start playing automatically. Default: false"),
  intervalMs: z.number().optional().describe("Milliseconds between autoplay steps. Default: 1500"),
  timezone: z
    .string()
    .optional()
    .describe("IANA timezone for display (e.g. 'America/New_York'). Auto-detected from browser if omitted."),
});

export type TimeSliderProps = z.infer<typeof timeSliderSchema>;

/* ── Timezone helpers ──────────────────────────────────────────────── */

function getUserTimezone(explicit?: string): string {
  if (explicit) return explicit;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/**
 * Convert a UTC timestamp string to a local display label.
 * Handles ISO formats ("2026-03-25T06:00:00"), DuckDB short formats ("Mar 25 06:00"),
 * and passes through anything unparseable.
 */
function formatLocal(utcStr: string, tz: string): string {
  try {
    let date = new Date(utcStr);
    if (Number.isNaN(date.getTime())) {
      const year = new Date().getFullYear();
      date = new Date(`${utcStr} ${year} UTC`);
    }
    if (Number.isNaN(date.getTime())) return utcStr;
    return date.toLocaleString("en-US", {
      timeZone: tz,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return utcStr;
  }
}

/** Stop pointer events from bubbling to dashboard drag handlers (same pattern as GeoMap). */
function stopDrag(e: React.SyntheticEvent) {
  e.stopPropagation();
}

/* ── Component ─────────────────────────────────────────────────────── */

export const TimeSlider = React.forwardRef<HTMLDivElement, TimeSliderProps>(
  ({ queryId, timestampColumn = "time_label", title, autoplay = false, intervalMs = 1500, timezone }, ref) => {
    const queryResult = useQueryResult(queryId);
    const inPanel = useInDashboardPanel();
    const tz = useMemo(() => getUserTimezone(timezone), [timezone]);

    // Extract unique sorted timestamps from query result
    const timestamps = useMemo(() => {
      if (!queryResult?.rows?.length || !timestampColumn) return [];
      const seen = new Set<string>();
      const unique: string[] = [];
      for (const row of queryResult.rows) {
        const val = String(row[timestampColumn] ?? "");
        if (val && !seen.has(val)) {
          seen.add(val);
          unique.push(val);
        }
      }
      return unique;
    }, [queryResult, timestampColumn]);

    const [index, setIndex] = useState(0);
    const [playing, setPlaying] = useState(autoplay);

    // Reset index when timestamps change (new query)
    useEffect(() => {
      setIndex(0);
      setPlaying(autoplay);
    }, [timestamps, autoplay]);

    // Autoplay interval
    useEffect(() => {
      if (!playing || timestamps.length <= 1) return;
      const interval = setInterval(() => {
        setIndex((prev) => (prev >= timestamps.length - 1 ? 0 : prev + 1));
      }, intervalMs);
      return () => clearInterval(interval);
    }, [playing, timestamps.length, intervalMs]);

    // Emit time filter on index change (useEffect - NEVER during render).
    // Avoid emitting identical consecutive filters: every call creates a new object
    // reference that wakes every `useTimeFilter()` subscriber (GeoMap, Graph), so
    // repeated equal emits manifest as cascading re-renders in the dashboard.
    const lastEmittedRef = React.useRef<{ ts: string[]; idx: number; col: string } | null>(null);
    useEffect(() => {
      if (timestamps.length === 0) return;
      const last = lastEmittedRef.current;
      if (
        last &&
        last.idx === index &&
        last.col === timestampColumn &&
        last.ts === timestamps // useMemo reference equality on timestamps
      ) {
        return;
      }
      lastEmittedRef.current = { ts: timestamps, idx: index, col: timestampColumn };
      setTimeFilter({
        timestamps,
        currentIndex: index,
        timestampColumn,
        sourceComponent: "TimeSlider",
      });
    }, [index, timestamps, timestampColumn]);

    // Clear time filter on unmount
    useEffect(() => {
      return () => clearTimeFilter();
    }, []);

    const handlePrev = useCallback(() => {
      setIndex((prev) => (prev <= 0 ? timestamps.length - 1 : prev - 1));
    }, [timestamps.length]);

    const handleNext = useCallback(() => {
      setIndex((prev) => (prev >= timestamps.length - 1 ? 0 : prev + 1));
    }, [timestamps.length]);

    const togglePlay = useCallback(() => {
      setPlaying((prev) => !prev);
    }, []);

    const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      setIndex(Number(e.target.value));
    }, []);

    // Loading / empty states
    if (!queryId) {
      return (
        <div ref={ref} className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          Waiting for data...
        </div>
      );
    }

    if (timestamps.length === 0) {
      return (
        <div ref={ref} className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          {queryResult ? "No timestamps found" : "Loading..."}
        </div>
      );
    }

    const currentLabel = timestamps[index] ?? "";
    const localLabel = formatLocal(currentLabel, tz);
    const disabled = timestamps.length <= 1;
    const progress = timestamps.length > 1 ? (index / (timestamps.length - 1)) * 100 : 0;
    const showTitle = title && !inPanel;

    return (
      <div
        ref={ref}
        className="rounded-xl border bg-card w-full overflow-hidden"
        // Prevent pointer events from bubbling to dashboard panel drag (same as GeoMap)
        onPointerDown={stopDrag}
        onMouseDown={stopDrag}
        onTouchStart={stopDrag}
        onTouchMove={stopDrag}
      >
        <div className="px-4 py-3 flex flex-col gap-2.5">
          {/* Top row: title/step + time label */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {showTitle && <span className="text-sm font-semibold text-foreground truncate">{title}</span>}
              <span className="text-xs text-muted-foreground whitespace-nowrap font-mono tabular-nums">
                {index + 1} / {timestamps.length}
              </span>
            </div>
            <span className="text-sm font-semibold font-mono text-foreground whitespace-nowrap tabular-nums">
              {localLabel}
            </span>
          </div>

          {/* Bottom row: transport controls + slider track */}
          <div className="flex items-center gap-3">
            {/* Transport buttons */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={handlePrev}
                disabled={disabled}
                className="w-7 h-7 rounded-md flex items-center justify-center bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                aria-label="Previous step"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={togglePlay}
                disabled={disabled}
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 hover:bg-primary/20 text-foreground disabled:opacity-30 transition-colors"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={disabled}
                className="w-7 h-7 rounded-md flex items-center justify-center bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                aria-label="Next step"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Custom slider track */}
            <div className="flex-1 relative flex items-center">
              {/* Track background */}
              <div className="w-full h-1.5 rounded-full bg-muted/60 overflow-hidden">
                {/* Progress fill */}
                <div
                  className="h-full rounded-full bg-foreground/30 transition-[width] duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {/* Native range input (transparent, positioned over track for interaction) */}
              <input
                type="range"
                min={0}
                max={timestamps.length - 1}
                value={index}
                onChange={handleSliderChange}
                disabled={disabled}
                className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-default"
                style={{ height: "28px", marginTop: "-7px" }}
                aria-label="Time step"
              />
              {/* Thumb indicator */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-foreground border-2 border-card shadow-sm pointer-events-none transition-[left] duration-100"
                style={{ left: `calc(${progress}% - 7px)` }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  },
);
TimeSlider.displayName = "TimeSlider";

/* ── Interactable wrapper ──────────────────────────────────────────── */

export const InteractableTimeSlider = withTamboInteractable(TimeSlider, {
  componentName: "TimeSlider",
  description:
    "Time-aware playback slider that cross-filters GeoMap and Graph. " +
    "Shows spatial snapshots on the map at each timestep and a reference line on the chart. " +
    "Pass queryId from the AREA query (all cells x all timestamps). " +
    "timestampColumn must match the time column shared across queries (default: 'time_label').",
  propsSchema: timeSliderSchema,
});
