"use client";

import { type Suggestion, TamboProvider, useTambo, useTamboThreadList } from "@tambo-ai/react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Link2,
  Link2Off,
  MessageSquare,
  Monitor,
  Moon,
  Plus,
  Share2,
  Sun,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardCanvas } from "@/components/tambo/dashboard-canvas";
import {
  MessageInput,
  MessageInputError,
  MessageInputFileButton,
  MessageInputMcpConfigButton,
  MessageInputMcpPromptButton,
  MessageInputMcpResourceButton,
  MessageInputSubmitButton,
  MessageInputTextarea,
  MessageInputToolbar,
} from "@/components/tambo/message-input";
import {
  MessageSuggestions,
  MessageSuggestionsList,
  MessageSuggestionsStatus,
} from "@/components/tambo/message-suggestions";
import { ScrollableMessageContainer } from "@/components/tambo/scrollable-message-container";
import { ThreadContent, ThreadContentMessages } from "@/components/tambo/thread-content";
import { WalkthruLogo } from "@/components/walkthru-logo";
import { tamboProviderConfig } from "@/lib/tambo";
import { useAnonymousUserKey } from "@/lib/use-anonymous-user-key";
import { cn } from "@/lib/utils";
import { preloadDuckDB, runQuery } from "@/services/duckdb-wasm";
import { getQueryResult, storeQueryResultWithId, useCrossFilterEnabled } from "@/services/query-store";

/* ── Helper: extract thread preview name ──────────────────────────── */

