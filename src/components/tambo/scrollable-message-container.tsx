import { useTambo } from "@tambo-ai/react";
import * as React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Props for the ScrollableMessageContainer component
 */
export type ScrollableMessageContainerProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * A scrollable container for message content with auto-scroll functionality.
 * Mimics ChatGPT / Claude app behavior:
 * - Auto-scrolls to bottom during streaming and on new messages
 * - Pauses auto-scroll when user scrolls up (takes control)
 * - Re-enables auto-scroll when user scrolls back to bottom OR sends a new message
 *
 * @example
 * ```tsx
 * <ScrollableMessageContainer>
 *   <ThreadContent variant="default">
 *     <ThreadContentMessages />
 *   </ThreadContent>
 * </ScrollableMessageContainer>
 * ```
 */
export const ScrollableMessageContainer = React.forwardRef<HTMLDivElement, ScrollableMessageContainerProps>(
  ({ className, children, ...props }, ref) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const { messages, isStreaming } = useTambo();

    // Use ref for auto-scroll state to avoid re-triggering effects
    const stickToBottomRef = useRef(true);
    // Track whether the programmatic scroll is in progress (to ignore its scroll events)
    const programmaticScrollRef = useRef(false);
    // RAF handle for streaming scroll
    const rafRef = useRef<number>(0);
    // Track message count to detect new user messages
    const prevMessageCountRef = useRef(0);

    // Handle forwarded ref
    React.useImperativeHandle(ref, () => scrollContainerRef.current!, []);

    /** Is the container scrolled to (or near) the bottom? */
    const isAtBottom = useCallback((): boolean => {
      const el = scrollContainerRef.current;
      if (!el) return true;
      return el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    }, []);

    /** Scroll to the very bottom */
    const scrollToBottom = useCallback((instant?: boolean) => {
      const el = scrollContainerRef.current;
      if (!el) return;
      programmaticScrollRef.current = true;
      el.scrollTo({
        top: el.scrollHeight,
        behavior: instant ? "instant" : "smooth",
      });
      // Clear the programmatic flag after smooth scroll settles
      // (smooth scroll fires multiple scroll events over ~300ms)
      setTimeout(
        () => {
          programmaticScrollRef.current = false;
        },
        instant ? 0 : 400,
      );
    }, []);

    // Handle scroll events - detect user taking control vs being at bottom
    const handleScroll = useCallback(() => {
      // Ignore scroll events caused by our own programmatic scrollTo
      if (programmaticScrollRef.current) return;

      // User-initiated scroll: check if they're at the bottom
      stickToBottomRef.current = isAtBottom();
    }, [isAtBottom]);

    // Stable content fingerprint to detect actual content changes
    const messagesContent = useMemo(() => {
      if (!messages) return null;
      return messages.map((message) => ({
        id: message.id,
        content: message.content,
        reasoning: message.reasoning,
      }));
    }, [messages]);

    // Re-enable stick-to-bottom when the user sends a NEW message
    // (message count increases and the last message is from the user)
    useEffect(() => {
      if (!messages || messages.length === 0) return;
      const count = messages.length;
      if (count > prevMessageCountRef.current) {
        const lastMsg = messages[count - 1];
        if (lastMsg.role === "user") {
          stickToBottomRef.current = true;
          scrollToBottom(true);
        }
      }
      prevMessageCountRef.current = count;
    }, [messages?.length, scrollToBottom]);

    // Auto-scroll during streaming - use rAF loop for smooth tracking
    useEffect(() => {
      if (!isStreaming || !stickToBottomRef.current) {
        cancelAnimationFrame(rafRef.current);
        return;
      }

      const tick = () => {
        if (!stickToBottomRef.current) return;
        const el = scrollContainerRef.current;
        if (el) {
          // Use instant scroll during streaming to avoid smooth-scroll lag
          programmaticScrollRef.current = true;
          el.scrollTop = el.scrollHeight;
          programmaticScrollRef.current = false;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      return () => cancelAnimationFrame(rafRef.current);
    }, [isStreaming]);

    // Auto-scroll on new content when NOT streaming (e.g. tool results, component renders)
    useEffect(() => {
      if (isStreaming || !stickToBottomRef.current || !messagesContent) return;

      const timeoutId = setTimeout(() => {
        if (stickToBottomRef.current) {
          scrollToBottom(false);
        }
      }, 50);
      return () => clearTimeout(timeoutId);
    }, [messagesContent, isStreaming, scrollToBottom]);

    return (
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={cn(
          "flex-1 overflow-y-auto",
          "[&::-webkit-scrollbar]:w-[6px]",
          "[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30",
          "[&::-webkit-scrollbar:horizontal]:h-[4px]",
          className,
        )}
        data-slot="scrollable-message-container"
        {...props}
      >
        {children}
      </div>
    );
  },
);
ScrollableMessageContainer.displayName = "ScrollableMessageContainer";
