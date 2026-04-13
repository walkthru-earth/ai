/**
 * Download/Export button for the current style JSON.
 */

import { Download } from "lucide-react";
import { downloadStyleJSON } from "@/services/style-store";

export function StyleDownloadButton() {
  return (
    <button
      type="button"
      onClick={downloadStyleJSON}
      className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
      title="Download style JSON"
    >
      <Download className="w-3.5 h-3.5" />
    </button>
  );
}