function threadLabel(thread: { id: string; name?: string; createdAt: string }): string {
  // Use thread name if Tambo populates it
  if (thread.name?.trim()) return thread.name;
  // Fallback: short date + truncated ID
  const date = new Date(thread.createdAt);
  const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${dateStr} — ${thread.id.substring(0, 8)}`;
}

/* ── Thread History ────────────────────────────────────────────────── */

function SessionHistory({ onClose }: { onClose: () => void }) {
  const { data, isLoading } = useTamboThreadList();
  const { currentThreadId, switchThread, startNewThread } = useTambo();

  return (
    <div className="flex flex-col h-full animate-fade-up">
      <div className="px-4 py-3 flex items-center gap-2.5">
        <Clock className="w-3.5 h-3.5 text-earth-cyan" />
        <span className="text-xs font-semibold text-foreground tracking-wide uppercase">Sessions</span>
        <button
          onClick={() => {
            startNewThread();
            onClose();
          }}
          className="ml-auto p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
          title="New session"
        >
          <Plus className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="space-y-1.5 p-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-9 rounded-lg bg-white/3 animate-pulse" />
            ))}
          </div>
        ) : data?.threads && data.threads.length > 0 ? (
          <div className="space-y-0.5">
            {data.threads.map((thread) => (
              <div
                key={thread.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  switchThread(thread.id);
                  onClose();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    switchThread(thread.id);
                    onClose();
                  }
                }}
                className={`group w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all cursor-pointer ${
                  thread.id === currentThreadId
                    ? "bg-earth-blue/10 text-earth-cyan border border-earth-blue/20"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-3 h-3 flex-shrink-0 opacity-50" />
                  <div className="flex-1 min-w-0">
                    <span className="block truncate font-semibold text-sm">{threadLabel(thread)}</span>
                    <span className="block text-[10px] text-muted-foreground/60 mt-0.5">
                      {new Date(thread.createdAt).toLocaleString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const url = `${window.location.origin}/explore?thread=${thread.id}`;
                      navigator.clipboard.writeText(url);
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-muted/50 transition-all flex-shrink-0"
                    title="Copy share link"
                  >
                    <Share2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center">
            <MessageSquare className="w-5 h-5 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No sessions yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Explorer Layout ───────────────────────────────────────────────── */

const defaultSuggestions: Suggestion[] = [
  {
    id: "s-buildings",
    title: "Buildings in Cairo",
    detailedSuggestion: "Show me building density in New Cairo at H3 res 5",
    messageId: "s-buildings",
  },
  {
    id: "s-population",
    title: "Population growth",
    detailedSuggestion: "Where is population growing fastest by 2100?",
    messageId: "s-population",
  },
  {
    id: "s-terrain",
    title: "Terrain analysis",
    detailedSuggestion: "Show me the highest elevations in the Himalayas",
    messageId: "s-terrain",
  },
];

function CrossFilterToggle() {
  const [enabled, setEnabled] = useCrossFilterEnabled();
  return (
    <button
      onClick={() => setEnabled(!enabled)}
      className={`p-1.5 rounded-lg transition-all ${
        enabled ? "bg-earth-blue/15 text-earth-cyan" : "text-muted-foreground hover:bg-muted/50"
      }`}
      title={enabled ? "Cross-filter ON — click to disable" : "Cross-filter OFF — click to enable"}
    >
      {enabled ? <Link2 className="w-3.5 h-3.5" /> : <Link2Off className="w-3.5 h-3.5" />}
    </button>
  );
}

type Theme = "light" | "dark" | "system";

function ThemeSwitcher() {
  // Always start "dark" to match server render — sync from localStorage in effect
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    if (stored && ["dark", "light", "system"].includes(stored)) {
      setTheme(stored);
    } else {
      // No stored theme — detect system preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(prefersDark ? "dark" : "light");
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
    } else {
      root.classList.toggle("dark", theme === "dark");
    }
    localStorage.setItem("theme", theme);

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => {
        root.classList.toggle("dark", mq.matches);
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme, mounted]);

  const cycle = () => {
    const order: Theme[] = ["dark", "light", "system"];
    setTheme(order[(order.indexOf(theme) + 1) % order.length]);
  };

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const label = theme === "dark" ? "Dark mode" : theme === "light" ? "Light mode" : "System theme";

  return (
    <button
      onClick={cycle}
      className="p-1.5 rounded-lg transition-all text-muted-foreground hover:bg-muted/50"
      title={label}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

/** Mobile bottom sheet with swipe-to-expand/collapse via drag handle. */
function MobileBottomSheet({
  expanded,
  onToggle,
  children,
}: {
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const touchStartY = useRef(0);
  const touchDeltaY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchDeltaY.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchDeltaY.current = e.touches[0].clientY - touchStartY.current;
  };

  const handleTouchEnd = () => {
    const dy = touchDeltaY.current;
    // Swipe up (negative dy) → expand, swipe down (positive dy) → collapse
    if (dy < -40 && !expanded) onToggle();
    else if (dy > 40 && expanded) onToggle();
    touchDeltaY.current = 0;
  };

  return (
    <div
      className={cn(
        "sm:hidden fixed inset-x-0 bottom-0 z-30 glass-panel transition-all duration-300 ease-out flex flex-col",
        expanded ? "top-0" : "max-h-[180px]",
      )}
      style={{ borderTop: "1px solid var(--border)" }}
    >
      {/* Drag handle — swipe up to expand, down to collapse, tap to toggle */}
      <div
        className="flex justify-center py-1.5 cursor-grab active:cursor-grabbing flex-shrink-0"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={onToggle}
      >
        <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
      </div>
      {children}
    </div>
  );
}

function ExplorerLayout() {
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  // Mobile: "collapsed" = input bar at bottom, "expanded" = full-screen chat
  const [mobileChat, setMobileChat] = useState<"collapsed" | "expanded">("collapsed");
  const { messages, currentThreadId, switchThread } = useTambo();

  // Preload DuckDB on mount so it's warm before the first query
  useEffect(() => {
    preloadDuckDB();
  }, []);

  // Auto-expand mobile chat when a new message arrives (user submitted)
  const prevMessageCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      setMobileChat((prev) => (prev === "collapsed" ? "expanded" : prev));
    }
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  // Auto-collapse mobile chat when a component is rendered in the dashboard
  const prevComponentCount = useRef(0);
  useEffect(() => {
    let count = 0;
    for (const msg of messages) {
      for (const block of msg.content) {
        if (block.type === "component" && block.renderedComponent) count++;
      }
    }
    if (count > prevComponentCount.current) {
      setMobileChat((prev) => (prev === "expanded" ? "collapsed" : prev));
    }
    prevComponentCount.current = count;
  }, [messages]);

  // Sync thread ID from URL → Tambo on initial load (for shared links)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlThread = params.get("thread");
    if (urlThread?.startsWith("thr_") && urlThread !== currentThreadId) {
      switchThread(urlThread);
    } else if (urlThread && !urlThread.startsWith("thr_")) {
      // Invalid thread param — clean URL
      params.delete("thread");
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }
  }, [currentThreadId, switchThread]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update URL when thread changes (without full navigation).
  // Skip placeholder/temporary IDs — only set URL for real thread IDs (e.g. "thr_...")
  useEffect(() => {
    if (!currentThreadId || currentThreadId === "placeholder" || !currentThreadId.startsWith("thr_")) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("thread") !== currentThreadId) {
      params.set("thread", currentThreadId);
      window.history.replaceState(null, "", `?${params.toString()}`);
    }
  }, [currentThreadId]);

  // Replay SQL queries from restored thread to repopulate the query store.
  // tool_use blocks (assistant) and tool_result blocks (user/tool) are in DIFFERENT messages,
  // so we must search across all messages to find the matching tool_result.
  const replayedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!messages.length) return;

    // Build a flat index of all tool_result blocks across all messages
    const toolResults = new Map<string, any>(); // toolUseId → result block
    for (const msg of messages) {
      for (const block of msg.content) {
        if ((block as any).type === "tool_result" && (block as any).toolUseId) {
          toolResults.set((block as any).toolUseId, block);
        }
      }
    }

    for (const msg of messages) {
      for (const block of msg.content) {
        if (block.type === "tool_use" && block.name === "runSQL" && block.input) {
          const sql = (block.input as any).sql as string | undefined;
          if (!sql) continue;

          // Find matching tool_result across all messages
          const resultBlock = toolResults.get(block.id) as any;

          // Extract original queryId from tool_result content
          let originalQueryId: string | null = null;
          if (resultBlock) {
            // tool_result.content can be a string or array of content blocks
            const text =
              typeof resultBlock.content === "string"
                ? resultBlock.content
                : Array.isArray(resultBlock.content)
                  ? (resultBlock.content.find((b: any) => b.type === "text")?.text ?? null)
                  : null;
            if (text) {
              try {
                originalQueryId = JSON.parse(text).queryId;
              } catch {
                /* not JSON */
              }
            }
          }

          // If we couldn't extract the original queryId, generate a deterministic one from the tool_use ID
          const replayId = originalQueryId ?? `replay_${block.id}`;
          if (replayedRef.current.has(replayId)) continue;
          if (getQueryResult(replayId)) continue;
          replayedRef.current.add(replayId);

          // Re-run SQL in background, store under the original queryId
          runQuery({ sql })
            .then((result) => {
              if (result.queryId && originalQueryId) {
                const stored = getQueryResult(result.queryId);
                if (stored) storeQueryResultWithId(originalQueryId, stored);
              }
            })
            .catch(() => {
              /* query replay failed — skip silently */
            });
        }
      }
    }
  }, [messages]);

  const isEmpty = useMemo(() => !messages || messages.filter((m) => m.role !== "system").length === 0, [messages]);

  return (
    <div className="flex h-screen bg-background relative grain">
      {/* ── Desktop: side-by-side layout ─────────────────────────── */}

      {/* Chat Panel — glass sidebar (desktop only) */}
      <div
        className={`hidden sm:flex ${
          isChatOpen ? "sm:w-[400px]" : "w-0"
        } glass-panel transition-all duration-300 ease-out flex-col relative flex-shrink-0 z-20`}
        style={{ borderRight: "1px solid var(--border)" }}
      >
        {isChatOpen && (
          <>
            {/* Header */}
            <div className="px-4 py-3 flex items-center gap-2.5 border-b border-border/30">
              <WalkthruLogo size={20} />
              <div className="flex-1 min-w-0">
                <h1 className="text-sm font-bold text-foreground leading-none">walkthru.earth</h1>
              </div>
              <CrossFilterToggle />
              <ThemeSwitcher />
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`p-1.5 rounded-lg transition-all ${
                  showHistory ? "bg-earth-blue/15 text-earth-cyan" : "text-muted-foreground hover:bg-muted/50"
                }`}
                title="Sessions"
              >
                <Clock className="w-3.5 h-3.5" />
              </button>
            </div>

            {showHistory ? (
              <SessionHistory onClose={() => setShowHistory(false)} />
            ) : (
              <>
                <ScrollableMessageContainer className="flex-1 px-3 py-2">
                  <ThreadContent variant="default">
                    <ThreadContentMessages />
                  </ThreadContent>
                </ScrollableMessageContainer>

                <MessageSuggestions>
                  <MessageSuggestionsStatus />
                </MessageSuggestions>

                <div className="p-3 border-t border-border/30">
                  <MessageInput variant="bordered">
                    <MessageInputTextarea placeholder="Ask about weather, terrain, buildings, population..." />
                    <MessageInputToolbar>
                      <MessageInputFileButton />
                      <MessageInputMcpPromptButton />
                      <MessageInputMcpResourceButton />
                      <MessageInputMcpConfigButton />
                      <MessageInputSubmitButton />
                    </MessageInputToolbar>
                    <MessageInputError />
                  </MessageInput>
                </div>

                <MessageSuggestions initialSuggestions={isEmpty ? defaultSuggestions : undefined}>
                  <MessageSuggestionsList />
                </MessageSuggestions>
              </>
            )}
          </>
        )}

        {/* Desktop toggle */}
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="absolute -right-7 top-1/2 -translate-y-1/2 w-6 h-10 flex items-center justify-center glass-panel-subtle rounded-r-lg z-30 hover:bg-muted/50 transition-colors"
        >
          {isChatOpen ? (
            <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Dashboard — all AI components become draggable/resizable panels */}
      <DashboardCanvas className="bg-muted/30" />

      {/* ── Mobile: small toolbar on dashboard (theme + cross-filter) ── */}
      {mobileChat === "collapsed" && (
        <div className="sm:hidden fixed top-2 right-2 z-20 flex items-center gap-1 rounded-lg glass-panel-subtle px-1.5 py-1">
          <CrossFilterToggle />
          <ThemeSwitcher />
        </div>
      )}

      {/* ── Mobile: bottom sheet chat (2 states: collapsed / expanded) ── */}
      <MobileBottomSheet
        expanded={mobileChat === "expanded"}
        onToggle={() => setMobileChat((s) => (s === "expanded" ? "collapsed" : "expanded"))}
      >
        {/* Expanded: full-screen header with history + new thread */}
        {mobileChat === "expanded" && (
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/30 flex-shrink-0">
            <WalkthruLogo size={16} />
            <span className="text-xs font-bold text-foreground flex-1">walkthru.earth</span>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={cn(
                "p-1.5 rounded-lg transition-all",
                showHistory ? "bg-earth-blue/15 text-earth-cyan" : "text-muted-foreground hover:bg-muted/50",
              )}
              title="Sessions"
            >
              <Clock className="w-3.5 h-3.5" />
            </button>
            <CrossFilterToggle />
            <ThemeSwitcher />
            <button
              onClick={() => setMobileChat("collapsed")}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/50"
              title="Minimize chat"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Messages — only when expanded */}
        {mobileChat === "expanded" && (
          <>
            {showHistory ? (
              <SessionHistory onClose={() => setShowHistory(false)} />
            ) : (
              <ScrollableMessageContainer className="flex-1 px-3 py-2 overflow-y-auto">
                <ThreadContent variant="default">
                  <ThreadContentMessages />
                </ThreadContent>
              </ScrollableMessageContainer>
            )}
            <MessageSuggestions>
              <MessageSuggestionsStatus />
            </MessageSuggestions>
          </>
        )}

        {/* Input bar — always visible */}
        <div className={cn("p-2", mobileChat === "expanded" && "border-t border-border/30")}>
          <MessageInput variant="bordered">
            <MessageInputTextarea placeholder="Ask about weather, terrain, buildings, population..." />
            <MessageInputToolbar>
              <MessageInputSubmitButton />
            </MessageInputToolbar>
            <MessageInputError />
          </MessageInput>
        </div>

        {/* Suggestions — only when collapsed and empty thread */}
        {mobileChat === "collapsed" && (
          <MessageSuggestions initialSuggestions={isEmpty ? defaultSuggestions : undefined}>
            <MessageSuggestionsList className="px-2 pb-2" />
          </MessageSuggestions>
        )}
      </MobileBottomSheet>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────── */

export default function ExplorePage() {
  const userKey = useAnonymousUserKey();

  return (
    <TamboProvider
      {...tamboProviderConfig}
      userKey={userKey}
      contextHelpers={{
        walkthruContext: () => ({
          platform: "walkthru.earth",
          behavior: [
            "BE DECISIVE. Do NOT ask clarifying questions — pick smart defaults and execute immediately.",
            "When asked 'fastest growing' — use absolute growth unless user says 'percent'. When asked 'where' — show global, not a region.",
            "Always run the SQL query AND render components in ONE response. Never say 'try refreshing' — just retry the query.",
            "If a query fails, retry once with a simpler version. Never give up and show raw SQL without also trying to execute it.",
            "Render MULTIPLE components per response: a map + a table + an insight card for rich analysis.",
            "NEVER output markdown tables, ASCII art, or separator characters like +#+#+ in chat text. Use InsightCard or DataTable components instead.",
            "Keep chat text SHORT — 1-2 sentences max. All data goes into components, not into chat text.",
          ],
          duckdbWasmNotes: [
            "H3 extension pre-loaded. NO INSTALL/LOAD in SQL. ONE statement per call.",
            "h3_index is BIGINT. For maps: SELECT h3_h3_to_string(h3_index) AS hex, <metric> AS value — NO lat/lng needed.",
            "deck.gl H3HexagonLayer renders polygons from hex string automatically.",
            "Always LIMIT 500. Use HTTPS URLs in FROM.",
            "h3_cell_area(h3_index, 'km^2') for area. NOT h3_cell_area_km2.",
            "NEVER do latlng.lat or latlng.lng — h3_cell_to_latlng() returns DOUBLE[2] list, not struct. Use list_extract() if needed. But for maps, just use hex strings.",
            "Use h3_grid_ring() NOT h3_k_ring() (deprecated). Use h3_grid_disk() NOT h3_k_ring_distances().",
          ],
          s3Base: "https://s3.us-west-2.amazonaws.com/us-west-2.opendata.source.coop/walkthru-earth",
          datasets: {
            terrain: "dem-terrain/v2/h3/h3_res={1-10}/data.parquet",
            building: "indices/building/v2/h3/h3_res={3-8}/data.parquet",
            population: "indices/population/v2/scenario=SSP2/h3_res={1-8}/data.parquet",
            weather:
              "indices/weather/model=GraphCast_GFS/date=YYYY-MM-DD/hour={0,12}/h3_res=5/data.parquet (only res 5)",
          },
          componentTips: [
            "ALL viz components use queryId from runSQL — ZERO token cost for data. Never pass inline data arrays.",
            "H3Map: queryId + hexColumn='hex' + valueColumn='value' + lat/lng/zoom + colorMetric. deck.gl renders from hex strings.",
            "Graph: queryId + xColumn + yColumns + chartType.",
            "CHART X-AXIS RULE: NEVER use raw H3 hex IDs as chart labels — they are meaningless to users. " +
              "Instead, create meaningful labels in the SQL query: " +
              "Use CASE/WHEN to bucket values (e.g. '0-1000m', '1000-3000m'), " +
              "use NTILE or ROUND for numeric ranges, " +
              "use ROW_NUMBER() for rank labels (e.g. 'Rank 1', 'Rank 2'), " +
              "or GROUP BY a meaningful column. " +
              "Example: SELECT CASE WHEN elev < 1000 THEN '0-1k' WHEN elev < 3000 THEN '1k-3k' ELSE '3k+' END AS label, COUNT(*) AS count ... GROUP BY label",
            "DataTable: queryId only (auto-derives columns/rows). Optional: visibleColumns to limit columns shown.",
            "H3Map colorScheme: 'blue-red', 'viridis', 'plasma', 'warm', 'cool', 'spectral'.",
            "Cross-filtering: zooming/panning the map filters Graph and DataTable to only show visible hexes.",
            "IMPORTANT: Reuse the SAME queryId across H3Map + Graph + DataTable for linked cross-filtering. " +
              "Include 'hex' column in the query so spatial filtering works. " +
              "Example: run ONE query with hex + value + other columns, then pass the same queryId to all 3 components.",
            "For charts linked with maps via cross-filter, 'hex' can be in the query for filtering but use a DIFFERENT column as xColumn (not hex). " +
              "If no meaningful label column exists, add one in SQL: ROW_NUMBER() OVER (ORDER BY value DESC) as rank, then use xColumn='rank'.",
          ],
        }),
      }}
    >
      <ExplorerLayout />
    </TamboProvider>
  );
}
