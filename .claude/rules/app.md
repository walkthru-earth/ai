---
paths:
  - "src/app/**"
---

# App Pages

## Entry Point

`index.html` → `src/main.tsx` → `src/App.tsx` (React Router). Theme detection script + `crypto.randomUUID` polyfill in `index.html`. Fonts: Quicksand (local woff2 via `@font-face` in `globals.css`) + DM Mono (`@fontsource/dm-mono` imported in `main.tsx`) — fully self-hosted, no CDN.

## `globals.css`

Tailwind v4 theme variables (light + dark). Brand colors: earth-blue, earth-cyan, earth-green in `@theme inline`. Dashboard grid touch-action rules. No TipTap CSS.

## `explore/page.tsx` (main UI)

- TamboProvider with shared `buildContextHelpers(geo)` + `buildInitialSuggestions(geo)` from `@/lib/tambo`
- `useGeoIP()` provides user location + H3 cells for personalized context and suggestions
- MobileBottomSheet: swipeable drawer, auto-expand on send, auto-collapse on dashboard render
- SessionHistory: thread list with auto-names, new thread button
- `useReplayQueries(messages)` re-runs runSQL tool calls from restored threads
- Thread URLs: `?thread=threadId` (validates `thr_` prefix)

## `chat/page.tsx`

- `ChatInner` inside TamboProvider — `useTambo()` for messages, `useReplayQueries()` for thread restore
- Shared `buildContextHelpers(geo)` + `buildInitialSuggestions(geo)` for AI context and suggestions
- `MessageThreadFull` with `initialSuggestions` prop for geo-personalized chips
- GeoMap renders at `h-[420px]` inline (no dashboard panels)

## `page.tsx`

Landing page. No tech branding visible.
