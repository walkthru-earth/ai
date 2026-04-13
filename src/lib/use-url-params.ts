import { useTambo, useTamboThreadInput } from "@tambo-ai/react";
import { useEffect, useRef } from "react";

/**
 * Bidirectional URL param sync used by both `/chat` and `/explore`.
 *
 * - `?thread=<id>` - Shared thread links. On mount: read → `switchThread`.
 *   When `currentThreadId` changes to a real id (`thr_...`), the URL is
 *   updated. Placeholders clear the param. Invalid ids are scrubbed.
 * - `?q=<text>` - One-shot starter prompt from the home page chips. Sets
 *   the input value, submits once, then clears the param so a refresh
 *   does not re-submit. Skipped when `?thread=` points at an existing
 *   thread so restored conversations are not trampled.
 */
export function useUrlParamsSync() {
  const { currentThreadId, switchThread } = useTambo();
  const { setValue, submit } = useTamboThreadInput();

  // Thread sync: URL → Tambo on mount
  const threadSyncDone = useRef(false);
  useEffect(() => {
    if (threadSyncDone.current) return;
    threadSyncDone.current = true;
    const params = new URLSearchParams(window.location.search);
    const urlThread = params.get("thread");
    if (urlThread?.startsWith("thr_") && urlThread !== currentThreadId) {
      switchThread(urlThread);
    } else if (urlThread && !urlThread.startsWith("thr_")) {
      params.delete("thread");
      replaceQuery(params);
    }
  }, [currentThreadId, switchThread]);

  // Thread sync: Tambo → URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (currentThreadId?.startsWith("thr_")) {
      if (params.get("thread") !== currentThreadId) {
        params.set("thread", currentThreadId);
        replaceQuery(params);
      }
    } else if (params.has("thread")) {
      params.delete("thread");
      replaceQuery(params);
    }
  }, [currentThreadId]);

  // One-shot ?q= starter prompt
  const qSubmitted = useRef(false);
  useEffect(() => {
    if (qSubmitted.current) return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (!q) return;
    if (params.get("thread")?.startsWith("thr_")) return;
    qSubmitted.current = true;
    params.delete("q");
    replaceQuery(params);
    setValue(q);
    setTimeout(() => {
      void submit();
    }, 50);
  }, [setValue, submit]);
}

function replaceQuery(params: URLSearchParams) {
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}
