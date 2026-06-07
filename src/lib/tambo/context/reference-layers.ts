/**
 * Reverse-geocode reference layers for AI context.
 *
 * The H3 datasets (weather, terrain, population, etc.) have NO place names, only H3 cells.
 * To answer "which countries/cities is it above 40C now" style questions, the AI joins a
 * cell-level result to one of these public reference layers. Both are CORS-enabled and read
 * directly by DuckDB-WASM over httpfs. Token cost stays near zero because the join output goes
 * through the queryId pattern (only the queryId + 3 sample rows ever reach the LLM).
 */

/** Public country-boundaries GeoJSON. Property holding the name is `name` (NOT `ADMIN`). */
export const COUNTRIES_GEOJSON_URL =
  "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson";

/** World cities parquet: columns city, country_code, country, lat, lon, population (33k rows). */
export const WORLD_CITIES_URL =
  "https://raw.githubusercontent.com/tabaqatdev/gdelt-cng/refs/heads/main/data_helpers/world_cities.parquet";

export function buildReferenceLayerTips(queryLimit: number): string[] {
  return [
    "PLACE-NAMING (reverse geocode): H3 datasets have NO country/city names. To answer 'which " +
      "countries/cities have <metric> above/below X' questions, first filter the H3 dataset to the cells " +
      "of interest, derive coordinates, then join a reference layer. Results flow through queryId, so this " +
      "stays token-cheap. Two layers, both read directly over httpfs:",

    "COUNTRY ATTRIBUTION (use H3 res 3 for global scans to stay light, res 4-5 for a single region). " +
      `Reference: read_json_auto('${COUNTRIES_GEOJSON_URL}'), name field is f.properties.name. Pattern: ` +
      "WITH hot AS (SELECT h3_h3_to_string(h3_index) AS hex, temperature_2m_C AS value, " +
      "h3_cell_to_lat(h3_index) AS lat, h3_cell_to_lng(h3_index) AS lng FROM '<weather_url>' " +
      "WHERE timestamp = (SELECT MAX(timestamp) FROM '<weather_url>') AND temperature_2m_C > 40), " +
      "countries AS (SELECT f.properties.name AS country, ST_GeomFromGeoJSON(to_json(f.geometry)) AS geom " +
      `FROM (SELECT unnest(features) AS f FROM read_json_auto('${COUNTRIES_GEOJSON_URL}'))) ` +
      "SELECT c.country, COUNT(*) AS hot_cells, ROUND(MAX(h.value),1) AS peak_value, ROUND(AVG(h.value),1) AS avg_value " +
      "FROM hot h JOIN countries c ON ST_Contains(c.geom, ST_Point(h.lng, h.lat)) " +
      `GROUP BY ALL ORDER BY peak_value DESC LIMIT ${queryLimit}. ` +
      "Render the country result as a DataTable plus a bar Graph (xColumn='country', yColumns=['peak_value']).",

    "CITY NAMING (name the actual cities, not just countries). " +
      `Reference: '${WORLD_CITIES_URL}' (columns city, country_code, country, lat, lon, population). ` +
      "CRITICAL: the city's H3 resolution MUST match the weather file's resolution, compute " +
      "h3_latlng_to_cell(lat, lon, <SAME res as the weather url>)::BIGINT and join on h3_index. Pattern: " +
      "WITH hot AS (SELECT h3_index, temperature_2m_C AS value FROM '<weather_url res 4>' " +
      "WHERE timestamp = (SELECT MAX(timestamp) FROM '<weather_url>') AND temperature_2m_C > 40), " +
      "cities AS (SELECT city, country_code, population, h3_latlng_to_cell(lat, lon, 4)::BIGINT AS h3_index " +
      `FROM '${WORLD_CITIES_URL}' WHERE population > 100000) ` +
      "SELECT c.city, c.country_code, c.population, ROUND(h.value,1) AS temp_c, " +
      "h3_cell_to_lat(h.h3_index) AS lat, h3_cell_to_lng(h.h3_index) AS lng " +
      `FROM cities c JOIN hot h USING (h3_index) ORDER BY temp_c DESC LIMIT ${queryLimit}. ` +
      "The result already has lat/lng, render a scatterplot GeoMap plus a DataTable. " +
      "Raise the population floor (e.g. > 500000) to keep the list to major cities only.",

    "GENERALIZES to ANY H3 dataset and ANY metric, swap the file and the WHERE clause: coldest places " +
      "(temperature_2m_C < X), heaviest rain (precipitation_mm_6hr), windiest (wind_speed_10m_ms), most " +
      "populous (pop_2025), highest terrain (elev), densest buildings (count). Keep the join layer the same. " +
      "'now' for weather = the latest timestamp in the file (the file is a 5-day forecast), use MAX(timestamp).",
  ];
}
