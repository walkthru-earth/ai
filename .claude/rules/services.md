---
paths:
  - "src/services/**"
---

# Services

## `duckdb-wasm.ts`

- `initDuckDB()`: singleton, jsDelivr bundles, Blob URL worker, extensions: httpfs → spatial → h3 → a5, `geometry_always_xy = true`, retries 3x
- **A5 function names (exact — no others exist)**: `a5_lonlat_to_cell(lng, lat, res)`, `a5_cell_to_lonlat(cell)`, `a5_cell_to_boundary`, `a5_cell_to_children`, `a5_cell_area`, `a5_hex_to_u64(hex)`, `a5_u64_to_hex(cell)`. There is NO `a5_hex_to_cell`. Use `a5_hex_to_u64` for hex→UBIGINT conversion.
- `preloadDuckDB()`: non-blocking warmup on page mount
- `runQuery({sql})`: cleanSql → detectGeometryColumns (DESCRIBE) → wrapSqlForGeometry (if GEOMETRY found) → execute → Arrow→JS rows + columnArrays (typed array views) + arrowIPC (bytes) + wkbArrays (if geometry) → store in query-store → return metadata + 3 sample rows + `geometryNote` (if geometry detected)
- `detectGeometryColumns(conn, sql)`: runs `DESCRIBE (sql)`, checks column_type for GEOMETRY or WKB BLOB with well-known geo names. CTE queries wrapped as `DESCRIBE (SELECT * FROM (WITH...) __detect_geom LIMIT 0)` to enable detection for GeoJSON/WFS queries. Fast — reads Parquet metadata only.
- `wrapSqlForGeometry(sql, geomCol, cols)`: wraps as `SELECT __src.* EXCLUDE ("geomCol"), ST_Y(ST_Centroid(geom)) AS lat, ST_X(ST_Centroid(geom)) AS lng, ST_AsWKB(geom) AS __geo_wkb FROM (sql) __src`. EXCLUDE prevents DuckDB-WASM "Unsupported type in Arrow Conversion: GEOMETRY" crash (#2187). Skips lat/lng if they already exist. **lat/lng are synthetic** — they do NOT exist in the raw file.
- **GEOMETRY Arrow fallback**: If query execution fails with GEOMETRY Arrow error, runQuery retries with all GEOMETRY columns converted to WKB via `ST_AsWKB()` and excluded from `SELECT *`.
- `registerRemoteJSON(url, name)`: fetches remote JSON via browser `fetch`, registers as virtual file in DuckDB-WASM via `registerFileBuffer`. Returns virtual path `/remote/{name}.geojson`. Used by ArcGIS tool to bypass httpfs truncation. Cached per URL — subsequent calls return same path.
- `arrowToJs(val)`: BigInt→Number, Uint8Array→hex, Struct→recursive .toJSON() (converts nested BigInts), plain objects→recursive, Array→recursive
- Column arrays extracted via `vec.toArray()` — zero-copy views for single-chunk results. Used by GeoArrow layers for map rendering.

## `query-store.ts`

- `Map<string, StoredQuery>`, keeps last 20 results. `StoredQuery` has `rows` (JS objects), `columnArrays` (typed arrays for GeoArrow), `arrowIPC` (IPC bytes), `wkbArrays` (Uint8Array[] for auto-detected geometry), `geometryColumn` (name of detected geom col).
- `storeQueryResult()` → auto-incremented `qr_N` ID
- `storeQueryResultWithId(id, result)` → specific ID (thread replay)
- `useQueryResult(queryId)` — `useSyncExternalStore` reactive hook. Components MUST use this, not `getQueryResult()`
- Cross-filter: `setCrossFilter()` / `useCrossFilter()`. Types: `value` (click), `bbox` (viewport). Toggle via `setCrossFilterEnabled()`
- Fly-To Bus: `requestFlyTo({ latitude, longitude, zoom? })` → `useFlyToVersion()` triggers re-render → `consumeFlyTo()` returns target once. Used by DataTable "Zoom to record" → DeckGLMap `flyTo()` (sets `programmaticMoveRef` to suppress viewport save). Lightweight version-based pub/sub (same pattern as cross-filter).
- Panel Dismiss Bus: `requestDismissPanel(target)` → `useDismissVersion()` triggers re-render → `consumeDismissRequest()` returns `{ target }` once. target: `"all"` clears everything, or component type name (e.g. `"GeoMap"`, `"Graph"`) for selective dismiss. Used by `dismissPanels` AI tool → DashboardCanvas matches target against `componentName` (case-insensitive) or exact `panelId`. Same version-based pub/sub pattern as fly-to.

## Data Layer (modular registry)

### `datasets/` — 9 dataset modules
Each file exports a `DatasetDefinition` with id, name, description, columns, columnDescriptions, urlPattern, h3ResRange, defaultH3Res, category.

- `datasets/types.ts`: `DatasetDefinition`, `DatasetInfo`, `BuildUrlOutput`, S3_BASE constant
- `datasets/index.ts`: Registry aggregating all datasets. Exports `listDatasets()`, `buildParquetUrl()`, `describeDataset()`, `DATASETS`, `COLUMN_DESCRIPTIONS`
- `datasets/weather.ts`: GraphCast AI forecasts, res 1-5, 17 columns
- `datasets/terrain.ts`: GEDTM 30m DEM, res 1-10, 6 columns
- `datasets/building.ts`: Global Building Atlas (2.75B), res 3-8, 11 columns
- `datasets/population.ts`: WorldPop SSP2, res 1-8, 16 time steps
- `datasets/places.ts`: Overture POIs (72M), res 1-10, 20 columns (13 categories + landmarks)
- `datasets/transportation.ts`: Overture transport (343M segments), res 1-10, 23 columns
- `datasets/base.ts`: Overture base environment, res 1-10, 32 columns (land use, water, infra)
- `datasets/addresses.ts`: Overture addresses (minimal, schema TBD)
- `datasets/buildings-overture.ts`: Overture buildings (minimal, schema TBD)

### `cross-indices/` — 11 cross-index analyses
Each file exports a `CrossIndexDefinition` with id, name, description, datasets, joinColumn, computedColumns, equivalentSQL, focusRegion.

- `cross-indices/types.ts`: `CrossIndexDefinition`, `CrossIndexInput`
- `cross-indices/index.ts`: Registry. Exports `getCrossIndex()`, `CROSS_INDEX_IDS`
- Existing 6: urban-density, housing-pressure, landslide-risk, vertical-living, population-growth, shrinking-cities
- New 5: walkability (5 signals, 4 datasets), fifteen-min-city (7 signals, 4 datasets), biophilic (base × population), heat-vulnerability (6 signals, 4 datasets), water-security (6 signals, 5 datasets)

### `resolvers.ts` — Dynamic URL resolution
- `resolveWeatherPrefix()`: GitHub state file → fallback HEAD probe cascade. Singleton-cached promise
- `resolveOvertureRelease()`: GitHub state file → fallback `2026-03-18.0`. Singleton-cached promise

### `suggest-analysis.ts` — NL keyword routing
- `suggestAnalysis()`: keyword matching → datasets, cross-indices, columns, sample SQL, focus regions
- Routes 11 cross-index keywords + 9 dataset keywords + fallback overview
