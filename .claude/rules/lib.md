---
paths:
  - "src/lib/**"
---

# Lib

## `tambo/` (modular AI config)

`tamboProviderConfig` - shared base for all `TamboProvider` instances. Pages spread + add overrides.

### Structure

```
src/lib/tambo/
├── index.ts              # Aggregator: tamboProviderConfig + re-exports
├── tools/                # 10 tool registrations (1 file per tool or related group)
│   ├── run-sql.ts        # runSQL - most critical, queryId pattern
│   ├── dataset-tools.ts  # listDatasets + buildParquetUrl + describeDataset
│   ├── cross-index.ts    # getCrossIndex (11 analyses)
│   ├── suggest.ts        # suggestAnalysis
│   ├── arcgis.ts         # exploreArcGISService + describeArcGISLayer - smart discovery + pre-load
│   ├── dashboard.ts      # dismissPanels - clear all or specific panels by type/id
│   └── export.ts         # exportCSV - download query results as CSV
├── components/           # 12 component registrations
│   ├── geo-map.ts        # GeoMap + H3Map (deck.gl)
│   ├── graph.ts          # Graph (10 chart types)
│   ├── data-table.ts     # DataTable (paginated)
│   ├── time-slider.ts    # TimeSlider (weather time playback + cross-filter)
│   ├── objex-viewer.ts   # ObjexViewer (3D raster)
│   └── static.ts         # StatsCard, StatsGrid, InsightCard, DatasetCard, QueryDisplay, DataCard
├── context/              # AI context helpers (split by concern)
│   ├── behavior.ts       # AI behavior rules (analytical commentary, decisiveness)
│   ├── duckdb-notes.ts   # DuckDB v1.5 WASM rules
│   ├── dataset-paths.ts  # 9 dataset S3 paths
│   └── component-tips.ts # Component usage tips + cross-index patterns
└── suggestions.ts        # buildInitialSuggestions() - 10 geo-personalized suggestions (5 primary + 5 extended)
```

### Key exports
- `tamboProviderConfig` - base config for all pages
- `buildContextHelpers(geo)` - assembles behavior + DuckDB + datasets + tips into AI context
- `buildInitialSuggestions(geo)` - 10 geo-personalized suggestions (5 primary + 5 extended)
- `tools` (10 tools) / `components` (12 components) - aggregated arrays

### Editing guide
- **Add a tool**: create file in `tools/`, add to `tools/index.ts`
- **Add a component**: create file in `components/` (or add to `static.ts`), add to `components/index.ts`
- **Add AI behavior rule**: edit `context/behavior.ts`
- **Add DuckDB rule**: edit `context/duckdb-notes.ts`
- **Add dataset path**: edit `context/dataset-paths.ts`
- **Add component tip**: edit `context/component-tips.ts`
- **Tune tool description**: edit the specific tool file (affects AI routing quality)

## `thread-hooks.ts`

- `useReplayQueries(messages)` - scans thread messages for runSQL tool_use/tool_result pairs, re-runs SQL in background, stores under original queryId via `storeQueryResultWithId()`. Used by both `/chat` and `/explore`.
- `useMergeRefs()`, `useCanvasDetection()`, `usePositioning()`, `getSafeContent()`, `checkHasContent()`

## `use-geo-ip.ts`

`useGeoIP()` - fetches from `get.geojs.io/v1/ip/geo.json`, caches 24h in localStorage (null on first render). Returns `GeoIP` with city, country, lat/lng, timezone, and `h3Cells` (pre-computed H3 hex strings at res 1-8 via `h3-js`). Gracefully returns `null` when blocked.

## `settings-store.ts`

Centralized settings store via `useSyncExternalStore` + localStorage (`walkthru-settings`). Manages theme (`dark`/`light`/`system`), queryLimit (default 10000), defaultH3Res (1-10, default 5), defaultA5Res (3-15, default 7). Exports: `getSettings()`, `updateSettings(partial)`, `useSettings()`, `DEFAULT_QUERY_LIMIT`, `QUERY_LIMIT_PRESETS`, `H3_RES_RANGE`, `A5_RES_RANGE`. Migrates from old `"theme"` localStorage key.

## `use-theme-effect.ts`

`useThemeEffect()` - reads theme from `useSettings()`, applies to `document.documentElement.classList`. Handles system media query listener for "system" mode. Called once in `App.tsx`.

## `use-anonymous-user-key.ts`

Persistent anonymous user key (localStorage `walkthru-user-key`). SDK requires `userKey` for thread scoping.

## `utils.ts`

- `cn()` - clsx + tailwind-merge
- `basePath` - `import.meta.env.BASE_URL` (from Vite `base` config, defaults to `/ai`)

## `tambo-style-editor/` (modular AI config for Style Editor)

Separate from main `tambo/` config since style editor uses completely different tools and context. Same modular structure.

```
src/lib/tambo-style-editor/
├── index.ts                  # Aggregator: styleEditorProviderConfig + re-exports
├── tools/
│   ├── index.ts              # Aggregates 8 tools
│   ├── utils.ts              # parseJsonValue / parseJsonObject - surface JSON.parse errors with position snippet + bracket mismatch hint. safeParseJson kept for compat.
│   ├── inspect.ts            # inspectStyle - on-demand layer/source/root reader
│   ├── set-layer-property.ts # setLayerProperty - surgical path-based setter (PREFERRED for single-prop edits), auto-validates + rollback
│   ├── update-layer.ts       # updateLayer - add/update/remove whole layer with deep merge
│   ├── update-source.ts      # updateSource - add/update/remove
│   ├── update-map-settings.ts # updateMapSettings - root-level props
│   ├── set-style.ts          # setStyle - full replacement
│   ├── load-style-url.ts     # loadStyleUrl - fetch remote style
│   └── validate-style.ts     # validateStyle - @maplibre/maplibre-gl-style-spec
├── context/
│   ├── index.ts              # buildStyleEditorContext() - compact fingerprint + spec
│   ├── behavior.ts           # AI behavior rules (decisiveness, batch ops, tools)
│   ├── maplibre-spec.ts      # Compressed MapLibre Style v8 reference (~1200 tokens)
│   └── shortbread-schema.ts  # VersaTiles/OSM tile schema (~400 tokens, conditional)
├── presets.ts                # 10 curated style presets (VersaTiles + MapLibre demo)
└── suggestions.ts            # 5 style editor suggestion chips
```

### Key exports
- `styleEditorProviderConfig` - base TamboProvider config (tools, no components)
- `buildStyleEditorContext()` - compact fingerprint + spec + conditional Shortbread schema
- `styleEditorSuggestions` - 5 initial suggestion chips
- `styleEditorTools` - 8 tools (inspect, setLayerProperty, update layer/source/settings, validate, set, load)
