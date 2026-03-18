# Walkthru Earth AI

AI urban intelligence platform — natural language queries over global geospatial data (weather, terrain, buildings, population). Built on Vite + React Router + Tambo AI + DuckDB-WASM + deck.gl.

## Commands

```bash
pnpm dev          # localhost:5173/ai
pnpm build        # production (base: /ai, output: out/)
pnpm preview      # preview production build
pnpm lint         # biome check
pnpm lint:fix     # biome auto-fix
```

- **Vite** (not Next.js) — `vite.config.ts`: React plugin, `@tailwindcss/vite`, `base: "/ai"`, output to `out/`
- **React Router** — `src/App.tsx` defines routes: `/`, `/chat`, `/explore`, `/interactables`
- **Entry point**: `index.html` → `src/main.tsx` → `<BrowserRouter basename="/ai">`
- **Biome** (not ESLint) — `biome.json`: 2-space indent, double quotes, semicolons, 120 chars
- **Pre-commit**: lefthook runs `pnpx @biomejs/biome check --write` on staged files
- **Env vars**: Use `import.meta.env.VITE_*` (not `process.env.NEXT_PUBLIC_*`). Defined in `.env.local`, typed in `vite-env.d.ts`
- **No SSR**: Pure SPA — all pages are client-rendered. No `"use server"`, no API routes
- **Fonts**: Quicksand (local woff2 via `@font-face` in `globals.css`) + DM Mono (Google Fonts CDN)
- **Lazy loading**: Use `React.lazy()` + `<Suspense>` instead of `next/dynamic`
- **Static assets**: `basePath` from `import.meta.env.BASE_URL` (set by Vite `base` config)

## Architecture

**queryId pattern** (zero-token data bridge): AI calls `runSQL` → DuckDB executes → full result stored in `query-store.ts` → only `queryId` returned to LLM (~10 tokens). Components read data from store via `useQueryResult(queryId)`.

**Geometry auto-detection**: `runQuery()` auto-detects geometry columns via `DESCRIBE` (fast, metadata-only). Two paths: (1) native GEOMETRY type → `ST_AsWKB` + `ST_Centroid`, (2) WKB BLOB with well-known column name (geom, geometry, shape, etc.) → `ST_GeomFromWKB` + direct WKB passthrough. `enable_geoparquet_conversion = false` in init prevents WASM `stoi` crash on some GeoParquet files — our wrapping handles geometry instead. WKB arrays stored in query-store → GeoArrow zero-copy rendering. AI just writes `SELECT * FROM parquet_file`.

**Cross-filter bus**: Lightweight pub/sub in `query-store.ts`. Components emit/consume `bbox` (map viewport) and `value` (click) filters. Requires shared `queryId` + `hex` column.

**Dashboard canvas**: Desktop = `react-grid-layout`, Touch = `@dnd-kit/sortable` (1.2s hold, grip-only drag). Panel IDs are deduplicated via `Set`. Order persisted to localStorage.

## DuckDB Rules (for AI tool descriptions)

