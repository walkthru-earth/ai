/**
 * DuckDB v1.5 WASM technical rules — sent as AI context.
 * Edit this file when DuckDB version changes or new rules are discovered.
 * queryLimit is read from settings store at message-send time.
 */

export function buildDuckdbWasmNotes(queryLimit: number): string[] {
  return [
    `DuckDB v1.5. H3, A5, spatial, httpfs pre-loaded. NO INSTALL/LOAD. ONE statement. LIMIT ${queryLimit}. HTTPS URLs in FROM.`,
    "Geometry: SELECT * from Parquet with GEOMETRY → auto-renders on map. lat/lng are SYNTHETIC — never select them in follow-ups. Use SELECT * EXCLUDE (col).",
    "H3: h3_index BIGINT. Maps: h3_h3_to_string(h3_index) AS hex. h3_cell_to_lat()/h3_cell_to_lng() → DOUBLE (preferred). h3_grid_ring/h3_grid_disk (NOT h3_k_ring).",
    "A5 FUNCTIONS (exact names — no others exist): " +
      "a5_lonlat_to_cell(lng, lat, res) → UBIGINT (lng FIRST!). " +
      "a5_cell_to_lonlat(cell) → DOUBLE[2] [lon, lat]. a5_cell_to_boundary(cell). a5_cell_to_children(cell, res). a5_cell_area(res). " +
      "a5_hex_to_u64(hex_string) → UBIGINT (NOT a5_hex_to_cell — that does NOT exist). " +
      "a5_u64_to_hex(cell) → VARCHAR. printf('%x', cell) also works for hex output. " +
      "When computing lat/lng from A5 cells, keep the raw BIGINT cell for a5_cell_to_lonlat — do NOT re-parse from hex string.",
    "v1.5: GEOMETRY core type. TRY_CAST(x AS GEOMETRY) broken → TRY(ST_GeomFromText(x)). Lambda: lambda x: x + 1 (NOT x -> x + 1). " +
      "WASM LIMITATION: DuckDB-WASM can't serialize GEOMETRY to Arrow (issue #2187). The system auto-handles this by converting to WKB — just use SELECT * with a geometry column.",
    "Spatial: ST_Buffer/ST_Contains/ST_Intersects/ST_DWithin auto-render. ST_Distance_Spheroid(a,b) → meters. geom && ST_MakeEnvelope(w,s,e,n) for bbox pushdown.",
    "CRITICAL: queryId (qr_N) is a CLIENT-SIDE store ID — FROM qr_1 WILL ALWAYS FAIL with 'Table not found'. " +
      "To derive new data from previous results: include ALL needed columns in the ORIGINAL query, or re-run the full SQL with modifications. " +
      "NEVER write SELECT ... FROM qr_N — it does not exist in DuckDB. " +
      "Timestamp math: CAST(ts AS TIMESTAMP) + INTERVAL '72 hours' (WASM has no ICU — TIMESTAMPTZ + INTERVAL fails). " +
      "CAST(TIMESTAMP AS BIGINT) FAILS — use epoch(ts) for seconds or CAST(ts AS VARCHAR) for display.",
    "Weather: 5-day/21-step forecast. MUST call buildParquetUrl('weather') FIRST — NEVER guess the URL (date changes daily, guessing WILL 404). " +
      "PRECIPITATION SMART FILTER: For the MAP layer, use CASE WHEN precipitation_mm_6hr >= 0.1 THEN ROUND(precipitation_mm_6hr, 2) ELSE NULL END — " +
      "NULL values don't render on the hex map, so only meaningful rain shows up (< 0.1mm is noise). " +
      "For the CHART timeline, use 0 instead of NULL so the line stays continuous. " +
      "Format: strftime(CAST(timestamp AS TIMESTAMP), '%b %d %H:%M') AS time_label. " +
      "TIMEZONE: Weather timestamps are UTC. TimeSlider component auto-converts UTC to user's local timezone for display. " +
      "In SQL, just output UTC time_label — no timezone conversion needed (DuckDB WASM has no ICU). " +
      "COLUMNS (exhaustive — NO others exist): h3_index, timestamp, temperature_2m_C, temperature_850hPa_C, temp_diff_850hPa_2m_C, " +
      "wind_speed_10m_ms, wind_direction_10m_deg, wind_speed_850hPa_ms, wind_direction_850hPa_deg, " +
      "wind_u/v_10m_ms, wind_u/v_850hPa_ms, wind_shear_magnitude_ms, wind_shear_direction_deg, " +
      "specific_humidity_gkg, moisture_flux_u/v/magnitude, pressure_msl_hPa, precipitation_mm_6hr, " +
      "vertical_velocity_500hPa_Pas, geopotential_500hPa_m, geopotential_anomaly_500hPa_m. " +
      "NO relative_humidity, NO dewpoint, NO cloud_cover exist.",
    "Grid rule: use H3 when user asks H3, A5 when user asks A5. " +
      "ALL datasets are H3-indexed — when user asks for A5, compute A5 cells from H3 centroids: " +
      "SELECT printf('%x', a5_lonlat_to_cell(h3_cell_to_lng(h3_index), h3_cell_to_lat(h3_index), res)) AS pentagon, " +
      "<metric> AS value, h3_cell_to_lat(h3_index) AS lat, h3_cell_to_lng(h3_index) AS lng FROM ... " +
      "Column named 'pentagon' auto-detects layerType=a5. Do NOT output 'hex' column when user asks A5. " +
      "A5 RESOLUTION for H3-derived data: A5 res must be COARSER than or equal to H3 source to avoid gaps. " +
      "H3 res 3 → A5 res 5-6. H3 res 4 → A5 res 6-7. H3 res 5 → A5 res 7-8. " +
      "Too-fine A5 (e.g. res 9 from H3 res 5) creates sparse pentagons with visible gaps. " +
      "When multiple H3 cells map to the same A5 cell, GROUP BY a5_cell and AVG/SUM the metrics. " +
      "Keep raw BIGINT a5_cell in CTE for a5_cell_to_lonlat(), only printf('%x', a5_cell) AS pentagon in final SELECT.",
    "GeoJSON/WFS/ArcGIS: read_json_auto returns STRUCTs. URL must be CORS-enabled. " +
      "ALWAYS add maximum_object_size=10485760 to read_json_auto for remote JSON (prevents truncation). " +
      "ArcGIS TOOL ROUTING (TOKEN-EFFICIENT): " +
      "(1) ANY ArcGIS URL → call exploreArcGISService. It auto-detects URL level AND auto-loads data. " +
      "(2) If response has layer.queryId → data is ALREADY queried. Render GeoMap + DataTable with that queryId IMMEDIATELY — NO runSQL call needed. " +
      "(3) If response has layerList (multi-layer service) → present layers, call describeArcGISLayer for the chosen one — it also returns queryId. " +
      "(4) Catalog level returns serviceNames + categories — present summary, use baseUrl + name to construct service URLs. Do NOT make multiple search calls. " +
      "(5) For custom queries on loaded ArcGIS data, use localPath from the layer response with runSQL: " +
      "WITH fc AS (SELECT unnest(features) AS f FROM read_json_auto(localPath)) SELECT f.properties.FIELD AS alias, ... FROM fc. " +
      "ArcGIS SQL RULES: " +
      "(a) NEVER use SQL comments (-- or /* */) in runSQL — they cause WASM parse errors. " +
      "(b) Geometry auto-detection generates synthetic lat/lng — do NOT manually extract coordinates. " +
      "(c) codedValueDomains field lists coded fields — decode with CASE WHEN or LEFT JOIN. " +
      "For large ArcGIS layers: paginate with read_json_auto([url || '&resultOffset=' || x FOR x IN generate_series(0, total, pageSize)]). " +
      "CRITICAL: use %2A not * for outFields — DuckDB treats * as glob and errors. " +
      "WFS: append ?service=WFS&version=1.1.0&request=GetFeature&typeName=layer&outputFormat=application/json. " +
      "Plain GeoJSON: use URL directly. ALL return FeatureCollections — same Pattern A/B applies. " +
      "PATTERN A (map + all columns): " +
      `WITH fc AS (SELECT unnest(features) AS f FROM read_json_auto('url')) SELECT f.id AS feature_id, unnest(f.properties), ST_GeomFromGeoJSON(to_json(f.geometry)) AS geometry FROM fc LIMIT ${queryLimit}. ` +
      "PATTERN B (aggregation — NO unnest, NO geometry): " +
      "WITH fc AS (SELECT unnest(features) AS f FROM read_json_auto('url')) " +
      "SELECT f.properties.field AS alias, AVG(f.properties.metric) AS avg_val, COUNT(*) AS n FROM fc GROUP BY ALL. " +
      "RULES: (1) NEVER use ->>'$...' JSON path on structs (WASM error). (2) NEVER use f.properties.* (parser error). " +
      "(3) unnest(f.properties) ONLY as a bare SELECT column — never inside CAST/CASE/expressions. " +
      "(4) For GROUP BY / ORDER BY: use f.properties.field dot notation. " +
      "(5) Struct fields keep their original types — if interval_start is TIMESTAMP, use strftime() to format it, " +
      "never CAST(TIMESTAMP AS BIGINT). Use epoch(ts) for numeric seconds.",
    "OOM PREVENTION (~3GB WASM limit): NEVER SELECT * into CTEs on large files (weather res5=42M rows). " +
      "Push WHERE h3_index=X directly into the Parquet scan for predicate pushdown. Only SELECT needed columns. " +
      "For multi-file comparisons: filter each file BEFORE joining. Prefer res 3-4 for area/map queries.",
    "CROSS-DATASET: All datasets share h3_index — joins trivial BUT resolutions MUST match across all files. " +
      "Shared range: res 3-5. UNPIVOT population for time-series charts. " +
      "Use h3_cell_to_lat/lng to derive coordinates from h3_index directly.",
  ];
}
