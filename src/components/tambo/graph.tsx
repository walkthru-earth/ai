"use client";

import { cva } from "class-variance-authority";
import * as React from "react";
import { useMemo } from "react";
import * as RechartsCore from "recharts";
import { z } from "zod/v3";
import { cn } from "@/lib/utils";
import { setCrossFilter, useCrossFilter, useQueryResult } from "@/services/query-store";

/* ── Variants ─────────────────────────────────────────────────────── */

export const graphVariants = cva("w-full h-full rounded-lg overflow-hidden transition-all duration-200", {
  variants: {
    variant: {
      default: "bg-background",
      solid: "shadow-lg bg-muted",
      bordered: "border-2 border-border",
    },
    size: { default: "min-h-[16rem]", sm: "min-h-[12rem]", lg: "min-h-[24rem]" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

/* ── Error boundary ───────────────────────────────────────────────── */

class GraphErrorBoundary extends React.Component<
  { children: React.ReactNode; className?: string; variant?: string; size?: string },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          className={cn(
            graphVariants({ variant: this.props.variant as any, size: this.props.size as any }),
            this.props.className,
          )}
        >
          <div className="p-4 flex items-center justify-center h-full text-destructive text-center text-sm">
            Error loading chart. Please try again.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── Schema ────────────────────────────────────────────────────────── */

// Legacy inline data schema (backward compat)
export const graphDataSchema = z.object({
  type: z.enum(["bar", "line", "pie"]).describe("Type of graph to render"),
  labels: z.array(z.string()).describe("Labels for the graph"),
  datasets: z
    .array(
      z.object({
        label: z.string().describe("Label for the dataset"),
        data: z.array(z.number()).describe("Data points"),
        color: z.string().optional().describe("Optional color"),
      }),
    )
    .describe("Data for the graph"),
});

export const graphSchema = z.object({
  // PREFERRED: queryId mode (zero tokens for data)
  queryId: z
    .string()
    .optional()
    .describe(
      "ID from runSQL result. Chart reads data from the query store (zero token cost). " +
        "Use with xColumn + yColumns + chartType.",
    ),
  xColumn: z.string().optional().describe("Column name for X-axis labels (e.g. 'hex', 'region')"),
  yColumns: z
    .array(z.string())
    .optional()
    .describe("Column names to plot as Y-axis series (e.g. ['pop_2025', 'pop_2050'])"),
  chartType: z.enum(["bar", "line", "pie"]).optional().describe("Chart type when using queryId mode (default: bar)"),
  // LEGACY: inline data (backward compat — deprecated)
  data: graphDataSchema
    .optional()
    .describe("Inline chart data. DEPRECATED — prefer queryId + xColumn + yColumns instead."),
  title: z.string().optional().describe("Title for the chart"),
  showLegend: z.boolean().optional().describe("Whether to show the legend"),
  variant: z.enum(["default", "solid", "bordered"]).optional(),
  size: z.enum(["default", "sm", "lg"]).optional(),
  className: z.string().optional(),
});

export type GraphProps = z.infer<typeof graphSchema>;
export type GraphDataType = z.infer<typeof graphDataSchema>;

/* ── Colors ────────────────────────────────────────────────────────── */

const defaultColors = [
  "hsl(220, 100%, 62%)",
  "hsl(160, 82%, 47%)",
  "hsl(32, 100%, 62%)",
  "hsl(340, 82%, 66%)",
  "hsl(270, 80%, 60%)",
  "hsl(190, 90%, 50%)",
];

/* ── Component ─────────────────────────────────────────────────────── */

export const Graph = React.forwardRef<HTMLDivElement, GraphProps>(
  ({ className, variant, size, data, title, showLegend = true, queryId, xColumn, yColumns, chartType }, ref) => {
    const crossFilter = useCrossFilter();
    const queryResult = useQueryResult(queryId);

    // Resolve data: queryId mode (preferred) → inline mode (legacy)
    // Applies cross-filter: when map viewport changes, only show data for visible hexes
    const resolvedData = useMemo((): GraphDataType | null => {
      if (queryId && xColumn && yColumns?.length) {
        if (!queryResult || queryResult.rows.length === 0) return null;

        // Apply spatial cross-filter: only show rows whose hex is in the map viewport
        let rows = queryResult.rows;
        if (
          crossFilter &&
          crossFilter.sourceComponent !== "Graph" &&
          crossFilter.filterType === "bbox" &&
          crossFilter.values.length > 0
        ) {
          const visibleSet = new Set(crossFilter.values);
          const matchCol = queryResult.columns.includes(crossFilter.column) ? crossFilter.column : null;
          if (matchCol) {
            rows = rows.filter((r) => visibleSet.has(r[matchCol] as string));
          }
        }

        return {
          type: chartType ?? "bar",
          labels: rows.map((r) => String(r[xColumn] ?? "")),
          datasets: yColumns.map((col) => ({
            label: col,
            data: rows.map((r) => Number(r[col] ?? 0)),
          })),
        };
      }
      return data ?? null;
    }, [queryId, queryResult, xColumn, yColumns, chartType, data, crossFilter]);

    // Loading state
    if (!resolvedData) {
      return (
        <div ref={ref} className={cn(graphVariants({ variant, size }), className)}>
          <div className="p-4 h-full flex items-center justify-center text-muted-foreground text-sm">
            {queryId ? "Loading chart data..." : "Awaiting data..."}
          </div>
        </div>
      );
    }

    const { type, labels, datasets } = resolvedData;
    if (!labels?.length || !datasets?.length) {
      return (
        <div ref={ref} className={cn(graphVariants({ variant, size }), className)}>
          <div className="p-4 h-full flex items-center justify-center text-muted-foreground text-sm">
            Building chart...
          </div>
        </div>
      );
    }

    const validDatasets = datasets.filter((d) => d.label && d.data?.length > 0);
    if (validDatasets.length === 0) return null;

    const maxPts = Math.min(labels.length, Math.min(...validDatasets.map((d) => d.data.length)));

    const chartData = labels.slice(0, maxPts).map((label, i) => ({
      name: label,
      ...Object.fromEntries(validDatasets.map((d) => [d.label, d.data[i] ?? 0])),
    }));

    // Cross-filter: highlight matching bar/point
    const _isFiltered = crossFilter && crossFilter.sourceComponent !== "Graph" && crossFilter.column === xColumn;

    const handleBarClick = (entry: any) => {
      if (!queryId || !xColumn) return;
      const clickedLabel = entry?.name ?? entry?.payload?.name;
      if (clickedLabel != null) {
        setCrossFilter({
          sourceQueryId: queryId,
          sourceComponent: "Graph",
          filterType: "value",
          column: xColumn,
          values: [clickedLabel],
        });
      }
    };

    const tooltipStyle = {
      backgroundColor: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "0.5rem",
      color: "var(--foreground)",
    };

    const renderChart = () => {
      switch (type) {
        case "bar":
          return (
            <RechartsCore.BarChart data={chartData} onClick={handleBarClick}>
              <RechartsCore.CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <RechartsCore.XAxis
                dataKey="name"
                stroke="var(--muted-foreground)"
                axisLine={false}
                tickLine={false}
                fontSize={11}
              />
              <RechartsCore.YAxis stroke="var(--muted-foreground)" axisLine={false} tickLine={false} fontSize={11} />
              <RechartsCore.Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.1 }}
              />
              {showLegend && <RechartsCore.Legend wrapperStyle={{ color: "var(--foreground)" }} />}
              {validDatasets.map((d, i) => (
                <RechartsCore.Bar
                  key={d.label}
                  dataKey={d.label}
                  fill={d.color ?? defaultColors[i % defaultColors.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </RechartsCore.BarChart>
          );
        case "line":
          return (
            <RechartsCore.LineChart data={chartData}>
              <RechartsCore.CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <RechartsCore.XAxis
                dataKey="name"
                stroke="var(--muted-foreground)"
                axisLine={false}
                tickLine={false}
                fontSize={11}
              />
              <RechartsCore.YAxis stroke="var(--muted-foreground)" axisLine={false} tickLine={false} fontSize={11} />
              <RechartsCore.Tooltip contentStyle={tooltipStyle} />
              {showLegend && <RechartsCore.Legend wrapperStyle={{ color: "var(--foreground)" }} />}
              {validDatasets.map((d, i) => (
                <RechartsCore.Line
                  key={d.label}
                  type="monotone"
                  dataKey={d.label}
                  stroke={d.color ?? defaultColors[i % defaultColors.length]}
                  dot={false}
                  strokeWidth={2}
                />
              ))}
            </RechartsCore.LineChart>
          );
        case "pie": {
          const pieDs = validDatasets[0];
          if (!pieDs) return null;
          return (
            <RechartsCore.PieChart>
              <RechartsCore.Pie
                data={pieDs.data.slice(0, maxPts).map((v, i) => ({
                  name: labels[i],
                  value: v,
                  fill: defaultColors[i % defaultColors.length],
                }))}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                labelLine={false}
              />
              <RechartsCore.Tooltip contentStyle={tooltipStyle} />
              {showLegend && <RechartsCore.Legend wrapperStyle={{ color: "var(--foreground)" }} />}
            </RechartsCore.PieChart>
          );
        }
        default:
          return null;
      }
    };

    return (
      <GraphErrorBoundary className={className} variant={variant} size={size}>
        <div ref={ref} className={cn(graphVariants({ variant, size }), className)}>
          <div className="p-4 h-full">
            {title && <h3 className="text-sm font-semibold mb-3 text-foreground">{title}</h3>}
            <div className="w-full h-[calc(100%-2rem)]">
              <RechartsCore.ResponsiveContainer width="100%" height="100%">
                {renderChart() ?? <></>}
              </RechartsCore.ResponsiveContainer>
            </div>
          </div>
        </div>
      </GraphErrorBoundary>
    );
  },
);
Graph.displayName = "Graph";