- **DuckDB v1.5+** (Variegata). Extensions loaded: `httpfs`, `spatial`, `h3`, `a5`. `geometry_always_xy = true` set at init.
- **GEOMETRY is a core type** in v1.5 — no `INSTALL spatial` needed to read GEOMETRY columns from Parquet. `ST_AsWKB`/`ST_GeomFromWKB` are built-in. `ST_Centroid`, `ST_X`, `ST_Y`, `ST_Transform`, `ST_Intersects` still need spatial (pre-loaded).
- **Geometry auto-detection**: Parquet files with GEOMETRY columns auto-render — just `SELECT * FROM file`. DESCRIBE returns `GEOMETRY('EPSG:4326')` in v1.5 (not just `GEOMETRY`), so detection uses `startsWith("GEOMETRY")`.
- `h3_cell_to_latlng()` returns `DOUBLE[2]` list, NOT a struct
- Use `h3_grid_ring` not `h3_k_ring` (deprecated)
- `h3_cell_area(h3_index, 'km^2')` not `h3_cell_area_km2`
- `ST_AsGeoJSON(geometry)` converts spatial geometry to GeoJSON string for GeoMap (but prefer geometry auto-detection — no conversion needed)
- ONE statement per call, always LIMIT 500, HTTPS URLs in FROM
- **v1.5 syntax**: Use `lambda x: x + 1` NOT `x -> x + 1` (arrow syntax deprecated). `TRY_CAST(x AS GEOMETRY)` is broken — use `TRY(ST_GeomFromText(x))`.
- **Spatial filter pushdown**: `geom && ST_MakeEnvelope(w,s,e,n)` prunes Parquet row groups for bbox queries (uses column stats).
- **Coordinate order**: `lat` = latitude (north/south, e.g. 30.05 for Cairo), `lng` = longitude (east/west, e.g. 31.25 for Cairo). H3: `h3_latlng_to_cell(lat, lng, res)`. DuckDB spatial: `ST_Point(lng, lat)` (x=lon, y=lat). deck.gl GeoMap props: `latitude`/`longitude`.
- **NEVER hardcode H3 hex strings** — AI will hallucinate wrong indices. Always compute from coordinates: `h3_latlng_to_cell(lat, lng, res)::BIGINT`. For area queries: `h3_grid_disk(h3_latlng_to_cell(lat, lng, res)::BIGINT, radius)`. If user's pre-computed H3 cells are available in context, use those directly.

## Data

S3 base: `https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop/walkthru-earth`

| Dataset | Path Pattern | H3 Res | Notes |
|---------|-------------|--------|-------|
| Weather (GraphCast) | `indices/weather/model=GraphCast_GFS/date={date}/hour={0,12}/h3_res={0-5}/data.parquet` | 0-5 | Daily dates, hours 0 and 12. |
| Terrain (GEDTM 30m) | `dem-terrain/v2/h3/h3_res={1-10}/data.parquet` | 1-10 | Columns: elev, slope, aspect, tri, tpi |
| Buildings (2.75B) | `indices/building/v2/h3/h3_res={3-8}/data.parquet` | 3-8 | 12 columns incl. max_height_m, height_std_m, volume_density_m3_per_km2 |
| Population (SSP2) | `indices/population/v2/scenario=SSP2/h3_res={1-8}/data.parquet` | 1-8 | 16 time steps: pop_2025 through pop_2100 (every 5 years) |

## Styling Rules

- Tailwind CSS v4, dark/light via CSS variables. Font: Quicksand.
- **No hardcoded colors**: use `bg-muted`, `text-foreground`, `bg-card`, etc. — never `bg-zinc-950`, `#hex`, `rgb()`, `hsl()` inline
- **No `!important`**: use JS conditionals instead
- Semantic classes: `text-destructive` not `text-red-500`, `text-primary` not `text-blue-500`

## Tambo SDK (v1.2.2) — Bidirectional AI Components

Config in `src/lib/tambo.ts`. All pages spread `tamboProviderConfig` (apiKey, components, tools, tamboUrl). Shared `buildContextHelpers(geo)` provides AI with user theme, geo-IP location, and pre-computed H3 cells. `buildInitialSuggestions(geo)` generates personalized suggestion chips.

### How Tambo Works (AI ↔ Component flow)

1. **AI generates a component**: LLM picks a registered component by name, generates props matching its Zod schema → rendered in chat or dashboard.
2. **AI updates existing component**: LLM calls `update_component_props` with new props → `withTamboInteractable` merges them into existing component (no re-mount).
3. **Component reads data via queryId**: AI calls `runSQL` tool → DuckDB executes → result stored in `query-store` → only `queryId` (~10 tokens) returned to LLM. Component calls `useQueryResult(queryId)` to read full dataset reactively.
4. **Component emits cross-filter**: User clicks a hex/bar/row → `setCrossFilter()` → other components react via `useCrossFilter()`.

### Registering Components (`src/lib/tambo.ts`)

