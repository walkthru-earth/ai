import { withTamboInteractable } from "@tambo-ai/react";
import { cva } from "class-variance-authority";
import * as React from "react";
import { useCallback, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Funnel,
  FunnelChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { applyCrossFilter, setCrossFilter, useCrossFilter, useQueryResult } from "@/services/query-store";
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
  type: z
    .enum(["bar", "line", "area", "pie", "scatter", "radar", "radialBar", "treemap", "composed", "funnel"])
    .describe("Type of graph to render"),
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
    .enum(["bar", "line", "area", "pie", "scatter", "radar", "radialBar", "treemap", "composed", "funnel"])
    .optional()
    .describe(
      "Chart type (default: bar). " +
        "line: trends/time series. area: filled line. pie: proportions. " +
        "scatter: correlation (needs 2+ yColumns, first=X second=Y). " +
        "radar: multi-dimensional profiles. radialBar: circular progress/gauge. " +
        "treemap: hierarchical proportions. composed: bar+line overlay (first yColumn=bar, rest=line). " +
        "funnel: conversion/pipeline stages (widest at top, narrowing down).",
    ),
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

/* ── Module-level constants ───────────────────────────────────────── */

const tooltipStyle = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  color: "var(--foreground)",
};

const tooltipFormatter = (value: number, name: string) => {
  const formatted =
    Math.abs(value) >= 1000
      ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
      : String(Math.round(value * 100) / 100);
  return [formatted, name];
};

/* ── CustomXTick ──────────────────────────────────────────────────── */

interface CustomXTickProps {
  x?: number;
  y?: number;
  payload?: { value: string };
  rotated: boolean;
  longLabels: boolean;
  shortenXTick: (v: string) => { short: string; full: string };
}

const CustomXTick = ({ x, y, payload, rotated, longLabels, shortenXTick }: CustomXTickProps) => {
  if (!payload?.value) return null;
  const { short, full } = longLabels
    ? shortenXTick(payload.value)
    : { short: String(payload.value), full: String(payload.value) };
  const isTruncated = short !== full;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={10}
        textAnchor={rotated ? "end" : "middle"}
        transform={rotated ? "rotate(-45)" : undefined}
        fill="var(--muted-foreground)"
        fontSize={longLabels ? 9 : 10}
        style={isTruncated ? { cursor: "help" } : undefined}
      >
        {isTruncated && <title>{full}</title>}
        {short}
      </text>
    </g>
  );
};

