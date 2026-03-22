import { TamboProvider, useTambo } from "@tambo-ai/react";
import { Sparkles } from "lucide-react";
import { useEffect, useMemo } from "react";
import { SettingsButton } from "@/components/settings-popover";
import { useMcpServers } from "@/components/tambo/mcp-config-modal";
import { MessageThreadFull } from "@/components/tambo/message-thread-full";
import { WalkthruLogo } from "@/components/walkthru-logo";
import { buildContextHelpers, buildInitialSuggestions, tamboProviderConfig } from "@/lib/tambo";
import { useReplayQueries } from "@/lib/thread-hooks";
import { useAnonymousUserKey } from "@/lib/use-anonymous-user-key";
import { type GeoIP, useGeoIP } from "@/lib/use-geo-ip";
import { preloadDuckDB } from "@/services/duckdb-wasm";

function ChatInner({ geo }: { geo: GeoIP | null }) {
  const { messages } = useTambo();

  useEffect(() => {
    preloadDuckDB();
  }, []);

  // Replay SQL queries from restored threads to repopulate the query store
  useReplayQueries(messages);

  const suggestions = useMemo(() => buildInitialSuggestions(geo), [geo]);

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-border bg-background/95 backdrop-blur-sm px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <WalkthruLogo size={20} />
        <h1 className="font-bold text-sm text-foreground">walkthru.earth</h1>
        <Sparkles className="w-3.5 h-3.5 text-earth-cyan" />
        <span className="text-xs text-muted-foreground hidden sm:inline">AI-powered urban intelligence</span>
        <span className="flex-1" />
        <SettingsButton />
      </header>
      <div className="flex-1 min-h-0">
        <MessageThreadFull className="max-w-4xl mx-auto h-full" initialSuggestions={suggestions} />
      </div>
    </div>
  );
}

export default function Chat() {
  const mcpServers = useMcpServers();
  const userKey = useAnonymousUserKey();
  const geo = useGeoIP();
  const contextHelpers = useMemo(() => buildContextHelpers(geo), [geo]);

  return (
    <TamboProvider {...tamboProviderConfig} mcpServers={mcpServers} userKey={userKey} contextHelpers={contextHelpers}>
      <ChatInner geo={geo} />
    </TamboProvider>
  );
}
