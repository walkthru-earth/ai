---
paths:
  - "src/services/**"
---

# Services

## `duckdb-wasm.ts`

- `initDuckDB()`: singleton, jsDelivr bundles, Blob URL worker, extensions: httpfs → spatial → h3 → a5, `geometry_always_xy = true`, retries 3x
- `preloadDuckDB()`: non-blocking warmup on page mount
- `runQuery({sql})`: cleanSql → detectGeometryColumns (DESCRIBE) → wrapSqlForGeometry (if GEOMETRY found) → execute → Arrow→JS rows + columnArrays (typed array views) + arrowIPC (bytes) + wkbArrays (if geometry) → store in query-store → return metadata + 3 sample rows + `geometryNote` (if geometry detected)
- `detectGeometryColumns(conn, sql)`: runs `DESCRIBE (sql)`, checks column_type for GEOMETRY or WKB BLOB with well-known geo names. Skips CTE queries (`WITH ...`). Fast — reads Parquet metadata only.
- `wrapSqlForGeometry(sql, geomCol, cols)`: wraps as `SELECT __src.*, ST_Y(ST_Centroid(geom)) AS lat, ST_X(ST_Centroid(geom)) AS lng, ST_AsWKB(geom) AS __geo_wkb FROM (sql) __src`. Skips lat/lng if they already exist. Strips geom column + __geo_wkb from public columns/rows. **lat/lng are synthetic** — they do NOT exist in the raw Parquet file. `geometryNote` in the return value tells the AI which column holds the actual geometry.
- `arrowToJs(val)`: BigInt→Number, Uint8Array→hex, Struct→recursive .toJSON() (converts nested BigInts), plain objects→recursive, Array→recursive
- Column arrays extracted via `vec.toArray()` — zero-copy views for single-chunk results. Used by GeoArrow layers for map rendering.

## `query-store.ts`

- `Map<string, StoredQuery>`, keeps last 20 results. `StoredQuery` has `rows` (JS objects), `columnArrays` (typed arrays for GeoArrow), `arrowIPC` (IPC bytes), `wkbArrays` (Uint8Array[] for auto-detected geometry), `geometryColumn` (name of detected geom col).
- `storeQueryResult()` → auto-incremented `qr_N` ID
- `storeQueryResultWithId(id, result)` → specific ID (thread replay)
- `useQueryResult(queryId)` — `useSyncExternalStore` reactive hook. Components MUST use this, not `getQueryResult()`
- Cross-filter: `setCrossFilter()` / `useCrossFilter()`. Types: `value` (click), `bbox` (viewport). Toggle via `setCrossFilterEnabled()`
- Fly-To Bus: `requestFlyTo({ latitude, longitude, zoom? })` → `useFlyToVersion()` triggers re-render → `consumeFlyTo()` returns target once. Used by DataTable "Zoom to record" → DeckGLMap `flyTo()`. Lightweight version-based pub/sub (same pattern as cross-filter).

## `walkthru-data.ts`

- 4 dataset definitions with full column lists, URL patterns, H3 res ranges:
  - Weather: res 0-5, hours 0/12, 17 columns (temp, wind, shear, humidity, moisture flux, pressure, precip, geopotential)
  - Terrain: res 1-10, 6 columns (elev, slope, aspect, tri, tpi)
  - Building: res 3-8, 11 columns (count, density, footprint, coverage, height avg/max/std, volume, volume density)
  - Population: res 1-8, 16 time steps (pop_2025 through pop_2100 every 5 years)
- 6 pre-built cross-dataset analyses (CROSS_INDICES)
- `resolveWeatherPrefix()`: probes S3 for latest weather date/hour (cached)
- `suggestAnalysis()`: keyword routing → datasets, cross-indices, sample SQL
