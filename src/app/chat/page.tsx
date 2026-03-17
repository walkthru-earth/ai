"use client";

import { TamboProvider, useTambo } from "@tambo-ai/react";
import { useEffect } from "react";
import { useMcpServers } from "@/components/tambo/mcp-config-modal";
import { MessageThreadFull } from "@/components/tambo/message-thread-full";
import { WalkthruLogo } from "@/components/walkthru-logo";
import { tamboProviderConfig } from "@/lib/tambo";
import { useReplayQueries } from "@/lib/thread-hooks";
import { useAnonymousUserKey } from "@/lib/use-anonymous-user-key";
import { preloadDuckDB } from "@/services/duckdb-wasm";

function ChatInner() {
  const { messages } = useTambo();

  useEffect(() => {
    preloadDuckDB();
  }, []);

  // Replay SQL queries from restored threads to repopulate the query store
  useReplayQueries(messages);

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-border bg-background/95 backdrop-blur-sm px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <WalkthruLogo size={20} />
        <h1 className="font-bold text-sm text-foreground">walkthru.earth</h1>
        <span className="text-xs text-muted-foreground hidden sm:inline">AI-powered urban intelligence</span>
      </header>
      <div className="flex-1 min-h-0">
        <MessageThreadFull className="max-w-4xl mx-auto h-full" />
      </div>
    </div>
  );
}

export default function Chat() {
  const mcpServers = useMcpServers();
  const userKey = useAnonymousUserKey();

  return (
    <TamboProvider {...tamboProviderConfig} mcpServers={mcpServers} userKey={userKey}>
      <ChatInner />
    </TamboProvider>
  );
}
