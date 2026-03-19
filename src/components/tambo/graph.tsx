import { withTamboInteractable } from "@tambo-ai/react";
import { cva } from "class-variance-authority";
import * as React from "react";
import { useMemo } from "react";
import * as RechartsCore from "recharts";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { setCrossFilter, useCrossFilter, useQueryResult } from "@/services/query-store";
import { useInDashboardPanel } from "./panel-context";

/* ── Variants ─────────────────────────────────────────────────────── */

export const graphVariants = cva("w-full rounded-lg overflow-hidden transition-all duration-200", {
  variants: {
    variant: {
      default: "bg-background",
      solid: "shadow-lg bg-muted",
      bordered: "border-2 border-border",
    },
    size: { default: "", sm: "", lg: "" },
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
  type: z.enum(["bar", "line", "area", "pie"]).describe("Type of graph to render"),
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
  chartType: z
    .enum(["bar", "line", "area", "pie"])
    .optional()
    .describe("Chart type when using queryId mode (default: bar). Use 'area' for filled line charts."),
  xLabel: z.string().optional().describe("X-axis label (e.g. 'Rank', 'Year', 'Region'). Shown below the X-axis."),
  yLabel: z
    .string()
    .optional()
    .describe("Y-axis label (e.g. 'Buildings per km²', 'Population'). Shown vertically on the left."),
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
  (
    { className, variant, size, data, title, showLegend = true, queryId, xColumn, yColumns, chartType, xLabel, yLabel },
    ref,
  ) => {
    const crossFilter = useCrossFilter();
    const queryResult = useQueryResult(queryId);
    const inPanel = useInDashboardPanel();

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

    const heightClass = inPanel ? "h-full" : "h-[320px]";

    // Loading state
    if (!resolvedData) {
      return (
        <div ref={ref} className={cn(graphVariants({ variant, size }), heightClass, className)}>
          <div className="p-4 h-full flex items-center justify-center text-muted-foreground text-sm">
            {queryId ? "Loading chart data..." : "Awaiting data..."}
          </div>
        </div>
      );
    }

    const { type, labels, datasets } = resolvedData;
    if (!labels?.length || !datasets?.length) {
      return (
        <div ref={ref} className={cn(graphVariants({ variant, size }), heightClass, className)}>
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
    const handleBarClick = (entry: any) => {
      const clickedLabel = entry?.name ?? entry?.payload?.name;
      if (clickedLabel != null) {
        // clickedLabel available for cross-filter below
        if (queryId && xColumn) {
          setCrossFilter({
            sourceQueryId: queryId,
            sourceComponent: "Graph",
            filterType: "value",
            column: xColumn,
            values: [clickedLabel],
          });
        }
      }
    };

    // Auto-rotate/hide X labels when many data points
    const manyPoints = chartData.length > 10;
    const xAxisProps = {
      dataKey: "name" as const,
      stroke: "var(--muted-foreground)",
      axisLine: false,
      tickLine: false,
      fontSize: 10,
      interval: manyPoints ? Math.ceil(chartData.length / 8) : 0,
      angle: manyPoints ? -45 : 0,
      textAnchor: manyPoints ? ("end" as const) : ("middle" as const),
      height: manyPoints ? 50 : 30,
      label: xLabel
        ? {
            value: xLabel,
            position: "insideBottom" as const,
            offset: manyPoints ? -4 : -2,
            fontSize: 11,
            fill: "var(--muted-foreground)",
          }
        : undefined,
    };

    const yAxisProps = {
      stroke: "var(--muted-foreground)",
      axisLine: false,
      tickLine: false,
      fontSize: 10,
      width: 50,
      tickFormatter: (v: number) =>
        Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v * 10) / 10),
      label: yLabel
        ? {
            value: yLabel,
            angle: -90,
            position: "insideLeft" as const,
            offset: 4,
            fontSize: 11,
            fill: "var(--muted-foreground)",
            style: { textAnchor: "middle" },
          }
        : undefined,
    };

    const tooltipStyle = {
      backgroundColor: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "0.5rem",
      color: "var(--foreground)",
    };

    // Format tooltip values: round to reasonable precision
    const tooltipFormatter = (value: number, name: string) => {
      const formatted =
        Math.abs(value) >= 1000
          ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
          : String(Math.round(value * 100) / 100);
      return [formatted, yLabel && validDatasets.length === 1 ? yLabel : name];
    };

    const renderChart = () => {
      switch (type) {
        case "bar":
          return (
            <RechartsCore.BarChart data={chartData} onClick={handleBarClick}>
              <RechartsCore.CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <RechartsCore.XAxis {...xAxisProps} />
              <RechartsCore.YAxis {...yAxisProps} />
              <RechartsCore.Tooltip
                contentStyle={tooltipStyle}
                formatter={tooltipFormatter}
                cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.1 }}
              />
              {showLegend && validDatasets.length > 1 && (
                <RechartsCore.Legend wrapperStyle={{ color: "var(--foreground)", fontSize: 10 }} />
              )}
              {validDatasets.map((d, i) => (
                <RechartsCore.Bar
                  key={d.label}
                  dataKey={d.label}
                  fill={d.color ?? defaultColors[i % defaultColors.length]}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              ))}
            </RechartsCore.BarChart>
          );
        case "line":
          return (
            <RechartsCore.LineChart data={chartData}>
              <RechartsCore.CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <RechartsCore.XAxis {...xAxisProps} />
              <RechartsCore.YAxis {...yAxisProps} />
              <RechartsCore.Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
              {showLegend && validDatasets.length > 1 && (
                <RechartsCore.Legend wrapperStyle={{ color: "var(--foreground)", fontSize: 10 }} />
              )}
              {validDatasets.map((d, i) => (
                <RechartsCore.Line
                  key={d.label}
                  type="monotone"
                  dataKey={d.label}
                  stroke={d.color ?? defaultColors[i % defaultColors.length]}
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ))}
            </RechartsCore.LineChart>
          );
        case "area":
          return (
            <RechartsCore.AreaChart data={chartData}>
              <defs>
                {validDatasets.map((d, i) => {
                  const color = d.color ?? defaultColors[i % defaultColors.length];
                  return (
                    <linearGradient key={d.label} id={`area-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                    </linearGradient>
                  );
                })}
              </defs>
              <RechartsCore.CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <RechartsCore.XAxis {...xAxisProps} />
              <RechartsCore.YAxis {...yAxisProps} />
              <RechartsCore.Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatter} />
              {showLegend && validDatasets.length > 1 && (
                <RechartsCore.Legend wrapperStyle={{ color: "var(--foreground)", fontSize: 10 }} />
              )}
              {validDatasets.map((d, i) => (
                <RechartsCore.Area
                  key={d.label}
                  type="monotone"
                  dataKey={d.label}
                  stroke={d.color ?? defaultColors[i % defaultColors.length]}
                  fill={`url(#area-grad-${i})`}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ))}
            </RechartsCore.AreaChart>
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
                outerRadius="70%"
                labelLine={false}
                isAnimationActive={false}
              />
              <RechartsCore.Tooltip contentStyle={tooltipStyle} />
              {showLegend && <RechartsCore.Legend wrapperStyle={{ color: "var(--foreground)", fontSize: 10 }} />}
            </RechartsCore.PieChart>
          );
        }
        default:
          return null;
      }
    };

    const showTitle = title && !inPanel;

    return (
      <GraphErrorBoundary className={className} variant={variant} size={size}>
        <div ref={ref} className={cn(graphVariants({ variant, size }), heightClass, className)}>
          <div className="p-2 sm:p-4 h-full flex flex-col">
            {showTitle && <h3 className="text-xs sm:text-sm font-semibold mb-1 sm:mb-3 text-foreground">{title}</h3>}
            <div className="w-full flex-1 min-h-0">
              <RechartsCore.ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
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

/** Interactable Graph — AI can update chartType, xColumn, yColumns at runtime */
export const InteractableGraph = withTamboInteractable(Graph, {
  componentName: "Graph",
  description:
    "Interactive chart (bar/line/area/pie). AI can update chart type, axes, axis labels, and data source at runtime. " +
    "ALWAYS set xLabel and yLabel to explain axes (e.g. xLabel='Rank', yLabel='Buildings per km²'). " +
    "Use 'area' for filled line charts (good for distributions, rankings, time series). " +
    "Use to respond to requests like 'switch to line chart' or 'show pop_2100 instead'.",
  propsSchema: graphSchema,
});
