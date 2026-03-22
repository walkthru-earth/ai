/**
 * Centralized settings store — reactive via useSyncExternalStore + localStorage.
 *
 * Manages: theme (dark/light/system), queryLimit (default 10000).
 * All Tambo AI context reads queryLimit from here at message-send time.
 * Same pattern as query-store.ts cross-filter toggle.
 */

import { useSyncExternalStore } from "react";

/* ── Types ────────────────────────────────────────────────────── */

export type Theme = "dark" | "light" | "system";

export interface Settings {
  theme: Theme;
  queryLimit: number;
}

/* ── Constants ────────────────────────────────────────────────── */

const STORAGE_KEY = "walkthru-settings";
const OLD_THEME_KEY = "theme"; // legacy key — migrated on first load

export const DEFAULT_QUERY_LIMIT = 10000;

export const QUERY_LIMIT_PRESETS = [
  { value: 500, label: "500" },
  { value: 5000, label: "5K" },
  { value: 10000, label: "10K" },
  { value: 50000, label: "50K" },
] as const;

const DEFAULTS: Settings = {
  theme: "system",
  queryLimit: DEFAULT_QUERY_LIMIT,
};

/* ── Module-level store ───────────────────────────────────────── */

const listeners = new Set<() => void>();

function loadFromStorage(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULTS, ...parsed };
    }
    // Migrate from old "theme" key
    const oldTheme = localStorage.getItem(OLD_THEME_KEY);
    if (oldTheme && (oldTheme === "dark" || oldTheme === "light" || oldTheme === "system")) {
      const migrated = { ...DEFAULTS, theme: oldTheme as Theme };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      localStorage.removeItem(OLD_THEME_KEY);
      return migrated;
    }
  } catch {
    /* localStorage unavailable */
  }
  return { ...DEFAULTS };
}

let settings: Settings = loadFromStorage();

function notify() {
  for (const fn of listeners) fn();
}

/* ── Public API ───────────────────────────────────────────────── */

/** Read current settings (non-reactive — use in callbacks, thunks, non-React code). */
export function getSettings(): Settings {
  return settings;
}

/** Update one or more settings fields. Persists to localStorage and notifies subscribers. */
export function updateSettings(partial: Partial<Settings>): void {
  settings = { ...settings, ...partial };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    // Keep old "theme" key in sync for index.html FOUC script
    localStorage.setItem(OLD_THEME_KEY, settings.theme);
  } catch {
    /* quota exceeded */
  }
  notify();
}

/** Reactive hook — re-renders when any setting changes. */
export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => settings,
    () => DEFAULTS,
  );
}
