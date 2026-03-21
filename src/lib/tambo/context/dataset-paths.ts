/**
 * Dataset S3 paths for AI context — tells the LLM where data lives.
 * Edit this file when adding new datasets or changing path patterns.
 */

export { S3_BASE } from "@/services/datasets/types";

export const datasetPaths: Record<string, string> = {
  terrain: "dem-terrain/v2/h3/h3_res={1-10}/data.parquet",
  building: "indices/building/v2/h3/h3_res={3-8}/data.parquet",
  population: "indices/population/v2/scenario=SSP2/h3_res={1-8}/data.parquet",
  weather:
    "indices/weather/model=GraphCast_GFS/date=YYYY-MM-DD/hour={0,12}/h3_res={1-5}/data.parquet — " +
    "Each file = 5-day forecast (21 steps, 6-hourly). Use buildParquetUrl to resolve latest date. Never build future-date URLs.",
  places:
    "indices/places-index/v1/release={ver}/h3/h3_res={1-10}/data.parquet — " +
    "72M POIs, 13 categories (food, shopping, health, education, sports, etc.) + landmarks (restaurant, hospital, school, park). Use buildParquetUrl('places').",
  transportation:
    "indices/transportation-index/v1/release={ver}/h3/h3_res={1-10}/data.parquet — " +
    "343M segments. Road types (motorway→footway), rail, water, surface (paved/unpaved), bridges, tunnels. Use buildParquetUrl('transportation').",
  base:
    "indices/base-index/v1/release={ver}/h3/h3_res={1-10}/data.parquet — " +
    "Land use (park, recreation, protected, agriculture, residential), water (river, lake, ocean, stream, reservoir), " +
    "infrastructure (transit, pedestrian, barrier, power, water_infra). Use buildParquetUrl('base').",
  addresses:
    "indices/addresses-index/v1/release={ver}/h3/h3_res={1-10}/data.parquet — Address points. Use DESCRIBE to explore columns.",
  "buildings-overture":
    "indices/buildings-index/v1/release={ver}/h3/h3_res={1-10}/data.parquet — Overture buildings (different from Global Building Atlas). Use DESCRIBE.",
};