```ts
// In tamboProviderConfig.components array:
{
  name: "ComponentName",                    // AI references this name
  description: "When/how AI should use it", // Critical for AI routing
  component: InteractableComponent,         // withTamboInteractable-wrapped
  propsSchema: zodSchema,                   // Zod schema with .describe() on every field
}

// In tamboProviderConfig.tools array:
{
  name: "toolName",
  description: "What this tool does",
  tool: functionRef,                        // Actual function AI can call
  inputSchema: z.object({...}),
  outputSchema: z.object({...}),
}
```

### Making a Component Interactable (AI can update props at runtime)

```ts
// 1. Define Zod schema with .describe() on EVERY field
export const mySchema = z.object({
  queryId: z.string().optional().describe("ID from runSQL result"),
  title: z.string().optional().describe("Display title"),
  // ... all fields described
});

// 2. Build component with React.forwardRef (ref required)
export const MyComponent = React.forwardRef<HTMLDivElement, MyProps>((props, ref) => {
  const queryResult = useQueryResult(props.queryId); // reactive data
  const crossFilter = useCrossFilter();              // optional: react to other components
  return <div ref={ref}>...</div>;
});

// 3. Wrap with withTamboInteractable
export const InteractableMyComponent = withTamboInteractable(MyComponent, {
  componentName: "MyComponent",
  description: "What AI can do: 'When user says X, update Y prop'",
  propsSchema: mySchema,
});
```

### Key Rules

