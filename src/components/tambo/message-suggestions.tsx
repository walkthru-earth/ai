import type { Suggestion, TamboThreadMessage } from "@tambo-ai/react";
import { useTambo, useTamboSuggestions } from "@tambo-ai/react";
import * as React from "react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { MessageGenerationStage } from "./message-generation-stage";
import { Tooltip, TooltipProvider } from "./suggestions-tooltip";

/**
 * @typedef MessageSuggestionsContextValue
 * @property {Array} suggestions - Array of suggestion objects
 * @property {string|null} selectedSuggestionId - ID of the currently selected suggestion
 * @property {function} accept - Function to accept a suggestion
 * @property {boolean} isGenerating - Whether suggestions are being generated
 * @property {Error|null} error - Any error from generation
 * @property {object} thread - The current Tambo thread
 */
interface MessageSuggestionsContextValue {
  suggestions: Suggestion[];
  selectedSuggestionId: string | null;
  accept: (options: { suggestion: Suggestion }) => Promise<void>;
  isGenerating: boolean;
  error: Error | null;
  messages: TamboThreadMessage[];
  isStreaming: boolean;
  isWaiting: boolean;
  isMac: boolean;
}

/**
 * React Context for sharing suggestion data and functions among sub-components.
 * @internal
 */
const MessageSuggestionsContext = React.createContext<MessageSuggestionsContextValue | null>(null);

/**
 * Hook to access the message suggestions context.
 * @returns {MessageSuggestionsContextValue} The message suggestions context value.
 * @throws {Error} If used outside of MessageSuggestions.
 * @internal
 */
const useMessageSuggestionsContext = () => {
  const context = React.useContext(MessageSuggestionsContext);
  if (!context) {
    throw new Error("MessageSuggestions sub-components must be used within a MessageSuggestions");
  }
  return context;
};

/**
 * Props for the MessageSuggestions component.
 * Extends standard HTMLDivElement attributes.
 */
export interface MessageSuggestionsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Maximum number of suggestions to display (default: 3) */
  maxSuggestions?: number;
  /** The child elements to render within the container. */
  children?: React.ReactNode;
  /** Pre-seeded suggestions to display initially */
  initialSuggestions?: Suggestion[];
}

/**
 * The root container for message suggestions.
 * It establishes the context for its children and handles overall state management.
 * @component MessageSuggestions
 * @example
 * ```tsx
 * <MessageSuggestions maxSuggestions={3}>
 *   <MessageSuggestions.Status />
 *   <MessageSuggestions.List />
 * </MessageSuggestions>
 * ```
 */
