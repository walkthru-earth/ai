"use client";

import * as React from "react";
import { z } from "zod";

export const queryDisplaySchema = z.object({
  sql: z.string().describe("SQL query string to display with syntax highlighting"),
  title: z.string().optional().describe("Title describing what this query does"),
  dataset: z.string().optional().describe("Which dataset this query targets (e.g. 'weather', 'terrain')"),
  parquetUrl: z.string().optional().describe("Direct URL to the Parquet file being queried"),
  rowCount: z.number().optional().describe("Number of rows returned by this query"),
  duration: z.string().optional().describe("Query execution duration (e.g. '1.2s')"),
});

type QueryDisplayProps = z.infer<typeof queryDisplaySchema>;

const SQL_KEYWORDS = new Set([
  "SELECT",
  "FROM",
  "WHERE",
  "JOIN",
  "LEFT",
  "RIGHT",
  "INNER",
  "OUTER",
  "ON",
  "USING",
  "GROUP",
  "BY",
  "ORDER",
  "HAVING",
  "LIMIT",
  "OFFSET",
  "AS",
  "AND",
  "OR",
  "NOT",
  "IN",
  "IS",
  "NULL",
  "NULLIF",
  "CASE",
  "WHEN",
  "THEN",
  "ELSE",
  "END",
  "BETWEEN",
  "LIKE",
  "EXISTS",
  "DISTINCT",
  "UNION",
  "ALL",
  "INSERT",
  "UPDATE",
  "DELETE",
  "CREATE",
  "DROP",
  "ALTER",
  "TABLE",
  "INDEX",
  "VIEW",
  "WITH",
  "RECURSIVE",
  "FLOAT",
  "INT",
  "INTEGER",
  "ASC",
  "DESC",
]);

function highlightSQL(sql: string): React.ReactNode[] {
  const tokens = sql.split(/(\s+|'[^']*'|[(),])/g);
  return tokens.map((token, i) => {
    const upper = token.toUpperCase();
    if (SQL_KEYWORDS.has(upper)) {
      return (
        <span key={i} className="text-primary font-semibold">
          {token}
        </span>
      );
    }
    if (/^'[^']*'$/.test(token)) {
      return (
        <span key={i} className="text-secondary">
          {token}
        </span>
      );
    }
    if (/^\d+(\.\d+)?$/.test(token)) {
      return (
        <span key={i} className="text-earth-green">
          {token}
        </span>
      );
    }
    return <span key={i}>{token}</span>;
  });
}

export const QueryDisplay = React.forwardRef<HTMLDivElement, QueryDisplayProps>(
  ({ sql, title, dataset, parquetUrl, rowCount, duration }, ref) => {
    const [copied, setCopied] = React.useState(false);

    if (!sql) {
      return <div ref={ref} className="rounded-xl border p-4 animate-pulse bg-muted/30 h-32" />;
    }

    const handleCopy = () => {
      navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };

    return (
      <div ref={ref} className="rounded-xl border overflow-hidden bg-card">
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary flex-shrink-0">SQL</span>
            {title && <span className="text-sm font-medium text-foreground truncate">{title}</span>}
            {dataset && (
              <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">
                {dataset}
              </span>
            )}
          </div>
          <button
            onClick={handleCopy}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 ml-2"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        <div className="bg-muted p-4 overflow-x-auto">
          <pre className="text-sm font-mono text-foreground/90 whitespace-pre-wrap break-words">
            {highlightSQL(sql)}
          </pre>
        </div>

        {(rowCount !== undefined || duration || parquetUrl) && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-t bg-muted/10 text-xs text-muted-foreground">
            {rowCount != null && <span>{rowCount.toLocaleString()} rows</span>}
            {duration && <span>{duration}</span>}
            {parquetUrl && (
              <a
                href={parquetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline truncate max-w-xs"
              >
                Source data
              </a>
            )}
          </div>
        )}
      </div>
    );
  },
);
QueryDisplay.displayName = "QueryDisplay";
