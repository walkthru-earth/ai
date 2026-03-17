"use client";

import { useTamboComponentState, withTamboInteractable } from "@tambo-ai/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { useMemo, useState } from "react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { setCrossFilter, useCrossFilter, useQueryResult } from "@/services/query-store";
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

function formatCell(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "number") {
    if (Number.isInteger(val) && Math.abs(val) >= 1000) return val.toLocaleString();
    if (!Number.isInteger(val)) return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(val);
}

const PAGE_SIZE = 20;

/* ── Component ─────────────────────────────────────────────────────── */

export const DataTable = React.forwardRef<HTMLDivElement, DataTableProps>(
  (
    {
      title,
      queryId,
      visibleColumns,
      columns,
      rows,
      caption,
      highlight = "alternating",
      onRowSelect,
      onPageChange,
      ...rest
    }: DataTableProps & { onRowSelect?: (val: string) => void; onPageChange?: (page: number) => void },
    ref,
  ) => {
    const crossFilter = useCrossFilter();
    const queryResult = useQueryResult(queryId);
    const inPanel = useInDashboardPanel();
    const [page, setPage] = useState(0);

    // Resolve data: queryId mode (preferred) → inline mode (legacy)
    // Applies spatial cross-filter: when map viewport changes, only show rows for visible hexes
    const { resolvedColumns, resolvedRows } = useMemo(() => {
      if (queryId) {
        if (!queryResult) return { resolvedColumns: null, resolvedRows: null };

        const colNames = visibleColumns ?? queryResult.columns;
        const cols = colNames.map((c) => ({ id: c, label: c, align: "left" as const }));

        // Apply spatial cross-filter
        let rRows = queryResult.rows;
        if (
          crossFilter &&
          crossFilter.sourceComponent !== "DataTable" &&
          crossFilter.filterType === "bbox" &&
          crossFilter.values.length > 0
        ) {
          const visibleSet = new Set(crossFilter.values);
          const matchCol = queryResult.columns.includes(crossFilter.column) ? crossFilter.column : null;
          if (matchCol) {
            rRows = rRows.filter((r) => visibleSet.has(r[matchCol] as string));
          }
        }

        const fRows = rRows.map((row, i) => ({
          id: String(i),
          cells: cols.map((c) => formatCell(row[c.id])),
        }));
        return { resolvedColumns: cols, resolvedRows: fRows };
      }
      return { resolvedColumns: columns ?? null, resolvedRows: rows ?? null };
    }, [queryId, queryResult, visibleColumns, columns, rows, crossFilter]);

    // Reset page when data changes
    const totalRows = resolvedRows?.length ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
    const safePage = Math.min(page, totalPages - 1);
    if (safePage !== page) setPage(safePage);

    const pageRows = resolvedRows?.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE) ?? [];

    // Loading state
    if (!resolvedColumns || !resolvedRows) {
      return (
        <div ref={ref} className="rounded-xl border p-4 animate-pulse bg-muted/30 h-48">
          <div className="h-4 bg-muted rounded w-1/3 mb-4" />
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-3 bg-muted rounded" />
            ))}
          </div>
        </div>
      );
    }

    // Cross-filter: which rows are highlighted?
    const filterColIdx =
      crossFilter && crossFilter.sourceComponent !== "DataTable"
        ? resolvedColumns.findIndex((c) => c.id === crossFilter.column)
        : -1;

    const handleRowClick = (rowIdx: number) => {
      const globalIdx = safePage * PAGE_SIZE + rowIdx;
      const val = resolvedRows[globalIdx]?.cells[0];
      if (val != null) {
        onRowSelect?.(String(val));
      }
      if (!queryId || !resolvedColumns.length || val == null) return;
      const firstCol = resolvedColumns[0].id;
      if (val != null) {
        setCrossFilter({
          sourceQueryId: queryId,
          sourceComponent: "DataTable",
          filterType: "value",
          column: firstCol,
          values: [val],
        });
      }
    };

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
                  filterColIdx >= 0 && crossFilter
                    ? crossFilter.values.includes(resolvedRows[globalIdx]?.cells[filterColIdx])
                    : false;

                return (
                  <tr
                    key={row.id ?? `row-${rowIdx}`}
                    onClick={() => handleRowClick(rowIdx)}
                    className={cn(
                      "border-b last:border-0 transition-colors cursor-pointer hover:bg-muted/20",
                      highlight === "alternating" && rowIdx % 2 === 1 && "bg-muted/10",
                      isFilterMatch && "bg-primary/10 border-l-2 border-l-primary",
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
                onClick={() => {
                  const newPage = Math.max(0, safePage - 1);
                  setPage(newPage);
                  onPageChange?.(newPage);
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
                onClick={() => {
                  const newPage = Math.min(totalPages - 1, safePage + 1);
                  setPage(newPage);
                  onPageChange?.(newPage);
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

/** Wrapper that adds bidirectional state via useTamboComponentState */
const DataTableWithState = React.forwardRef<HTMLDivElement, DataTableProps>((props, ref) => {
  const [_selectedRow, setSelectedRow] = useTamboComponentState<string | null>("selectedRow", null);
  const [_currentPage, setCurrentPage] = useTamboComponentState("currentPage", 0, 1000);
  return <DataTable ref={ref} {...(props as any)} onRowSelect={setSelectedRow} onPageChange={setCurrentPage} />;
});
DataTableWithState.displayName = "DataTableWithState";

const dataTableStateSchema = z.object({
  selectedRow: z
    .string()
    .nullable()
    .optional()
    .describe("The first cell value of the row the user clicked. AI can read to know what row user selected."),
  currentPage: z
    .number()
    .optional()
    .describe("Current page number (0-indexed). AI can read to know which page user is viewing."),
});

/** Interactable DataTable — AI can update visibleColumns, title at runtime */
export const InteractableDataTable = withTamboInteractable(DataTableWithState, {
  componentName: "DataTable",
  description:
    "Interactive data table with pagination. AI can update visible columns and title at runtime. " +
    "State is bidirectional: selectedRow shows what row user clicked, currentPage shows which page. " +
    "Use to respond to requests like 'hide the hex column' or 'show only pop_2025 and pop_2100'.",
  propsSchema: dataTableSchema,
  stateSchema: dataTableStateSchema,
});
