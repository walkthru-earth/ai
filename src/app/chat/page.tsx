"use client";

import { TamboProvider } from "@tambo-ai/react";
import { useEffect } from "react";
import { useMcpServers } from "@/components/tambo/mcp-config-modal";
import { MessageThreadFull } from "@/components/tambo/message-thread-full";
import { WalkthruLogo } from "@/components/walkthru-logo";
import { components, tools } from "@/lib/tambo";
import { useAnonymousUserKey } from "@/lib/use-anonymous-user-key";
import { preloadDuckDB } from "@/services/duckdb-wasm";

export default function Chat() {
  const mcpServers = useMcpServers();
  const userKey = useAnonymousUserKey();

  useEffect(() => {
    preloadDuckDB();
  }, []);

  return (
    <TamboProvider
      apiKey={process.env.NEXT_PUBLIC_TAMBO_API_KEY!}
      components={components}
      tools={tools}
      tamboUrl={process.env.NEXT_PUBLIC_TAMBO_URL}
      mcpServers={mcpServers}
      userKey={userKey}
    >
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
    </TamboProvider>
  );
}
