# Walkthru Earth AI

AI urban intelligence platform — natural language queries over global geospatial data (weather, terrain, buildings, population). Built on Tambo AI + DuckDB-WASM + deck.gl.

## Commands

```bash
pnpm dev          # localhost:3000/ai
pnpm build        # production (basePath: /ai)
pnpm lint         # biome check
pnpm lint:fix     # biome auto-fix
```

- **Biome** (not ESLint) — `biome.json`: 2-space indent, double quotes, semicolons, 120 chars
- **Pre-commit**: lefthook runs `biome check --write --staged`

## Architecture

**queryId pattern** (zero-token data bridge): AI calls `runSQL` → DuckDB executes → full result stored in `query-store.ts` → only `queryId` returned to LLM (~10 tokens). Components read data from store via `useQueryResult(queryId)`.

**Cross-filter bus**: Lightweight pub/sub in `query-store.ts`. Components emit/consume `bbox` (map viewport) and `value` (click) filters. Requires shared `queryId` + `hex` column.

**Dashboard canvas**: Desktop = `react-grid-layout`, Touch = `@dnd-kit/sortable` (1.2s hold, grip-only drag). Panel IDs are deduplicated via `Set`. Order persisted to localStorage.

## DuckDB Rules (for AI tool descriptions)

- Extensions loaded: `httpfs`, `h3`, `spatial`
- `h3_cell_to_latlng()` returns `DOUBLE[2]` list, NOT a struct
- Use `h3_grid_ring` not `h3_k_ring` (deprecated)
- `h3_cell_area(h3_index, 'km^2')` not `h3_cell_area_km2`
- `ST_AsGeoJSON(geometry)` converts spatial geometry to GeoJSON string for GeoMap
- ONE statement per call, always LIMIT 500, HTTPS URLs in FROM
- **NEVER hardcode H3 hex strings** — AI will hallucinate wrong indices. Always compute from coordinates: `h3_latlng_to_cell(lat, lng, res)::BIGINT`. For area queries: `h3_grid_disk(h3_latlng_to_cell(lat, lng, res)::BIGINT, radius)`

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

Config in `src/lib/tambo.ts`. All pages spread `tamboProviderConfig` (apiKey, components, tools, tamboUrl).

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
- **DO NOT use `useTamboComponentState`** with `withTamboInteractable` — causes "setState during render" error. Use `propsSchema` for all AI-controlled state.
- **DO NOT use `useTamboInteractable()` or `useTamboCurrentComponent()`** inside a `withTamboInteractable`-wrapped component — same setState conflict.
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

- **H3**: `buildGeoArrowH3Table()` — hex strings via `vectorFromArray(Utf8)`, values via `wrapFloat64()` (zero-copy)
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
