---
paths:
  - "src/app/**"
---

# App Pages

## Entry Point

`index.html` → `src/main.tsx` → `src/App.tsx` (React Router). Theme detection script + `crypto.randomUUID` polyfill in `index.html`. Fonts: Quicksand (local woff2 via `@font-face` in `globals.css`) + DM Mono (`@fontsource/dm-mono` imported in `main.tsx`), fully self-hosted, no CDN.

## `globals.css`

Tailwind v4 theme variables (light + dark). Brand colors: earth-blue, earth-cyan, earth-green in `@theme inline`. Dashboard grid touch-action rules. No TipTap CSS.

## `explore/page.tsx` (main UI)

- TamboProvider with shared `buildContextHelpers(geo)` + `buildInitialSuggestions(geo)` from `@/lib/tambo`
- `listResources`/`getResource` on TamboProvider exposes active dashboard panels as `panel://` resources for @-mentions
- `useMcpServers()` passes MCP server config to TamboProvider, `<TamboMcpProvider>` wraps children for MCP hooks
- `useGeoIP()` provides user location + H3 cells for personalized context and suggestions
- `MentionChips` above textarea renders `@panel:Component("title")` mentions as colored pills
- `DashboardCanvas` `onMentionPanel` prop inserts `@panel:` mention into chat via `useTamboThreadInput`
- MobileBottomSheet: swipeable drawer, auto-expand on send, auto-collapse on dashboard render
- SessionHistory: thread list with auto-names, new thread button
- `useReplayQueries(messages)` re-runs runSQL tool calls from restored threads
- Thread URLs: `?thread=threadId` (validates `thr_` prefix)
- Settings (theme, cross-filter, query limit) via `<SettingsButton />` gear icon, all controls in popover

## `chat/page.tsx`

- `ChatInner` inside TamboProvider + `TamboMcpProvider`. `useTambo()` for messages, `useReplayQueries()` for thread restore
- `useMcpServers()` passes MCP servers, shared `buildContextHelpers(geo)` + `buildInitialSuggestions(geo)` for AI context
- `MessageThreadFull` with `initialSuggestions` prop for geo-personalized chips
- `<SettingsButton />` in header for theme, cross-filter, query limit
- GeoMap renders at `h-[420px]` inline (no dashboard panels)

## `style-editor/page.tsx`

- Lazy-loaded via `React.lazy()` in App.tsx
- Separate `TamboProvider` with `styleEditorProviderConfig` from `@/lib/tambo-style-editor`
- `listResources`/`getResource` exposes style sources/layers as `style://source/id` and `style://layer/id`
- `buildStyleEditorContext()` sends compact style fingerprint + MapLibre spec + conditional Shortbread schema
- Style loaded from `?style=` URL param or starts with `EMPTY_STYLE`
- Layout: side-by-side chat + MapLibre map (desktop), bottom sheet + map (mobile)
- Chat input: `@` button for source/layer mentions, `/` button for style commands, `MentionChips` above textarea
- Map: feature click shows `SourcePopup` with "Mention layer/source" buttons
- Preset picker in empty state (10 VersaTiles/MapLibre styles)

## `page.tsx`

Landing page. No tech branding visible.