- **`_tambo_*` props**: Components receive hidden props (`_tambo_componentId`, etc.) — never spread `{...props}` onto DOM elements
- **Zod constraints**: No `z.record()`, `z.map()`, `z.set()`. Always `.describe()` every field. Array items need `id` field.
- **`useQueryResult(queryId)`** (reactive via `useSyncExternalStore`) — NOT `getQueryResult()` (won't re-render on thread replay)
- **`_tambo_*` props**: Components receive hidden props (`_tambo_componentId`, etc.) — never spread `{...props}` onto DOM elements
- **DO NOT use `useTamboComponentState`** with `withTamboInteractable` — causes "setState during render" error. Use `propsSchema` for all AI-controlled state.
- **DO NOT use `useTamboInteractable()` or `useTamboCurrentComponent()`** inside a `withTamboInteractable`-wrapped component — same setState conflict.
- **NEVER call setState during render** in components wrapped with `withTamboInteractable` or in components that mount/unmount interactable children (e.g. DashboardCanvas). Always use `useEffect` or `queueMicrotask` for state updates triggered by prop/data changes. Direct setState in render body causes "Cannot update TamboRegistryProvider while rendering TamboInteractableProvider" because re-registration runs during the same render cycle.
- **`useInDashboardPanel()`**: Components check if they're in a dashboard panel to hide redundant headers.
- **Run ID desync**: `invalid_previous_run` error → auto `startNewThread()` to escape error loop

### Current Interactable Components

| Component | AI Can Update | Data Source | Cross-Filter |
|-----------|--------------|-------------|--------------|
| **GeoMap** | latitude, longitude, zoom, basemap, colorScheme, extruded, layerType, layers[] | queryId → useQueryResult | Emits: hex click, bbox. Consumes: bbox |
| **Graph** | chartType, xColumn, yColumns, queryId | queryId → useQueryResult | Emits: bar click. Consumes: bbox (filters rows) |
| **DataTable** | visibleColumns, title | queryId → useQueryResult | Emits: row click. Consumes: bbox |

### Static Components (AI sends all props, no runtime updates)

StatsCard, StatsGrid, InsightCard, DatasetCard, QueryDisplay, DataCard — AI provides all values inline.

### Multi-Layer GeoMap

`layers` array prop (max 5). Each layer: `{ id, queryId, layerType, hexColumn, valueColumn, ..., colorScheme, opacity, visible }`. Floating layer control panel (top-left) for toggle/opacity/reorder persists to localStorage (keyed by layer IDs). Uses 5 fixed `useQueryResult` hook slots (React hooks can't be called conditionally).

### Adding a New Bidirectional Component (checklist)

1. Define Zod schema in component file — `.describe()` every field, use `queryId` for data
2. Build with `React.forwardRef`, use `useQueryResult(queryId)` for data, `useCrossFilter()` if needed
3. Wrap with `withTamboInteractable(Component, { componentName, description, propsSchema })`
4. Register in `src/lib/tambo.ts` → `components` array with `name`, `description`, `component`, `propsSchema`
5. Write `description` that tells AI exactly when to use it and what props to update for common user requests
6. If the component needs tools (e.g. a new data source), add to `tools` array with `inputSchema`/`outputSchema`

## GeoArrow Zero-Copy Rendering

Map layers use `@geoarrow/deck.gl-layers` + `@walkthru-earth/objex-utils` for zero-copy Arrow → GPU rendering. Data pipeline:

```
DuckDB-WASM → Arrow Table → columnArrays (typed array views) + arrowIPC (bytes)
  → stored in query-store alongside JS rows
  → GeoMap reads columnArrays → builds GeoArrow Table (makeData/makeVector, no copy for Float64)
  → GeoArrow layers render directly from Arrow buffers
```

- **H3**: Always uses standard deck.gl `H3HexagonLayer` (not GeoArrow). deck.gl natively generates hexagon polygons from H3 hex strings on the GPU — this is more efficient than passing pre-computed lat/lng, polygon/WKB, or Arrow geometry. Just pass `hex` (string) + `value` (number) per row. GeoArrowH3HexagonLayer is experimental and unreliable.
- **A5** (future): deck.gl 9.2+ has `A5Layer` for pentagonal DGGS cells. A5 is a pentagonal global grid (vs H3's hexagons) with exactly equal-area cells and lower distortion. Uses `getPentagon` accessor (BigInt or hex string). Same GPU-native approach as H3 — deck.gl generates pentagon polygons from cell IDs, no geometry passthrough needed. DuckDB: `INSTALL a5 FROM community; LOAD a5;` — functions: `a5_lonlat_to_cell(lon, lat, res)`, `a5_cell_to_lonlat(cell)`, `a5_cell_to_boundary(cell)`, `a5_cell_to_children(cell, res)`, `a5_cell_area(res)`. All cells at same resolution have exactly equal area.
- **Scatterplot**: `buildPointGeomVector()` interleaves lat/lng into `Float64Array(2*N)`, wraps as `FixedSizeList(2, Float64)` via `makeData`
- **Arc**: `buildGeoArrowArcTable()` — source/target point geometry columns, same interleave pattern
- **WKB/GeoJSON geometry**: `@walkthru-earth/objex-utils` `buildGeoArrowTables()` — direct WKB binary → DataView reads → pre-allocated Float64Array → Arrow Table. Supports point, linestring, polygon, multi* geometries. No GeoJSON parsing, no intermediate JS objects.
- **Fallback**: if `columnArrays`/`wkbArrays` missing, falls back to standard deck.gl layers with JS object data

Layer types: `h3`, `scatterplot`, `geojson`, `arc`, `wkb` (native geometry via WKB)

Packages: `@geoarrow/deck.gl-layers@0.3.1`, `@walkthru-earth/objex-utils@1.0.0`, `apache-arrow@21.1.0`, `hyparquet@1.25.1`

## Conventions

- Never show "Tambo", "DuckDB", "H3", "Parquet", "deck.gl" in UI
- Theme: system detection on first visit, ThemeSwitcher cycles Dark/Light/System
- Map basemap: CARTO Dark Matter / Positron. `auto` follows system theme, `dark`/`light` override via AI or prop
- Thread URLs: `?thread=threadId` only for real IDs (prefix `thr_`)
- Plain `<textarea>` for all text input (no TipTap/rich-text)
- AI must NEVER render checkboxes or selectable lists — users cannot submit selections. Use DatasetCard components + auto-submitting suggestion chips instead.
- Geo-IP: `useGeoIP()` fetches from geojs.io, caches 24h in localStorage (null on first render). Returns city, country, lat/lng, timezone, and pre-computed H3 cells at res 1/3/5/7. Falls back gracefully when blocked.
- Query replay: `useReplayQueries(messages)` shared hook re-runs SQL from restored threads to repopulate query-store. Used by both `/chat` and `/explore`.
- GeoMap height: `h-[420px]` in chat (inline), `h-full` in dashboard panels.
