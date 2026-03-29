# Tambo Components Guidelines

Components in this directory are registered with Tambo for AI-driven generative UI.

Read the full documentation at https://docs.tambo.co/llms.txt for component creation patterns and best practices.

## Registered Components (12)

### Interactable (AI can update props at runtime)

| Component | File | Description |
|-----------|------|-------------|
| **GeoMap** | `geo-map.tsx` + `geo-map-deckgl.tsx` | deck.gl map with 6 layer types (h3, a5, scatterplot, geojson, arc, wkb). Multi-layer (max 5). |
| **H3Map** | `h3-map.tsx` | Backward-compat alias for GeoMap with `layerType="h3"` |
| **Graph** | `graph.tsx` | Recharts with 10 chart types (bar, line, area, pie, scatter, radar, radialBar, treemap, composed, funnel) |
| **DataTable** | `data-table.tsx` | Paginated table with zoom-to-record and copy-record actions |
| **TimeSlider** | `time-slider.tsx` | Time playback for weather. Cross-filters GeoMap + Graph via time filter bus |
| **ObjexViewer** | `objex-viewer.tsx` | 3D viewer for GeoTIFF, LAZ, PMTiles, FlatGeobuf |

### Static (AI sends all props inline)

| Component | Description |
|-----------|-------------|
| **StatsCard** | Single metric display (value, label, icon, severity) |
| **StatsGrid** | Multiple metrics in a grid |
| **InsightCard** | Key finding with severity level |
| **DatasetCard** | Dataset metadata card |
| **QueryDisplay** | SQL query with syntax highlighting |
| **DataCard** | Selectable option cards |

## Rules

- All interactable components use `withTamboInteractable` + `React.forwardRef` + Zod `propsSchema`
- Data components read from `useQueryResult(queryId)` (reactive via `useSyncExternalStore`)
- Never use `useTamboComponentState`, `useTamboInteractable()`, or `useTamboCurrentComponent()` inside wrapped components
- Never call `setState` in render body. Use `useEffect` or `queueMicrotask`
- Never spread `{...props}` onto DOM elements (hidden `_tambo_*` props)
- `.describe()` every Zod field. No `z.record()`, `z.map()`, `z.set()`
