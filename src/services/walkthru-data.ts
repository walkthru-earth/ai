/**
 * Walkthru Earth Data Service
 *
 * Provides tools for querying geospatial data from Walkthru Earth's
 * open Parquet datasets on S3 (weather, terrain, buildings, population).
 *
 * Uses hyparquet for browser-side Parquet parsing via Web Worker.
 */

/* ── Constants ───────────────────────────────────────────────────── */

export const S3_BUCKET = "https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop";
export const S3_BASE = `${S3_BUCKET}/walkthru-earth`;
const PROBE_BASE = "https://data.source.coop/walkthru-earth";
const WEATHER_BASE = `${S3_BASE}/indices/weather/model=GraphCast_GFS`;

/* ── Dataset catalog ─────────────────────────────────────────────── */

export interface DatasetInfo {
  id: string;
  name: string;
  description: string;
  columns: string[];
  urlPattern: string;
  h3ResRange: [number, number];
  defaultH3Res: number;
  category: "weather" | "terrain" | "building" | "population" | "cross-index";
}

export const DATASETS: DatasetInfo[] = [
  {
    id: "weather",
    name: "AI Weather Forecast (GraphCast)",
    description:
      "NOAA GraphCast AI weather forecasts with 21 timesteps. Temperature, wind, pressure, precipitation at 2m/10m height.",
    columns: [
      "h3_index",
      "timestamp",
      "temperature_2m_C",
      "wind_speed_10m_ms",
      "wind_direction_10m_deg",
      "pressure_msl_hPa",
      "precipitation_mm_6hr",
    ],
    urlPattern: `${WEATHER_BASE}/date={date}/hour={hour}/h3_res=5/data.parquet`,
    h3ResRange: [5, 5],
    defaultH3Res: 5,
    category: "weather",
  },
  {
    id: "terrain",
    name: "Global Terrain (GEDTM 30m)",
    description: "Global elevation, slope, aspect, and terrain ruggedness from GEDTM 30m DEM. 10.5 billion cells.",
    columns: ["h3_index", "elev", "slope", "aspect", "tri"],
    urlPattern: `${S3_BASE}/dem-terrain/v2/h3/h3_res={h3_res}/data.parquet`,
    h3ResRange: [1, 10],
    defaultH3Res: 3,
    category: "terrain",
  },
  {
    id: "building",
    name: "Global Building Atlas",
    description: "2.75 billion buildings worldwide. Count, density, height, volume, footprint, coverage per H3 cell.",
    columns: [
      "h3_index",
      "building_count",
      "building_density",
      "avg_height_m",
      "total_volume_m3",
      "total_footprint_m2",
      "avg_footprint_m2",
      "coverage_ratio",
    ],
    urlPattern: `${S3_BASE}/indices/building/v2/h3/h3_res={h3_res}/data.parquet`,
    h3ResRange: [3, 8],
    defaultH3Res: 5,
    category: "building",
  },
  {
    id: "population",
    name: "WorldPop SSP2 Population Projections",
    description: "Population estimates and projections for 2025, 2050, 2100 under SSP2 scenario.",
    columns: ["h3_index", "pop_2025", "pop_2050", "pop_2100"],
    urlPattern: `${S3_BASE}/indices/population/v2/scenario=SSP2/h3_res={h3_res}/data.parquet`,
    h3ResRange: [1, 8],
    defaultH3Res: 3,
    category: "population",
  },
];

/* ── Weather prefix resolution ───────────────────────────────────── */

let _weatherPrefixPromise: Promise<string> | null = null;

