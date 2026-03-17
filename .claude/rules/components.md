---
paths:
  - "src/components/tambo/**"
---

# Tambo Components

## queryId-driven (zero tokens to LLM)

**GeoMap** (`geo-map.tsx` + `geo-map-deckgl.tsx`): Generic deck.gl map, 4 layer types (h3, scatterplot, geojson, arc). Auto-detects from column names. Basemap: auto/dark/light. AI can update props (zoom, basemap, colorScheme, layerType) at runtime via `withTamboInteractable`. Supports multi-layer via `layers` array prop (max 5) — each layer has `id`, `queryId`, `layerType`, columns, `colorScheme`, `opacity`, `visible`. Floating layer control panel (top-left) for toggle/opacity/reorder persists to localStorage. Uses 5 fixed `useQueryResult` hook slots for React rules compliance. `LayerConfig` in deckgl has per-layer `id`, `colorScheme`, `opacity`, `minVal`, `maxVal`, `columnArrays`, `arrowIPC`, `columnMapping`.

**GeoArrow rendering** (`geo-map-deckgl.tsx`): When `columnArrays` (raw typed arrays from DuckDB Arrow) are available, uses `@geoarrow/deck.gl-layers` for zero-copy rendering. `wrapFloat64()` wraps existing Float64Arrays via `makeData`/`makeVector` (no copy). `buildPointGeomVector()` interleaves lat/lng into FixedSizeList(2) geometry. Falls back to standard deck.gl layers when Arrow data unavailable (e.g., GeoJSON type, or old cached queries).

**H3Map** (`h3-map.tsx`): Backward-compat alias → `GeoMap` with `layerType="h3"`.

**Graph** (`graph.tsx`): queryId + xColumn + yColumns + chartType → Recharts. Cross-filter consume/emit. AI can update chartType, axes at runtime.

**DataTable** (`data-table.tsx`): queryId → auto-derive cols/rows. Paginated 20/page. Cross-filter consume/emit. AI can update visibleColumns, title at runtime.

All use `useQueryResult(queryId)`, `withTamboInteractable` (propsSchema only), `useInDashboardPanel()`.

**Note**: `useTamboComponentState` causes "setState during render" errors with `withTamboInteractable` — do NOT use it in interactable components. Use `propsSchema` for AI control instead.

## Inline props (AI sends values directly)

StatsCard, StatsGrid, InsightCard, DatasetCard, QueryDisplay, DataCard.

## Sizing

All viz components: `h-full flex flex-col`. Header/footer `flex-shrink-0`, content `flex-1 min-h-0`. Map canvas `min-h-[200px]`. GeoMap: `h-[420px]` in chat (inline), `h-full` in dashboard panels — uses `useInDashboardPanel()` to detect context.

## Dashboard (`dashboard-canvas.tsx`)

- Panel header: `[grip] [title] ... [maximize] [close]`. Title from `content.props.title`.
- Panel ID dedup: `Set<string>` with `compIdx` suffix for collisions.
- Desktop: `react-grid-layout`. Maps 8 rows, graphs 5, tables 4.
- Touch: `@dnd-kit/sortable`, TouchSensor (1.2s delay). Grip-only drag. WebGL hidden during drag.
- Panel order persisted to localStorage. Auto-scrolls to latest.

## Message Input (`message-input.tsx`)

- Plain native `<textarea>` only — no TipTap/rich-text.
- Types inline: `ImageItems`, `getImageItems()`, `TamboEditor`, `ResourceItem`, `PromptItem`.
- Compound component: `MessageInput.Textarea`, `.SubmitButton`, `.Toolbar`, etc.
- `invalid_previous_run` error → auto `startNewThread()`, preserves user text for resend.

## Chat

- `message.tsx`: checks `[data-canvas-space="true"]` → "Rendered in dashboard" or inline.
- `thread-content.tsx`: `isGenerating = !isIdle` (covers isWaiting + isStreaming).
- `message-suggestions.tsx`: `useTamboSuggestions()` + initial suggestions when thread empty. Chips are clickable buttons with arrow icon — auto-submit on click (no typing needed). `MessageThreadFull` accepts `initialSuggestions` prop for geo-personalized chips.
- `elicitation-ui.tsx`: Tambo elicitation for human-in-the-loop forms. Single-entry mode (boolean/enum) auto-submits on click. Multi-entry mode shows Submit button.
