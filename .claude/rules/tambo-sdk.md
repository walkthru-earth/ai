---
paths:
  - "src/lib/tambo/**"
  - "src/components/tambo/**"
---

# Tambo SDK Reference (@tambo-ai/react v1.2.2+, latest v1.2.4)

## TamboProvider Props

```tsx
<TamboProvider
  apiKey={string}                     // Required (or projectKey)
  userKey={string}                    // Required: user identifier for thread scoping
  userToken={string}                  // Optional: JWT for per-user OAuth auth (alternative to userKey)
  components={TamboComponent[]}       // Registered generative components
  tools={TamboTool[]}                 // Registered tools AI can call
  contextHelpers={{ [key]: () => object }}  // Dynamic per-message context (runs EVERY message)
  mcpServers={McpServerInfo[]}        // MCP server connections (client-side)
  resources={ListResourceItem[]}      // Static @-mentionable resources
  getResource={(uri) => Promise}      // Resource content fetcher
  listResources={(search?) => Promise} // Dynamic resource listing
  tamboUrl={string}                   // Custom API endpoint
  environment={string}                // Environment designation
  initialMessages={InitialInputMessage[]} // Pre-populated messages (content blocks, not strings)
  onCallUnregisteredTool={(name) => void} // Callback for unregistered tool calls
  autoGenerateThreadName={boolean}    // Auto-name threads (default: true)
  autoGenerateNameThreshold={number}  // Messages before auto-naming (default: 3)
>
```

## Core Hooks

| Hook | Returns | Use |
|------|---------|-----|
| `useTambo()` | `{ thread, messages, streamingState, isStreaming, isWaiting, isIdle, initThread, switchThread, startNewThread, cancelRun, client }` | Thread state + streaming + management |
| `useTamboThreadInput()` | `{ value, setValue, submit, images, addImage, addImages, removeImage, clearImages, isPending, isDisabled, isError, error }` | Message input + image staging |
| `useTamboThread(threadId)` | `UseQueryResult<ThreadRetrieveResponse>` | Fetch single thread by ID |
| `useTamboThreadList(listOptions?, queryOptions?)` | `{ data: { threads, hasMore, nextCursor }, isLoading, error, refetch }` | Paginated thread list |
| `useTamboStreamStatus()` | `{ streamStatus: StreamStatus, propStatus: Record<keyof Props, PropStatus> }` | Per-prop streaming state |
| `useTamboComponentState(key, initial, debounce?)` | `[state, setState, { isPending, error, flush }]` | Bidirectional state sync (only in ComponentRenderer) |
| `useTamboContextHelpers()` | `{ getAdditionalContext, getContextHelpers, addContextHelper, removeContextHelper }` | Runtime context registration |
| `useTamboContextAttachment()` | `{ attachments, addContextAttachment, removeContextAttachment, clearContextAttachments }` | One-shot context for next message |
| `useTamboRegistry()` | `{ registerComponent, registerTool, registerTools, componentList, toolRegistry }` | Runtime component/tool registration |
| `useTamboSuggestions(options?)` | `{ suggestions, generate, accept, isGenerating, isAccepting, selectedSuggestionId }` | Suggestion chips with accept/generate |
| `useTamboInteractable()` | `{ addInteractableComponent, removeInteractableComponent, updateInteractableComponentProps, ... }` | Interactable registry (prefer withTamboInteractable) |
| `useTamboCurrentComponent()` | `{ componentName, props, interactableId, description }` | Current component metadata |
| `useTamboCurrentMessage()` | `TamboThreadMessage` | Current message from provider |
| `useComponentContent()` | `{ componentId, threadId, messageId, componentName }` | Component instance metadata |
| `useTamboClient()` | Tambo API client | Direct API access |
| `useTamboVoice()` | `{ startRecording, stopRecording, isRecording, isTranscribing, transcript }` | Speech-to-text |
| `useIsTamboTokenUpdating()` | `boolean` | Token refresh indicator |

## Component Registration

```tsx
const component: TamboComponent = {
  name: "ComponentName",           // AI references this name
  description: "When/how to use",  // Critical for AI routing - be specific
  component: ReactComponent,       // The actual component (or withTamboInteractable-wrapped)
  propsSchema: zodSchema,          // Zod schema with .describe() on EVERY field
  loadingComponent?: ReactComponent, // Optional: shown while props stream
  associatedTools?: TamboTool[],   // Optional: tools bundled with this component
  annotations?: ToolAnnotations,   // Optional: hints for AI
};
```

