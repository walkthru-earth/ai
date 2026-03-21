---
paths:
  - "src/lib/**"
---

# Lib

## `tambo/` (modular AI config)

`tamboProviderConfig` — shared base for all `TamboProvider` instances. Pages spread + add overrides.

### Structure

```
src/lib/tambo/
├── index.ts              # Aggregator: tamboProviderConfig + re-exports
├── tools/                # 6 tool registrations (1 file per tool or related group)
│   ├── run-sql.ts        # runSQL — most critical, queryId pattern
│   ├── dataset-tools.ts  # listDatasets + buildParquetUrl + describeDataset
│   ├── cross-index.ts    # getCrossIndex (11 analyses)
│   └── suggest.ts        # suggestAnalysis
├── components/           # 11 component registrations
│   ├── geo-map.ts        # GeoMap + H3Map (deck.gl)
│   ├── graph.ts          # Graph (10 chart types)
│   ├── data-table.ts     # DataTable (paginated)
│   ├── objex-viewer.ts   # ObjexViewer (3D raster)
│   └── static.ts         # StatsCard, StatsGrid, InsightCard, DatasetCard, QueryDisplay, DataCard
├── context/              # AI context helpers (split by concern)
│   ├── behavior.ts       # AI behavior rules
│   ├── duckdb-notes.ts   # DuckDB v1.5 WASM rules
│   ├── dataset-paths.ts  # 9 dataset S3 paths
│   └── component-tips.ts # Component usage tips + cross-index patterns
└── suggestions.ts        # buildInitialSuggestions() — 4 geo-personalized chips
```

### Key exports
- `tamboProviderConfig` — base config for all pages
- `buildContextHelpers(geo)` — assembles behavior + DuckDB + datasets + tips into AI context
- `buildInitialSuggestions(geo)` — 4 geo-personalized suggestion chips
- `tools` / `components` — aggregated arrays

### Editing guide
- **Add a tool**: create file in `tools/`, add to `tools/index.ts`
- **Add a component**: create file in `components/` (or add to `static.ts`), add to `components/index.ts`
- **Add AI behavior rule**: edit `context/behavior.ts`
- **Add DuckDB rule**: edit `context/duckdb-notes.ts`
- **Add dataset path**: edit `context/dataset-paths.ts`
- **Add component tip**: edit `context/component-tips.ts`
- **Tune tool description**: edit the specific tool file (affects AI routing quality)

## `thread-hooks.ts`

- `useReplayQueries(messages)` — scans thread messages for runSQL tool_use/tool_result pairs, re-runs SQL in background, stores under original queryId via `storeQueryResultWithId()`. Used by both `/chat` and `/explore`.
- `useMergeRefs()`, `useCanvasDetection()`, `usePositioning()`, `getSafeContent()`, `checkHasContent()`

## `use-geo-ip.ts`

`useGeoIP()` — fetches from `get.geojs.io/v1/ip/geo.json`, caches 24h in localStorage (null on first render). Returns `GeoIP` with city, country, lat/lng, timezone, and `h3Cells` (pre-computed H3 hex strings at res 1-8 via `h3-js`). Gracefully returns `null` when blocked.

## `use-anonymous-user-key.ts`

Persistent anonymous user key (localStorage `walkthru-user-key`). SDK requires `userKey` for thread scoping.

## `utils.ts`

- `cn()` — clsx + tailwind-merge
- `basePath` — `import.meta.env.BASE_URL` (from Vite `base` config, defaults to `/ai`)
