/**
 * Style Editor Layout - side-by-side chat + MapLibre map.
 * Desktop: resizable sidebar chat + full-bleed map.
 * Mobile: bottom sheet chat + full-bleed map.
 */

import type { Suggestion } from "@tambo-ai/react";
import { useTambo, useTamboThreadInput } from "@tambo-ai/react";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Palette } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MentionChips } from "@/components/tambo/mention-chips";
import {
  MessageInput,
  MessageInputError,
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
import { cn } from "@/lib/utils";
import { downloadStyleJSON, useStyle } from "@/services/style-store";
import { SourcePopup } from "./source-popup";
import { StyleDownloadButton } from "./style-download-button";
import type { FeatureInfo } from "./style-editor-map";
import { StyleEditorMap } from "./style-editor-map";
import { StylePresetPicker } from "./style-preset-picker";
import { CommandDropdown, ResourceDropdown, StyleCommandButton, StyleResourceButton } from "./style-toolbar-buttons";

/* ── Input with @ and / toolbar buttons + keyboard triggers ──────── */

type DropdownState = "none" | "resource" | "command";

function StyleEditorInput({ placeholder }: { placeholder?: string }) {
  const { value: tamboValue, setValue: setTamboValue } = useTamboThreadInput();
  const [dropdown, setDropdown] = useState<DropdownState>("none");
  const prevValueRef = useRef("");

  // Detect "@" or "/" typed by watching Tambo's actual input value
  useEffect(() => {
    const prev = prevValueRef.current;
    prevValueRef.current = tamboValue;

    // Only trigger on new character additions
    if (tamboValue.length <= prev.length) return;

    // "@" at end of input (typed by user)
    if (tamboValue.endsWith("@") && !prev.endsWith("@")) {
      setDropdown("resource");
      return;
    }

    // "/" at start of input (typed by user)
    if (tamboValue.startsWith("/") && !tamboValue.includes(" ")) {
      setDropdown("command");
      return;
    }

    // Close command dropdown if user types space or clears "/"
    if (dropdown === "command" && !tamboValue.startsWith("/")) {
      setDropdown("none");
    }
  }, [tamboValue, dropdown]);

  const closeDropdown = useCallback(() => setDropdown("none"), []);

  const handleCommandAction = useCallback(
    (action: string) => {
      if (action === "__export__") {
        downloadStyleJSON();
        setTamboValue("");
        setDropdown("none");
        return;
      }
      if (action === "__validate__") {
        setTamboValue("Validate the current style and report any errors");
        setDropdown("none");
        return;
      }
    },
    [setTamboValue],
  );

  const handleInsertText = useCallback(
    (text: string) => {
      setTamboValue(text);
      setDropdown("none");
    },
    [setTamboValue],
  );

  const handleResourceInsert = useCallback(
    (resourceText: string) => {
      // Replace trailing "@" trigger, insert mention text into tamboValue
      const base = tamboValue.endsWith("@") ? tamboValue.slice(0, -1) : tamboValue;
      setTamboValue(base ? `${base}${resourceText}` : resourceText);
      setDropdown("none");
    },
    [tamboValue, setTamboValue],
  );

  const removeMention = useCallback(
    (mention: string) => {
      setTamboValue(tamboValue.replace(mention, "").replace(/ {2,}/g, " ").trim());
    },
    [tamboValue, setTamboValue],
  );

  return (
    <div className="relative">
      {/* Full-width dropdowns rendered above the input */}
      {dropdown === "resource" && <ResourceDropdown onSelect={handleResourceInsert} onClose={closeDropdown} />}
      {dropdown === "command" && (
        <CommandDropdown
          onSelect={handleInsertText}
          onAction={handleCommandAction}
          onClose={closeDropdown}
          filterText={tamboValue.startsWith("/") ? tamboValue : undefined}
        />
      )}

      <MessageInput variant="bordered">
        <MentionChips value={tamboValue} onRemove={removeMention} />
        <MessageInputTextarea placeholder={placeholder || "Describe style changes, @ to mention, / for commands..."} />
        <MessageInputToolbar>
          <StyleResourceButton
            active={dropdown === "resource"}
            onClick={() => setDropdown(dropdown === "resource" ? "none" : "resource")}
          />
          <StyleCommandButton
            active={dropdown === "command"}
            onClick={() => setDropdown(dropdown === "command" ? "none" : "command")}
          />
          <MessageInputSubmitButton />
        </MessageInputToolbar>
        <MessageInputError />
      </MessageInput>
    </div>
  );
}

/* ── Layer Info Bar ───────────────────────────────────────────────── */

function StyleInfoBar() {
  const style = useStyle();
  if (!style) return null;

  const sourceCount = Object.keys(style.sources || {}).length;
  const layerCount = style.layers.length;

  return (
    <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border/30 flex items-center gap-3">
      <span>
        {sourceCount} source{sourceCount !== 1 ? "s" : ""}
      </span>
      <span className="w-px h-3 bg-border/50" />
      <span>
        {layerCount} layer{layerCount !== 1 ? "s" : ""}
      </span>
      {style.name && (
        <>
          <span className="w-px h-3 bg-border/50" />
          <span className="truncate">{style.name}</span>
        </>
      )}
    </div>
  );
}

/* ── Mobile Bottom Sheet ─────────────────────────────────────────── */

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
    if (dy < -40 && !expanded) onToggle();
    else if (dy > 40 && expanded) onToggle();
    touchDeltaY.current = 0;
  };

  return (
    <div
      className={cn(
        "sm:hidden fixed inset-x-0 bottom-0 z-30 glass-panel transition-all duration-300 ease-out flex flex-col border-t border-border",
        expanded && "top-0",
      )}
    >
      <button
        type="button"
        className="flex w-full justify-center py-1.5 cursor-grab active:cursor-grabbing flex-shrink-0 bg-transparent border-0"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={onToggle}
      >
        <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
      </button>
      {children}
    </div>
  );
}

