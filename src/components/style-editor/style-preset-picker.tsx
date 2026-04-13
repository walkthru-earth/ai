/**
 * Style preset picker - grid of curated styles to load into the editor.
 * Shown in the empty state or as a dropdown from the header.
 */

import { Loader2 } from "lucide-react";
import { useState } from "react";
import type { StylePreset } from "@/lib/tambo-style-editor/presets";
import { stylePresets } from "@/lib/tambo-style-editor/presets";
import { cn } from "@/lib/utils";
import { loadStyleFromUrl } from "@/services/style-store";

function PresetCard({
  preset,
  loading,
  onSelect,
}: {
  preset: StylePreset;
  loading: boolean;
  onSelect: (preset: StylePreset) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(preset)}
      disabled={loading}
      className={cn(
        "flex items-start gap-2.5 p-2.5 rounded-lg border border-border/40 text-left",
        "hover:border-earth-cyan/40 hover:bg-muted/30 transition-all duration-150",
        "disabled:opacity-50 disabled:cursor-wait",
      )}
    >
      <div
        className="w-6 h-6 rounded-md flex-shrink-0 border border-border/30 mt-0.5"
        style={{ backgroundColor: preset.color }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-foreground truncate">{preset.name}</div>
        <div className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">{preset.description}</div>
      </div>
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground flex-shrink-0 mt-1" />}
    </button>
  );
}

export function StylePresetPicker({ onLoaded }: { onLoaded?: () => void }) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (preset: StylePreset) => {
    setLoadingId(preset.id);
    setError(null);
    const result = await loadStyleFromUrl(preset.url);
    setLoadingId(null);
    if (!result.ok) {
      setError(`Failed to load ${preset.name}: ${result.error}`);
    } else {
      onLoaded?.();
    }
  };

  return (
    <div className="px-3 py-4">
      <div className="text-xs font-semibold text-foreground mb-1">Start with a style</div>
      <div className="text-[10px] text-muted-foreground mb-3">
        Pick a preset or describe what you want in the chat below
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {stylePresets.map((preset) => (
          <PresetCard key={preset.id} preset={preset} loading={loadingId === preset.id} onSelect={handleSelect} />
        ))}
      </div>
      {error && <div className="mt-2 text-[10px] text-destructive">{error}</div>}
    </div>
  );
}
