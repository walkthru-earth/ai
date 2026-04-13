import type { Suggestion } from "@tambo-ai/react";
import { TamboProvider, useTambo } from "@tambo-ai/react";
import { TamboMcpProvider } from "@tambo-ai/react/mcp";
import { Sparkles } from "lucide-react";
import { SettingsButton } from "@/components/settings-popover";
import { useMcpServers } from "@/components/tambo/mcp-config-modal";
import { MessageThreadFull } from "@/components/tambo/message-thread-full";
import { WalkthruLogo } from "@/components/walkthru-logo";
import { tamboProviderConfig } from "@/lib/tambo";
import { useReplayQueries } from "@/lib/thread-hooks";
import { usePageBootstrap } from "@/lib/use-page-bootstrap";
import { useUrlParamsSync } from "@/lib/use-url-params";

function ChatInner({ suggestions }: { suggestions: Suggestion[] }) {
  const { messages } = useTambo();

  // Shared ?thread= + ?q= URL param sync (same as /explore)
  useUrlParamsSync();

  // Replay SQL queries from restored threads to repopulate the query store
  useReplayQueries(messages);

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-border bg-background px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <a
          href="https://walkthru.earth/links"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <WalkthruLogo size={20} />
          <h1 className="font-bold text-sm text-foreground">walkthru.earth</h1>
          <Sparkles className="w-3.5 h-3.5 text-earth-cyan" />
        </a>
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
  const { userKey, contextHelpers, suggestions } = usePageBootstrap();

  return (
    <TamboProvider {...tamboProviderConfig} mcpServers={mcpServers} userKey={userKey} contextHelpers={contextHelpers}>
      <TamboMcpProvider>
        <ChatInner suggestions={suggestions} />
      </TamboMcpProvider>
    </TamboProvider>
  );
}