// Shorten a label string, keeping the full text for hover
const shortenXTick = (v: string): { short: string; full: string } => {
  const s = String(v);
  if (s.length <= 10) return { short: s, full: s };
  const dtMatch = s.match(/\d{4}-(\d{2}-\d{2})\s*(\d{2}:\d{2})/);
  if (dtMatch) return { short: `${dtMatch[1]} ${dtMatch[2]}`, full: s };
  return s.length > 14 ? { short: `${s.slice(0, 12)}…`, full: s } : { short: s, full: s };
};

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
        const rows = applyCrossFilter(queryResult.rows, queryResult.columns, crossFilter, "Graph");

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

    // Cross-filter: highlight matching bar/point (must be before early returns for hook rules)
    const handleBarClick = useCallback(
      (entry: any) => {
        const clickedLabel = entry?.name ?? entry?.payload?.name;
        if (clickedLabel != null) {
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
      },
      [queryId, xColumn],
    );

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

    // Auto-rotate/hide X labels when many data points
    const manyPoints = chartData.length > 10;
    // Detect if X labels are long (e.g. datetime strings) — need more rotation + truncation
    const maxLabelLen = Math.max(...chartData.slice(0, 20).map((d) => String(d.name).length));
    const longLabels = maxLabelLen > 12;
    const rotated = manyPoints || longLabels;

    // Tooltip formatter that uses yLabel for single-dataset charts
    const tooltipFormatterWithLabel =
      yLabel && validDatasets.length === 1
        ? (value: number, _name: string) => {
            const formatted =
              Math.abs(value) >= 1000
                ? value.toLocaleString(undefined, { maximumFractionDigits: 1 })
                : String(Math.round(value * 100) / 100);
            return [formatted, yLabel];
          }
        : tooltipFormatter;

    const xAxisProps = {
      dataKey: "name" as const,
      stroke: "var(--muted-foreground)",
      axisLine: false,
      tickLine: false,
      interval: manyPoints ? Math.ceil(chartData.length / 8) : 0,
      height: rotated ? 55 : 30,
      tick: longLabels
        ? (props: any) => (
            <CustomXTick {...props} rotated={rotated} longLabels={longLabels} shortenXTick={shortenXTick} />
          )
        : undefined,
      // When not using custom tick, use basic props
      ...(longLabels
        ? {}
        : {
            fontSize: 10,
            angle: rotated ? -45 : 0,
            textAnchor: rotated ? ("end" as const) : ("middle" as const),
          }),
      label: xLabel
        ? {
            value: xLabel.length > 30 ? `${xLabel.slice(0, 28)}…` : xLabel,
            position: "insideBottom" as const,
            offset: -2,
            fontSize: 10,
            fill: "var(--muted-foreground)",
            content:
              xLabel.length > 30
                ? ({ viewBox }: any) => (
                    <text
                      x={(viewBox?.x ?? 0) + (viewBox?.width ?? 0) / 2}
                      y={(viewBox?.y ?? 0) + (viewBox?.height ?? 0) - 2}
                      textAnchor="middle"
                      fill="var(--muted-foreground)"
                      fontSize={10}
                      style={{ cursor: "help" }}
                    >
                      <title>{xLabel}</title>
                      {`${xLabel.slice(0, 28)}…`}
                    </text>
                  )
                : undefined,
          }
        : undefined,
    };

    // Custom Y-axis label with hover for truncated text
    const yLabelTruncated = yLabel && yLabel.length > 25 ? `${yLabel.slice(0, 23)}…` : yLabel;
    const yLabelIsTruncated = yLabel && yLabel !== yLabelTruncated;
    const yAxisProps = {
      stroke: "var(--muted-foreground)",
      axisLine: false,
      tickLine: false,
      fontSize: 10,
      width: 50,
      tickFormatter: (v: number) =>
        Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v * 10) / 10),
      label: yLabelTruncated
        ? {
            content: ({ viewBox }: any) => {
              const cx = (viewBox?.x ?? 0) + 14;
              const cy = (viewBox?.y ?? 0) + (viewBox?.height ?? 0) / 2;
              return (
                <text
                  x={cx}
                  y={cy}
                  transform={`rotate(-90, ${cx}, ${cy})`}
                  textAnchor="middle"
                  fill="var(--muted-foreground)"
                  fontSize={10}
                  style={yLabelIsTruncated ? { cursor: "help" } : undefined}
                >
                  {yLabelIsTruncated && <title>{yLabel}</title>}
                  {yLabelTruncated}
                </text>
              );
            },
          }
        : undefined,
    };

    const renderChart = () => {
      switch (type) {
        case "bar":
          return (
            <BarChart data={chartData} onClick={handleBarClick}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={tooltipFormatterWithLabel}
                cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.1 }}
              />
              {showLegend && validDatasets.length > 1 && (
                <Legend verticalAlign="top" height={24} wrapperStyle={{ color: "var(--foreground)", fontSize: 10 }} />
              )}
              {validDatasets.map((d, i) => (
                <Bar
                  key={d.label}
                  dataKey={d.label}
                  fill={d.color ?? defaultColors[i % defaultColors.length]}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          );
        case "line":
          return (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} />
              <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatterWithLabel} />
              {showLegend && validDatasets.length > 1 && (
                <Legend verticalAlign="top" height={24} wrapperStyle={{ color: "var(--foreground)", fontSize: 10 }} />
              )}
              {validDatasets.map((d, i) => (
                <Line
                  key={d.label}
                  type="monotone"
                  dataKey={d.label}
                  stroke={d.color ?? defaultColors[i % defaultColors.length]}
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          );
        case "area":
          return (
            <AreaChart data={chartData}>
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
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} />
              <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatterWithLabel} />
              {showLegend && validDatasets.length > 1 && (
                <Legend verticalAlign="top" height={24} wrapperStyle={{ color: "var(--foreground)", fontSize: 10 }} />
              )}
              {validDatasets.map((d, i) => (
                <Area
                  key={d.label}
                  type="monotone"
                  dataKey={d.label}
                  stroke={d.color ?? defaultColors[i % defaultColors.length]}
                  fill={`url(#area-grad-${i})`}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          );
        case "scatter": {
          // Scatter: first yColumn = X-axis, second yColumn = Y-axis (or use xColumn for labels)
          const scatterDs = validDatasets[0];
          const scatterY = validDatasets[1] ?? validDatasets[0];
          if (!scatterDs) return null;
          const scatterData = chartData.map((d, i) => ({
            x: scatterDs.data[i] ?? 0,
            y: (scatterY === scatterDs ? 0 : scatterY.data[i]) ?? 0,
            name: d.name,
            ...d,
          }));
          return (
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                type="number"
                dataKey="x"
                name={scatterDs.label}
                stroke="var(--muted-foreground)"
                fontSize={10}
                axisLine={false}
                tickLine={false}
                label={
                  (xLabel ?? scatterDs.label)
                    ? {
                        value: xLabel ?? scatterDs.label,
                        position: "insideBottom" as const,
                        offset: -2,
                        fontSize: 11,
                        fill: "var(--muted-foreground)",
                      }
                    : undefined
                }
              />
              <YAxis
                type="number"
                dataKey="y"
                name={scatterY.label}
                {...yAxisProps}
                label={
                  (yLabel ?? scatterY.label)
                    ? {
                        value: yLabel ?? scatterY.label,
                        angle: -90,
                        position: "insideLeft" as const,
                        offset: 4,
                        fontSize: 11,
                        fill: "var(--muted-foreground)",
                        style: { textAnchor: "middle" },
                      }
                    : undefined
                }
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Scatter data={scatterData} fill={defaultColors[0]} isAnimationActive={false} />
            </ScatterChart>
          );
        }
        case "radar": {
          return (
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={10} />
              <PolarRadiusAxis stroke="var(--muted-foreground)" fontSize={9} />
              <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatterWithLabel} />
              {showLegend && validDatasets.length > 1 && (
                <Legend verticalAlign="top" height={24} wrapperStyle={{ color: "var(--foreground)", fontSize: 10 }} />
              )}
              {validDatasets.map((d, i) => (
                <Radar
                  key={d.label}
                  name={d.label}
                  dataKey={d.label}
                  stroke={d.color ?? defaultColors[i % defaultColors.length]}
                  fill={d.color ?? defaultColors[i % defaultColors.length]}
                  fillOpacity={0.2}
                  isAnimationActive={false}
                />
              ))}
            </RadarChart>
          );
        }
        case "radialBar": {
          const rbData =
            validDatasets[0]?.data.slice(0, maxPts).map((v, i) => ({
              name: labels[i],
              value: v,
              fill: defaultColors[i % defaultColors.length],
            })) ?? [];
          return (
            <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="90%" barSize={16} data={rbData}>
              <RadialBar
                dataKey="value"
                isAnimationActive={false}
                label={{ fill: "var(--foreground)", fontSize: 10, position: "insideStart" }}
              />
              <Tooltip contentStyle={tooltipStyle} />
              {showLegend && (
                <Legend verticalAlign="top" height={24} wrapperStyle={{ color: "var(--foreground)", fontSize: 10 }} />
              )}
            </RadialBarChart>
          );
        }
        case "treemap": {
          const tmData =
            validDatasets[0]?.data.slice(0, maxPts).map((v, i) => ({
              name: labels[i],
              size: v,
              fill: defaultColors[i % defaultColors.length],
            })) ?? [];
          return (
            <Treemap
              data={tmData}
              dataKey="size"
              nameKey="name"
              aspectRatio={4 / 3}
              stroke="var(--border)"
              isAnimationActive={false}
              content={({ x, y, width, height, name, fill }: any) =>
                width > 30 && height > 20 ? (
                  <g>
                    <rect
                      x={x}
                      y={y}
                      width={width}
                      height={height}
                      fill={fill}
                      stroke="var(--border)"
                      strokeWidth={1}
                      rx={2}
                    />
                    <text
                      x={x + width / 2}
                      y={y + height / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="var(--foreground)"
                      fontSize={10}
                    >
                      {String(name ?? "").slice(0, 12)}
                    </text>
                  </g>
                ) : (
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill={fill}
                    stroke="var(--border)"
                    strokeWidth={1}
                    rx={2}
                  />
                )
              }
            />
          );
        }
        case "composed":
          // First yColumn rendered as bar, remaining as lines overlaid
          return (
            <ComposedChart data={chartData} onClick={handleBarClick}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis {...xAxisProps} />
              <YAxis {...yAxisProps} />
              <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatterWithLabel} />
              {showLegend && validDatasets.length > 1 && (
                <Legend verticalAlign="top" height={24} wrapperStyle={{ color: "var(--foreground)", fontSize: 10 }} />
              )}
              {validDatasets.map((d, i) =>
                i === 0 ? (
                  <Bar
                    key={d.label}
                    dataKey={d.label}
                    fill={d.color ?? defaultColors[i % defaultColors.length]}
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                    opacity={0.7}
                  />
                ) : (
                  <Line
                    key={d.label}
                    type="monotone"
                    dataKey={d.label}
                    stroke={d.color ?? defaultColors[i % defaultColors.length]}
                    dot={false}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                ),
              )}
            </ComposedChart>
          );
        case "pie": {
          const pieDs = validDatasets[0];
          if (!pieDs) return null;
          return (
            <PieChart>
              <Pie
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
              <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatterWithLabel} />
              {showLegend && (
                <Legend verticalAlign="top" height={24} wrapperStyle={{ color: "var(--foreground)", fontSize: 10 }} />
              )}
            </PieChart>
          );
        }
        case "funnel": {
          const fnData =
            validDatasets[0]?.data.slice(0, maxPts).map((v, i) => ({
              name: labels[i],
              value: v,
              fill: defaultColors[i % defaultColors.length],
            })) ?? [];
          return (
            <FunnelChart>
              <Tooltip contentStyle={tooltipStyle} formatter={tooltipFormatterWithLabel} />
              <Funnel dataKey="value" data={fnData} isAnimationActive={false}>
                <LabelList position="right" fill="var(--foreground)" stroke="none" fontSize={10} dataKey="name" />
              </Funnel>
            </FunnelChart>
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
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                {renderChart() ?? <></>}
              </ResponsiveContainer>
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
    "Interactive chart (bar/line/area/pie/scatter/radar/radialBar/treemap/composed/funnel). " +
    "ALWAYS set xLabel and yLabel to explain axes (e.g. xLabel='Rank', yLabel='Buildings per km²'). " +
    "Chart types: bar (comparisons), line (trends), area (filled line), pie (proportions), " +
    "scatter (correlation — first yColumn=X, second=Y), radar (multi-dimensional profiles), " +
    "radialBar (circular gauge), treemap (hierarchical proportions), composed (bar+line overlay — first yColumn=bar, rest=lines), " +
    "funnel (conversion/pipeline stages). " +
    "AI can update chart type, axes, axis labels, and data source at runtime.",
  propsSchema: graphSchema,
});
