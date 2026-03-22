import { withTamboInteractable } from "@tambo-ai/react";
import { Check, ChevronLeft, ChevronRight, Clipboard, Locate } from "lucide-react";
import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { CardSkeleton } from "@/components/ui/card-skeleton";
import { cn } from "@/lib/utils";
import { applyCrossFilter, requestFlyTo, setCrossFilter, useCrossFilter, useQueryResult } from "@/services/query-store";
import { useInDashboardPanel } from "./panel-context";

/* ── Schema ────────────────────────────────────────────────────────── */

export const dataTableSchema = z.object({
  title: z.string().describe("Table title describing the data shown"),

  // PREFERRED: queryId mode (zero tokens — reads from query store)
  queryId: z
    .string()
    .optional()
    .describe(
      "ID from runSQL result. Table auto-derives columns and rows from the query store (zero token cost). " +
        "Optionally pass visibleColumns to limit displayed columns.",
    ),
  visibleColumns: z
    .array(z.string())
    .optional()
    .describe("Optional subset of columns to display from the query result. If omitted, shows all columns."),

  // LEGACY: inline data (backward compat)
  columns: z
    .array(
      z.object({
        id: z.string().describe("Column identifier matching row keys"),
        label: z.string().describe("Display label for column header"),
        align: z.enum(["left", "center", "right"]).optional().describe("Text alignment"),
      }),
    )
    .optional()
    .describe("Column definitions (auto-derived when using queryId)"),
  rows: z
    .array(
      z.object({
        id: z.string().describe("Unique row identifier"),
        cells: z.array(z.string()).describe("Cell values in the same order as columns"),
      }),
    )
    .optional()
    .describe("Data rows (auto-derived when using queryId)"),

  caption: z.string().optional().describe("Optional caption below the table"),
  highlight: z.enum(["none", "alternating", "hover"]).optional().describe("Row highlighting style"),
});

type DataTableProps = z.infer<typeof dataTableSchema>;

/* ── Format helper ─────────────────────────────────────────────────── */

