# walkthru.earth — AI Explorer

Part of [walkthru.earth](https://walkthru.earth) — people-first urban intelligence. We reveal hidden patterns in cities and turn them into solutions that support wellbeing everywhere.

The AI Explorer lets you talk to the world's geospatial data using natural language. Ask questions about cities, climate, terrain, and population — get instant answers as interactive maps, charts, and tables. All computation runs in your browser.

## Quick Start

```bash
pnpm install
cp example.env.local .env.local   # add your API keys
pnpm dev                           # localhost:5173/ai
```

## Tech Stack

- **Vite** — build tool, dev server, instant HMR
- **React 19** + **React Router** — SPA routing
- **Tambo AI SDK** — bidirectional AI ↔ component framework
- **DuckDB-WASM v1.5** — in-browser SQL engine (spatial, H3, A5 extensions)
- **deck.gl** + **GeoArrow** — GPU-accelerated map rendering with zero-copy Arrow buffers
- **Tailwind CSS v4** — utility-first styling with CSS variables for theming. Fonts: Quicksand (local woff2) + DM Mono (`@fontsource`) — fully self-hosted, no CDN
- **Biome** — linting and formatting

## Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/explore` | Main dashboard — chat sidebar + draggable/resizable map, chart, and table panels |
| `/chat` | Full chat interface with inline component rendering |
| `/interactables` | Component showcase |

## How It Works

```
User → AI Agent → runSQL tool → DuckDB-WASM (in-browser)
                                    ↓
                              Query Store (queryId)
                                    ↓
                        GeoMap / Graph / DataTable
                              ↕ Cross-Filter Bus
```

- **Zero-token data bridge**: AI returns only a `queryId` (~10 tokens). Components read full query results directly from the client-side store — no data passes through the LLM.
- **DuckDB-WASM**: Full SQL engine runs entirely in the browser, querying S3-hosted Parquet files via HTTP. No backend needed.
- **Cross-filtering**: Pan/zoom the map → chart and table filter to visible hexes. Click a chart bar → map and table highlight. Toggle on/off globally.
- **Shareable threads**: Each conversation gets a URL (`?thread=thr_...`). Opening a shared link replays all SQL queries in DuckDB to restore the dashboard state.
- **Static SPA**: Fully client-side — deploys to any CDN, S3, or GitHub Pages.

## Datasets

All data is open and hosted on S3 as H3-indexed Parquet files. The AI resolves URLs automatically via `buildParquetUrl()`.

| Dataset | Description | H3 Res | Source |
|---------|-------------|--------|--------|
| Weather | GraphCast AI global forecast (5-day, 6-hourly) | 1–5 | NOAA |
| Terrain | Elevation, slope, aspect, ruggedness (10.5B cells) | 1–10 | GEDTM 30m |
| Buildings | 2.75B buildings — count, height, footprint, density | 3–8 | Global Building Atlas |
| Population | SSP2 projections 2025–2100 (16 time steps) | 1–8 | WorldPop |
| Places | 72M POIs — 13 categories + landmarks | 1–10 | Overture Maps |
| Transportation | 343M road/rail/water segments, surface types | 1–10 | Overture Maps |
| Base | Land use, water bodies, infrastructure | 1–10 | Overture Maps |
| Addresses | Address points | 1–10 | Overture Maps |
| Buildings (Overture) | Overture building footprints | 1–10 | Overture Maps |

## Cross-Index Analyses

11 composite analyses that join multiple datasets to answer complex questions:

| Analysis | Datasets | Signals |
|----------|----------|---------|
| Walkability | transport + base + terrain + places | Road types, pedestrian infra, barriers, slope, destinations |
| 15-Minute City | places + transport + base + terrain | Amenity diversity, essentials, walkability, cycling, transit, green space |
| Biophilic | base + population | Nature per capita (parks, water, green space vs people) |
| Heat Vulnerability | building + transport + base + weather | Building mass, paved surfaces, nature deficit, temperature |
| Water Security | base + population + weather + building + terrain | Water sources, infrastructure, precipitation, permeability |
| Urban Density | building + population | Buildings per person, coverage ratio |
| Housing Pressure | population + building | Population growth vs building capacity |
| Landslide Risk | terrain + building | Slope + ruggedness vs built environment |
| Vertical Living | building + population | High-rise buildings vs population |
| Population Growth | population | 2025 → 2100 growth trajectories |
| Shrinking Cities | population | Declining population areas |

## Architecture

```
src/
├── app/                          # Pages (landing, explore, chat, interactables)
├── components/
│   ├── tambo/                    # AI-driven components (GeoMap, Graph, DataTable, etc.)
│   └── ui/                       # shadcn/ui primitives
├── lib/
│   └── tambo/                    # Modular AI configuration
│       ├── tools/                # 6 tool registrations (runSQL, datasets, cross-index, suggest)
│       ├── components/           # 11 component registrations
│       ├── context/              # AI context (behavior, DuckDB rules, dataset paths, tips)
│       └── suggestions.ts        # Geo-personalized suggestion chips
└── services/
    ├── datasets/                 # 9 dataset modules + registry
    ├── cross-indices/            # 11 cross-index modules + registry
    ├── resolvers.ts              # Weather date + Overture release resolution
    ├── suggest-analysis.ts       # NL keyword → dataset routing
    ├── duckdb-wasm.ts            # DuckDB init, query execution, geometry detection
    └── query-store.ts            # Reactive query result store + cross-filter bus
```

## Features

- **Interactive maps** — deck.gl + MapLibre with H3 hexagons, A5 pentagons, scatterplot, arc, WKB geometry layers, 6 color schemes, 3D extrusion, light/dark basemap
- **Multi-layer support** — Up to 5 layers per map with floating control panel
- **Charts** — 10 chart types (bar, line, area, pie, scatter, radar, radialBar, treemap, composed, funnel) via Recharts
- **Data tables** — Auto-derived columns with sorting, pagination, and cross-filter highlighting
- **Insight cards** — AI-generated analysis summaries with severity levels
- **Cross-index analyses** — 11 composite scores joining 2–5 datasets (walkability, heat vulnerability, etc.)
- **GeoArrow zero-copy** — DuckDB Arrow tables → GPU buffers with no JS intermediary. Auto-detects geometry columns
- **Geometry auto-detection** — Parquet files with GEOMETRY columns auto-render on the map. Just `SELECT *`
- **Mobile responsive** — Bottom sheet chat on mobile, touch-optimized dashboard
- **Theme** — Dark/light/system with full CSS variable theming
- **Geo-personalized** — Suggestion chips and initial context based on user's location

## Commands

```bash
pnpm dev        # Vite dev server (localhost:5173/ai)
pnpm build      # Static production build → out/
pnpm preview    # Preview production build
pnpm lint       # Biome check
pnpm lint:fix   # Biome auto-fix
```

## Environment Variables

See [`example.env.local`](example.env.local) for all required variables.

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_TAMBO_API_KEY` | Yes | Tambo AI API key (`npx tambo init`) |
| `VITE_TAMBO_URL` | No | Tambo API URL (default: `https://api.tambo.co`) |
| `VITE_POSTHOG_KEY` | No | PostHog analytics key |
| `VITE_POSTHOG_HOST` | No | PostHog host |

## Deployment

The app builds to `out/` as a static SPA. For client-side routing, configure your host to serve `index.html` for all routes under `/ai/*`. The build copies `404.html` automatically for GitHub Pages.

### GitHub Actions

The included workflow (`.github/workflows/deploy.yml`) deploys to GitHub Pages on push to `main`. Set these repository secrets:

- `VITE_TAMBO_API_KEY`
- `VITE_TAMBO_URL`
- `VITE_POSTHOG_KEY` (optional)
- `VITE_POSTHOG_HOST` (optional)

## Related Projects

- [walkthru.earth](https://github.com/walkthru-earth/walkthru-earth.github.io) — Main website with Earth's Living Indices globe

## License

CC BY 4.0 — see [LICENSE](LICENSE)