/* ── Main Layout ─────────────────────────────────────────────────── */

export function StyleEditorLayout({ suggestions: defaultSuggestions }: { suggestions: Suggestion[] }) {
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [mobileChat, setMobileChat] = useState<"collapsed" | "expanded">("collapsed");
  const [clickedFeature, setClickedFeature] = useState<FeatureInfo | null>(null);
  const { messages } = useTambo();
  const { value: inputValue, setValue: setInputValue } = useTamboThreadInput();

  // Auto-expand mobile chat on new message
  const prevMessageCount = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      setMobileChat((prev) => (prev === "collapsed" ? "expanded" : prev));
    }
    prevMessageCount.current = messages.length;
  }, [messages.length]);

  const isEmpty = useMemo(() => !messages || messages.filter((m) => m.role !== "system").length === 0, [messages]);

  const handleFeatureClick = useCallback((info: FeatureInfo) => {
    setClickedFeature(info);
  }, []);

  const handleMention = useCallback(
    (id: string, label: string) => {
      const mentionType = label.includes("source") ? "source" : "layer";
      const mention = `@${mentionType}:${id} `;
      setInputValue(inputValue ? `${inputValue}${mention}` : mention);
      setClickedFeature(null);
    },
    [inputValue, setInputValue],
  );

  return (
    <div className="flex h-screen bg-background relative">
      {/* ── Desktop: side-by-side ────────────────────────────────── */}

      {/* Chat sidebar */}
      <div
        className={`hidden sm:flex ${
          isChatOpen ? "sm:w-[400px]" : "w-0"
        } glass-panel transition-all duration-300 ease-out flex-col relative flex-shrink-0 z-20 border-r border-border`}
      >
        {isChatOpen && (
          <>
            {/* Header */}
            <div className="px-4 py-3 flex items-center gap-2.5 border-b border-border/30">
              <a
                href="https://walkthru.earth/links"
                target="_blank"
                rel="noreferrer"
                className="flex-shrink-0 hover:opacity-80 transition-opacity"
                title="walkthru.earth"
              >
                <WalkthruLogo size={20} />
              </a>
              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                <h1 className="text-sm font-bold text-foreground leading-none">Style Editor</h1>
                <Palette className="w-3.5 h-3.5 text-earth-cyan" />
              </div>
              <StyleDownloadButton />
            </div>

            <StyleInfoBar />

            <ScrollableMessageContainer className="flex-1 px-3 py-2">
              {isEmpty && <StylePresetPicker />}
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
              <StyleEditorInput />
            </div>
          </>
        )}

        {/* Sidebar toggle */}
        <button
          type="button"
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

      {/* Map area */}
      <div className="flex-1 relative">
        <StyleEditorMap onFeatureClick={handleFeatureClick} />

        {/* Source popup overlay */}
        <SourcePopup feature={clickedFeature} onClose={() => setClickedFeature(null)} onMention={handleMention} />

        {/* Download floating button (when chat is collapsed) */}
        {!isChatOpen && (
          <button
            type="button"
            onClick={downloadStyleJSON}
            className="hidden sm:flex absolute top-3 left-3 z-10 items-center gap-1.5 px-3 py-2 rounded-lg glass-panel-subtle text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        )}
      </div>

      {/* ── Mobile: bottom sheet ─────────────────────────────────── */}
      <MobileBottomSheet
        expanded={mobileChat === "expanded"}
        onToggle={() => setMobileChat((s) => (s === "expanded" ? "collapsed" : "expanded"))}
      >
        {mobileChat === "expanded" && (
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/30 flex-shrink-0">
            <a
              href="https://walkthru.earth/links"
              target="_blank"
              rel="noreferrer"
              className="flex-shrink-0 hover:opacity-80 transition-opacity"
              title="walkthru.earth"
            >
              <WalkthruLogo size={16} />
            </a>
            <span className="text-xs font-bold text-foreground">Style Editor</span>
            <Palette className="w-3 h-3 text-earth-cyan flex-shrink-0" />
            <span className="flex-1" />
            <StyleDownloadButton />
            <button
              type="button"
              onClick={() => setMobileChat("collapsed")}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/50"
              title="Minimize"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        )}

        {mobileChat === "expanded" && (
          <>
            <StyleInfoBar />
            <ScrollableMessageContainer className="flex-1 px-3 py-2 overflow-y-auto">
              {isEmpty && <StylePresetPicker />}
              <ThreadContent variant="default">
                <ThreadContentMessages />
              </ThreadContent>
            </ScrollableMessageContainer>
            <MessageSuggestions>
              <MessageSuggestionsStatus />
            </MessageSuggestions>
          </>
        )}

        <MessageSuggestions initialSuggestions={isEmpty ? defaultSuggestions : undefined}>
          <MessageSuggestionsList className="px-2 pb-1" />
        </MessageSuggestions>

        <div className={cn("p-2", mobileChat === "expanded" && "border-t border-border/30")}>
          <StyleEditorInput placeholder="Describe style changes..." />
        </div>
      </MobileBottomSheet>
    </div>
  );
}