function formatCell(val: unknown, colName?: string): string {
  if (val == null) return "";
  if (typeof val === "number") {
    // Detect epoch-ms timestamps: column name hints + value in plausible range (2000-01-01 to 2200-01-01)
    if (
      Number.isInteger(val) &&
      val > 946684800000 &&
      val < 7258118400000 &&
      colName &&
      /timestamp|date|time|created|updated/i.test(colName)
    ) {
      return new Date(val).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (Number.isInteger(val) && Math.abs(val) >= 1000) return val.toLocaleString();
    if (!Number.isInteger(val)) return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(val);
}

const PAGE_SIZE = 20;

/* ── Component ─────────────────────────────────────────────────────── */

export const DataTable = React.forwardRef<HTMLDivElement, DataTableProps>(
  ({ title, queryId, visibleColumns, columns, rows, caption, highlight = "alternating" }, ref) => {
    const crossFilter = useCrossFilter();
    const queryResult = useQueryResult(queryId);
    const inPanel = useInDashboardPanel();
    const [page, setPage] = useState(0);

    // Resolve data: queryId mode (preferred) → inline mode (legacy)
    // Applies spatial cross-filter: when map viewport changes, only show rows for visible hexes
    // formatCell is deferred to the paginated slice (pageRows) to avoid formatting all rows
    const { resolvedColumns, filteredRawRows, resolvedRows } = useMemo(() => {
      if (queryId) {
        if (!queryResult) return { resolvedColumns: null, resolvedRows: null };

        const colNames = visibleColumns ?? queryResult.columns;
        const cols = colNames.map((c) => ({ id: c, label: c, align: "left" as const }));

        // Apply spatial cross-filter
        const rRows = applyCrossFilter(queryResult.rows, queryResult.columns, crossFilter, "DataTable");

        // Store raw row references (no formatCell yet — deferred to pageRows)
        const fRows = rRows.map((_row, i) => ({ id: String(i), rawIdx: i }));
        return { resolvedColumns: cols, resolvedRows: fRows, filteredRawRows: rRows };
      }
      return { resolvedColumns: columns ?? null, resolvedRows: rows ?? null, filteredRawRows: null };
    }, [queryId, queryResult, visibleColumns, columns, rows, crossFilter]);

    // Reset page when data changes — useEffect to avoid setState during render
    const totalRows = resolvedRows?.length ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
    const safePage = Math.min(page, totalPages - 1);
    useEffect(() => {
      if (safePage !== page) setPage(safePage);
    }, [safePage, page]);

    // Format cells only for the visible page slice
    const pageRows = useMemo(() => {
      if (!resolvedRows || !resolvedColumns) return [];
      const slice = resolvedRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
      // queryId mode: rows have rawIdx, format from filteredRawRows
      if (filteredRawRows) {
        return slice.map((entry) => ({
          id: entry.id,
          cells: resolvedColumns.map((c) =>
            formatCell(filteredRawRows[(entry as { rawIdx: number }).rawIdx]?.[c.id], c.id),
          ),
        }));
      }
      // Legacy inline mode: rows already have cells
      return slice as { id: string; cells: string[] }[];
    }, [resolvedRows, resolvedColumns, filteredRawRows, safePage]);

    const [expandedRow, setExpandedRow] = useState<number | null>(null);
    const [copiedRow, setCopiedRow] = useState<number | null>(null);
    const copiedTimerRef = useRef<ReturnType<typeof setTimeout>>();

    // Cleanup copiedRow timer on unmount
    useEffect(() => {
      return () => clearTimeout(copiedTimerRef.current);
    }, []);

    // Close expanded row on page change
    // biome-ignore lint/correctness/useExhaustiveDependencies: page triggers reset intentionally
    useEffect(() => {
      setExpandedRow(null);
    }, [page]);

    const handleCopyRecord = useCallback(
      (globalIdx: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!resolvedColumns || !filteredRawRows) return;
        const rawRow = filteredRawRows[globalIdx];
        if (!rawRow) return;
        const record: Record<string, string> = {};
        for (let i = 0; i < resolvedColumns.length; i++) {
          record[resolvedColumns[i].id] = formatCell(rawRow[resolvedColumns[i].id], resolvedColumns[i].id);
        }
        navigator.clipboard.writeText(JSON.stringify(record, null, 2)).then(() => {
          setCopiedRow(globalIdx);
          clearTimeout(copiedTimerRef.current);
          copiedTimerRef.current = setTimeout(() => setCopiedRow(null), 1500);
        });
      },
      [resolvedColumns, filteredRawRows],
    );

    const handleZoomToRecord = useCallback(
      (globalIdx: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!queryResult) return;
        const rawRow = filteredRawRows ? filteredRawRows[globalIdx] : queryResult.rows[globalIdx];
        if (!rawRow) return;

        // Try to find lat/lng from the row (may be synthetic from geometry detection, or explicit)
        const lat = (rawRow.lat ?? rawRow.latitude) as number | undefined;
        const lng = (rawRow.lng ?? rawRow.longitude) as number | undefined;

        if (typeof lat === "number" && typeof lng === "number") {
          requestFlyTo({ latitude: lat, longitude: lng, zoom: 12 });
          return;
        }

        // Try H3 hex → centroid
        const hex = (rawRow.hex ?? rawRow.h3_index) as string | undefined;
        if (typeof hex === "string" && hex.length > 0) {
          import("h3-js")
            .then((h3) => {
              try {
                const [hLat, hLng] = h3.cellToLatLng(hex);
                requestFlyTo({ latitude: hLat, longitude: hLng, zoom: 12 });
              } catch {
                /* invalid hex */
              }
            })
            .catch(() => {});
        }
      },
      [queryResult, filteredRawRows],
    );

    const handleRowClick = useCallback(
      (rowIdx: number) => {
        const globalIdx = safePage * PAGE_SIZE + rowIdx;
        // Toggle expanded row
        setExpandedRow((prev) => (prev === globalIdx ? null : globalIdx));
        // Emit cross-filter
        if (!queryId || !resolvedColumns?.length) return;
        const firstCol = resolvedColumns[0].id;
        const pageRow = pageRows[rowIdx];
        const val = pageRow?.cells?.[0] ?? null;
        if (val != null) {
          setCrossFilter({
            sourceQueryId: queryId,
            sourceComponent: "DataTable",
            filterType: "value",
            column: firstCol,
            values: [val],
          });
        }
      },
      [safePage, queryId, resolvedColumns, pageRows],
    );

    // Loading state
    if (!resolvedColumns || !resolvedRows) {
      return (
        <CardSkeleton ref={ref} className="h-48">
          <div className="h-4 bg-muted rounded w-1/3 mb-4" />
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-3 bg-muted rounded" />
            ))}
          </div>
        </CardSkeleton>
      );
    }

    // Cross-filter: which rows are highlighted?
    const filterColIdx =
      crossFilter && crossFilter.sourceComponent !== "DataTable"
        ? resolvedColumns.findIndex((c) => c.id === crossFilter.column)
        : -1;

    return (
      <div ref={ref} className="rounded-xl border overflow-hidden bg-card h-full flex flex-col">
        {title && !inPanel && (
          <div className="px-4 py-2 border-b bg-muted/30 flex-shrink-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          </div>
        )}
        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b bg-muted/40">
                {resolvedColumns.map((col) => (
                  <th
                    key={col.id}
                    className={cn(
                      "px-3 py-1.5 font-semibold text-muted-foreground whitespace-nowrap text-xs bg-muted/40",
                      col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                    )}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, rowIdx) => {
                const globalIdx = safePage * PAGE_SIZE + rowIdx;
                const isFilterMatch =
                  filterColIdx >= 0 && crossFilter ? crossFilter.values.includes(row.cells?.[filterColIdx]) : false;
                const isExpanded = expandedRow === globalIdx;

                return (
                  <React.Fragment key={row.id ?? `row-${rowIdx}`}>
                    <tr
                      onClick={() => handleRowClick(rowIdx)}
                      className={cn(
                        "border-b last:border-0 transition-colors cursor-pointer hover:bg-muted/20",
                        highlight === "alternating" && rowIdx % 2 === 1 && "bg-muted/10",
                        isFilterMatch && "bg-primary/10 border-l-2 border-l-primary",
                        isExpanded && "bg-primary/5",
                      )}
                    >
                      {row.cells?.map((cell, cellIdx) => {
                        const col = resolvedColumns[cellIdx];
                        return (
                          <td
                            key={`${row.id ?? rowIdx}-${cellIdx}`}
                            className={cn(
                              "px-3 py-1.5 text-foreground whitespace-nowrap text-xs",
                              col?.align === "right"
                                ? "text-right"
                                : col?.align === "center"
                                  ? "text-center"
                                  : "text-left",
                            )}
                          >
                            {cell}
                          </td>
                        );
                      })}
                    </tr>
                    {isExpanded && (
                      <tr className="border-b bg-muted/20">
                        <td colSpan={resolvedColumns.length} className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => handleZoomToRecord(globalIdx, e)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            >
                              <Locate className="w-3 h-3" />
                              Zoom to record
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleCopyRecord(globalIdx, e)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-muted text-foreground hover:bg-muted/80 transition-colors"
                            >
                              {copiedRow === globalIdx ? (
                                <Check className="w-3 h-3" />
                              ) : (
                                <Clipboard className="w-3 h-3" />
                              )}
                              {copiedRow === globalIdx ? "Copied" : "Copy record"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer: pagination + caption */}
        <div className="px-3 py-1.5 border-t bg-muted/10 flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-muted-foreground">
            {totalRows > PAGE_SIZE
              ? `${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, totalRows)} of ${totalRows.toLocaleString()}`
              : `${totalRows.toLocaleString()} rows`}
          </span>
          {caption && <span className="text-xs text-muted-foreground/60 truncate flex-1 text-right">{caption}</span>}
          {totalPages > 1 && (
            <div className="flex items-center gap-1 ml-auto">
              <button
                type="button"
                onClick={() => {
                  setPage((p) => Math.max(0, p - 1));
                }}
                disabled={safePage === 0}
                className="p-0.5 rounded hover:bg-muted/50 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <span className="text-xs text-muted-foreground tabular-nums min-w-[3ch] text-center">
                {safePage + 1}/{totalPages}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPage((p) => Math.min(totalPages - 1, p + 1));
                }}
                disabled={safePage >= totalPages - 1}
                className="p-0.5 rounded hover:bg-muted/50 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  },
);
DataTable.displayName = "DataTable";

/** Interactable DataTable — AI can update visibleColumns, title at runtime */
export const InteractableDataTable = withTamboInteractable(DataTable, {
  componentName: "DataTable",
  description:
    "Interactive data table with pagination. AI can update visible columns and title at runtime. " +
    "Use to respond to requests like 'hide the hex column' or 'show only pop_2025 and pop_2100'.",
  propsSchema: dataTableSchema,
});
