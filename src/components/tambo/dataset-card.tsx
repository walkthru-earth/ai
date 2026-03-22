import { Building2, Cloud, Database, Mountain, Users } from "lucide-react";
import * as React from "react";
import { z } from "zod";
import { CardSkeleton } from "@/components/ui/card-skeleton";
import { cn } from "@/lib/utils";

export const datasetCardSchema = z.object({
  name: z.string().describe("Dataset name"),
  description: z.string().describe("Brief description of what this dataset contains"),
  category: z.enum(["weather", "terrain", "building", "population", "cross-index"]).describe("Dataset category"),
  columns: z
    .array(
      z.object({
        id: z.string().describe("Unique column identifier"),
        name: z.string().describe("Column name"),
        description: z.string().describe("What this column contains"),
      }),
    )
    .describe("Available columns in this dataset"),
  h3ResRange: z.array(z.number()).optional().describe("Min and max H3 resolution supported"),
  totalRows: z.string().optional().describe("Human-readable total row count (e.g. '10.5 billion')"),
  sourceUrl: z.string().optional().describe("URL to the data source"),
});

type DatasetCardProps = z.infer<typeof datasetCardSchema>;

const CATEGORY_STYLES: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  weather: { icon: Cloud, color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  terrain: { icon: Mountain, color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  building: { icon: Building2, color: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
  population: { icon: Users, color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  "cross-index": { icon: Database, color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20" },
};

export const DatasetCard = React.forwardRef<HTMLDivElement, DatasetCardProps>(
  ({ name, description, category, columns, h3ResRange, totalRows, sourceUrl }, ref) => {
    const [expanded, setExpanded] = React.useState(false);
    const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES["cross-index"];

    if (!name) {
      return <CardSkeleton ref={ref} className="h-36" />;
    }

    return (
      <div ref={ref} className="rounded-xl border bg-card overflow-hidden">
        <div className="p-4">
          <div className="flex items-start gap-3">
            {(() => {
              const Icon = style.icon;
              return <Icon className="w-5 h-5 flex-shrink-0" />;
            })()}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-foreground">{name}</h3>
                <span className={cn("text-xs px-2 py-0.5 rounded-full border", style.color)}>{category}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{description}</p>

              <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
                {totalRows && <span>{totalRows} rows</span>}
                {h3ResRange && h3ResRange.length === 2 && (
                  <span>
                    H3 res {h3ResRange[0]}-{h3ResRange[1]}
                  </span>
                )}
                {columns && <span>{columns.length} columns</span>}
              </div>
            </div>
          </div>

          {columns && columns.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-earth-blue hover:text-earth-cyan transition-colors"
              >
                {expanded ? "Hide columns" : "Show columns"}
              </button>
              {expanded && (
                <div className="mt-2 space-y-1">
                  {columns.map((col) => (
                    <div key={col.id} className="flex items-start gap-2 text-xs">
                      <code className="font-mono text-earth-blue bg-earth-blue/5 px-1.5 py-0.5 rounded flex-shrink-0">
                        {col.name}
                      </code>
                      <span className="text-muted-foreground">{col.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {sourceUrl && (
            <div className="mt-3">
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-earth-blue hover:underline"
              >
                View source data →
              </a>
            </div>
          )}
        </div>
      </div>
    );
  },
);
DatasetCard.displayName = "DatasetCard";
