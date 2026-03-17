"use client";

import { TamboProvider, useTambo, useTamboThreadList } from "@tambo-ai/react";
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
import { buildContextHelpers, buildInitialSuggestions, tamboProviderConfig } from "@/lib/tambo";
import { useReplayQueries } from "@/lib/thread-hooks";
import { useAnonymousUserKey } from "@/lib/use-anonymous-user-key";
import { type GeoIP, useGeoIP } from "@/lib/use-geo-ip";
import { cn } from "@/lib/utils";
import { preloadDuckDB } from "@/services/duckdb-wasm";
import { useCrossFilterEnabled } from "@/services/query-store";

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
        expanded && "top-0",
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

function ExplorerLayout({ geo }: { geo: GeoIP | null }) {
  const defaultSuggestions = useMemo(() => buildInitialSuggestions(geo), [geo]);
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

  // Replay SQL queries from restored thread to repopulate the query store
  useReplayQueries(messages);

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

                <MessageSuggestions initialSuggestions={isEmpty ? defaultSuggestions : undefined}>
                  <MessageSuggestionsList className="px-3" />
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

        {/* Suggestion chips — above input for mobile visibility */}
        <MessageSuggestions initialSuggestions={isEmpty ? defaultSuggestions : undefined}>
          <MessageSuggestionsList className="px-2 pb-1" />
        </MessageSuggestions>

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
      </MobileBottomSheet>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────── */

export default function ExplorePage() {
  const userKey = useAnonymousUserKey();
  const geo = useGeoIP();
  const contextHelpers = useMemo(() => buildContextHelpers(geo), [geo]);

  return (
    <TamboProvider {...tamboProviderConfig} userKey={userKey} contextHelpers={contextHelpers}>
      <ExplorerLayout geo={geo} />
    </TamboProvider>
  );
}
