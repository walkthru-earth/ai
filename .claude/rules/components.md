---
paths:
  - "src/components/tambo/**"
---

# Tambo Components

## queryId-driven (zero tokens to LLM)

**GeoMap** (`geo-map.tsx` + `geo-map-deckgl.tsx`): Generic deck.gl map, 6 layer types (h3, a5, scatterplot, geojson, arc, wkb). Auto-detects from column names + wkbArrays presence. Detection priority: a5 (`pentagon`/`a5_cell`/`a5_index`) → h3 (`hex`/`h3_index`) → wkb (auto-detected GEOMETRY) → arc → scatterplot → geojson. Basemap: auto/dark/light. AI can update props (zoom, basemap, colorScheme, layerType) at runtime via `withTamboInteractable`. Supports multi-layer via `layers` array prop (max 5) — each layer has `id`, `queryId`, `layerType`, `pentagonColumn`, columns, `colorScheme`, `opacity`, `visible`. Floating layer control panel (top-left) for toggle/opacity/reorder persists to localStorage. Uses 5 fixed `useQueryResult` hook slots for React rules compliance. `LayerConfig` in deckgl has per-layer `id`, `colorScheme`, `opacity`, `minVal`, `maxVal`, `columnArrays`, `arrowIPC`, `wkbArrays`, `columnMapping` (includes `pentagonColumn`).

**Map interactivity** (`geo-map-deckgl.tsx`):
- **Hover tooltip** (desktop): `onHover` on all layers → `extractHoverProps()` extracts up to 6 key-value pairs → `MapTooltip` renders floating card with `bg-card/95 backdrop-blur-sm`. Repositions to stay within map bounds. Cursor changes to `crosshair` on feature hover.
- **Tap tooltip** (mobile): `makeClickHandler` wraps layer `onClick` — on touch devices, click also sets `hoverInfo` to show tooltip. Tooltip dismisses on `movestart` (pan/zoom).
- **Right-click context menu**: `onContextMenu` on wrapper div → if hovering a feature, shows dropdown with "Copy record" (JSON to clipboard). Dismisses on click anywhere or map move.
- **Fly-to consumer**: `useFlyToVersion()` + `consumeFlyTo()` — listens for external fly-to requests (e.g. DataTable "Zoom to record") and calls `mapRef.flyTo()`.
- `HoverInfo` type: `{ x, y, object, layerType }`. `extractHoverProps()` handles both GeoArrow (Arrow table schema at index) and standard (JS object) layers.

**Geometry auto-detection**: When `StoredQuery.wkbArrays` is present (auto-extracted by `runQuery()` from GEOMETRY columns), `transformQueryToLayer()` takes the WKB fast path — bypasses GeoJSON parsing, routes directly to `buildGeoArrowTables()` zero-copy rendering. Lat/lng from the auto-injected centroid columns provide bounds. Works with GeoParquet, native Parquet geometry (Format 2.11+), and DuckDB GEOMETRY columns.

**GeoArrow rendering** (`geo-map-deckgl.tsx`): Four paths:
1. **Cell ID path** (H3/A5): Standard deck.gl `H3HexagonLayer` / `A5Layer` — GPU-native polygon generation from cell IDs. No GeoArrow, no geometry data needed.
2. **WKB path** (preferred for geometry): `wkbArrays → buildGeoArrowTables() → GeoArrowScatterplotLayer/PathLayer/PolygonLayer`. Zero-copy binary → Arrow. Used automatically when GEOMETRY columns detected. Spatial analysis results (ST_Buffer, ST_Intersects, spatial joins) auto-route here.
3. **Point/Arc path**: `columnArrays → buildGeoArrowPointTable()/buildGeoArrowArcTable()`. Interleaves lat/lng into FixedSizeList(2) geometry.
4. **Fallback**: Standard deck.gl layers with JS object data when Arrow data unavailable.

**H3Map** (`h3-map.tsx`): Backward-compat alias → `GeoMap` with `layerType="h3"`.

**Graph** (`graph.tsx`): queryId + xColumn + yColumns + chartType + xLabel + yLabel → Recharts. 10 chart types: bar, line, area, pie, scatter, radar, radialBar, treemap, composed (bar+line overlay), funnel. Cross-filter consume/emit. AI can update chartType, axes, labels at runtime. Y-axis auto-formats (5000→5k). Long labels truncated with SVG `<title>` hover. Legend renders at top. Always set xLabel/yLabel.

