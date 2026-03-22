import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reusable clipboard copy hook with auto-reset indicator.
 */
export function useCopyToClipboard(resetMs = 2000): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => setCopied(false), resetMs);
        })
        .catch(() => {});
    },
    [resetMs],
  );

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  return [copied, copy];
}
