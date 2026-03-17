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
        for (const ext of ["httpfs", "spatial", "h3", "a5"]) {
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
            "INSTALL spatial",
            "LOAD spatial",
            "INSTALL h3 FROM community",
            "LOAD h3",
            "INSTALL a5 FROM community",
            "LOAD a5",
            "SET s3_region = 'us-west-2'",
            "SET s3_url_style = 'path'",
            "SET geometry_always_xy = true",
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
 * Detect GEOMETRY columns via DESCRIBE. Returns { geomColumn, allColumns } or null on failure.
 * DESCRIBE reads Parquet metadata (no data scan) — fast even for remote files.
 *
 * DuckDB v1.5+ reports typed geometry as `GEOMETRY('EPSG:4326')` or `GEOMETRY('OGC:CRS84')`
 * instead of plain `GEOMETRY`, so we check with startsWith rather than exact match.
 */
async function detectGeometryColumns(
  conn: any,
  sql: string,
): Promise<{ geomColumn: string; allColumns: string[] } | null> {
  try {
    const descResult = await conn.query(`DESCRIBE (${sql})`);
    const nameVec = descResult.getChild("column_name");
    const typeVec = descResult.getChild("column_type");
    if (!nameVec || !typeVec) return null;

    let geomColumn: string | null = null;
    const allColumns: string[] = [];
    for (let i = 0; i < descResult.numRows; i++) {
      const name = String(nameVec.get(i));
      const colType = String(typeVec.get(i) ?? "").toUpperCase();
      allColumns.push(name);
      // v1.5+: GEOMETRY, GEOMETRY('EPSG:4326'), GEOMETRY('OGC:CRS84'), etc.
      if (colType.startsWith("GEOMETRY") && !geomColumn) {
        geomColumn = name;
      }
    }
    return geomColumn ? { geomColumn, allColumns } : null;
  } catch {
    return null;
  }
}

/**
 * Wrap SQL to auto-extract coordinates + standard WKB from a GEOMETRY column.
 * Adds lat/lng (via ST_Centroid) only if they don't already exist.
 * Adds __geo_wkb for zero-copy GeoArrow rendering.
 */
function wrapSqlForGeometry(sql: string, geomColumn: string, existingColumns: string[]): string {
  const lowerCols = new Set(existingColumns.map((c) => c.toLowerCase()));
  const hasLat = lowerCols.has("lat") || lowerCols.has("latitude");
  const hasLng = lowerCols.has("lng") || lowerCols.has("longitude");
  const coordCols =
    !hasLat && !hasLng ? `, ST_Y(ST_Centroid("${geomColumn}")) AS lat, ST_X(ST_Centroid("${geomColumn}")) AS lng` : "";
  return `SELECT __src.*${coordCols}, ST_AsWKB("${geomColumn}") AS __geo_wkb FROM (${sql}) __src`;
}

/**
 * Run a SQL query. Stores full result in query-store.
 * Returns only metadata to the LLM (queryId, rowCount, columns, duration, sample).
 *
 * Auto-detects GEOMETRY columns in the result. When found:
 * - Wraps the query to extract lat/lng coordinates + standard WKB
 * - Stores WKB arrays for zero-copy GeoArrow rendering (no ST_AsGeoJSON needed)
 * - Strips useless geometry hex from rows/columns
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
    // Auto-detect GEOMETRY columns (fast DESCRIBE — reads Parquet metadata only)
    const geomInfo = await detectGeometryColumns(conn, sql);
    const geomColumn = geomInfo?.geomColumn ?? null;
    const finalSql = geomColumn ? wrapSqlForGeometry(sql, geomColumn, geomInfo!.allColumns) : sql;

    const result = await conn.query(finalSql);
    const duration = Math.round(performance.now() - start);
    const rawColumns: string[] = result.schema.fields.map((f: any) => f.name);
    const numRows = result.numRows;

    // Columns to strip from public result (internal geo helpers)
    const stripCols = new Set<string>();
    if (geomColumn) {
      stripCols.add("__geo_wkb");
      stripCols.add(geomColumn); // DuckDB internal geometry hex is useless
    }

    // Extract WKB arrays from __geo_wkb column (standard WKB, not DuckDB internal format)
    let wkbArrays: Uint8Array[] | undefined;
    if (geomColumn) {
      const wkbVec = result.getChild("__geo_wkb");
      if (wkbVec) {
        const wkbs: Uint8Array[] = [];
        for (let i = 0; i < numRows; i++) {
          const val = wkbVec.get(i);
          if (val instanceof Uint8Array) {
            wkbs.push(val.slice()); // copy — DuckDB may invalidate buffer
          }
        }
        if (wkbs.length > 0) wkbArrays = wkbs;
      }
    }

    // Public columns — strip internal geo columns
    const columns = rawColumns.filter((c) => !stripCols.has(c));

    // Convert Arrow → plain JS objects (once, stored client-side)
    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < numRows; i++) {
      const row: Record<string, unknown> = {};
      for (const col of rawColumns) {
        if (stripCols.has(col)) continue;
        const vec = result.getChild(col);
        if (vec) {
          const val = vec.get(i);
          row[col] = arrowToJs(val);
        }
      }
      rows.push(row);
    }

    // Extract raw column typed arrays for zero-copy GeoArrow rendering
    const columnArrays: Record<string, ArrayLike<any>> = {};
    for (const col of rawColumns) {
      if (stripCols.has(col)) continue;
      const vec = result.getChild(col);
      if (vec) {
        try {
          columnArrays[col] = vec.toArray();
        } catch {
          /* some types (nested struct) may not support toArray */
        }
      }
    }

    // Serialize Arrow Table to IPC bytes for zero-copy GeoArrow layer rendering.
    // DuckDB-WASM bundles its own apache-arrow; IPC is the version-safe transfer format.
    let arrowIPC: Uint8Array | undefined;
    try {
      arrowIPC = result.serialize?.("binary");
      // Fallback: DuckDB-WASM may expose serialize differently
      if (!arrowIPC && typeof (result as any).toArrowBuffer === "function") {
        arrowIPC = (result as any).toArrowBuffer();
      }
    } catch {
      /* IPC serialization not available, fall back to columnArrays */
    }

    // Store full result client-side (JS rows for tables/graphs, Arrow for map layers)
    const queryId = storeQueryResult({
      rows,
      columns,
      duration,
      rowCount: numRows,
      sql,
      columnArrays,
      arrowIPC,
      wkbArrays,
      geometryColumn: geomColumn ?? undefined,
    });

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
