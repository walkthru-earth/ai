/**
 * DuckDB v1.5 WASM technical rules — sent as AI context.
 * Edit this file when DuckDB version changes or new rules are discovered.
 */

export const duckdbWasmNotes = [
  "DuckDB v1.5. H3, A5, spatial, httpfs pre-loaded. NO INSTALL/LOAD. ONE statement. LIMIT 500. HTTPS URLs in FROM.",
  "Geometry: SELECT * from Parquet with GEOMETRY → auto-renders on map. lat/lng are SYNTHETIC — never select them in follow-ups. Use SELECT * EXCLUDE (col).",
  "H3: h3_index BIGINT. Maps: h3_h3_to_string(h3_index) AS hex. h3_cell_to_lat()/h3_cell_to_lng() → DOUBLE (preferred). h3_grid_ring/h3_grid_disk (NOT h3_k_ring).",
  "A5 FUNCTIONS (exact names — no others exist): " +
    "a5_lonlat_to_cell(lng, lat, res) → UBIGINT (lng FIRST!). " +
    "a5_cell_to_lonlat(cell) → DOUBLE[2] [lon, lat]. a5_cell_to_boundary(cell). a5_cell_to_children(cell, res). a5_cell_area(res). " +
    "a5_hex_to_u64(hex_string) → UBIGINT (NOT a5_hex_to_cell — that does NOT exist). " +
    "a5_u64_to_hex(cell) → VARCHAR. printf('%x', cell) also works for hex output. " +
    "When computing lat/lng from A5 cells, keep the raw BIGINT cell for a5_cell_to_lonlat — do NOT re-parse from hex string.",
  "v1.5: GEOMETRY core type. TRY_CAST(x AS GEOMETRY) broken → TRY(ST_GeomFromText(x)). Lambda: lambda x: x + 1 (NOT x -> x + 1).",
  "Spatial: ST_Buffer/ST_Contains/ST_Intersects/ST_DWithin auto-render. ST_Distance_Spheroid(a,b) → meters. geom && ST_MakeEnvelope(w,s,e,n) for bbox pushdown.",
  "CRITICAL: queryId (qr_N) is client-side — NOT a DuckDB table. Timestamp math: CAST(ts AS TIMESTAMP) + INTERVAL '72 hours' (WASM has no ICU — TIMESTAMPTZ + INTERVAL fails).",
  "Weather: each file has 5-day/21-step forecast. Query ONE file via buildParquetUrl. GREATEST(precipitation_mm_6hr, 0) to clamp. " +
    "TIMESTAMPS: Always format timestamps for display using strftime(CAST(timestamp AS TIMESTAMP), '%Y-%m-%d %H:%M') AS timestamp. " +
    "Raw epoch ms values are unreadable to users.",
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
  "OOM PREVENTION (~3GB WASM limit): NEVER SELECT * into CTEs on large files (weather res5=42M rows). " +
    "Push WHERE h3_index=X directly into the Parquet scan for predicate pushdown. Only SELECT needed columns. " +
    "For multi-file comparisons: filter each file BEFORE joining. Prefer res 3-4 for area/map queries.",
  "CROSS-DATASET: All datasets share h3_index — joins trivial BUT resolutions MUST match across all files. " +
    "Shared range: res 3-5. UNPIVOT population for time-series charts. " +
    "Use h3_cell_to_lat/lng to derive coordinates from h3_index directly.",
];
