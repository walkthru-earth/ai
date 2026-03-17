"use client";

import * as React from "react";
import { useMemo } from "react";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { setCrossFilter, useCrossFilter, useQueryResult } from "@/services/query-store";

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

/* ── Component ─────────────────────────────────────────────────────── */

export const DataTable = React.forwardRef<HTMLDivElement, DataTableProps>(
  ({ title, queryId, visibleColumns, columns, rows, caption, highlight = "alternating" }, ref) => {
    const crossFilter = useCrossFilter();
    const queryResult = useQueryResult(queryId);

    // Resolve data: queryId mode (preferred) → inline mode (legacy)
    // Applies spatial cross-filter: when map viewport changes, only show rows for visible hexes
    const { resolvedColumns, resolvedRows, rawRows } = useMemo(() => {
      if (queryId) {
        if (!queryResult) return { resolvedColumns: null, resolvedRows: null, rawRows: null };

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
        return { resolvedColumns: cols, resolvedRows: fRows, rawRows: rRows };
      }
      return { resolvedColumns: columns ?? null, resolvedRows: rows ?? null, rawRows: null };
    }, [queryId, queryResult, visibleColumns, columns, rows, crossFilter]);

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
      if (!queryId || !resolvedColumns.length) return;
      const firstCol = resolvedColumns[0].id;
      const val = resolvedRows[rowIdx]?.cells[0];
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
        {title && (
          <div className="px-4 py-2.5 border-b bg-muted/30 flex-shrink-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          </div>
        )}
        <div className="overflow-auto flex-1 min-h-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20">
                {resolvedColumns.map((col) => (
                  <th
                    key={col.id}
                    className={cn(
                      "px-4 py-2.5 font-semibold text-muted-foreground whitespace-nowrap text-xs",
                      col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                    )}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resolvedRows.map((row, rowIdx) => {
                const isFilterMatch =
                  filterColIdx >= 0 && crossFilter ? crossFilter.values.includes(row.cells[filterColIdx]) : false;

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
                            "px-4 py-2 text-foreground whitespace-nowrap text-sm",
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
        {caption && (
          <div className="px-4 py-2 border-t bg-muted/10">
            <p className="text-xs text-muted-foreground">{caption}</p>
          </div>
        )}
      </div>
    );
  },
);
DataTable.displayName = "DataTable";
