/**
 * Shared types and constants for dataset definitions.
 */

export const S3_BASE = "https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop/walkthru-earth";

export type DatasetCategory = "weather" | "terrain" | "building" | "population" | "overture";

export interface DatasetDefinition {
  id: string;
  name: string;
  description: string;
  columns: string[];
  columnDescriptions: Record<string, string>;
  urlPattern: string;
  h3ResRange: [number, number];
  defaultH3Res: number;
  category: DatasetCategory;
}

/** Output from listDatasets - same as DatasetDefinition but without columnDescriptions for token efficiency. */
export interface DatasetInfo {
  id: string;
  name: string;
  description: string;
  columns: string[];
  urlPattern: string;
  h3ResRange: [number, number];
  defaultH3Res: number;
  category: DatasetCategory;
}

export interface BuildUrlInput {
  dataset: string;
  h3Res?: number;
}

export interface BuildUrlOutput {
  url: string;
  dataset: DatasetInfo;
  h3Res: number;
  sql: string;
}

export interface DescribeDatasetInput {
  dataset: string;
}

export interface DatasetDescription {
  name: string;
  description: string;
  columns: { name: string; description: string }[];
  category: string;
  h3ResRange: [number, number];
  sampleUrl: string;
  equivalentSQL: string;
}
