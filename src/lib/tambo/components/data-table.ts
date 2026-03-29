/**
 * DataTable component registration - interactive paginated table.
 */

import type { TamboComponent } from "@tambo-ai/react";
import { dataTableSchema, InteractableDataTable } from "@/components/tambo/data-table";

export const dataTableComponent: TamboComponent = {
  name: "DataTable",
  description:
    "Interactive paginated data table. INTERACTABLE: AI can update visibleColumns and title at runtime. " +
    "PREFERRED: pass queryId from runSQL (auto-derives columns/rows, zero token cost).",
  component: InteractableDataTable,
  propsSchema: dataTableSchema,
};
