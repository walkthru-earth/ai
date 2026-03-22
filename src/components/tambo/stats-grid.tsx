import * as React from "react";
import { z } from "zod";
import { CardSkeleton } from "@/components/ui/card-skeleton";
import { StatsCard, statsCardSchema } from "./stats-card";

export const statsGridSchema = z.object({
  title: z.string().optional().describe("Optional title above the stats grid"),
  stats: z
    .array(
      statsCardSchema.extend({
        id: z.string().describe("Unique identifier for this stat"),
      }),
    )
    .describe("Array of stats to display in a responsive grid"),
});

type StatsGridProps = z.infer<typeof statsGridSchema>;

export const StatsGrid = React.forwardRef<HTMLDivElement, StatsGridProps>(({ title, stats }, ref) => {
  if (!stats || stats.length === 0) {
    return (
      <div ref={ref} className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <CardSkeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} className="p-3">
      {title && <h3 className="font-semibold text-foreground mb-3">{title}</h3>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {stats.map((stat, i) => (
          <StatsCard
            key={stat.id || `stat-${i}`}
            title={stat.title}
            value={stat.value}
            subtitle={stat.subtitle}
            change={stat.change}
            trend={stat.trend}
            icon={stat.icon}
            color={stat.color}
          />
        ))}
      </div>
    </div>
  );
});
StatsGrid.displayName = "StatsGrid";
