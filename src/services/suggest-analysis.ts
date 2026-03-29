/**
 * Natural language → dataset/cross-index routing via keyword matching.
 */

import { getSettings } from "@/lib/settings-store";
import { CROSS_INDEX_IDS, getCrossIndex } from "./cross-indices";
import { DATASETS } from "./datasets";

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

  // ── Cross-index routing (new composites first, then existing) ──

  if (q.includes("walkab") || q.includes("pedestrian") || q.includes("footway")) {
    const ci = await getCrossIndex({ analysis: "walkability" });
    return {
      suggestedDatasets: ci.datasets,
      suggestedCrossIndex: "walkability",
      columns: ["h3_index", "segment_count", "n_footway", "n_pedestrian", "n_motorway", "slope", "place_count"],
      explanation: ci.description,
      sampleSQL: ci.equivalentSQL,
      focusRegion: ci.focusRegion,
    };
  }

  if (q.includes("15 min") || q.includes("fifteen") || q.includes("15-min") || q.includes("amenity diversity")) {
    const ci = await getCrossIndex({ analysis: "fifteen-min-city" });
    return {
      suggestedDatasets: ci.datasets,
      suggestedCrossIndex: "fifteen-min-city",
      columns: ["h3_index", "place_count", "n_health_care", "n_education", "n_cycleway", "n_transit", "slope"],
      explanation: ci.description,
      sampleSQL: ci.equivalentSQL,
      focusRegion: ci.focusRegion,
    };
  }

  if (
    q.includes("biophilic") ||
    q.includes("nature per capita") ||
    q.includes("green per person") ||
    q.includes("nature access")
  ) {
    const ci = await getCrossIndex({ analysis: "biophilic" });
    return {
      suggestedDatasets: ci.datasets,
      suggestedCrossIndex: "biophilic",
      columns: ["h3_index", "n_lu_park", "n_lu_recreation", "water_count", "pop_2025"],
      explanation: ci.description,
      sampleSQL: ci.equivalentSQL,
      focusRegion: ci.focusRegion,
    };
  }

  if (q.includes("heat") || q.includes("heat island") || q.includes("urban heat") || q.includes("heat vulnerab")) {
    const ci = await getCrossIndex({ analysis: "heat-vulnerability" });
    return {
      suggestedDatasets: ci.datasets,
      suggestedCrossIndex: "heat-vulnerability",
      columns: ["h3_index", "total_volume_m3", "coverage_ratio", "n_paved", "temperature_2m_C", "wind_speed_10m_ms"],
      explanation: ci.description,
      sampleSQL: ci.equivalentSQL,
      focusRegion: ci.focusRegion,
    };
  }

  if (
    q.includes("water security") ||
    q.includes("water supply") ||
    q.includes("drought") ||
    q.includes("water scarcity")
  ) {
    const ci = await getCrossIndex({ analysis: "water-security" });
    return {
      suggestedDatasets: ci.datasets,
      suggestedCrossIndex: "water-security",
      columns: ["h3_index", "water_count", "n_water_infra", "precipitation_mm_6hr", "coverage_ratio", "pop_2025"],
      explanation: ci.description,
      sampleSQL: ci.equivalentSQL,
      focusRegion: ci.focusRegion,
    };
  }

  if (q.includes("housing") || q.includes("pressure") || q.includes("overcrowd")) {
    const ci = await getCrossIndex({ analysis: "housing-pressure" });
    return {
      suggestedDatasets: ci.datasets,
      suggestedCrossIndex: "housing-pressure",
      columns: ["h3_index", "pop_2025", "pop_2100", "building_count", "growth_ratio", "bldg_per_person"],
      explanation: ci.description,
      sampleSQL: ci.equivalentSQL,
      focusRegion: ci.focusRegion,
    };
  }

  if (q.includes("landslide") || q.includes("unstable") || (q.includes("risk") && q.includes("terrain"))) {
    const ci = await getCrossIndex({ analysis: "landslide-risk" });
    return {
      suggestedDatasets: ci.datasets,
      suggestedCrossIndex: "landslide-risk",
      columns: ["h3_index", "slope", "tri", "building_count", "avg_height_m"],
      explanation: ci.description,
      sampleSQL: ci.equivalentSQL,
      focusRegion: ci.focusRegion,
    };
  }

  if (q.includes("vertical") || q.includes("highrise") || q.includes("high-rise")) {
    const ci = await getCrossIndex({ analysis: "vertical-living" });
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
    const ci = await getCrossIndex({ analysis: "shrinking-cities" });
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
    const ci = await getCrossIndex({ analysis: "population-growth" });
    return {
      suggestedDatasets: ci.datasets,
      suggestedCrossIndex: "population-growth",
      columns: ["h3_index", "pop_2025", "pop_2050", "pop_2100", "growth_ratio"],
      explanation: ci.description,
      sampleSQL: ci.equivalentSQL,
      focusRegion: ci.focusRegion,
    };
  }

  // ── Single dataset routing (including new Overture datasets) ──

  if (
    q.includes("restaurant") ||
    q.includes("cafe") ||
    q.includes("gym") ||
    q.includes("poi") ||
    q.includes("amenity") ||
    q.includes("amenities") ||
    q.includes("places") ||
    q.includes("shop") ||
    q.includes("hospital") ||
    q.includes("school") ||
    q.includes("park") ||
    q.includes("hotel") ||
    q.includes("entertainment") ||
    q.includes("nightlife") ||
    q.includes("cinema") ||
    q.includes("supermarket") ||
    q.includes("pharmacy") ||
    q.includes("clinic") ||
    q.includes("library") ||
    q.includes("museum") ||
    q.includes("theater")
  ) {
    const ds = DATASETS.find((d) => d.id === "places")!;
    return {
      suggestedDatasets: ["places"],
      suggestedCrossIndex: null,
      columns: ds.columns,
      explanation:
        "Overture Places Index - 72M POIs across 13 categories. Includes restaurants, gyms, shops, hospitals, schools, parks, and more.",
      sampleSQL: `SELECT h3_index, h3_h3_to_string(h3_index) AS hex,\n  place_count, n_food_and_drink, n_shopping, n_health_care, n_lifestyle_services AS value\nFROM places\nLIMIT ${getSettings().queryLimit}`,
      focusRegion: null,
    };
  }

  if (
    q.includes("road") ||
    q.includes("transport") ||
    q.includes("highway") ||
    q.includes("cycling") ||
    q.includes("bike") ||
    q.includes("rail") ||
    q.includes("infrastructure") ||
    q.includes("paved")
  ) {
    const ds = DATASETS.find((d) => d.id === "transportation")!;
    return {
      suggestedDatasets: ["transportation"],
      suggestedCrossIndex: null,
      columns: ds.columns,
      explanation: "Overture Transportation Index - 343M road, rail, and water segments with detailed type breakdown.",
      sampleSQL: `SELECT h3_index, h3_h3_to_string(h3_index) AS hex,\n  segment_count AS value, n_road, n_rail, n_paved, n_unpaved\nFROM transportation\nLIMIT ${getSettings().queryLimit}`,
      focusRegion: null,
    };
  }

  if (
    q.includes("land use") ||
    q.includes("water bod") ||
    q.includes("river") ||
    q.includes("lake") ||
    q.includes("barrier") ||
    q.includes("transit stop") ||
    q.includes("base environment")
  ) {
    const ds = DATASETS.find((d) => d.id === "base")!;
    return {
      suggestedDatasets: ["base"],
      suggestedCrossIndex: null,
      columns: ds.columns,
      explanation: "Overture Base Environment Index - land use, water bodies, and infrastructure types.",
      sampleSQL: `SELECT h3_index, h3_h3_to_string(h3_index) AS hex,\n  infra_count AS value, water_count, n_lu_park, n_lu_residential\nFROM base\nLIMIT ${getSettings().queryLimit}`,
      focusRegion: null,
    };
  }

  if (
    q.includes("weather") ||
    q.includes("temperature") ||
    q.includes("wind") ||
    q.includes("rain") ||
    q.includes("precipitation") ||
    q.includes("pressure")
  ) {
    const ds = DATASETS.find((d) => d.id === "weather")!;
    return {
      suggestedDatasets: ["weather"],
      suggestedCrossIndex: null,
      columns: ds.columns,
      explanation:
        "AI weather forecast data from NOAA GraphCast model. Use buildParquetUrl('weather') to resolve latest date.",
      sampleSQL:
        "SELECT h3_index, temperature_2m_C, wind_speed_10m_ms, precipitation_mm_6hr\nFROM weather\nWHERE h3_res = 2",
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
      columns: DATASETS.find((d) => d.id === "terrain")!.columns,
      explanation: "Global terrain data from GEDTM 30m. Elevation, slope, aspect, and terrain ruggedness.",
      sampleSQL: "SELECT h3_index, elev, slope, tri\nFROM terrain\nWHERE h3_res = 3",
      focusRegion: { name: "Himalayas", lat: 28, lng: 85, zoom: 3.5 },
    };
  }

  if (
    q.includes("residential") ||
    q.includes("commercial") ||
    q.includes("apartment") ||
    q.includes("mosque") ||
    q.includes("church") ||
    q.includes("warehouse") ||
    q.includes("factory") ||
    q.includes("building type") ||
    q.includes("building class") ||
    q.includes("building use") ||
    q.includes("religious building") ||
    q.includes("industrial building")
  ) {
    const ds = DATASETS.find((d) => d.id === "buildings-overture")!;
    return {
      suggestedDatasets: ["buildings-overture"],
      suggestedCrossIndex: null,
      columns: ds.columns,
      explanation:
        "Overture Buildings Index - building classification by use (residential, commercial, industrial, civic, education, medical, religious) " +
        "and subtype (house, apartments, retail, office, school, mosque, church, hospital, factory, etc.).",
      sampleSQL: `SELECT h3_index, h3_h3_to_string(h3_index) AS hex,\n  building_count AS value, n_residential, n_commercial, n_apartments, n_mosque, n_church\nFROM buildings_overture\nLIMIT ${getSettings().queryLimit}`,
      focusRegion: null,
    };
  }

  if (q.includes("building") || q.includes("urban") || q.includes("city") || q.includes("construction")) {
    return {
      suggestedDatasets: ["building", "buildings-overture"],
      suggestedCrossIndex: null,
      columns: DATASETS.find((d) => d.id === "building")!.columns,
      explanation:
        "Two building datasets: Global Building Atlas (morphology: density, volume, footprint) and " +
        "Overture Buildings Index (classification: residential, commercial, industrial types). JOIN on h3_index for full picture.",
      sampleSQL: "SELECT h3_index, building_count, building_density, avg_height_m\nFROM building\nWHERE h3_res = 3",
      focusRegion: { name: "Tokyo Metro", lat: 35.7, lng: 139.7, zoom: 4 },
    };
  }

  if (q.includes("population") || q.includes("people") || q.includes("demo")) {
    return {
      suggestedDatasets: ["population"],
      suggestedCrossIndex: null,
      columns: DATASETS.find((d) => d.id === "population")!.columns,
      explanation: "WorldPop SSP2 population projections for 2025, 2050, and 2100.",
      sampleSQL: "SELECT h3_index, pop_2025, pop_2050, pop_2100\nFROM population\nWHERE h3_res = 3",
      focusRegion: null,
    };
  }

  // ── Default: return overview ──
  return {
    suggestedDatasets: DATASETS.map((d) => d.id),
    suggestedCrossIndex: null,
    columns: [],
    explanation:
      `I can help you explore ${DATASETS.length} global datasets (weather, terrain, buildings, population, and 5 Overture Maps indices) ` +
      `plus ${CROSS_INDEX_IDS.length} cross-index analyses. What would you like to explore?`,
    sampleSQL: "",
    focusRegion: null,
  };
}