## Tool Registration (defineTool or manual)

```tsx
const tool: TamboTool = {
  name: "toolName",
  description: "What this tool does",
  title?: "Display Title",          // Optional: UI display name
  tool: (input) => output,          // Function AI calls (receives single object, not spread args)
  inputSchema: z.object({...}),     // Zod schema for parameters (Zod 3.25.76+, Zod 4.x, or JSON Schema)
  outputSchema: z.object({...}),    // Optional: Zod schema for return
  transformToContent?: (result) => ContentPart[], // Optional: transform result to rich content
  maxCalls?: number,                // Optional: max invocations per run
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
  stateSchema?: zodSchema,          // Optional: schema for bidirectional state
  annotations?: ToolAnnotations,
});
```

Wrapped components receive extra props: `interactableId?: string`, `onInteractableReady?: (id) => void`, `onPropsUpdate?: (newProps) => void`.

### CRITICAL Rules (setState conflicts)

- **DO NOT use `useTamboComponentState`** inside `withTamboInteractable`. Causes "setState during render"
- **DO NOT use `useTamboInteractable()` or `useTamboCurrentComponent()`** inside wrapped components. Same conflict
- **NEVER call setState in render body**. Always use `useEffect` or `queueMicrotask`
- Root cause: `withTamboInteractable` re-registers with `TamboRegistryProvider` during render; any setState that triggers mount/unmount of wrapped components during that cycle causes React warning
- Use `propsSchema` for ALL AI-controlled state (not component-level useState)

### Hidden Props

Components receive `_tambo_componentId`, `_tambo_*` hidden props. **Never spread `{...props}` onto DOM elements**. Destructure only the props you need.

## Context System

| Type | When Called | Lifecycle | Use Case |
|------|-----------|-----------|----------|
| `contextHelpers` | Every message | Persistent | Ambient state (theme, location, time) |
| `useTamboContextAttachment` | Next message only | Cleared after send | User-selected files, one-time data |
| Resources (`@` mention) | When user references | On-demand | Docs, searchable data |

**Context helpers are NOT conditional**. All run on every message. No per-tool or per-question filtering.

## Zod Schema Rules

- **Always `.describe()` every field**. AI uses descriptions for prop generation
- **No `z.record()`, `z.map()`, `z.set()`**. Unsupported by Tambo serialization
- **Array items need `id` field**. Required for stable React keys during streaming
- **Streaming**: Props arrive incrementally. Use optional chaining, `?? "Loading..."`, check `useTamboStreamStatus()`
- Use `z.infer<typeof Schema>` for TypeScript props type

## Performance / Token Optimization

- Response time proportional to props object size. Keep schemas minimal
- Have components fetch data internally rather than passing data arrays as props
- Pass IDs/references (small) instead of full datasets (large). This is the queryId pattern
- Tool output goes to AI context. Return minimal data (queryId, not full rows)

## Thread Management

- Each `userKey` is isolated with separate threads
- `invalid_previous_run` error → call `startNewThread()` to escape error loop
- Thread URLs: `?thread=threadId` (validate `thr_` prefix)
- `useReplayQueries(messages)` re-runs SQL from restored threads
- **Thread delete**: `useTamboClient()` → `client.threads.delete(threadId, { userKey })`. Requires `userKey` in params. Available in `ThreadOptionsDropdown` with inline confirmation UI.
- **Thread rename**: `client.threads.update(threadId, { userKey, name })`. Wired up in `ThreadOptionsDropdown` with inline edit input, refetches thread list on success.

## Message Content Types (SDK)

Tambo messages contain `content` blocks (Anthropic-style). Five content types:

| Type | Key Fields | Description |
|------|-----------|-------------|
| `text` | `text: string` | Plain text |
| `component` | `id, name, props, streamingState?, renderedComponent?` | AI-generated component |
| `tool_use` | `id, name, input, hasCompleted?, statusMessage?` | Tool invocation |
| `tool_result` | `toolUseId, content: (TextContent\|ResourceContent)[], isError?` | Tool execution result |
| `resource` | `uri, name?, mimeType?, text?` | Attached resource |