const MessageSuggestions = React.forwardRef<HTMLDivElement, MessageSuggestionsProps>(
  ({ children, className, maxSuggestions = 3, initialSuggestions = [], ...props }, ref) => {
    const { messages, isStreaming, isWaiting } = useTambo();
    const {
      suggestions: generatedSuggestions,
      selectedSuggestionId,
      accept,
      isGenerating,
      error,
    } = useTamboSuggestions({ maxSuggestions });

    // Combine initial and generated suggestions, but only use initial ones when thread is empty
    const suggestions = React.useMemo(() => {
      // Only use pre-seeded suggestions if thread is empty
      if (!messages.length && initialSuggestions.length > 0) {
        return initialSuggestions.slice(0, maxSuggestions);
      }
      // Otherwise use generated suggestions
      return generatedSuggestions;
    }, [messages.length, generatedSuggestions, initialSuggestions, maxSuggestions]);

    const isMac = typeof navigator !== "undefined" && navigator.platform.startsWith("Mac");

    const contextValue = React.useMemo(
      () => ({
        suggestions,
        selectedSuggestionId,
        accept,
        isGenerating,
        error,
        messages,
        isStreaming,
        isWaiting,
        isMac,
      }),
      [suggestions, selectedSuggestionId, accept, isGenerating, error, messages, isStreaming, isWaiting, isMac],
    );

    // Handle keyboard shortcuts for selecting suggestions
    useEffect(() => {
      if (!suggestions || suggestions.length === 0) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        const modifierPressed = isMac ? event.metaKey && event.altKey : event.ctrlKey && event.altKey;

        if (modifierPressed) {
          const keyNum = parseInt(event.key, 10);
          if (!Number.isNaN(keyNum) && keyNum > 0 && keyNum <= suggestions.length) {
            event.preventDefault();
            const suggestionIndex = keyNum - 1;
            void accept({ suggestion: suggestions[suggestionIndex] });
          }
        }
      };

      document.addEventListener("keydown", handleKeyDown);

      return () => {
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [suggestions, accept, isMac]);

    // If we have no messages yet and no initial suggestions, render nothing
    if (!messages.length && initialSuggestions.length === 0) {
      return null;
    }

    return (
      <MessageSuggestionsContext.Provider value={contextValue}>
        <TooltipProvider>
          <div ref={ref} className={cn("px-4 pb-2", className)} data-slot="message-suggestions-container" {...props}>
            {children}
          </div>
        </TooltipProvider>
      </MessageSuggestionsContext.Provider>
    );
  },
);
MessageSuggestions.displayName = "MessageSuggestions";

/**
 * Props for the MessageSuggestionsStatus component.
 * Extends standard HTMLDivElement attributes.
 */
export type MessageSuggestionsStatusProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Displays loading, error, or generation stage information.
 * Automatically connects to the context to show the appropriate status.
 * @component MessageSuggestions.Status
 * @example
 * ```tsx
 * <MessageSuggestions>
 *   <MessageSuggestions.Status />
 *   <MessageSuggestions.List />
 * </MessageSuggestions>
 * ```
 */
const MessageSuggestionsStatus = React.forwardRef<HTMLDivElement, MessageSuggestionsStatusProps>(
  ({ className, ...props }, ref) => {
    const { error, isGenerating, isStreaming, isWaiting } = useMessageSuggestionsContext();

    return (
      <div
        ref={ref}
        className={cn(
          "p-2 rounded-md text-sm bg-transparent",
          !error && !isGenerating && !isStreaming && !isWaiting ? "p-0 min-h-0 mb-0" : "",
          className,
        )}
        data-slot="message-suggestions-status"
        {...props}
      >
        {/* Error state */}
        {error && (
          <div className="p-2 rounded-md text-sm bg-destructive/10 text-destructive">
            <p>{error.message}</p>
          </div>
        )}

        {/* Always render a container for generation stage to prevent layout shifts */}
        <div className="generation-stage-container">{(isStreaming || isWaiting) && <MessageGenerationStage />}</div>
      </div>
    );
  },
);
MessageSuggestionsStatus.displayName = "MessageSuggestions.Status";

/**
 * Props for the MessageSuggestionsList component.
 * Extends standard HTMLDivElement attributes.
 */
export type MessageSuggestionsListProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Displays the list of suggestion buttons.
 * Automatically connects to the context to show the suggestions.
 * @component MessageSuggestions.List
 * @example
 * ```tsx
 * <MessageSuggestions>
 *   <MessageSuggestions.Status />
 *   <MessageSuggestions.List />
 * </MessageSuggestions>
 * ```
 */
const MessageSuggestionsList = React.forwardRef<HTMLDivElement, MessageSuggestionsListProps>(
  ({ className, ...props }, ref) => {
    const { suggestions, selectedSuggestionId, accept, isGenerating, isMac } = useMessageSuggestionsContext();

    const modKey = isMac ? "⌘" : "Ctrl";
    const altKey = isMac ? "⌥" : "Alt";

    // Hide entirely while generating or when no suggestions
    if (isGenerating || suggestions.length === 0) {
      return null;
    }

    return (
      <div
        ref={ref}
        className={cn("flex gap-2 pb-2 overflow-x-auto scrollbar-none flex-nowrap", className)}
        data-slot="message-suggestions-list"
        {...props}
      >
        {suggestions.map((suggestion, index) => (
          <Tooltip
            key={suggestion.id}
            content={
              <span suppressHydrationWarning>
                {modKey}+{altKey}+{index + 1}
              </span>
            }
            side="top"
          >
            <button
              type="button"
              className={cn(
                "py-2 px-3 rounded-2xl text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0",
                "border border-flat",
                "flex items-center gap-1.5",
                getSuggestionButtonClassName({
                  isGenerating,
                  isSelected: selectedSuggestionId === suggestion.id,
                }),
              )}
              onClick={async () => !isGenerating && (await accept({ suggestion }))}
              disabled={isGenerating}
              data-suggestion-id={suggestion.id}
              data-suggestion-index={index}
            >
              <span className="font-medium">{suggestion.title}</span>
              <svg
                className="w-3 h-3 opacity-50"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </Tooltip>
        ))}
      </div>
    );
  },
);
MessageSuggestionsList.displayName = "MessageSuggestions.List";

/**
 * Internal function to get className for suggestion button based on state
 */
function getSuggestionButtonClassName({ isGenerating, isSelected }: { isGenerating: boolean; isSelected: boolean }) {
  if (isGenerating) {
    return "bg-muted/50 text-muted-foreground";
  }
  if (isSelected) {
    return "bg-accent text-accent-foreground";
  }
  return "bg-background hover:bg-accent hover:text-accent-foreground";
}

export { MessageSuggestions, MessageSuggestionsList, MessageSuggestionsStatus, Tooltip, TooltipProvider };
