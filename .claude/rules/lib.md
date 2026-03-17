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
- `buildContextHelpers(geo)` — AI context with user theme, geo-IP location (city, lat/lng, H3 cells at res 1/3/5/7), behavior rules, DuckDB notes, dataset paths, component tips. Coordinate order: `lat` = latitude (N/S), `lng` = longitude (E/W). H3: `h3_latlng_to_cell(lat, lng, res)`. Spatial: `ST_Point(lng, lat)`.
- `buildInitialSuggestions(geo)` — geo-personalized suggestion chips (falls back to global when geo unavailable)

## `thread-hooks.ts`

- `useReplayQueries(messages)` — scans thread messages for runSQL tool_use/tool_result pairs, re-runs SQL in background, stores under original queryId via `storeQueryResultWithId()`. Used by both `/chat` and `/explore`.
- `useMergeRefs()`, `useCanvasDetection()`, `usePositioning()`, `getSafeContent()`, `checkHasContent()`

## `use-geo-ip.ts`

`useGeoIP()` — fetches from `get.geojs.io/v1/ip/geo.json`, caches 24h in localStorage. SSR-safe (always `null` on first render). Returns `GeoIP` with city, country, lat/lng, timezone, and `h3Cells` (pre-computed H3 hex strings at res 1/3/5/7 via `h3-js`). Gracefully returns `null` when blocked.

## `use-anonymous-user-key.ts`

Persistent anonymous user key (localStorage `walkthru-user-key`). SDK requires `userKey` for thread scoping.

## `utils.ts`

- `cn()` — clsx + tailwind-merge
- `basePath` — `NEXT_PUBLIC_BASE_PATH || "/ai"`
