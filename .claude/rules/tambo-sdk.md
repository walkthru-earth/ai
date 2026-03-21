---
paths:
  - "src/lib/tambo/**"
  - "src/components/tambo/**"
---

# Tambo SDK Reference (@tambo-ai/react v1.2.2)

## TamboProvider Props

```tsx
<TamboProvider
  apiKey={string}                     // Required
  userKey={string}                    // Required: user identifier for thread scoping
  components={TamboComponent[]}       // Registered generative components
  tools={TamboTool[]}                 // Registered tools AI can call
  contextHelpers={{ [key]: () => object }}  // Dynamic per-message context (runs EVERY message)
  mcpServers={MCPServerConfig[]}      // MCP server connections
  resources={ListResourceItem[]}      // Static @-mentionable resources
  getResource={(uri) => Promise}      // Resource content fetcher
  listResources={(search?) => Promise} // Dynamic resource listing
  tamboUrl={string}                   // Custom API endpoint
  autoGenerateThreadName={boolean}    // Auto-name threads
  autoGenerateNameThreshold={number}  // Messages before auto-naming
>
```

## Core Hooks

| Hook | Returns | Use |
|------|---------|-----|
| `useTambo()` | `{ thread, messages, isLoading, error, addMessage, createThread }` | Thread state + messages |
| `useTamboThreadInput()` | `{ value, setValue, submit, isPending, error }` | Message input control |
| `useTamboThreadList()` | `{ data: Thread[], isLoading, error, refetch }` | All user threads |
| `useTamboStreamStatus()` | `{ isStreaming, isComplete, status }` | Streaming state for UI |
| `useTamboContextHelpers()` | `{ addContextHelper, removeContextHelper }` | Runtime context registration |
| `useTamboContextAttachment()` | `{ addContextAttachment, attachments, removeContextAttachment }` | One-shot context for next message |
| `useTamboRegistry()` | `{ registerResource, registerResources }` | Programmatic resource registration |
| `useTamboSuggestions()` | Suggestion chips from AI | Follow-up suggestions |

## Component Registration

```tsx
const component: TamboComponent = {
  name: "ComponentName",           // AI references this name
  description: "When/how to use",  // Critical for AI routing — be specific
  component: ReactComponent,       // The actual component (or withTamboInteractable-wrapped)
  propsSchema: zodSchema,          // Zod schema with .describe() on EVERY field
};
```

## Tool Registration (defineTool or manual)

```tsx
const tool: TamboTool = {
  name: "toolName",
  description: "What this tool does",
  tool: (input) => output,          // Function AI calls
  inputSchema: z.object({...}),     // Zod schema for parameters
  outputSchema: z.object({...}),    // Optional: Zod schema for return
  annotations?: {
    tamboStreamableHint?: boolean,   // Call tool during streaming (partial args)
    readOnlyHint?: boolean,
    destructiveHint?: boolean,
  },
};
```

## withTamboInteractable

Wraps a component so AI can update its props at runtime:

```tsx
const Interactable = withTamboInteractable(BaseComponent, {
  componentName: "Name",
  description: "What AI can update and when",
  propsSchema: zodSchema,
});
```

### CRITICAL Rules (setState conflicts)

- **DO NOT use `useTamboComponentState`** inside `withTamboInteractable` — causes "setState during render"
- **DO NOT use `useTamboInteractable()` or `useTamboCurrentComponent()`** inside wrapped components — same conflict
- **NEVER call setState in render body** — always use `useEffect` or `queueMicrotask`
- Root cause: `withTamboInteractable` re-registers with `TamboRegistryProvider` during render; any setState that triggers mount/unmount of wrapped components during that cycle causes React warning
- Use `propsSchema` for ALL AI-controlled state (not component-level useState)

### Hidden Props

Components receive `_tambo_componentId`, `_tambo_*` hidden props — **never spread `{...props}` onto DOM elements**. Destructure only the props you need.

## Context System

| Type | When Called | Lifecycle | Use Case |
|------|-----------|-----------|----------|
| `contextHelpers` | Every message | Persistent | Ambient state (theme, location, time) |
| `useTamboContextAttachment` | Next message only | Cleared after send | User-selected files, one-time data |
| Resources (`@` mention) | When user references | On-demand | Docs, searchable data |

**Context helpers are NOT conditional** — all run on every message. No per-tool or per-question filtering.

## Zod Schema Rules

- **Always `.describe()` every field** — AI uses descriptions for prop generation
- **No `z.record()`, `z.map()`, `z.set()`** — unsupported by Tambo serialization
- **Array items need `id` field** — for stable React keys during streaming
- **Streaming**: Props arrive incrementally — use optional chaining, `?? "Loading..."`, check `useTamboStreamStatus()`
- Use `z.infer<typeof Schema>` for TypeScript props type

## Performance / Token Optimization

- Response time proportional to props object size — keep schemas minimal
- Have components fetch data internally rather than passing data arrays as props
- Pass IDs/references (small) instead of full datasets (large) — this is the queryId pattern
- Tool output goes to AI context — return minimal data (queryId, not full rows)

## Thread Management

- Each `userKey` is isolated with separate threads
- `invalid_previous_run` error → call `startNewThread()` to escape error loop
- Thread URLs: `?thread=threadId` (validate `thr_` prefix)
- `useReplayQueries(messages)` re-runs SQL from restored threads

## UPDATE vs CREATE NEW

- `update_component_props`: appearance changes ONLY (zoom, colors, chart type) — same data
- **NEVER change queryId via update** — won't re-render. Always create new component for new data
- When in doubt, create new — users expect previous visualizations to remain for comparison

## State Persistence (Bidirectional Sync via localStorage)

Tambo's `withTamboInteractable` is one-way (Tambo→Component). User interactions are persisted via localStorage to survive refresh:

| State | Storage Key | Debounce | Scope |
|-------|-------------|----------|-------|
| Map viewport (zoom/pan/pitch/bearing) | `geomap-viewport:{queryId\|layerIds}` | 300ms (moveend) | Per map |
| Map layer opacity/visibility/order | `geomap-layers:{layerIds}` | Immediate | Per map |
| Dashboard panel order | `panel-order-${threadId}` | Immediate | Per thread |
| Dashboard panel sizes | `panel-layouts-${threadId}` | 500ms | Per thread |
| Dashboard dismissed panels | `panel-dismissed-${threadId}` | Immediate | Per thread |

**NOT persisted** (intentionally): DataTable pagination, maximized panel state, Graph hover/click.

**programmaticMoveRef**: In DeckGLMap, a ref flag suppresses viewport saves during AI-driven flyTo, auto-fitBounds, and external flyTo. Only user gestures are saved. Flag is auto-cleared after each `moveend`.
