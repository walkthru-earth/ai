/**
 * Component usage tips for AI context - guides the LLM on how to use each component effectively.
 * Edit this file when adding new components or discovering better patterns.
 * queryLimit is read from settings store at message-send time.
 */

export function buildComponentTips(queryLimit: number): string[] {
  return [
    // Data flow
    "ALL viz components use queryId from runSQL, ZERO token cost for data. Never pass inline data arrays.",

    // Map layers
    "H3Map: queryId + hexColumn='hex' + valueColumn='value' + lat/lng/zoom + colorMetric. deck.gl renders from hex strings.",
    "A5: column 'pentagon' auto-detects layerType=a5. See DuckDB notes for A5 SQL patterns.",

    // Spatial SQL patterns (auto-rendering handled by DuckDB notes)
    "SPATIAL SQL PATTERNS: " +
      "(1) Buffer: SELECT * REPLACE (ST_Buffer(geom, 1000) AS geom) FROM ... (1km buffer, auto-renders as polygons). " +
      "(2) Point-in-polygon: SELECT * FROM points p, polygons z WHERE ST_Contains(z.geom, p.geom). " +
      "(3) Spatial join: SELECT a.*, b.name FROM a JOIN b ON ST_Intersects(a.geom, b.geom). " +
      "(4) Nearest: SELECT * FROM points ORDER BY ST_Distance(geom, ST_Point(lng, lat)) LIMIT 10. " +
      "(5) Bbox filter (fast): WHERE geom && ST_MakeEnvelope(w, s, e, n), uses Parquet row group stats. " +
      "(6) Distance: ST_Distance_Spheroid(a, b) for meters. ST_Area_Spheroid(geom) for m². " +
      "(7) Transform CRS: ST_Transform(geom, 'EPSG:4326', 'EPSG:3857'). " +
      "All spatial results auto-render. Just pass queryId to GeoMap.",

    // Graph
    "Graph: queryId + xColumn + yColumns + chartType (bar/line/area/pie). " +
      "ALWAYS set xLabel and yLabel to explain axes (e.g. xLabel='Rank', yLabel='Population'). " +
      "Use 'area' for filled line charts. Y-axis auto-formats large numbers (e.g. 5000 → '5k').",
    "CHART X-AXIS RULE: NEVER use raw H3 hex IDs as chart labels. They are meaningless to users. " +
      "Instead, create meaningful labels in the SQL query: " +
      "Use CASE/WHEN to bucket values (e.g. '0-1000m', '1000-3000m'), " +
      "use NTILE or ROUND for numeric ranges, " +
      "use ROW_NUMBER() for rank labels (e.g. 'Rank 1', 'Rank 2'), " +
      "or GROUP BY a meaningful column. " +
      "Example: SELECT CASE WHEN elev < 1000 THEN '0-1k' WHEN elev < 3000 THEN '1k-3k' ELSE '3k+' END AS label, COUNT(*) AS count ... GROUP BY label",

    // DataTable
    "DataTable: queryId only (auto-derives columns/rows). Optional: visibleColumns to limit columns shown.",

    // Cross-filtering
    "Cross-filtering: zooming/panning the map filters Graph and DataTable to only show visible hexes.",
    "IMPORTANT: Reuse the SAME queryId across H3Map + Graph + DataTable for linked cross-filtering. " +
      "Include 'hex' column in the query so spatial filtering works. " +
      "Example: run ONE query with hex + value + other columns, then pass the same queryId to all 3 components.",
    "For charts linked with maps via cross-filter, 'hex' can be in the query for filtering but use a DIFFERENT column as xColumn (not hex). " +
      "If no meaningful label column exists, add one in SQL: ROW_NUMBER() OVER (ORDER BY value DESC) as rank, then use xColumn='rank'.",

    // Cross-dataset analysis patterns
    "CROSS-DATASET ANALYSIS PATTERNS (join rules in DuckDB notes): " +
      "Urban density: building JOIN population → bldg_per_person, coverage_ratio vs pop_density. " +
      "Housing pressure: population growth (pop_2100/pop_2025) vs building count → where is housing falling behind? " +
      "Terrain risk: terrain (slope, tri) JOIN building → buildings on steep ground. " +
      "Weather exposure: weather (wind, precip) JOIN building (height, density) → wind exposure index. " +
      "Population timeline: UNPIVOT population wide format → line chart of pop_2025..pop_2100. " +
      "All use same pattern: WITH cells AS (h3_grid_disk neighborhood) → JOIN all files USING (h3_index).",

    // Overture cross-indices
    "OVERTURE CROSS-INDICES: call getCrossIndex(analysis) for signal breakdowns, weights, and SQL templates. " +
      "Available: walkability, fifteen-min-city, biophilic, heat-vulnerability, water-security, plus 6 more.",

    // TimeSlider
    "TimeSlider: queryId + timestampColumn (default 'time_label'). " +
      "Cross-filters GeoMap (spatial snapshot at selected time) and shows ReferenceLine on Graph. " +
      "Pass the AREA query queryId (all cells × all timestamps). Timezone auto-converted to user's local time.",

    // Weather forecast pattern
    "WEATHER FORECAST WITH TIME SLIDER (MANDATORY pattern): " +
      "STEP 0: Call buildParquetUrl('weather') to get the URL. " +
      "Each file has 21 timestamps (5-day, 6-hourly). For ANY weather query: " +
      "STEP 1 - AREA query (all cells × all 21 timestamps, for GeoMap + TimeSlider): " +
      `SELECT h3_h3_to_string(w.h3_index) AS hex, strftime(CAST(w.timestamp AS TIMESTAMP), '%b %d %H:%M') AS time_label, ` +
      "w.temperature_2m_C AS temp_c, " +
      "CASE WHEN w.precipitation_mm_6hr >= 0.1 THEN ROUND(w.precipitation_mm_6hr, 2) ELSE NULL END AS precip_mm, " +
      "w.wind_speed_10m_ms AS wind_ms, w.wind_direction_10m_deg AS wind_dir " +
      "FROM url w WHERE w.h3_index IN (SELECT unnest(h3_grid_disk(h3_latlng_to_cell(LAT, LNG, 5)::BIGINT, 4))::BIGINT) " +
      `ORDER BY w.timestamp, w.h3_index LIMIT {queryLimit}. ` +
      "STEP 2 - TIMELINE query (single center cell × all timestamps, for Graph + DataTable): " +
      `SELECT strftime(CAST(timestamp AS TIMESTAMP), '%b %d %H:%M') AS time_label, ` +
      "temperature_2m_C AS temp_c, " +
      "CASE WHEN precipitation_mm_6hr >= 0.1 THEN ROUND(precipitation_mm_6hr, 2) ELSE 0 END AS precip_mm, " +
      "wind_speed_10m_ms AS wind_ms, wind_direction_10m_deg AS wind_dir, pressure_msl_hPa AS pressure " +
      "FROM url WHERE h3_index = h3_latlng_to_cell(LAT, LNG, 5)::BIGINT ORDER BY timestamp LIMIT 21. " +
      "STEP 3 - RENDER ALL 4 COMPONENTS IN ONE RESPONSE (do NOT stop after the map): " +
      "(1) GeoMap with layers array, 3 layers ALL sharing the AREA queryId: " +
      "layer 'temp' (valueColumn='temp_c', colorScheme='warm', colorMetric='Temperature °C'), " +
      "layer 'precip' (valueColumn='precip_mm', colorScheme='cool', colorMetric='Precipitation mm/6hr'), " +
      "layer 'wind' (valueColumn='wind_ms', colorScheme='viridis', colorMetric='Wind Speed m/s'). " +
      "(2) TimeSlider with AREA queryId, timestampColumn='time_label'. " +
      "(3) Graph - MANDATORY, NEVER SKIP: chartType='line', queryId from TIMELINE query, " +
      "xColumn='time_label', yColumns=['temp_c','precip_mm','wind_ms'], " +
      "xLabel='Time (UTC)', yLabel='Temp (°C) / Precip (mm) / Wind (m/s)'. " +
      "(4) DataTable with TIMELINE queryId. " +
      "The Graph is CRITICAL. Users expect to see the 5-day forecast as a timeline chart. " +
      "ONLY use columns listed in the DuckDB weather note. Do NOT invent columns like relative_humidity or dewpoint. " +
      "The TimeSlider cross-filters the map (spatial snapshot at selected time) and marks a reference line on the Graph. " +
      "For A5 weather: compute A5 cells from H3 centroids (see grid rule).",

    // Smart defaults
    "SMART DEFAULTS: For 'my location' queries, use the pre-computed h3Cells from context. Never compute or hardcode. " +
      "For maps: zoom 11-12 for neighborhood, 8-9 for city, 4-5 for region. " +
      "For area queries: h3_grid_disk radius 2-3 for tight neighborhood, 5-8 for wider area. " +
      "Include h3_cell_to_lat/h3_cell_to_lng in queries when components need coordinates for positioning.",
  ];
}
