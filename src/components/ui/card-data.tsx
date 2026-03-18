import { Check, ExternalLink } from "lucide-react";
import * as React from "react";
import { useState } from "react";
import { z } from "zod";
import { cn } from "@/lib/utils";

// Define option type for individual options in the multi-select
export type DataCardItem = {
  id: string;
  label: string;
  value: string;
  description?: string;
  url?: string;
};

// Define the component state type
export type DataCardState = {
  selectedValues: string[];
};

// Define the component props schema with Zod
export const dataCardSchema = z.object({
  title: z.string().describe("Title displayed above the data cards"),
  options: z
    .array(
      z.object({
        id: z.string().describe("Unique identifier for this card"),
        label: z.string().describe("Display text for the card title"),
        value: z.string().describe("Value associated with this card"),
        description: z.string().optional().describe("Optional summary for the card"),
        url: z.string().optional().describe("Optional URL for the card to navigate to"),
      }),
    )
    .describe("Array of selectable cards to display"),
});

// Define the props type based on the Zod schema
export type DataCardProps = z.infer<typeof dataCardSchema> &
  React.HTMLAttributes<HTMLDivElement> & { [key: `_tambo_${string}`]: unknown };

/**
 * DataCard Component
 *
 * A component that displays options as clickable cards with links and summaries
 * with the ability to select multiple items.
 */
export const DataCard = React.forwardRef<HTMLDivElement, DataCardProps>(
  ({ title, options, className, ...rest }, ref) => {
    // Filter out Tambo internal props before spreading onto DOM
    const props = Object.fromEntries(Object.entries(rest).filter(([k]) => !k.startsWith("_tambo_")));
    const [state, setState] = useState<DataCardState>({ selectedValues: [] });

    // Handle option selection
    const handleToggleCard = (value: string) => {
      const selectedValues = [...state.selectedValues];
      const index = selectedValues.indexOf(value);

      if (index > -1) {
        selectedValues.splice(index, 1);
      } else {
        selectedValues.push(value);
      }

      setState({ selectedValues });
    };

    // Handle navigation to URL
    const handleNavigate = (url?: string) => {
      if (url) {
        window.open(url, "_blank");
      }
    };

    return (
      <div ref={ref} className={cn("w-full space-y-3", className)} {...props}>
        {title && <h3 className="font-semibold text-foreground">{title}</h3>}

        <div className="space-y-2">
          {options?.map((card, index) => {
            const isSelected = state.selectedValues.includes(card.value);
            return (
              <div
                key={`${card.id || "card"}-${index}`}
                className={cn(
                  "group rounded-lg border bg-card p-3 transition-colors cursor-pointer",
                  isSelected
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:border-border/80 hover:bg-muted/30",
                )}
                onClick={() => handleToggleCard(card.value)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 w-4 h-4 border rounded-sm flex items-center justify-center flex-shrink-0 transition-colors",
                      isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30",
                    )}
                  >
                    {isSelected && <Check className="h-2.5 w-2.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-earth-blue group-hover:text-earth-cyan transition-colors">
                      {card.label}
                    </h4>
                    {card.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{card.description}</p>
                    )}
                    {card.url && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNavigate(card.url);
                        }}
                        className="inline-flex items-center gap-1 text-xs text-earth-green mt-1.5 hover:underline truncate max-w-full"
                      >
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{card.url}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);

DataCard.displayName = "DataCard";

export default DataCard;