**DataTable** (`data-table.tsx`): queryId → auto-derive cols/rows. Paginated 20/page. Cross-filter consume/emit. AI can update visibleColumns, title at runtime. Click row → expands action bar: **Zoom to record** (flies map to row's lat/lng or H3 hex centroid via `requestFlyTo()`) + **Copy record** (JSON to clipboard). Expanded row collapses on re-click or page change.

All use `useQueryResult(queryId)`, `withTamboInteractable` (propsSchema only), `useInDashboardPanel()`.

**setState rules for interactable components**:
- Do NOT use `useTamboComponentState`, `useTamboInteractable()`, or `useTamboCurrentComponent()` — all cause "setState during render" errors with `withTamboInteractable`.
- NEVER call setState directly in render body — always use `useEffect` or callbacks. Example: data-table pagination reset uses `useEffect(safePage)`, not inline `if (safePage !== page) setPage()`.
- Dashboard toggleMaximize uses `queueMicrotask()` to defer setState.
- Thread reset in DashboardCanvas uses `useEffect(currentThreadId)` not render-body setState.
- Root cause: `withTamboInteractable` re-registers with `TamboRegistryProvider` during render; any setState that triggers mount/unmount of wrapped components during that cycle causes the React warning.

## Inline props (AI sends values directly)

StatsCard, StatsGrid, InsightCard, DatasetCard, QueryDisplay, DataCard.

## Sizing

All viz components use `useInDashboardPanel()` to detect context:
- **In dashboard panels**: `h-full` — fills the panel container (definite height from grid layout or touch `h-[280px]`/`h-[420px]`)
- **In chat (inline)**: fixed height — GeoMap `h-[420px]`, Graph `h-[320px]`
- Inner layout: `flex flex-col`, header/footer `flex-shrink-0`, content `flex-1 min-h-0`
- Graph: compact `p-2 sm:p-4` padding, smart X-axis (auto-rotate at >10 or long labels), legend at top, Y-axis auto-format (5k). Default zoom: 1 (world view)
- Textarea: `min-h-[44px]` on mobile, `sm:min-h-[82px]` on desktop

## Dashboard (`dashboard-canvas.tsx`)

- Panel header: `[grip] [title] ... [maximize] [close]`. Title from `content.props.title`.
- Panel ID dedup: `Set<string>` with `compIdx` suffix for collisions.
- Desktop: `react-grid-layout`, rowHeight 80px. Maps 8 rows, graphs 5, tables 4.
- Touch: `@dnd-kit/sortable`, TouchSensor (1.2s delay). Grip-only drag. Maps `h-[420px]`, others `h-[280px]`.
- Maximized panel: `fixed inset-0 z-40 bg-background` — covers all floating UI. Minimize via `queueMicrotask` to avoid setState-during-render.
- Thread reset: `useEffect(currentThreadId)` clears dismissed/layouts/order. NEVER in render body.
- Panel order persisted to localStorage. Auto-scrolls to latest.

## Message Input (`message-input.tsx`)

- Plain native `<textarea>` only — no TipTap/rich-text.
- Types inline: `ImageItems`, `getImageItems()`, `TamboEditor`, `ResourceItem`, `PromptItem`.
- Compound component: `MessageInput.Textarea`, `.SubmitButton`, `.Toolbar`, etc.
- `invalid_previous_run` error → auto `startNewThread()`, preserves user text for resend.

## Auto-scroll (`scrollable-message-container.tsx`)

- Ref-based stick-to-bottom (no state re-triggers). Instant `scrollTop` during streaming (no smooth-scroll lag). Smooth scroll on non-streaming content changes.
- **User scroll-up**: pauses auto-scroll (ignores programmatic scroll events via `programmaticScrollRef`).
- **Resume**: re-enables on new user message (detects `role === "user"` + count increase) or when user manually scrolls to bottom.
- Matches ChatGPT/Claude app behavior.

## UPDATE vs CREATE NEW

- **Update existing** (`update_component_props`): same data, change appearance (zoom, colors, chart type, hide columns).
- **Create new**: different metric/dataset ("show wind" when chart shows temp). Previous visualizations stay visible for comparison.

## Chat

- `message.tsx`: checks `[data-canvas-space="true"]` → "Rendered in dashboard" or inline.
- `thread-content.tsx`: `isGenerating = !isIdle` (covers isWaiting + isStreaming).
- `message-suggestions.tsx`: `useTamboSuggestions()` + initial suggestions when thread empty. Chips: single horizontal row with `overflow-x-auto scrollbar-none`, `whitespace-nowrap shrink-0` per chip, arrow icon for click affordance. Auto-submit on click. Positioned ABOVE input in both `/chat` and `/explore`.
- `message-thread-full.tsx`: accepts `initialSuggestions` prop for geo-personalized chips.
- `elicitation-ui.tsx`: Tambo elicitation for human-in-the-loop forms. Single-entry mode (boolean/enum) auto-submits on click. Multi-entry mode shows Submit button.

## Mobile Bottom Sheet (`explore/page.tsx`)

- `MobileBottomSheet`: `fixed inset-x-0 bottom-0 z-30`. No hardcoded `max-h` when collapsed — sizes to content dynamically. `top-0` when expanded (full screen).
- Suggestion chips above input bar, always visible in collapsed state.
- Floating toolbar (`fixed top-2 right-2 z-20`): CrossFilterToggle + ThemeSwitcher. Hidden by maximized panels (`z-40`).
