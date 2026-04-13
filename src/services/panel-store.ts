/**
 * Panel Store - lightweight registry of active dashboard panels.
 *
 * DashboardCanvas writes panel info here on every render.
 * The explore page reads it for @-mentionable resource listings.
 * Not reactive (no useSyncExternalStore) since resource listing is on-demand.
 */

export interface PanelEntry {
  id: string;
  componentName: string;
  title: string;
  queryId?: string;
}

let activePanels: PanelEntry[] = [];

/** Called by DashboardCanvas whenever panels change. */
export function syncActivePanels(panels: PanelEntry[]): void {
  activePanels = panels;
}

/** Read current panels (non-reactive, for resource listing). */
export function getActivePanels(): PanelEntry[] {
  return activePanels;
}
