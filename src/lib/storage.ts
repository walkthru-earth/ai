/**
 * Safe localStorage read with JSON parse. Returns fallback on any error.
 * No SSR guard needed — this is a pure SPA.
 */
export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Safe localStorage write with JSON stringify. Silently catches quota errors.
 */
export function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded — silently ignore
  }
}

/**
 * Remove a localStorage key. Silently catches errors.
 */
export function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // silently ignore
  }
}