**Component content** (`TamboComponentContent`):

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique component instance ID |
| `name` | `string` | Registered component name (e.g. `"GeoMap"`, `"Graph"`, `"DataTable"`) |
| `props` | `Record<string, unknown>` | Props to pass to the component |
| `type` | `"component"` | Content block type identifier |
| `streamingState` | `"started" \| "streaming" \| "done"` | Streaming lifecycle |
| `renderedComponent` | `ReactElement` | React-specific: the rendered element (added by `@tambo-ai/react`) |

**CRITICAL**: The component name is `content.name`, NOT `content.componentName`. The `componentName` field exists only on `withTamboInteractable` config and `TamboCurrentComponent` hook, never on raw message content blocks. DashboardCanvas reads `content.name` to determine panel type for sizing and classification.

**TamboThreadMessage** fields: `id`, `role` (`user`/`assistant`/`system`), `content: Content[]`, `createdAt?`, `metadata?`, `parentMessageId?`, `reasoning?: string[]`, `reasoningDurationMS?`.

## UPDATE vs CREATE NEW

- **Update existing** (`update_component_props`): appearance changes OR data replacement on the same panel. Zoom, pitch, bearing, colors, chart type, hide columns, or a new `queryId` to swap data in place. Changing `queryId` via `update_component_props` works because `useQueryResult` reactively picks up the new data via `useSyncExternalStore`. Use update when the user says "show me X instead" or "change this to Y".
- **Create new** component when the user wants to see both old and new data side by side for comparison ("also show X", "compare with Y").

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

## Streaming State

`streamingState.status`: `"idle" | "waiting" | "streaming"`. `useTambo()` provides convenience booleans: `isIdle`, `isWaiting`, `isStreaming`. `cancelRun()` aborts current run.

`StreamStatus` (from `useTamboStreamStatus`): `{ isPending, isStreaming, isSuccess, isError, streamError? }`. `PropStatus`: per-property `{ isPending, isStreaming, isSuccess, error? }`.

Props remain `undefined` during generation. Always use `?.` and `??` operators. Generate array item IDs client-side (AI-generated IDs unreliable during streaming).

## MCP Integration (Client-Side)

Configure via `mcpServers` prop on `TamboProvider`. Wrap children with `<TamboMcpProvider>` (from `@tambo-ai/react/mcp`).

```tsx
import { TamboMcpProvider, MCPTransport } from "@tambo-ai/react/mcp";

<TamboProvider mcpServers={[{ url: "https://mcp.example.com/sse", transport: MCPTransport.SSE }]}>
  <TamboMcpProvider>
    <App />
  </TamboMcpProvider>
</TamboProvider>
```

**MCP Features**: Tools (auto-orchestrated), Resources (`@` mentions), Prompts (`/` hotkey), Elicitations (mid-tool user input forms), Sampling (server-side only, LLM sub-conversations).

**MCP Hooks** (from `@tambo-ai/react/mcp`):
- `useTamboMcpServers()` - connected/failed server list
- `useTamboMcpElicitation()` - `{ elicitation, resolveElicitation }` for user input forms
- `useTamboMcpPromptList(search?)` - browse server prompts
- `useTamboMcpPrompt(name, args)` - fetch single prompt
- `useTamboMcpResourceList(search?)` - browse server resources
- `useTamboMcpResource(uri)` - fetch single resource

**Elicitation responses**: `{ action: "accept"|"decline"|"cancel", content?: Record<string, unknown> }`. Field types: text, number, boolean, enum.

**Transport**: `MCPTransport.HTTP` (default, streamable) or `MCPTransport.SSE` (Server-Sent Events).

## TamboThread Type

```tsx
interface TamboThread {
  id: string;
  name?: string;
  messages: TamboThreadMessage[];
  status: "idle" | "waiting" | "streaming";
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastRunCancelled: boolean;
}
```

## Custom Events (Advanced)

Events emitted during streaming: `tambo.component.start`, `tambo.component.props_delta` (with JSON Patch operations), `tambo.component.state_delta`, `tambo.component.end`, `tambo.run.awaiting_input` (elicitation), `tambo.message.parent`.

## Agent Configuration (Dashboard)

- **Custom Instructions**: Define agent role, tone, behavioral guidelines
- **LLM Provider**: OpenAI, Anthropic, Google, Groq, Mistral, Cerebras
- **Parameters**: temperature, max tokens, top P, top K
- **Reasoning models**: Supported with `reasoningDurationMS` on messages
