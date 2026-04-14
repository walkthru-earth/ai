/** Shared JSON parsing helpers for style editor tools. */

/** Accept both JSON strings and already-parsed objects. Returns object or null (legacy). */
export function safeParseJson(input: unknown): Record<string, unknown> | null {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  if (typeof input !== "string") return null;
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // noop
  }
  return null;
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Parse ANY JSON value (object, array, string, number, boolean, null) and
 * surface the exact JSON.parse error so the AI can self-correct instead of
 * looping on a generic "invalid JSON" message. Accepts already-parsed values
 * as-is (Tambo sometimes passes objects directly).
 */
export function parseJsonValue(input: unknown): ParseResult<unknown> {
  if (typeof input !== "string") {
    return { ok: true, value: input };
  }
  const trimmed = input.trim();
  if (trimmed === "")
    return { ok: false, error: 'Empty value. Pass a JSON literal like 3, "#ff0000", or ["get","x"].' };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // V8/SM put "at position N" in message; surface a short preview near the error
    const match = msg.match(/position (\d+)/);
    let hint = "";
    if (match) {
      const pos = Math.max(0, Math.min(trimmed.length - 1, Number(match[1])));
      const start = Math.max(0, pos - 20);
      const end = Math.min(trimmed.length, pos + 20);
      const snippet = trimmed.slice(start, end).replace(/\n/g, "\\n");
      hint = ` near: ...${snippet}...`;
      // Common cause on nested expressions
      const opens = (trimmed.match(/\[/g) || []).length;
      const closes = (trimmed.match(/\]/g) || []).length;
      if (opens !== closes) {
        hint += ` [bracket mismatch: ${opens} '[' vs ${closes} ']']`;
      }
    }
    return { ok: false, error: `JSON parse failed: ${msg}${hint}` };
  }
}

/** Parse and require the result to be a plain object. */
export function parseJsonObject(input: unknown): ParseResult<Record<string, unknown>> {
  const r = parseJsonValue(input);
  if (!r.ok) return r;
  if (!r.value || typeof r.value !== "object" || Array.isArray(r.value)) {
    return { ok: false, error: 'Expected a JSON object (e.g. {"paint":{"fill-color":"#ff0000"}}).' };
  }
  return { ok: true, value: r.value as Record<string, unknown> };
}
