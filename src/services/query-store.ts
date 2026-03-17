"use client";

/**
 * Query Result Store + Cross-Filter Bus
 *
 * Query Store: zero-token data bridge between DuckDB tools and viz components.
 * Cross-Filter: pub/sub for linked dashboard interactions (click bar → highlight hex → filter table).
 * Spatial Filter: map viewport bbox filters all other components.
 */

import { useSyncExternalStore } from "react";

/* ── Query Store ──────────────────────────────────────────────────── */

export interface StoredQuery {
  rows: Record<string, unknown>[];
  columns: string[];
  duration: number;
  rowCount: number;
  sql: string;
  timestamp: number;
}

const store = new Map<string, StoredQuery>();
let nextId = 1;

/* ── Query Store Listeners (for reactive hooks) ──────────────────── */

const queryListeners = new Set<() => void>();
function emitQuery() { for (const fn of queryListeners) fn(); }
function subscribeQuery(cb: () => void): () => void {
  queryListeners.add(cb);
  return () => queryListeners.delete(cb);
}

/** Reactive version counter — increments on every store write so useSyncExternalStore detects changes. */
let queryVersion = 0;
function getQueryVersion() { return queryVersion; }

export function storeQueryResult(result: Omit<StoredQuery, "timestamp">): string {
  const id = `qr_${nextId++}`;
  store.set(id, { ...result, timestamp: Date.now() });
  if (store.size > 20) {
    const oldest = [...store.keys()].slice(0, store.size - 20);
    for (const key of oldest) store.delete(key);
  }
  queryVersion++;
  emitQuery();
  return id;
}

/** Store a result under a specific ID (for restoring shared threads). */
export function storeQueryResultWithId(
  id: string,
  result: Omit<StoredQuery, "timestamp">,
): void {
  store.set(id, { ...result, timestamp: Date.now() });
  queryVersion++;
  emitQuery();
}

export function getQueryResult(id: string): StoredQuery | null {
  return store.get(id) ?? null;
}

export function getLatestQueryResult(): StoredQuery | null {
  if (store.size === 0) return null;
  const entries = [...store.entries()];
  return entries[entries.length - 1][1];
}

/**
 * React hook — reactively reads a query result from the store.
 * Re-renders when any query result is stored (via storeQueryResult / storeQueryResultWithId).
 */
export function useQueryResult(queryId: string | undefined): StoredQuery | null {
  // useSyncExternalStore calls getSnapshot after each emitQuery() notification.
  // Returning a new object reference (or null→object) triggers re-render.
  return useSyncExternalStore(
    subscribeQuery,
    () => (queryId ? getQueryResult(queryId) : null),
    () => null,
  );
}

/* ── Cross-Filter Bus ─────────────────────────────────────────────── */

export interface CrossFilter {
  sourceQueryId: string;
  sourceComponent: string;
  filterType: "row" | "value" | "bbox";
  column: string;
  values: (string | number)[];
  /** Spatial bounding box [west, south, east, north] — set by map viewport */
  bbox?: [number, number, number, number];
}

// ── Cross-filter state ──
let crossFilterEnabled = true;
let currentFilter: CrossFilter | null = null;
const listeners = new Set<() => void>();

function emit() { for (const fn of listeners) fn(); }

export function setCrossFilter(filter: CrossFilter): void {
  if (!crossFilterEnabled) return;
  currentFilter = filter;
  emit();
}

export function clearCrossFilter(): void {
  currentFilter = null;
  emit();
}

export function getCrossFilter(): CrossFilter | null {
  return crossFilterEnabled ? currentFilter : null;
}

function subscribeCrossFilter(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useCrossFilter(): CrossFilter | null {
  return useSyncExternalStore(subscribeCrossFilter, getCrossFilter, () => null);
}

// ── Global toggle ──
const toggleListeners = new Set<() => void>();
function emitToggle() { for (const fn of toggleListeners) fn(); }

export function setCrossFilterEnabled(enabled: boolean): void {
  crossFilterEnabled = enabled;
  if (!enabled) currentFilter = null;
  emit();
  emitToggle();
}

export function isCrossFilterEnabled(): boolean {
  return crossFilterEnabled;
}

function subscribeToggle(cb: () => void): () => void {
  toggleListeners.add(cb);
  return () => toggleListeners.delete(cb);
}

export function useCrossFilterEnabled(): [boolean, (v: boolean) => void] {
  const enabled = useSyncExternalStore(subscribeToggle, isCrossFilterEnabled, () => true);
  return [enabled, setCrossFilterEnabled];
}
