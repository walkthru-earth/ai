/**
 * DataTable component registration — interactive paginated table.
 */

import type { TamboComponent } from "@tambo-ai/react";
import { dataTableSchema, InteractableDataTable } from "@/components/tambo/data-table";

export const dataTableComponent: TamboComponent = {
  name: "DataTable",
  description:
    "Interactive paginated data table. INTERACTABLE: AI can update visibleColumns and title at runtime. " +
    "PREFERRED: pass queryId from runSQL (auto-derives columns/rows — zero token cost). " +
    "UPDATE vs NEW: Update existing table when user modifies SAME data (hide columns, change title). " +
    "CREATE NEW table when user asks for a DIFFERENT dataset, query result, or filter. " +
    "NEVER change queryId via update_component_props — it won't re-render. Always create a new component for new data.",
  component: InteractableDataTable,
  propsSchema: dataTableSchema,
};