function recentDates(count = 7): string[] {
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export function resolveWeatherPrefix(): Promise<string> {
  if (_weatherPrefixPromise) return _weatherPrefixPromise;

  _weatherPrefixPromise = (async () => {
    const probe = async (date: string, hour: number): Promise<string | null> => {
      try {
        const probeUrl = `${PROBE_BASE}/indices/weather/model=GraphCast_GFS/date=${date}/hour=${hour}/h3_res=2/data.parquet`;
        const res = await fetch(probeUrl, { method: "HEAD" });
        return res.ok ? `${WEATHER_BASE}/date=${date}/hour=${hour}` : null;
      } catch {
        return null;
      }
    };

    const dates = recentDates(7);
    for (const date of dates) {
      const results = await Promise.all([probe(date, 12), probe(date, 0)]);
      const found = results.find(Boolean);
      if (found) return found;
    }
    // Fallback
    return `${WEATHER_BASE}/date=${dates[dates.length - 1]}/hour=0`;
  })();

  return _weatherPrefixPromise;
}

/* ── Tool: List available datasets ───────────────────────────────── */

export interface ListDatasetsInput {
  category?: string;
}

export async function listDatasets(input?: ListDatasetsInput): Promise<DatasetInfo[]> {
  if (input?.category) {
    return DATASETS.filter((d) => d.category === input.category);
  }
  return DATASETS;
}

/* ── Tool: Build a Parquet URL ───────────────────────────────────── */

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

export async function buildParquetUrl(input: BuildUrlInput): Promise<BuildUrlOutput> {
  const ds = DATASETS.find((d) => d.id === input.dataset);
  if (!ds) {
    throw new Error(`Unknown dataset: ${input.dataset}. Available: ${DATASETS.map((d) => d.id).join(", ")}`);
  }

  const h3Res = input.h3Res ?? ds.defaultH3Res;
  let url = ds.urlPattern.replace("{h3_res}", String(h3Res));

  if (ds.category === "weather") {
    const prefix = await resolveWeatherPrefix();
    const parts = prefix.split("/");
    const datePart = parts.find((p) => p.startsWith("date="))?.split("=")[1];
    const hourPart = parts.find((p) => p.startsWith("hour="))?.split("=")[1];
    url = url.replace("{date}", datePart ?? "latest").replace("{hour}", hourPart ?? "12");
  }

  const sql = `SELECT ${ds.columns.join(", ")}\nFROM '${url}'`;

  return { url, dataset: ds, h3Res, sql };
}

/* ── Tool: Describe a dataset ────────────────────────────────────── */

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

const COLUMN_DESCRIPTIONS: Record<string, string> = {
  h3_index: "H3 hexagonal cell identifier (BigInt)",
  timestamp: "Forecast timestamp (UTC)",
  temperature_2m_C: "Air temperature at 2 meters above ground (Celsius)",
  wind_speed_10m_ms: "Wind speed at 10 meters above ground (m/s)",
  wind_direction_10m_deg: "Wind direction at 10m (degrees, 0-360)",
  pressure_msl_hPa: "Mean sea level pressure (hectopascals)",
  precipitation_mm_6hr: "6-hour accumulated precipitation (mm)",
  elev: "Elevation above sea level (meters)",
  slope: "Terrain slope angle (degrees)",
  aspect: "Direction the slope faces (degrees, 0-360)",
  tri: "Terrain Ruggedness Index",
  building_count: "Number of buildings in H3 cell",
  building_density: "Buildings per square kilometer",
  avg_height_m: "Average building height (meters)",
  total_volume_m3: "Total building volume (cubic meters)",
  total_footprint_m2: "Total building footprint area (square meters)",
  avg_footprint_m2: "Average building footprint (square meters)",
  coverage_ratio: "Ground covered by buildings (0-1)",
  pop_2025: "Estimated population in 2025",
  pop_2050: "Projected population in 2050 (SSP2)",
  pop_2100: "Projected population in 2100 (SSP2)",
};

export async function describeDataset(input: DescribeDatasetInput): Promise<DatasetDescription> {
  const ds = DATASETS.find((d) => d.id === input.dataset);
  if (!ds) {
    throw new Error(`Unknown dataset: ${input.dataset}. Available: ${DATASETS.map((d) => d.id).join(", ")}`);
  }

  const { url, sql } = await buildParquetUrl({ dataset: ds.id });

  return {
    name: ds.name,
    description: ds.description,
    columns: ds.columns.map((c) => ({
      name: c,
      description: COLUMN_DESCRIPTIONS[c] ?? "No description available",
    })),
    category: ds.category,
    h3ResRange: ds.h3ResRange,
    sampleUrl: url,
    equivalentSQL: sql,
  };
}

/* ── Tool: Get cross-index analyses ──────────────────────────────── */

export interface CrossIndexInput {
  analysis:
    | "urban-density"
    | "housing-pressure"
    | "landslide-risk"
    | "vertical-living"
    | "population-growth"
    | "shrinking-cities";
}

export interface CrossIndexOutput {
  name: string;
  description: string;
  datasets: string[];
  joinColumn: string;
  computedColumns: { name: string; formula: string }[];
  equivalentSQL: string;
  focusRegion: { name: string; lat: number; lng: number; zoom: number };
}

const CROSS_INDICES: Record<string, CrossIndexOutput> = {
  "urban-density": {
    name: "Urban Density Index",
    description: "Buildings + population combined. Shows density of built environment relative to population.",
    datasets: ["building", "population"],
    joinColumn: "h3_index",
    computedColumns: [],
    equivalentSQL: `FROM building b JOIN population p USING (h3_index)\nSELECT b.h3_index, b.building_count, b.building_density, b.avg_height_m, p.pop_2025, p.pop_2050`,
    focusRegion: { name: "Nile Delta, Egypt", lat: 30.5, lng: 31.2, zoom: 4 },
  },
  "housing-pressure": {
    name: "Housing Pressure Index",
    description:
      "Population growth 2025-2100 cross-referenced with buildings per person. Identifies areas where population is outgrowing housing.",
    datasets: ["building", "population"],
    joinColumn: "h3_index",
    computedColumns: [
      { name: "growth_ratio", formula: "pop_2100 / pop_2025" },
      { name: "bldg_per_person", formula: "building_count / pop_2025" },
    ],
    equivalentSQL: `FROM population p LEFT JOIN building b USING (h3_index)\nSELECT p.h3_index, p.pop_2025, p.pop_2100,\n  p.pop_2100 / NULLIF(p.pop_2025, 0) AS growth_ratio,\n  b.building_count / NULLIF(p.pop_2025, 0) AS bldg_per_person\nWHERE p.pop_2025 >= 10`,
    focusRegion: {
      name: "Sub-Saharan Africa",
      lat: 0,
      lng: 25,
      zoom: 2.5,
    },
  },
  "landslide-risk": {
    name: "Buildings on Unstable Ground",
    description: "Terrain slope × building count. Highlights areas where buildings exist on steep terrain.",
    datasets: ["terrain", "building"],
    joinColumn: "h3_index",
    computedColumns: [],
    equivalentSQL: `FROM terrain t JOIN building b USING (h3_index)\nSELECT t.h3_index, t.elev, t.slope, t.tri, b.building_count, b.avg_height_m\nWHERE b.building_count > 0`,
    focusRegion: {
      name: "Himalayan Region",
      lat: 28,
      lng: 85,
      zoom: 3.5,
    },
  },
  "vertical-living": {
    name: "Vertical Living Index",
    description: "Buildings per person — reveals how vertically people live. High values = dense high-rises.",
    datasets: ["building", "population"],
    joinColumn: "h3_index",
    computedColumns: [{ name: "bldg_per_person", formula: "building_count / pop_2025" }],
    equivalentSQL: `FROM building b JOIN population p USING (h3_index)\nSELECT b.h3_index, b.building_count, b.avg_height_m, p.pop_2025,\n  b.building_count / p.pop_2025 AS bldg_per_person\nWHERE p.pop_2025 > 0 AND b.building_count > 0`,
    focusRegion: {
      name: "Pearl River Delta, China",
      lat: 22.5,
      lng: 114,
      zoom: 4,
    },
  },
  "population-growth": {
    name: "Population Growth 2025-2100",
    description: "Where population is projected to grow most under SSP2 scenario. Growth ratio = pop_2100 / pop_2025.",
    datasets: ["population"],
    joinColumn: "h3_index",
    computedColumns: [{ name: "growth_ratio", formula: "pop_2100 / pop_2025" }],
    equivalentSQL: `FROM population\nSELECT h3_index, pop_2025, pop_2050, pop_2100,\n  pop_2100 / NULLIF(pop_2025, 0) AS growth_ratio\nWHERE pop_2025 >= 10`,
    focusRegion: {
      name: "Sub-Saharan Africa",
      lat: 0,
      lng: 25,
      zoom: 2.5,
    },
  },
  "shrinking-cities": {
    name: "Shrinking Cities (Population Decline)",
    description: "Areas where population is projected to decline by 2100. Growth ratio < 1.",
    datasets: ["population"],
    joinColumn: "h3_index",
    computedColumns: [{ name: "growth_ratio", formula: "pop_2100 / pop_2025" }],
    equivalentSQL: `FROM population\nSELECT h3_index, pop_2025, pop_2100,\n  pop_2100 / NULLIF(pop_2025, 0) AS growth_ratio\nWHERE pop_2025 >= 10 AND pop_2100 < pop_2025`,
    focusRegion: { name: "East Asia", lat: 36, lng: 128, zoom: 3 },
  },
};

export async function getCrossIndex(input: CrossIndexInput): Promise<CrossIndexOutput> {
  const result = CROSS_INDICES[input.analysis];
  if (!result) {
    throw new Error(`Unknown analysis: ${input.analysis}. Available: ${Object.keys(CROSS_INDICES).join(", ")}`);
  }
  return result;
}

/* ── Tool: Suggest analysis from question ────────────────────────── */

export interface SuggestAnalysisInput {
  question: string;
}

export interface AnalysisSuggestion {
  suggestedDatasets: string[];
  suggestedCrossIndex: string | null;
  columns: string[];
  explanation: string;
  sampleSQL: string;
  focusRegion: { name: string; lat: number; lng: number; zoom: number } | null;
}

export async function suggestAnalysis(input: SuggestAnalysisInput): Promise<AnalysisSuggestion> {
  const q = input.question.toLowerCase();

  // Keyword matching for cross-indices
  if (q.includes("housing") || q.includes("pressure") || q.includes("overcrowd")) {
    const ci = CROSS_INDICES["housing-pressure"];
    return {
      suggestedDatasets: ci.datasets,
      suggestedCrossIndex: "housing-pressure",
      columns: ["h3_index", "pop_2025", "pop_2100", "building_count", "growth_ratio", "bldg_per_person"],
      explanation: ci.description,
      sampleSQL: ci.equivalentSQL,
      focusRegion: ci.focusRegion,
    };
  }

  if (q.includes("landslide") || q.includes("unstable") || q.includes("risk")) {
    const ci = CROSS_INDICES["landslide-risk"];
    return {
      suggestedDatasets: ci.datasets,
      suggestedCrossIndex: "landslide-risk",
      columns: ["h3_index", "slope", "tri", "building_count", "avg_height_m"],
      explanation: ci.description,
      sampleSQL: ci.equivalentSQL,
      focusRegion: ci.focusRegion,
    };
  }

  if (q.includes("vertical") || q.includes("highrise") || q.includes("high-rise") || q.includes("dense")) {
    const ci = CROSS_INDICES["vertical-living"];
    return {
      suggestedDatasets: ci.datasets,
      suggestedCrossIndex: "vertical-living",
      columns: ["h3_index", "building_count", "avg_height_m", "pop_2025", "bldg_per_person"],
      explanation: ci.description,
      sampleSQL: ci.equivalentSQL,
      focusRegion: ci.focusRegion,
    };
  }

  if (q.includes("shrink") || q.includes("decline") || q.includes("depopul")) {
    const ci = CROSS_INDICES["shrinking-cities"];
    return {
      suggestedDatasets: ci.datasets,
      suggestedCrossIndex: "shrinking-cities",
      columns: ["h3_index", "pop_2025", "pop_2100", "growth_ratio"],
      explanation: ci.description,
      sampleSQL: ci.equivalentSQL,
      focusRegion: ci.focusRegion,
    };
  }

  if (q.includes("growth") || q.includes("future") || q.includes("2100")) {
    const ci = CROSS_INDICES["population-growth"];
    return {
      suggestedDatasets: ci.datasets,
      suggestedCrossIndex: "population-growth",
      columns: ["h3_index", "pop_2025", "pop_2050", "pop_2100", "growth_ratio"],
      explanation: ci.description,
      sampleSQL: ci.equivalentSQL,
      focusRegion: ci.focusRegion,
    };
  }

  // Single-dataset suggestions
  if (
    q.includes("weather") ||
    q.includes("temperature") ||
    q.includes("wind") ||
    q.includes("rain") ||
    q.includes("precipitation") ||
    q.includes("pressure")
  ) {
    return {
      suggestedDatasets: ["weather"],
      suggestedCrossIndex: null,
      columns: DATASETS[0].columns,
      explanation:
        "AI weather forecast data from NOAA GraphCast model. Includes temperature, wind, pressure, and precipitation.",
      sampleSQL: `SELECT h3_index, temperature_2m_C, wind_speed_10m_ms, precipitation_mm_6hr\nFROM weather\nWHERE h3_res = 2`,
      focusRegion: null,
    };
  }

  if (
    q.includes("elevation") ||
    q.includes("terrain") ||
    q.includes("slope") ||
    q.includes("mountain") ||
    q.includes("rugged")
  ) {
    return {
      suggestedDatasets: ["terrain"],
      suggestedCrossIndex: null,
      columns: DATASETS[1].columns,
      explanation: "Global terrain data from GEDTM 30m. Elevation, slope, aspect, and terrain ruggedness.",
      sampleSQL: `SELECT h3_index, elev, slope, tri\nFROM terrain\nWHERE h3_res = 3`,
      focusRegion: {
        name: "Himalayas",
        lat: 28,
        lng: 85,
        zoom: 3.5,
      },
    };
  }

  if (q.includes("building") || q.includes("urban") || q.includes("city") || q.includes("construction")) {
    return {
      suggestedDatasets: ["building"],
      suggestedCrossIndex: null,
      columns: DATASETS[2].columns,
      explanation:
        "Global Building Atlas with 2.75 billion buildings. Count, density, height, volume, footprint per H3 cell.",
      sampleSQL: `SELECT h3_index, building_count, building_density, avg_height_m\nFROM building\nWHERE h3_res = 3`,
      focusRegion: {
        name: "Tokyo Metro",
        lat: 35.7,
        lng: 139.7,
        zoom: 4,
      },
    };
  }

  if (q.includes("population") || q.includes("people") || q.includes("demo")) {
    return {
      suggestedDatasets: ["population"],
      suggestedCrossIndex: null,
      columns: DATASETS[3].columns,
      explanation: "WorldPop SSP2 population projections for 2025, 2050, and 2100.",
      sampleSQL: `SELECT h3_index, pop_2025, pop_2050, pop_2100\nFROM population\nWHERE h3_res = 3`,
      focusRegion: null,
    };
  }

  // Default: return overview
  return {
    suggestedDatasets: DATASETS.map((d) => d.id),
    suggestedCrossIndex: null,
    columns: [],
    explanation:
      "I can help you explore 4 global datasets: AI Weather (GraphCast), Terrain (GEDTM 30m), Buildings (2.75B), and Population (SSP2 projections). Plus 6 cross-index analyses combining these datasets. What would you like to explore?",
    sampleSQL: "",
    focusRegion: null,
  };
}
