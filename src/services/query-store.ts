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
  /** Raw column typed arrays from Arrow result for zero-copy GeoArrow rendering */
  columnArrays?: Record<string, ArrayLike<any>>;
  /** Arrow IPC bytes for true zero-copy deserialization with GeoArrow layers */
  arrowIPC?: Uint8Array;
  /** Raw WKB geometry arrays — auto-extracted from GEOMETRY columns for zero-copy GeoArrow rendering */
  wkbArrays?: Uint8Array[];
  /** Name of the auto-detected geometry column (e.g. "geom") */
  geometryColumn?: string;
}

const store = new Map<string, StoredQuery>();
let nextId = 1;

/* ── Query Store Listeners (for reactive hooks) ──────────────────── */

const queryListeners = new Set<() => void>();
function emitQuery() {
  for (const fn of queryListeners) fn();
}
function subscribeQuery(cb: () => void): () => void {
  queryListeners.add(cb);
  return () => queryListeners.delete(cb);
}

/** Reactive version counter — increments on every store write so useSyncExternalStore detects changes. */
let queryVersion = 0;
function _getQueryVersion() {
  return queryVersion;
}

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
export function storeQueryResultWithId(id: string, result: Omit<StoredQuery, "timestamp">): void {
  store.set(id, { ...result, timestamp: Date.now() });
  if (store.size > 40) {
    const oldest = [...store.keys()].slice(0, store.size - 40);
    for (const key of oldest) store.delete(key);
  }
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

function emit() {
  for (const fn of listeners) fn();
}

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
function emitToggle() {
  for (const fn of toggleListeners) fn();
}

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

/* ── Fly-To Bus ────────────────────────────────────────────────────── */

export interface FlyToTarget {
  latitude: number;
  longitude: number;
  zoom?: number;
}

let flyToTarget: FlyToTarget | null = null;
let flyToVersion = 0;
const flyToListeners = new Set<() => void>();

function emitFlyTo() {
  for (const fn of flyToListeners) fn();
}

export function requestFlyTo(target: FlyToTarget): void {
  flyToTarget = target;
  flyToVersion++;
  emitFlyTo();
}

// Single-consumer: first caller clears the target
export function consumeFlyTo(): FlyToTarget | null {
  const t = flyToTarget;
  flyToTarget = null;
  return t;
}

function getFlyToVersion() {
  return flyToVersion;
}

function subscribeFlyTo(cb: () => void): () => void {
  flyToListeners.add(cb);
  return () => flyToListeners.delete(cb);
}

/** Returns the latest fly-to version (triggers re-render when a new target is requested) */
export function useFlyToVersion(): number {
  return useSyncExternalStore(subscribeFlyTo, getFlyToVersion, () => 0);
}

/* ── Panel Dismiss Bus ─────────────────────────────────────────────── */

export interface DismissRequest {
  /** "all" to clear everything, or specific component type/panelId */
  target: "all" | string;
}

let dismissRequest: DismissRequest | null = null;
let dismissVersion = 0;
const dismissListeners = new Set<() => void>();

function emitDismiss() {
  for (const fn of dismissListeners) fn();
}

/** Request panel dismissal — called by AI tool. target: "all", componentName, or panelId. */
export function requestDismissPanel(target: string): void {
  dismissRequest = { target };
  dismissVersion++;
  emitDismiss();
}

/** Single-consumer: first caller clears the request */
export function consumeDismissRequest(): DismissRequest | null {
  const r = dismissRequest;
  dismissRequest = null;
  return r;
}

function getDismissVersion() {
  return dismissVersion;
}

function subscribeDismiss(cb: () => void): () => void {
  dismissListeners.add(cb);
  return () => dismissListeners.delete(cb);
}

/** Returns the latest dismiss version (triggers re-render when a new request is made) */
export function useDismissVersion(): number {
  return useSyncExternalStore(subscribeDismiss, getDismissVersion, () => 0);
}
