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

## Tambo SDK (v1.2.2)

- Config in `src/lib/tambo.ts` — all pages spread `tamboProviderConfig`
- Components receive `_tambo_*` props — never spread `{...props}` onto DOM
- Zod: no `z.record()`/`z.map()`/`z.set()`, always `.describe()` every field, array items need `id`
- `useQueryResult(queryId)` (reactive) — NOT `getQueryResult()` (won't re-render on thread replay)
- **Interactable components**: GeoMap, Graph, DataTable use `withTamboInteractable` + `propsSchema`. AI can update props at runtime (zoom, basemap, chartType, visibleColumns). Do NOT use `useTamboComponentState` with interactables (causes setState-during-render error).
- **GeoMap multi-layer**: `layers` array prop (max 5). Each layer has `id`, `queryId`, `layerType`, column mappings, `colorScheme`, `opacity`, `visible`. Floating layer control panel (toggle visibility, opacity slider, reorder) persists to localStorage (keyed by layer IDs). Cannot use `useTamboInteractable`/`useTamboCurrentComponent` inside interactable components — same setState-during-render conflict as `useTamboComponentState`.
- **Run ID desync**: `invalid_previous_run` error → auto `startNewThread()` to escape error loop

## Conventions

- Never show "Tambo", "DuckDB", "H3", "Parquet", "deck.gl" in UI
- Theme: system detection on first visit, ThemeSwitcher cycles Dark/Light/System
- Map basemap: CARTO Dark Matter / Positron. `auto` follows system theme, `dark`/`light` override via AI or prop
- Thread URLs: `?thread=threadId` only for real IDs (prefix `thr_`)
- Plain `<textarea>` for all text input (no TipTap/rich-text)
