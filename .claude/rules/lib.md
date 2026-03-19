---
paths:
  - "src/lib/**"
---

# Lib

## `tambo.ts` (central config)

`tamboProviderConfig` — shared base for all `TamboProvider` instances. Pages spread + add overrides.

**Tools** (6): runSQL, listDatasets, buildParquetUrl, describeDataset, getCrossIndex, suggestAnalysis

**Components** (10): GeoMap, H3Map (alias), Graph, DataTable (queryId-driven, bidirectional state) + StatsCard, StatsGrid, InsightCard, DatasetCard, QueryDisplay, DataCard (inline props)

**Shared helpers**:
- `buildContextHelpers(geo)` — AI context with user theme, geo-IP location (city, lat/lng, H3 cells at res 1/3/5/7), behavior rules, DuckDB v1.5 notes (geometry auto-detection, synthetic lat/lng warning, lambda syntax, spatial filter pushdown, spatial analysis patterns, TRY_CAST broken, no same-name aliasing, A5 functions), dataset paths, component tips (including A5 rendering and spatial auto-routing), anti-injection rules. Coordinate order: `lat` = latitude (N/S), `lng` = longitude (E/W). H3: `h3_latlng_to_cell(lat, lng, res)`. A5: `a5_lonlat_to_cell(lng, lat, res)` — lng FIRST. Spatial: `ST_Point(lng, lat)`. Grid system rule: respect user's choice of H3 vs A5.
- `buildInitialSuggestions(geo)` — geo-personalized suggestion chips (falls back to global when geo unavailable)

## `thread-hooks.ts`

- `useReplayQueries(messages)` — scans thread messages for runSQL tool_use/tool_result pairs, re-runs SQL in background, stores under original queryId via `storeQueryResultWithId()`. Used by both `/chat` and `/explore`.
- `useMergeRefs()`, `useCanvasDetection()`, `usePositioning()`, `getSafeContent()`, `checkHasContent()`

## `use-geo-ip.ts`

`useGeoIP()` — fetches from `get.geojs.io/v1/ip/geo.json`, caches 24h in localStorage (null on first render). Returns `GeoIP` with city, country, lat/lng, timezone, and `h3Cells` (pre-computed H3 hex strings at res 1/3/5/7 via `h3-js`). Gracefully returns `null` when blocked.

## `use-anonymous-user-key.ts`

Persistent anonymous user key (localStorage `walkthru-user-key`). SDK requires `userKey` for thread scoping.

## `utils.ts`

- `cn()` — clsx + tailwind-merge
- `basePath` — `import.meta.env.BASE_URL` (from Vite `base` config, defaults to `/ai`)
