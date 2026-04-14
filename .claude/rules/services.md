---
paths:
  - "src/services/**"
---

# Services

## `duckdb-wasm.ts`

- `initDuckDB()`: singleton, jsDelivr bundles, Blob URL worker, extensions: httpfs → spatial → h3 → a5, `geometry_always_xy = true`, retries 3x
- **A5 function names (exact, no others exist)**: `a5_lonlat_to_cell(lng, lat, res)`, `a5_cell_to_lonlat(cell)`, `a5_cell_to_boundary`, `a5_cell_to_children`, `a5_cell_area`, `a5_hex_to_u64(hex)`, `a5_u64_to_hex(cell)`. There is NO `a5_hex_to_cell`. Use `a5_hex_to_u64` for hex→UBIGINT conversion.
- `preloadDuckDB()`: non-blocking warmup on page mount
- `runQuery({sql})`: cleanSql → detectGeometryColumns (DESCRIBE) → wrapSqlForGeometry (if GEOMETRY found) → execute → Arrow→JS rows + columnArrays (typed array views) + arrowIPC (bytes) + wkbArrays (if geometry) → store in query-store → return metadata + 3 sample rows + `geometryNote` (if geometry detected)
- `detectGeometryColumns(conn, sql)`: runs `DESCRIBE (sql)`, checks column_type for GEOMETRY or WKB BLOB with well-known geo names. CTE queries wrapped as `DESCRIBE (SELECT * FROM (WITH...) __detect_geom LIMIT 0)` to enable detection for GeoJSON/WFS queries. Fast, reads Parquet metadata only.
- `wrapSqlForGeometry(sql, geomCol, cols)`: wraps as `SELECT __src.* EXCLUDE ("geomCol"), ST_Y(ST_Centroid(geom)) AS lat, ST_X(ST_Centroid(geom)) AS lng, ST_AsWKB(geom) AS __geo_wkb FROM (sql) __src`. EXCLUDE prevents DuckDB-WASM "Unsupported type in Arrow Conversion: GEOMETRY" crash (#2187). Skips lat/lng if they already exist. **lat/lng are synthetic**, they do NOT exist in the raw file.
- **GEOMETRY Arrow fallback**: If query execution fails with GEOMETRY Arrow error, runQuery retries with all GEOMETRY columns converted to WKB via `ST_AsWKB()` and excluded from `SELECT *`.
- `registerRemoteJSON(url, name)`: fetches remote JSON via browser `fetch`, registers as virtual file in DuckDB-WASM via `registerFileBuffer`. Returns virtual path `/remote/{name}.geojson`. Used by ArcGIS tool to bypass httpfs truncation. Cached per URL, subsequent calls return same path.
- `arrowToJs(val)`: BigInt→Number, Uint8Array→hex, Struct→recursive .toJSON() (converts nested BigInts), plain objects→recursive, Array→recursive
- Column arrays extracted via `vec.toArray()`, zero-copy views for single-chunk results. Used by GeoArrow layers for map rendering.

## `query-store.ts`

- `Map<string, StoredQuery>`, keeps last 20 results (auto-ID) or 40 (specific ID). `StoredQuery` has `rows` (JS objects), `columnArrays` (typed arrays for GeoArrow), `arrowIPC` (IPC bytes), `wkbArrays` (Uint8Array[] for auto-detected geometry), `geometryColumn` (name of detected geom col).
- `storeQueryResult()` → auto-incremented `qr_N` ID (evicts oldest beyond 20)
- `storeQueryResultWithId(id, result)` → specific ID for thread replay (evicts oldest beyond 40)
- `useQueryResult(queryId)` - `useSyncExternalStore` reactive hook. Components MUST use this, not `getQueryResult()`
- Cross-filter: `setCrossFilter()` / `useCrossFilter()`. Types: `value` (click), `bbox` (viewport). Toggle via `setCrossFilterEnabled()`. **Emit guard**: `setCrossFilter` value-checks against `currentFilter` (source, type, column, queryId, values) and SKIPS emit when unchanged. Prevents map viewport bbox spam from cascading into GeoMap/DataTable/Graph re-renders.
- Fly-To Bus: `requestFlyTo({ latitude, longitude, zoom? })` → `useFlyToVersion()` triggers re-render → `consumeFlyTo()` returns target once. Used by DataTable "Zoom to record" → DeckGLMap `flyTo()` (sets `programmaticMoveRef` to suppress viewport save). Lightweight version-based pub/sub (same pattern as cross-filter).
- Time Filter Bus: `setTimeFilter({ timestamps, currentIndex, timestampColumn, sourceComponent })` → `useTimeFilter()` reactive hook → `applyTimeFilter(rows, filter, selfComponent)` filters rows matching current timestamp. `clearTimeFilter()` on TimeSlider unmount. Used for weather time playback: TimeSlider emits → GeoMap shows spatial snapshot, Graph shows reference line. **Emit guard**: `setTimeFilter` value-checks against `currentTimeFilter` (index, column, source, timestamps ref) and SKIPS emit when identical. TimeSlider also keeps a `lastEmittedRef` to skip redundant `setTimeFilter` calls triggered by effect re-runs.
- Panel Dismiss Bus: `requestDismissPanel(target)` → `useDismissVersion()` triggers re-render → `consumeDismissRequest()` returns `{ target }` once. target: `"all"` clears everything, or component type name (e.g. `"GeoMap"`, `"Graph"`) for selective dismiss. Used by `dismissPanels` AI tool → DashboardCanvas matches target against `panel.componentName` (sourced from Tambo `content.name`, case-insensitive) or exact `panelId`. Same version-based pub/sub pattern as fly-to.
- Panel Restore Bus: `requestRestorePanel(target)` → `useRestoreVersion()` triggers re-render → `consumeRestoreRequest()` returns `{ target }` once. Restores previously dismissed panels.
- Dismissed Panel IDs: `syncDismissedPanelIds(Set<string>)` called by DashboardCanvas → `isPanelDismissed(id)` / `useDismissedPanelIds()` reactive read-only access.

## `export.ts`

- `exportQueryToCSV({ queryId, filename? })`: reads `StoredQuery` from query-store, builds RFC 4180 CSV (proper escaping), triggers browser download via Blob URL. Used by AI `exportCSV` tool and DataTable footer button. Returns `{ success, rowCount, filename }`.

## `panel-store.ts`

- Lightweight registry of active dashboard panels. `DashboardCanvas` syncs panel info here on every render.
- `syncActivePanels(panels)` - called by DashboardCanvas when panels change
- `getActivePanels()` - non-reactive read for resource listing
- `PanelEntry`: `{ id, componentName, title, queryId? }`
- Used by explore page's `listResources`/`getResource` to expose panels as `panel://ComponentName/panelId` resources for @-mentions.

## `style-store.ts`

- Reactive `StyleSpecification` state via `useSyncExternalStore`. Single module-level variable.
- `getStyle()` / `setStyle(style)` - non-reactive read/write for tools
- `useStyle()` / `useStyleVersion()` - reactive hooks for components
- `loadStyleFromUrl(url)` - fetch + validate + set
- `exportStyleJSON()` - formatted JSON string
- `downloadStyleJSON()` - blob download trigger (shared, replaces 3 inline implementations)
- `getLayerById(id)` / `getSourceById(id)` - lookup helpers for `inspectStyle` tool
- `getStyleInventory()` - source/layer summary for @-mention listing
- `getCompactStyleFingerprint()` - token-optimized fingerprint for AI context (~1 token per layer)
- `EMPTY_STYLE` - minimal starting style (dark background, MapLibre demo glyphs/sprites)

## Data Layer (modular registry)

### `datasets/` - 9 dataset modules
Each file exports a `DatasetDefinition` with id, name, description, columns, columnDescriptions, urlPattern, h3ResRange, defaultH3Res, category.

- `datasets/types.ts`: `DatasetDefinition`, `DatasetInfo`, `BuildUrlOutput`, S3_BASE constant
- `datasets/index.ts`: Registry aggregating all datasets. Exports `listDatasets()`, `buildParquetUrl()`, `describeDataset()`, `DATASETS`, `COLUMN_DESCRIPTIONS`
- `datasets/weather.ts`: GraphCast AI forecasts, res 1-5, 24 columns (temp, wind, humidity, pressure, precip, geopotential)
- `datasets/terrain.ts`: GEDTM 30m DEM, res 1-10, 6 columns (elev, slope, aspect, tri, tpi)
- `datasets/building.ts`: Global Building Atlas (2.75B), res 3-8, 11 columns (count, density, footprint, height, volume)
- `datasets/population.ts`: WorldPop SSP2, res 1-8, 17 columns (h3_index + pop_2025 through pop_2100)
- `datasets/places.ts`: Overture POIs (72M), res 1-10, 31 columns (13 categories + 15 granular subcategories)
- `datasets/transportation.ts`: Overture transport (343M segments), res 1-10, 27 columns (road/rail/water + 16 road types + bridge/tunnel/paved/unpaved)
- `datasets/base.ts`: Overture base environment, res 1-10, 43 columns (16 land use + 10 water + 13 infrastructure types)
- `datasets/addresses.ts`: Overture addresses, res 1-10, 3 columns (h3_index, address_count, unique_postcodes)
- `datasets/buildings-overture.ts`: Overture buildings, res 1-10, 42 columns (13 USE types, 20 SUBTYPES, height/floor aggregates)

### `cross-indices/` - 11 cross-index analyses
Each file exports a `CrossIndexDefinition` with id, name, description, datasets, joinColumn, computedColumns, equivalentSQL, focusRegion.

- `cross-indices/types.ts`: `CrossIndexDefinition`, `CrossIndexInput`
- `cross-indices/index.ts`: Registry. Exports `getCrossIndex()`, `CROSS_INDEX_IDS`
- Simple 6: urban-density (building+population), housing-pressure (building+population), landslide-risk (terrain+building), vertical-living (building+population), population-growth (population), shrinking-cities (population)
- Composite 5: walkability (5 signals, 4 datasets), fifteen-min-city (7 signals, 4 datasets), biophilic (base×population), heat-vulnerability (6 signals, 4 datasets), water-security (6 signals, 5 datasets)

### `resolvers.ts` - Dynamic URL resolution
- `resolveWeatherPrefix()`: GitHub state file → fallback HEAD probe cascade. Singleton-cached promise
- `resolveOvertureRelease()`: GitHub state file → fallback `2026-03-18.0`. Singleton-cached promise

### `suggest-analysis.ts` - NL keyword routing
- `suggestAnalysis()`: keyword matching → datasets, cross-indices, columns, sample SQL, focus regions
- Routes 11 cross-index keywords + 9 dataset keywords + fallback overview
