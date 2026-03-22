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

        // Blob URL worker avoids bundler module resolution issues with WASM workers
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
            "SET GLOBAL s3_region = 'us-west-2'",
            "SET GLOBAL s3_url_style = 'path'",
            "SET GLOBAL geometry_always_xy = true",
            // Disable auto GeoParquet→GEOMETRY conversion — triggers stoi crash in WASM on some files.
            // Our detectGeometryColumns + wrapSqlForGeometry handles geometry extraction instead.
            // Must be GLOBAL so it persists across connections (runQuery opens new connections).
            "SET GLOBAL enable_geoparquet_conversion = false",
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

/**
 * Fetch remote JSON/GeoJSON via browser fetch and register as a virtual file
 * in DuckDB-WASM. This uses DuckDB's registerFileBuffer API to bypass httpfs
 * truncation issues with servers like ArcGIS that don't work well with
 * DuckDB-WASM's XMLHttpRequest-based range requests.
 *
 * Returns virtual path for use in SQL: read_json_auto('/remote/{name}.geojson')
 */
const _registeredFiles = new Map<string, string>();

export async function registerRemoteJSON(url: string, name: string): Promise<string> {
  const virtualPath = `/remote/${name}.geojson`;
  if (_registeredFiles.has(url)) return _registeredFiles.get(url)!;

  const instance = await initDuckDB();
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: HTTP ${resp.status}`);
  const buffer = new Uint8Array(await resp.arrayBuffer());
  await instance.registerFileBuffer(virtualPath, buffer);
  _registeredFiles.set(url, virtualPath);
  return virtualPath;
}

/** Convert Arrow values to plain JS — handles BigInt, Uint8Array, Struct, List, nested objects. */
function arrowToJs(val: unknown): unknown {
  if (val == null) return null;
  if (typeof val === "bigint") return Number(val);
  if (val instanceof Uint8Array) return `0x${[...val].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  // Arrow List / Array → plain array (before object check since Arrays are objects)
  if (Array.isArray(val)) return val.map(arrowToJs);
  // Arrow Struct → plain object, then recurse to convert nested BigInts/Uint8Arrays
  if (val && typeof val === "object" && "toJSON" in val && typeof (val as any).toJSON === "function") {
    const obj = (val as any).toJSON();
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        out[k] = arrowToJs(v);
      }
      return out;
    }
    return arrowToJs(obj);
  }
  // Plain object (e.g. from nested struct without toJSON) — recurse
  if (val && typeof val === "object" && val.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = arrowToJs(v);
    }
    return out;
  }
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

/** Well-known geometry column names in geospatial Parquet files */
const GEO_COLUMN_NAMES = new Set(["geometry", "geom", "wkb_geometry", "shape", "the_geom", "geo"]);

interface GeomDetection {
  geomColumn: string;
  allColumns: string[];
  /** Whether the column is native GEOMETRY (true) or WKB BLOB (false) */
  isNativeGeometry: boolean;
}

/**
 * Detect geometry columns via DESCRIBE. Checks two paths:
 * 1. Native GEOMETRY type (v1.5+: GEOMETRY, GEOMETRY('EPSG:4326'), etc.)
 * 2. WKB BLOB columns with well-known geo names (geom, geometry, shape, etc.)
 *    — needed when enable_geoparquet_conversion=false (avoids WASM stoi crash)
 *
 * DESCRIBE reads Parquet metadata (no data scan) — fast even for remote files.
 */
async function detectGeometryColumns(conn: any, sql: string): Promise<GeomDetection | null> {
  try {
    // DESCRIBE (WITH ...) is invalid DuckDB syntax, so wrap CTE queries in a subquery.
    // This enables geometry auto-detection for GeoJSON/WFS queries that use CTEs
    // (e.g. WITH fc AS (SELECT unnest(features)...) SELECT ST_GeomFromGeoJSON(...) AS geometry FROM fc).
    const trimmed = sql.trimStart().toUpperCase();
    const describeSql = trimmed.startsWith("WITH")
      ? `DESCRIBE (SELECT * FROM (${sql}) __detect_geom LIMIT 0)`
      : `DESCRIBE (${sql})`;

    const descResult = await conn.query(describeSql);
    const nameVec = descResult.getChild("column_name");
    const typeVec = descResult.getChild("column_type");
    if (!nameVec || !typeVec) return null;

    let geomColumn: string | null = null;
    let isNativeGeometry = false;
    const allColumns: string[] = [];

    for (let i = 0; i < descResult.numRows; i++) {
      const name = String(nameVec.get(i));
      const colType = String(typeVec.get(i) ?? "").toUpperCase();
      allColumns.push(name);

      if (geomColumn) continue;

      // Path 1: Native GEOMETRY type (v1.5+: GEOMETRY('EPSG:4326'), etc.)
      if (colType.startsWith("GEOMETRY")) {
        geomColumn = name;
        isNativeGeometry = true;
      }
      // Path 2: WKB BLOB with well-known geo column name
      // (GeoParquet auto-conversion disabled to avoid WASM stoi crash)
      else if (colType === "BLOB" && GEO_COLUMN_NAMES.has(name.toLowerCase())) {
        geomColumn = name;
        isNativeGeometry = false;
      }
    }
    return geomColumn ? { geomColumn, allColumns, isNativeGeometry } : null;
  } catch {
    return null;
  }
}

