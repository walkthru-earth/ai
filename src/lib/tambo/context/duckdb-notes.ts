/**
 * DuckDB v1.5 WASM technical rules — sent as AI context.
 * Edit this file when DuckDB version changes or new rules are discovered.
 */

export const duckdbWasmNotes = [
  "DuckDB v1.5. H3, A5, spatial, httpfs pre-loaded. NO INSTALL/LOAD. ONE statement. LIMIT 500. HTTPS URLs in FROM.",
  "Geometry: SELECT * from Parquet with GEOMETRY → auto-renders on map. lat/lng are SYNTHETIC — never select them in follow-ups. Use SELECT * EXCLUDE (col).",
  "H3: h3_index BIGINT. Maps: h3_h3_to_string(h3_index) AS hex. h3_cell_to_lat()/h3_cell_to_lng() → DOUBLE (preferred). h3_grid_ring/h3_grid_disk (NOT h3_k_ring).",
  "A5: a5_lonlat_to_cell(lng, lat, res) — lng FIRST. a5_cell_to_lonlat/boundary/children/area. Equal-area pentagons.",
  "v1.5: GEOMETRY core type. TRY_CAST(x AS GEOMETRY) broken → TRY(ST_GeomFromText(x)). Lambda: lambda x: x + 1 (NOT x -> x + 1).",
  "Spatial: ST_Buffer/ST_Contains/ST_Intersects/ST_DWithin auto-render. ST_Distance_Spheroid(a,b) → meters. geom && ST_MakeEnvelope(w,s,e,n) for bbox pushdown.",
  "CRITICAL: queryId (qr_N) is client-side — NOT a DuckDB table. Timestamp math: CAST(ts AS TIMESTAMP) + INTERVAL '72 hours' (WASM has no ICU — TIMESTAMPTZ + INTERVAL fails).",
  "Weather: each file has 5-day/21-step forecast. Query ONE file via buildParquetUrl. GREATEST(precipitation_mm_6hr, 0) to clamp.",
  "Grid rule: use H3 when user asks H3, A5 when user asks A5. Never convert between them.",
  "OOM PREVENTION (~3GB WASM limit): NEVER SELECT * into CTEs on large files (weather res5=42M rows). " +
    "Push WHERE h3_index=X directly into the Parquet scan for predicate pushdown. Only SELECT needed columns. " +
    "For multi-file comparisons: filter each file BEFORE joining. Prefer res 3-4 for area/map queries.",
  "CROSS-DATASET: All datasets share h3_index — joins trivial BUT resolutions MUST match across all files. " +
    "Shared range: res 3-5. UNPIVOT population for time-series charts. " +
    "Use h3_cell_to_lat/lng to derive coordinates from h3_index directly.",
];
