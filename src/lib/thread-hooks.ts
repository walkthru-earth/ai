import type { TamboThreadMessage } from "@tambo-ai/react";
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { runQuery } from "@/services/duckdb-wasm";
import { getQueryResult, storeQueryResultWithId } from "@/services/query-store";

/**
 * Merges multiple refs into a single callback ref.
 *
 * In React 19, callback refs may return cleanup functions; this hook fans out
 * both assignments and cleanups to all provided refs and tracks the last
 * cleanup so it runs when the instance changes.
 */
export function useMergeRefs<Instance>(
  ...refs: (React.Ref<Instance> | undefined)[]
): null | React.RefCallback<Instance> {
  const cleanupRef = React.useRef<undefined | (() => void)>(undefined);

  const refEffect = React.useCallback((instance: Instance | null) => {
    const cleanups = refs.map((ref) => {
      if (ref == null) {
        return;
      }

      if (typeof ref === "function") {
        const refCallback = ref;
        const refCleanup = refCallback(instance) as undefined | (() => void);
        return typeof refCleanup === "function"
          ? refCleanup
          : () => {
              refCallback(null);
            };
      }

      (ref as React.MutableRefObject<Instance | null>).current = instance;
      return () => {
        (ref as React.MutableRefObject<Instance | null>).current = null;
      };
    });

    return () => {
      cleanups.forEach((refCleanup) => refCleanup?.());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, refs);

  return React.useMemo(() => {
    if (refs.every((ref) => ref == null)) {
      return null;
    }

    return (value) => {
      if (cleanupRef.current) {
        cleanupRef.current();
        (cleanupRef as React.MutableRefObject<undefined | (() => void)>).current = undefined;
      }

      if (value != null) {
        (cleanupRef as React.MutableRefObject<undefined | (() => void)>).current = refEffect(value);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refEffect, ...refs, refs.every]);
}
/**
 * Custom hook to detect canvas space presence and position
 * @param elementRef - Reference to the component to compare position with
 * @returns Object containing hasCanvasSpace and canvasIsOnLeft
 */
export function useCanvasDetection(elementRef: React.RefObject<HTMLElement | null>) {
  const [hasCanvasSpace, setHasCanvasSpace] = useState(false);
  const [canvasIsOnLeft, setCanvasIsOnLeft] = useState(false);

  useEffect(() => {
    const checkCanvas = () => {
      const canvas = document.querySelector('[data-canvas-space="true"]');
      setHasCanvasSpace(!!canvas);

      if (canvas && elementRef.current) {
        // Check if canvas appears before this component in the DOM
        const canvasRect = canvas.getBoundingClientRect();
        const elemRect = elementRef.current.getBoundingClientRect();
        setCanvasIsOnLeft(canvasRect.left < elemRect.left);
      }
    };

    // Check on mount and after a short delay to ensure DOM is fully rendered
    checkCanvas();
    const timeoutId = setTimeout(checkCanvas, 100);

    // Re-check on window resize
    window.addEventListener("resize", checkCanvas);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", checkCanvas);
    };
  }, [elementRef]);

  return { hasCanvasSpace, canvasIsOnLeft };
}

/**
 * Utility to check if a className string contains the "right" class
 * @param className - The className string to check
 * @returns true if the className contains "right", false otherwise
 */
export function hasRightClass(className?: string): boolean {
  return className ? /(?:^|\s)right(?:\s|$)/i.test(className) : false;
}

/**
 * Hook to calculate sidebar and history positions based on className and canvas position
 * @param className - Component's className string
 * @param canvasIsOnLeft - Whether the canvas is on the left
 * @returns Object with isLeftPanel and historyPosition values
 */
export function usePositioning(className?: string, canvasIsOnLeft = false, hasCanvasSpace = false) {
  const isRightClass = hasRightClass(className);
  const isLeftPanel = !isRightClass;

  // Determine history position
  // If panel has right class, history should be on right
  // If canvas is on left, history should be on right
  // Otherwise, history should be on left
  let historyPosition: "left" | "right";
  if (isRightClass) {
    historyPosition = "right";
  } else if (hasCanvasSpace && canvasIsOnLeft) {
    historyPosition = "right";
  } else {
    historyPosition = "left";
  }

  return { isLeftPanel, historyPosition };
}

/**
 * Converts message content into a safely renderable format.
 * Handles text, resource references, and other content types.
 *
 * @deprecated This function is deprecated. Message rendering now uses a private
 * `convertContentToMarkdown()` function within the message component. This function
 * is kept for backward compatibility since it's exposed in the SDK.
 *
 * @param content - The message content (string, element, array, etc.)
 * @returns A renderable string or React element.
 */
export function getSafeContent(
  content: TamboThreadMessage["content"] | React.ReactNode | undefined | null,
): string | React.ReactElement {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (React.isValidElement(content)) return content; // Pass elements through
  if (Array.isArray(content)) {
    // Map content parts to strings, including resource references
    const parts: string[] = [];
    for (const item of content) {
      if (item?.type === "text") {
        parts.push(item.text ?? "");
      } else if (item?.type === "resource") {
        // Format resource references as @uri (uri already contains serverKey prefix if applicable)
        const uri = item.resource?.uri;
        if (uri) {
          parts.push(`@${uri}`);
        }
      }
    }
    return parts.join(" ");
  }
  // Handle potential edge cases or unknown types
  // console.warn("getSafeContent encountered unknown content type:", content);
  return "Invalid content format"; // Or handle differently
}

/**
 * Checks if a content item has meaningful data.
 * @param item - A content item from the message
 * @returns True if the item has content, false otherwise.
 */
function hasContentInItem(item: unknown): boolean {
  if (!item || typeof item !== "object") {
    return false;
  }

  const typedItem = item as {
    type?: string;
    text?: string;
    image_url?: { url?: string };
  };

  // Check for text content
  if (typedItem.type === "text") {
    return !!typedItem.text?.trim();
  }

  // Check for image content
  if (typedItem.type === "image_url") {
    return !!typedItem.image_url?.url;
  }

  return false;
}

/**
 * Checks if message content contains meaningful, non-empty text or images.
 * @param content - The message content (string, element, array, etc.)
 * @returns True if there is content, false otherwise.
 */
export function checkHasContent(content: TamboThreadMessage["content"] | React.ReactNode | undefined | null): boolean {
  if (!content) return false;
  if (typeof content === "string") return content.trim().length > 0;
  if (React.isValidElement(content)) return true; // Assume elements have content
  if (Array.isArray(content)) {
    return content.some(hasContentInItem);
  }
  return false; // Default for unknown types
}

/**
 * Extracts image URLs from message content array.
 * @param content - Array of content items
 * @returns Array of image URLs
 */
export function getMessageImages(
  content: { type?: string; image_url?: { url?: string } }[] | undefined | null,
): string[] {
  if (!content) return [];

  return content
    .filter((item) => item?.type === "image_url" && item.image_url?.url)
    .map((item) => item.image_url?.url!);
}

/**
 * Replay SQL queries from a restored thread to repopulate the query store.
 * tool_use blocks (assistant) and tool_result blocks (user/tool) are in DIFFERENT messages,
 * so we search across all messages to find the matching tool_result.
 */
export function useReplayQueries(messages: TamboThreadMessage[]) {
  const replayedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!messages.length) return;

    // Build a flat index of all tool_result blocks across all messages
    const toolResults = new Map<string, any>();
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
}
