/**
 * Component usage tips for AI context — guides the LLM on how to use each component effectively.
 * Edit this file when adding new components or discovering better patterns.
 * queryLimit is read from settings store at message-send time.
 */

export function buildComponentTips(queryLimit: number): string[] {
  return [
    // ── Data flow ──
    "ALL viz components use queryId from runSQL — ZERO token cost for data. Never pass inline data arrays.",

    // ── Map layers ──
    "H3Map: queryId + hexColumn='hex' + valueColumn='value' + lat/lng/zoom + colorMetric. deck.gl renders from hex strings.",
    "A5 rendering: deck.gl A5Layer renders pentagons from cell ID (same pattern as H3). " +
      "SQL: SELECT printf('%x', a5_lonlat_to_cell(lng, lat, res)) AS pentagon, <metric> AS value, " +
      "list_extract(a5_cell_to_lonlat(a5_lonlat_to_cell(lng, lat, res)), 1) AS lng, " +
      "list_extract(a5_cell_to_lonlat(a5_lonlat_to_cell(lng, lat, res)), 2) AS lat " +
      "— include lat/lng for map bounds. Column 'pentagon' auto-detects layerType=a5. Do NOT convert A5 to H3.",

    // ── Spatial analysis (auto-rendering) ──
    "SPATIAL ANALYSIS → AUTO-RENDERING: Spatial query results with GEOMETRY columns auto-render on the map — " +
      "the system extracts WKB and routes to the right GeoArrow layer (polygon/line/point) automatically. " +
      "ST_Buffer() → polygon layer. Point-in-polygon → preserves source geometry. " +
      "Spatial joins (ST_Intersects, ST_Contains, ST_DWithin) → result geometry auto-renders. " +
      "For spatial analysis: just SELECT * — no ST_AsGeoJSON, no layerType, no manual geometry handling.",
    "GeoJSON/WFS → AUTO-RENDERING: ST_GeomFromGeoJSON produces native GEOMETRY → auto-renders on map (lines, polygons, points). " +
      "See GeoJSON/WFS patterns in DuckDB notes. Use Pattern A for map+table, Pattern B for charts/aggregation.",
    "SPATIAL SQL PATTERNS: " +
      "(1) Buffer: SELECT * REPLACE (ST_Buffer(geom, 1000) AS geom) FROM ... (1km buffer, auto-renders as polygons). " +
      "(2) Point-in-polygon: SELECT * FROM points p, polygons z WHERE ST_Contains(z.geom, p.geom). " +
      "(3) Spatial join: SELECT a.*, b.name FROM a JOIN b ON ST_Intersects(a.geom, b.geom). " +
      "(4) Nearest: SELECT * FROM points ORDER BY ST_Distance(geom, ST_Point(lng, lat)) LIMIT 10. " +
      "(5) Bbox filter (fast): WHERE geom && ST_MakeEnvelope(w, s, e, n) — uses Parquet row group stats. " +
      "(6) Distance: ST_Distance_Spheroid(a, b) for meters. ST_Area_Spheroid(geom) for m². " +
      "(7) Transform CRS: ST_Transform(geom, 'EPSG:4326', 'EPSG:3857'). " +
      "All spatial results auto-render — just pass queryId to GeoMap.",

    // ── Graph ──
    "Graph: queryId + xColumn + yColumns + chartType (bar/line/area/pie). " +
      "ALWAYS set xLabel and yLabel to explain axes (e.g. xLabel='Rank', yLabel='Population'). " +
      "Use 'area' for filled line charts. Y-axis auto-formats large numbers (e.g. 5000 → '5k').",
    "CHART X-AXIS RULE: NEVER use raw H3 hex IDs as chart labels — they are meaningless to users. " +
      "Instead, create meaningful labels in the SQL query: " +
      "Use CASE/WHEN to bucket values (e.g. '0-1000m', '1000-3000m'), " +
      "use NTILE or ROUND for numeric ranges, " +
      "use ROW_NUMBER() for rank labels (e.g. 'Rank 1', 'Rank 2'), " +
      "or GROUP BY a meaningful column. " +
      "Example: SELECT CASE WHEN elev < 1000 THEN '0-1k' WHEN elev < 3000 THEN '1k-3k' ELSE '3k+' END AS label, COUNT(*) AS count ... GROUP BY label",

    // ── DataTable ──
    "DataTable: queryId only (auto-derives columns/rows). Optional: visibleColumns to limit columns shown.",

    // ── Color schemes ──
    "H3Map colorScheme: 'blue-red', 'viridis', 'plasma', 'warm', 'cool', 'spectral'.",

    // ── Cross-filtering ──
    "Cross-filtering: zooming/panning the map filters Graph and DataTable to only show visible hexes.",
    "IMPORTANT: Reuse the SAME queryId across H3Map + Graph + DataTable for linked cross-filtering. " +
      "Include 'hex' column in the query so spatial filtering works. " +
      "Example: run ONE query with hex + value + other columns, then pass the same queryId to all 3 components.",
    "For charts linked with maps via cross-filter, 'hex' can be in the query for filtering but use a DIFFERENT column as xColumn (not hex). " +
      "If no meaningful label column exists, add one in SQL: ROW_NUMBER() OVER (ORDER BY value DESC) as rank, then use xColumn='rank'.",

    // ── Cross-dataset analysis patterns ──
    "CROSS-DATASET ANALYSIS PATTERNS (all joined via h3_index — resolutions MUST match across files): " +
      "Urban density: building JOIN population → bldg_per_person, coverage_ratio vs pop_density. " +
      "Housing pressure: population growth (pop_2100/pop_2025) vs building count → where is housing falling behind? " +
      "Terrain risk: terrain (slope, tri) JOIN building → buildings on steep ground. " +
      "Weather exposure: weather (wind, precip) JOIN building (height, density) → wind exposure index. " +
      "Population timeline: UNPIVOT population wide format → line chart of pop_2025..pop_2100. " +
      "All use same pattern: WITH cells AS (h3_grid_disk neighborhood) → JOIN all files USING (h3_index).",

    // ── Overture cross-indices ──
    "OVERTURE CROSS-INDICES (use getCrossIndex for SQL patterns and weights): " +
      "Walkability (5 signals): transportation(road types) + base(pedestrian infra, barriers) + terrain(slope) + places(destinations). " +
      "15-min city (7 signals): places(diversity, essentials) + transportation(walk, cycle) + base(transit, green space) + terrain(slope). " +
      "Biophilic: base(nature+water) / population → nature per capita. " +
      "Heat vulnerability (6 signals): building(volume, coverage) + transportation(paved) + base(nature deficit) + weather(temp, wind). " +
      "Water security (6 signals): base(water) + population(growth) + weather(precip) + building(permeability) + terrain(retention). " +
      "Overture datasets res 1-10. Shared range with ALL datasets: res 3-5.",

    // ── Weather forecast pattern ──
    "WEATHER FORECAST (MANDATORY pattern — do NOT skip the chart): " +
      "STEP 0: Call buildParquetUrl('weather') to get the URL — NEVER guess the date. " +
      "Each file has 21 timestamps (5-day, 6-hourly). For ANY weather query: " +
      "(1) Run a TIMELINE query: all 21 timestamps for user's cell with strftime(CAST(timestamp AS TIMESTAMP), '%b %d %H:%M') AS time_label, " +
      "temperature_2m_C AS temp_c, GREATEST(precipitation_mm_6hr, 0) AS precip_mm, wind_speed_10m_ms AS wind_ms. " +
      "ONLY use columns listed in the DuckDB weather note — do NOT invent columns like relative_humidity or dewpoint. " +
      "(2) Run an AREA query: snapshot at first timestamp for surrounding cells (map). " +
      "(3) Render: GeoMap (area snapshot) + Graph (chartType='line', xColumn='time_label', yColumns=['temp_c','precip_mm','wind_ms']) + DataTable. " +
      "The line chart is NOT optional — users expect to see the 5-day forecast timeline without asking. " +
      "For A5 weather: compute A5 cells from H3 centroids (see grid rule).",

    // ── Smart defaults ──
    "SMART DEFAULTS: For 'my location' queries, use the pre-computed h3Cells from context — never compute or hardcode. " +
      "For maps: zoom 11-12 for neighborhood, 8-9 for city, 4-5 for region. " +
      "For area queries: h3_grid_disk radius 2-3 for tight neighborhood, 5-8 for wider area. " +
      "Include h3_cell_to_lat/h3_cell_to_lng in queries when components need coordinates for positioning.",
  ];
}
