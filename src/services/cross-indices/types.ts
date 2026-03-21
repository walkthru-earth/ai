/**
 * Shared types for cross-index definitions.
 */

export interface CrossIndexDefinition {
  id: string;
  name: string;
  description: string;
  datasets: string[];
  joinColumn: string;
  computedColumns: { name: string; formula: string }[];
  equivalentSQL: string;
  focusRegion: { name: string; lat: number; lng: number; zoom: number };
}

export interface CrossIndexInput {
  analysis: string;
}
