import { useState } from "react";

export const USER_KEY_STORAGE_KEY = "walkthru-user-key";

function generateUserKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `anon-${crypto.randomUUID()}`;
  }
  // Fallback for older browsers (iOS <15.4, older Android WebViews)
  const bytes = new Uint8Array(16);
  (typeof crypto !== "undefined" ? crypto : globalThis.crypto).getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `anon-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Stable anonymous user key for Tambo - persisted to localStorage.
 * The SDK requires a userKey for thread scoping but doesn't auto-generate one.
 */
export function useAnonymousUserKey(): string {
  const [userKey] = useState<string>(() => {
    if (typeof window === "undefined") return generateUserKey();
    const stored = localStorage.getItem(USER_KEY_STORAGE_KEY);
    if (stored) return stored;
    const newKey = generateUserKey();
    localStorage.setItem(USER_KEY_STORAGE_KEY, newKey);
    return newKey;
  });
  return userKey;
}
