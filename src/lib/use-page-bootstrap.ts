import { useEffect, useMemo } from "react";
import { buildContextHelpers, buildInitialSuggestions } from "@/lib/tambo";
import { useAnonymousUserKey } from "@/lib/use-anonymous-user-key";
import { useGeoIP } from "@/lib/use-geo-ip";
import { preloadDuckDB } from "@/services/duckdb-wasm";

/**
 * Shared bootstrap logic for page-level components.
 * Computes userKey, geo, contextHelpers, and suggestions.
 * Preloads DuckDB on mount.
 */
export function usePageBootstrap() {
  const userKey = useAnonymousUserKey();
  const geo = useGeoIP();
  const contextHelpers = useMemo(() => buildContextHelpers(geo), [geo]);
  const suggestions = useMemo(() => buildInitialSuggestions(geo), [geo]);

  useEffect(() => {
    preloadDuckDB();
  }, []);

  return { userKey, geo, contextHelpers, suggestions };
}
