---
paths:
  - "src/app/**"
---

# App Pages

## `layout.tsx`

Quicksand + DM Mono fonts. Inline script: theme detection (prevents FOUC) + `crypto.randomUUID` polyfill. Viewport `maximum-scale=1` prevents iOS input zoom.

## `globals.css`

Tailwind v4 theme variables (light + dark). Brand colors: earth-blue, earth-cyan, earth-green in `@theme inline`. Dashboard grid touch-action rules. No TipTap CSS.

## `explore/page.tsx` (main UI)

- TamboProvider with shared `buildContextHelpers(geo)` + `buildInitialSuggestions(geo)` from `tambo.ts`
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
