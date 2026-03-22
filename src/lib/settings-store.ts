/**
 * Centralized settings store — reactive via useSyncExternalStore + localStorage.
 *
 * Manages: theme (dark/light/system), queryLimit (default 10000).
 * All Tambo AI context reads queryLimit from here at message-send time.
 * Same pattern as query-store.ts cross-filter toggle.
 */

import { useSyncExternalStore } from "react";
import { readStorage, removeStorage, writeStorage } from "@/lib/storage";

/* ── Types ────────────────────────────────────────────────────── */

export type Theme = "dark" | "light" | "system";

export interface Settings {
  theme: Theme;
  queryLimit: number;
  /** Default H3 resolution for queries (1-10). null = let AI decide. */
  defaultH3Res: number | null;
  /** Default A5 resolution for queries (1-15). null = let AI decide. */
  defaultA5Res: number | null;
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

export const H3_RES_OPTIONS = [
  { value: null, label: "Auto" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
  { value: 6, label: "6" },
  { value: 7, label: "7" },
  { value: 8, label: "8" },
] as const;

export const A5_RES_OPTIONS = [
  { value: null, label: "Auto" },
  { value: 5, label: "5" },
  { value: 6, label: "6" },
  { value: 7, label: "7" },
  { value: 8, label: "8" },
  { value: 9, label: "9" },
  { value: 10, label: "10" },
] as const;

const DEFAULTS: Settings = {
  theme: "system",
  queryLimit: DEFAULT_QUERY_LIMIT,
  defaultH3Res: null,
  defaultA5Res: null,
};

/* ── Module-level store ───────────────────────────────────────── */

const listeners = new Set<() => void>();

function loadFromStorage(): Settings {
  const stored = readStorage<Partial<Settings> | null>(STORAGE_KEY, null);
  if (stored) {
    return { ...DEFAULTS, ...stored };
  }
  // Migrate from old "theme" key (stored as raw string, not JSON)
  try {
    const oldTheme = localStorage.getItem(OLD_THEME_KEY);
    if (oldTheme && (oldTheme === "dark" || oldTheme === "light" || oldTheme === "system")) {
      const migrated = { ...DEFAULTS, theme: oldTheme as Theme };
      writeStorage(STORAGE_KEY, migrated);
      removeStorage(OLD_THEME_KEY);
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
  writeStorage(STORAGE_KEY, settings);
  // Keep old "theme" key in sync for index.html FOUC script
  try {
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
