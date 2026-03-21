/**
 * Static component registrations — AI sends all props inline, no runtime updates.
 * Group these together since they're simple and rarely change independently.
 */

import type { TamboComponent } from "@tambo-ai/react";
import { DatasetCard, datasetCardSchema } from "@/components/tambo/dataset-card";
import { InsightCard, insightCardSchema } from "@/components/tambo/insight-card";
import { QueryDisplay, queryDisplaySchema } from "@/components/tambo/query-display";
import { StatsCard, statsCardSchema } from "@/components/tambo/stats-card";
import { StatsGrid, statsGridSchema } from "@/components/tambo/stats-grid";
import { DataCard, dataCardSchema } from "@/components/ui/card-data";

export const statsCardComponent: TamboComponent = {
  name: "StatsCard",
  description: "A single metric card. Use for one key value like temperature, population count, building density.",
  component: StatsCard,
  propsSchema: statsCardSchema,
};

export const statsGridComponent: TamboComponent = {
  name: "StatsGrid",
  description: "A responsive grid of multiple metric cards. Use when comparing several metrics at once.",
  component: StatsGrid,
  propsSchema: statsGridSchema,
};

export const insightCardComponent: TamboComponent = {
  name: "InsightCard",
  description: "Highlights a key finding with supporting details and severity level. Use for analysis conclusions.",
  component: InsightCard,
  propsSchema: insightCardSchema,
};

export const datasetCardComponent: TamboComponent = {
  name: "DatasetCard",
  description: "Shows metadata about a Walkthru Earth dataset. Use when the user asks about available data.",
  component: DatasetCard,
  propsSchema: datasetCardSchema,
};

export const queryDisplayComponent: TamboComponent = {
  name: "QueryDisplay",
  description:
    "Displays a SQL query with syntax highlighting and copy button. Use when showing the user a query or explaining how to access data.",
  component: QueryDisplay,
  propsSchema: queryDisplaySchema,
};

export const dataCardComponent: TamboComponent = {
  name: "DataCard",
  description: "Selectable option cards with descriptions and links. Use for navigation choices.",
  component: DataCard,
  propsSchema: dataCardSchema,
};
