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

All data is open and hosted on S3 as H3-indexed Parquet files.

| Dataset | Description | H3 Resolutions |
|---------|-------------|-----------------|
| Weather | GraphCast AI global forecast | Res 0–5 |
| Terrain | GEDTM 30m elevation, slope, aspect (10.5B cells) | Res 1–10 |
| Buildings | 2.75B buildings — count, height, footprint, density | Res 3–8 |
| Population | SSP2 projections 2025–2100 | Res 1–8 |

## Features

- **Interactive maps** — deck.gl + MapLibre with H3 hexagons, scatterplot, arc, WKB geometry layers, 6 color schemes, 3D extrusion, light/dark basemap
- **Multi-layer support** — Up to 5 layers per map with floating control panel
- **Charts** — Bar, line, pie via Recharts with smart axis labels
- **Data tables** — Auto-derived columns with sorting and cross-filter highlighting
- **Insight cards** — AI-generated analysis summaries with severity levels
- **GeoArrow zero-copy** — DuckDB Arrow tables → GPU buffers with no JS intermediary. Auto-detects geometry columns and returns `geometryNote` to AI
- **Mobile responsive** — Bottom sheet chat on mobile, touch-optimized dashboard
- **Theme** — Dark/light/system with full CSS variable theming

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
