/**
 * Context helpers assembler — combines all context pieces into a single object for TamboProvider.
 * This file wires the pieces together. Edit individual files for specific concerns.
 */

import { getSettings } from "@/lib/settings-store";
import type { GeoIP } from "@/lib/use-geo-ip";
import { behaviorRules } from "./behavior";
import { buildComponentTips } from "./component-tips";
import { datasetPaths, S3_BASE } from "./dataset-paths";
import { buildDuckdbWasmNotes } from "./duckdb-notes";

/** Returns the current UI theme: "dark" or "light". */
function getCurrentTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Build user environment context (theme, location, date). */
function buildUserEnvironment(geo: GeoIP | null) {
  const theme = getCurrentTheme();
  const timezone = geo?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const currentDate = new Date().toLocaleDateString("en-CA", { timeZone: geo?.timezone || undefined });

  return {
    currentDate,
    userTimezone: timezone,
    dateNote:
      "currentDate is the user's local date in YYYY-MM-DD (ISO 8601) — DuckDB casts directly. " +
      "Use for weather file URLs and date filtering.",
    theme,
    basemapHint:
      "ALWAYS set basemap='auto' — it automatically matches the user's theme (" +
      theme +
      "). NEVER set basemap='dark' or 'light' unless the user explicitly asks to override. " +
      "Do NOT read the theme value and manually pick dark/light — that causes reversal bugs. Just use 'auto'.",
    ...(geo ? buildLocationContext(geo, timezone, currentDate) : {}),
  };
}

/** Build geo-IP location context when available. */
function buildLocationContext(geo: GeoIP, timezone: string, currentDate: string) {
  return {
    userLocation: {
      city: geo.city,
      country: geo.country,
      countryCode: geo.country_code,
      lat: geo.latitude,
      lng: geo.longitude,
      region: geo.region,
      timezone: geo.timezone,
      ...(geo.h3Cells ? { h3Cells: geo.h3Cells } : {}),
    },
    locationHint:
      "The user is browsing from " +
      geo.city +
      ", " +
      geo.country +
      " (latitude=" +
      geo.latitude +
      " [north/south], longitude=" +
      geo.longitude +
      " [east/west]). " +
      "Timezone: " +
      timezone +
      ". Local date: " +
      currentDate +
      ". " +
      "Coordinate order: see DuckDB notes. " +
      (geo.h3Cells
        ? "USER H3 CELLS (use these — NEVER hardcode or compute H3 for 'my location' queries): " +
          Object.entries(geo.h3Cells)
            .map(([res, hex]) => `res${res}='${hex}'`)
            .join(", ") +
          ". SQL PATTERNS — Single cell: WHERE h3_index = h3_string_to_h3('<cell>')::BIGINT. " +
          "Area: WITH c AS (SELECT unnest(h3_grid_disk(h3_string_to_h3('<cell>')::BIGINT, 4))::BIGINT AS h3_index) SELECT ... FROM file JOIN c USING (h3_index). "
        : "") +
      "Use this to personalize initial suggestions (e.g., show data for their city/region first). " +
      "Do NOT mention that you know their location unless they ask about their area.",
  };
}

/**
 * Build contextHelpers for TamboProvider.
 * Assembles user environment, behavior rules, DuckDB notes, dataset paths, and component tips.
 */
export function buildContextHelpers(geo: GeoIP | null) {
  return {
    walkthruContext: () => {
      const { queryLimit, defaultH3Res, defaultA5Res } = getSettings();
      return {
        platform: "walkthru.earth",
        userEnvironment: buildUserEnvironment(geo),
        behavior: behaviorRules,
        duckdbWasmNotes: buildDuckdbWasmNotes(queryLimit),
        queryLimit,
        defaultH3Res: defaultH3Res ?? "auto (AI decides)",
        defaultA5Res: defaultA5Res ?? "auto (AI decides)",
        gridResolutionNote:
          defaultH3Res || defaultA5Res
            ? `User has set default grid resolution: ${defaultH3Res ? `H3 res ${defaultH3Res}` : ""}${defaultH3Res && defaultA5Res ? ", " : ""}${defaultA5Res ? `A5 res ${defaultA5Res}` : ""}. ` +
              "ALWAYS use this resolution for queries unless the user explicitly asks for a different one. " +
              "Pass this resolution to buildParquetUrl() and use it in SQL queries."
            : undefined,
        s3Base: S3_BASE,
        datasets: datasetPaths,
        componentTips: buildComponentTips(queryLimit),
      };
    },
  };
}
