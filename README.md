# walkthru.earth — AI Explorer

Part of [walkthru.earth](https://walkthru.earth) — people-first urban intelligence. We reveal hidden patterns in cities and turn them into solutions that support wellbeing everywhere.

The AI Explorer lets you talk to the world's geospatial data using natural language. Ask questions about cities, climate, terrain, and population — get instant answers as interactive maps, charts, and tables. All computation runs in your browser.

## Quick Start

```bash
pnpm install
cp example.env.local .env.local   # add your API keys
pnpm dev                           # localhost:3000
```

## Routes

| Route | Description |
|-------|-------------|
| `/explore` | Main dashboard — chat sidebar + draggable/resizable map, chart, and table panels |
| `/chat` | Full chat interface with inline component rendering |

## How It Works

```
User → AI Agent → runSQL tool → DuckDB-WASM (in-browser)
                                    ↓
                              Query Store (queryId)
                                    ↓
                        H3Map / Graph / DataTable
                              ↕ Cross-Filter Bus
```

- **Zero-token data bridge**: AI returns only a `queryId` (~10 tokens). Components read full query results directly from the client-side store — no data passes through the LLM.
- **DuckDB-WASM**: Full SQL engine runs entirely in the browser, querying S3-hosted Parquet files via HTTP. No backend needed.
- **Cross-filtering**: Pan/zoom the map → chart and table filter to visible hexes. Click a chart bar → map and table highlight. Toggle on/off globally.
- **Shareable threads**: Each conversation gets a URL (`?thread=thr_...`). Opening a shared link replays all SQL queries in DuckDB to restore the dashboard state.
- **Static export**: Fully client-side — deploys to any CDN, S3, or GitHub Pages.

## Datasets

All data is open and hosted on S3 as H3-indexed Parquet files.

| Dataset | Description | H3 Resolutions |
|---------|-------------|-----------------|
| Weather | GraphCast AI global forecast | Res 5 |
| Terrain | GEDTM 30m elevation, slope, aspect (10.5B cells) | Res 1–10 |
| Buildings | 2.75B buildings — count, height, footprint, density | Res 3–8 |
| Population | SSP2 projections 2025–2100 | Res 1–8 |

## Features

- **Interactive H3 hex maps** — deck.gl + MapLibre with 6 color schemes, 3D extrusion, light/dark basemap
- **Charts** — Bar, line, pie via Recharts with smart axis labels (no raw hex IDs)
- **Data tables** — Auto-derived columns with sorting and cross-filter highlighting
- **Insight cards** — AI-generated analysis summaries with severity levels
- **Mobile responsive** — Bottom sheet chat on mobile, touch-optimized dashboard (no drag on touch devices)
- **Theme** — Dark/light/system with full CSS variable theming
- **RTL support** — MapLibre RTL text plugin for Arabic, Hebrew labels

## Commands

```bash
pnpm dev        # Development server
pnpm build      # Static production build (output: out/)
pnpm lint       # ESLint
```

## Environment Variables

See [`example.env.local`](example.env.local) for all required variables.

## Related Projects

- [walkthru.earth](https://github.com/walkthru-earth/walkthru-earth.github.io) — Main website with Earth's Living Indices globe

## License

CC BY 4.0 — see [LICENSE](LICENSE)