/**
 * Wrap SQL to auto-extract coordinates + standard WKB from a geometry column.
 * Handles two column types:
 * - Native GEOMETRY: ST_Centroid(col) for coords, ST_AsWKB(col) for WKB
 * - WKB BLOB: ST_GeomFromWKB(col) → ST_Centroid for coords, col directly as WKB
 * Adds lat/lng only if they don't already exist.
 */
function wrapSqlForGeometry(
  sql: string,
  geomColumn: string,
  existingColumns: string[],
  isNativeGeometry: boolean,
): string {
  const lowerCols = new Set(existingColumns.map((c) => c.toLowerCase()));
  const hasLat = lowerCols.has("lat") || lowerCols.has("latitude");
  const hasLng = lowerCols.has("lng") || lowerCols.has("longitude");

  // For native GEOMETRY: use directly. For WKB BLOB: wrap with ST_GeomFromWKB first.
  const geomExpr = isNativeGeometry ? `"${geomColumn}"` : `ST_GeomFromWKB("${geomColumn}")`;

  const coordCols =
    !hasLat && !hasLng ? `, ST_Y(ST_Centroid(${geomExpr})) AS lat, ST_X(ST_Centroid(${geomExpr})) AS lng` : "";

  // For native GEOMETRY: ST_AsWKB converts to standard WKB. For BLOB: data is already WKB.
  const wkbExpr = isNativeGeometry ? `ST_AsWKB("${geomColumn}")` : `"${geomColumn}"`;

  // EXCLUDE native GEOMETRY columns from __src.* — DuckDB-WASM can't convert GEOMETRY to Arrow
  // ("Unsupported type in DuckDB -> Arrow Conversion: GEOMETRY"). The WKB version (__geo_wkb)
  // is Arrow-compatible and used for rendering instead.
  const excludeGeom = isNativeGeometry ? ` EXCLUDE ("${geomColumn}")` : "";

  return `SELECT __src.*${excludeGeom}${coordCols}, ${wkbExpr} AS __geo_wkb FROM (${sql}) __src`;
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
  geometryNote?: string;
}> {
  const rawSql = typeof input === "string" ? input : input.sql;
  const sql = cleanSql(rawSql);

  if (!sql) {
    return { queryId: "", columns: [], rowCount: 0, duration: 0, sampleRows: [] };
  }

  const instance = await initDuckDB();
  const conn = await instance.connect();
  const start = performance.now();

  try {
    // Auto-detect GEOMETRY/WKB columns (fast DESCRIBE — reads Parquet metadata only).
    // Skip for non-SELECT statements (DESCRIBE, EXPLAIN, etc.) — wrapping them makes no sense.
    const sqlUpper = sql.trimStart().toUpperCase();
    const isSelectQuery = sqlUpper.startsWith("SELECT") || sqlUpper.startsWith("WITH") || sqlUpper.startsWith("FROM");
    const geomInfo = isSelectQuery ? await detectGeometryColumns(conn, sql) : null;
    const geomColumn = geomInfo?.geomColumn ?? null;
    const isNativeGeometry = geomInfo?.isNativeGeometry ?? false;
    const finalSql = geomColumn
      ? wrapSqlForGeometry(sql, geomColumn, geomInfo?.allColumns ?? [], isNativeGeometry)
      : sql;

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
    // When geometry was auto-detected, tell the AI so it doesn't try to reference
    // synthetic lat/lng columns in follow-up SQL — they only exist in the wrapped result.
    const geometryNote = geomColumn
      ? `CRITICAL: "lat" and "lng" columns were AUTO-GENERATED from geometry column "${geomColumn}" (${isNativeGeometry ? "GEOMETRY" : "WKB BLOB"}). ` +
        `They do NOT exist in the raw Parquet file. NEVER SELECT lat/lng directly — they will cause "column not found" errors. ` +
        `For follow-up queries: (1) Use SELECT * — the system re-generates lat/lng automatically. ` +
        `(2) To pick specific columns: SELECT * EXCLUDE (unwanted_col1, unwanted_col2) FROM file. ` +
        `(3) To add computed columns: SELECT *, my_expr AS alias FROM (SELECT * FROM file LIMIT 500). ` +
        `(4) For direct geometry access: ST_Y(ST_GeomFromWKB("${geomColumn}")) for lat, ST_X(ST_GeomFromWKB("${geomColumn}")) for lng.`
      : undefined;

    return {
      queryId,
      columns,
      rowCount: numRows,
      duration,
      sampleRows: rows.slice(0, 3),
      ...(geometryNote && { geometryNote }),
    };
  } catch (error: any) {
    // DuckDB-WASM can't convert GEOMETRY to Arrow — retry with GEOMETRY columns cast to WKB.
    // This catches cases where geometry slipped through (e.g. detection missed it).
    const msg = error?.message ?? String(error);
    if (msg.includes("Unsupported type") && msg.includes("GEOMETRY")) {
      try {
        // Re-run DESCRIBE to find GEOMETRY columns, then wrap each with ST_AsWKB + EXCLUDE
        const descResult = await conn.query(
          sql.trimStart().toUpperCase().startsWith("WITH")
            ? `DESCRIBE (SELECT * FROM (${sql}) __fb LIMIT 0)`
            : `DESCRIBE (${sql})`,
        );
        const nameVec = descResult.getChild("column_name");
        const typeVec = descResult.getChild("column_type");
        if (nameVec && typeVec) {
          const geomCols: string[] = [];
          for (let i = 0; i < descResult.numRows; i++) {
            const colType = String(typeVec.get(i) ?? "").toUpperCase();
            if (colType.startsWith("GEOMETRY")) {
              geomCols.push(String(nameVec.get(i)));
            }
          }
          if (geomCols.length > 0) {
            const excludeClause = `EXCLUDE (${geomCols.map((c) => `"${c}"`).join(", ")})`;
            const wkbCols = geomCols.map((c) => `ST_AsWKB("${c}") AS "${c}_wkb"`).join(", ");
            const fallbackSql = `SELECT __fb.*${excludeClause}, ${wkbCols} FROM (${sql}) __fb`;
            const result = await conn.query(fallbackSql);
            const duration = Math.round(performance.now() - start);
            const rawColumns: string[] = result.schema.fields.map((f: any) => f.name);
            const numRows = result.numRows;

            // Extract rows
            const rows: Record<string, unknown>[] = [];
            for (let i = 0; i < numRows; i++) {
              const row: Record<string, unknown> = {};
              for (const col of rawColumns) {
                const vec = result.getChild(col);
                if (vec) row[col] = arrowToJs(vec.get(i));
              }
              rows.push(row);
            }

            // Extract WKB arrays from the first geometry column
            let wkbArrays: Uint8Array[] | undefined;
            const wkbColName = `${geomCols[0]}_wkb`;
            const wkbVec = result.getChild(wkbColName);
            if (wkbVec) {
              const wkbs: Uint8Array[] = [];
              for (let i = 0; i < numRows; i++) {
                const val = wkbVec.get(i);
                if (val instanceof Uint8Array) wkbs.push(val.slice());
              }
              if (wkbs.length > 0) wkbArrays = wkbs;
            }

            // Strip WKB helper columns from public view
            const publicCols = rawColumns.filter((c) => !c.endsWith("_wkb"));
            const publicRows = rows.map((r) => {
              const out: Record<string, unknown> = {};
              for (const c of publicCols) out[c] = r[c];
              return out;
            });

            const columnArrays: Record<string, ArrayLike<any>> = {};
            for (const col of publicCols) {
              const vec = result.getChild(col);
              if (vec) {
                try {
                  columnArrays[col] = vec.toArray();
                } catch {
                  /* ignore */
                }
              }
            }

            const queryId = storeQueryResult({
              rows: publicRows,
              columns: publicCols,
              duration,
              rowCount: numRows,
              sql,
              columnArrays,
              wkbArrays,
              geometryColumn: geomCols[0],
            });

            return {
              queryId,
              columns: publicCols,
              rowCount: numRows,
              duration,
              sampleRows: publicRows.slice(0, 3),
              geometryNote:
                `Geometry column "${geomCols[0]}" was converted to WKB for rendering. ` +
                `Use SELECT * for follow-up queries — lat/lng are synthetic.`,
            };
          }
        }
      } catch {
        /* fallback failed — throw original error */
      }
    }
    throw new Error(`DuckDB query error: ${msg}`);
  } finally {
    await conn.close();
  }
}
