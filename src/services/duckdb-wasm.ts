"use client";

/**
 * DuckDB-WASM service — runs SQL against remote Parquet in-browser.
 *
 * The runSQL tool returns a queryId (not row data) to the LLM.
 * Map components read data directly from the query store — zero tokens wasted.
 *
 * Features:
 * - Automatic retry on chunk load failure (up to 3 attempts)
 * - Preload API so DuckDB is warm before first query
 * - Robust Arrow → JS conversion (BigInt, Struct, List)
 */

import { storeQueryResult } from "./query-store";

let db: any = null;
let initPromise: Promise<any> | null = null;
let _initAttempts = 0;
const MAX_INIT_RETRIES = 3;

/** Initialize DuckDB-WASM singleton with retry on chunk load failure. */
async function initDuckDB(): Promise<any> {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    let lastError: any = null;

    for (let attempt = 1; attempt <= MAX_INIT_RETRIES; attempt++) {
      try {
        _initAttempts = attempt;
        const duckdb = await import("@duckdb/duckdb-wasm");

        const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

        // Blob URL worker avoids Next.js webpack module resolution issues
        const worker_url = URL.createObjectURL(
          new Blob([`importScripts("${bundle.mainWorker!}");`], {
            type: "text/javascript",
          }),
        );
        const worker = new Worker(worker_url);
        const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
        const instance = new duckdb.AsyncDuckDB(logger, worker);
        await instance.instantiate(bundle.mainModule, bundle.pthreadWorker);
        URL.revokeObjectURL(worker_url);

        // Try JS API extension loading
        for (const ext of ["httpfs", "h3"]) {
          try {
            if (typeof (instance as any).loadExtension === "function") {
              await (instance as any).loadExtension(ext);
            }
          } catch {
            /* fallback below */
          }
        }

        // SQL-level setup (all best-effort)
        const conn = await instance.connect();
        try {
          for (const stmt of [
            "INSTALL httpfs",
            "LOAD httpfs",
            "INSTALL h3 FROM community",
            "LOAD h3",
            "SET s3_region = 'us-west-2'",
            "SET s3_url_style = 'path'",
          ]) {
            try {
              await conn.query(stmt);
            } catch {
              /* ignore */
            }
          }
        } finally {
          await conn.close();
        }

        db = instance;
        return instance;
      } catch (error: any) {
        lastError = error;
        console.warn(`DuckDB init attempt ${attempt}/${MAX_INIT_RETRIES} failed:`, error?.message);
        // Reset for retry
        db = null;
        if (attempt < MAX_INIT_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
    }

    // All retries exhausted — reset so next call can retry fresh
    initPromise = null;
    throw new Error(
      `DuckDB failed to initialize after ${MAX_INIT_RETRIES} attempts: ${lastError?.message ?? "unknown error"}. ` +
        `Try refreshing the page.`,
    );
  })();

  return initPromise;
}

/**
 * Preload DuckDB — call early so it's warm before the first query.
 * Returns true on success, false on failure (non-blocking).
 */
export async function preloadDuckDB(): Promise<boolean> {
  try {
    await initDuckDB();
    return true;
  } catch {
    return false;
  }
}

/** Convert Arrow values to plain JS — handles BigInt, Uint8Array, Struct, List. */
function arrowToJs(val: unknown): unknown {
  if (val == null) return null;
  if (typeof val === "bigint") return Number(val);
  if (val instanceof Uint8Array) return `0x${[...val].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  // Arrow Struct → plain object
  if (val && typeof val === "object" && "toJSON" in val && typeof (val as any).toJSON === "function") {
    return (val as any).toJSON();
  }
  // Arrow List / Array → plain array
  if (Array.isArray(val)) return val.map(arrowToJs);
  return val;
}

/** Strip INSTALL/LOAD/SET from AI-generated SQL, take last SELECT. Remove trailing semicolons. */
function cleanSql(raw: string): string | null {
  const statements = raw
    .split(";")
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      const upper = s.toUpperCase();
      return !upper.startsWith("INSTALL") && !upper.startsWith("LOAD") && !upper.startsWith("SET ");
    });
  if (statements.length === 0) return null;
  // Strip any trailing semicolons — DuckDB-WASM parser treats them as empty second statement
  const last = statements[statements.length - 1].replace(/;+\s*$/, "").trim();
  return last || null;
}

/**
 * Run a SQL query. Stores full result in query-store.
 * Returns only metadata to the LLM (queryId, rowCount, columns, duration, sample).
 *
 * On init failure, retries DuckDB initialization automatically.
 */
export async function runQuery(input: { sql: string } | string): Promise<{
  queryId: string;
  columns: string[];
  rowCount: number;
  duration: number;
  sampleRows: Record<string, unknown>[];
}> {
  const rawSql = typeof input === "string" ? input : input.sql;
  const sql = cleanSql(rawSql);

  if (!sql) {
    return { queryId: "", columns: [], rowCount: 0, duration: 0, sampleRows: [] };
  }

  // If previous init failed, allow a fresh retry
  if (!db && !initPromise) {
    initPromise = null;
  }

  const instance = await initDuckDB();
  const conn = await instance.connect();
  const start = performance.now();

  try {
    const result = await conn.query(sql);
    const duration = Math.round(performance.now() - start);
    const columns = result.schema.fields.map((f: any) => f.name);
    const numRows = result.numRows;

    // Convert Arrow → plain JS objects (once, stored client-side)
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < numRows; i++) {
      const row: Record<string, unknown> = {};
      for (const col of columns) {
        const vec = result.getChild(col);
        if (vec) {
          const val = vec.get(i);
          row[col] = arrowToJs(val);
        }
      }
      rows.push(row);
    }

    // Store full result client-side
    const queryId = storeQueryResult({ rows, columns, duration, rowCount: numRows, sql });

    // Return only metadata + 3 sample rows to the LLM (saves tokens!)
    return {
      queryId,
      columns,
      rowCount: numRows,
      duration,
      sampleRows: rows.slice(0, 3),
    };
  } catch (error: any) {
    throw new Error(`DuckDB query error: ${error?.message ?? String(error)}`);
  } finally {
    await conn.close();
  }
}
