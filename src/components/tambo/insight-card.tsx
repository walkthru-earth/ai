"use client";

import { cn } from "@/lib/utils";
import { Info, AlertTriangle, AlertOctagon, CheckCircle2, MapPin } from "lucide-react";
import * as React from "react";
import { z } from "zod";

export const insightCardSchema = z.object({
  title: z.string().describe("Insight headline"),
  insight: z.string().describe("The key finding or analysis result"),
  details: z
    .array(
      z.object({
        id: z.string().describe("Unique detail identifier"),
        label: z.string().describe("Detail label"),
        value: z.string().describe("Detail value"),
      }),
    )
    .optional()
    .describe("Supporting data points for this insight"),
  severity: z
    .enum(["info", "warning", "critical", "positive"])
    .optional()
    .describe("Severity or tone of the insight"),
  region: z
    .string()
    .optional()
    .describe("Geographic region this insight applies to"),
  datasets: z
    .array(z.string())
    .optional()
    .describe("Datasets used to derive this insight"),
  sql: z
    .string()
    .optional()
    .describe("SQL query that would produce this insight"),
});

type InsightCardProps = z.infer<typeof insightCardSchema>;

const SEVERITY_STYLES: Record<string, { border: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  info: {
    border: "border-blue-500/30",
    bg: "bg-blue-500/5",
    icon: Info,
  },
  warning: {
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
    icon: AlertTriangle,
  },
  critical: {
    border: "border-red-500/30",
    bg: "bg-red-500/5",
    icon: AlertOctagon,
  },
  positive: {
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/5",
    icon: CheckCircle2,
  },
};

export const InsightCard = React.forwardRef<HTMLDivElement, InsightCardProps>(
  ({ title, insight, details, severity = "info", region, datasets, sql }, ref) => {
    const [showSQL, setShowSQL] = React.useState(false);
    const style = SEVERITY_STYLES[severity ?? "info"] ?? SEVERITY_STYLES.info;

    if (!title) {
      return (
        <div ref={ref} className="rounded-xl border p-4 animate-pulse bg-muted/30 h-32" />
      );
    }

    return (
      <div
        ref={ref}
        className={cn("rounded-xl border-2 overflow-hidden", style.border, style.bg)}
      >
        <div className="p-4">
          <div className="flex items-start gap-2">
            {(() => { const Icon = style.icon; return <Icon className="w-5 h-5 flex-shrink-0 text-current" />; })()}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground">{title}</h3>
              {region && (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {region}
                </span>
              )}
            </div>
          </div>

          <p className="text-sm text-foreground/90 mt-3 leading-relaxed">
            {insight}
          </p>

          {details && details.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mt-3">
              {details.map((d, i) => (
                <div
                  key={d.id ?? i}
                  className="bg-background/50 rounded-lg px-3 py-2"
                >
                  <p className="text-xs text-muted-foreground">{d.label}</p>
                  <p className="text-sm font-semibold text-foreground">
                    {d.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-3">
            {datasets?.map((ds) => (
              <span
                key={ds}
                className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
              >
                {ds}
              </span>
            ))}
            {sql && (
              <button
                onClick={() => setShowSQL(!showSQL)}
                className="text-xs text-primary hover:text-primary/80 ml-auto"
              >
                {showSQL ? "Hide SQL" : "View SQL"}
              </button>
            )}
          </div>

          {showSQL && sql && (
            <pre className="mt-2 p-3 rounded-lg bg-muted text-xs font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap">
              {sql}
            </pre>
          )}
        </div>
      </div>
    );
  },
);
InsightCard.displayName = "InsightCard";
