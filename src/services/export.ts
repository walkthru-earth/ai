import { getQueryResult } from "./query-store";

/**
 * Export query results as a CSV file download.
 * Called by AI tool or UI button.
 */
export function exportQueryToCSV(input: { queryId: string; filename?: string }): {
  success: boolean;
  rowCount: number;
  filename: string;
} {
  const result = getQueryResult(input.queryId);
  if (!result || result.rows.length === 0) {
    return { success: false, rowCount: 0, filename: "" };
  }

  const { rows, columns } = result;
  const filename = (input.filename?.replace(/\.csv$/i, "") ?? "export") + ".csv";

  // Build CSV: header + rows
  const escape = (val: unknown): string => {
    if (val == null) return "";
    const s = String(val);
    // Quote if contains comma, newline, or double-quote
    if (s.includes(",") || s.includes("\n") || s.includes('"')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const header = columns.map(escape).join(",");
  const body = rows.map((row) => columns.map((col) => escape(row[col])).join(",")).join("\n");
  const csv = header + "\n" + body;

  // Trigger browser download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { success: true, rowCount: rows.length, filename };
}
