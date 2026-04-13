/**
 * Source/Layer info popup shown when user clicks a feature on the map.
 * Provides @mention button to reference the layer/source in chat.
 */

import { AtSign, Layers, X } from "lucide-react";
import type { FeatureInfo } from "./style-editor-map";

interface SourcePopupProps {
  feature: FeatureInfo | null;
  onClose: () => void;
  onMention: (id: string, label: string) => void;
}

export function SourcePopup({ feature, onClose, onMention }: SourcePopupProps) {
  if (!feature) return null;

  const properties = Object.entries(feature.properties).slice(0, 8);

  return (
    <div className="absolute bottom-4 left-4 z-20 w-80 bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-fade-up">
      {/* Header */}
      <div className="px-3 py-2.5 bg-muted/50 flex items-center gap-2 border-b border-border/50">
        <Layers className="w-3.5 h-3.5 text-earth-cyan flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold text-foreground truncate block">{feature.layerId}</span>
          <span className="text-[10px] text-muted-foreground">
            {feature.sourceType} from {feature.sourceId || "unknown"}
          </span>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
          <X className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>

      {/* Properties */}
      {properties.length > 0 && (
        <div className="px-3 py-2 space-y-1 max-h-32 overflow-y-auto">
          {properties.map(([key, value]) => (
            <div key={key} className="flex items-baseline gap-1.5 text-[11px]">
              <span className="text-muted-foreground font-medium flex-shrink-0">{key}:</span>
              <span className="text-foreground truncate">{String(value)}</span>
            </div>
          ))}
          {Object.keys(feature.properties).length > 8 && (
            <span className="text-[10px] text-muted-foreground">
              +{Object.keys(feature.properties).length - 8} more
            </span>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="px-3 py-2 bg-muted/30 flex gap-2 border-t border-border/30">
        <button
          type="button"
          onClick={() => onMention(feature.layerId, `${feature.layerId} [${feature.sourceType}]`)}
          className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-earth-blue/10 text-earth-cyan hover:bg-earth-blue/20 transition-colors text-xs font-medium"
        >
          <AtSign className="w-3 h-3" />
          Mention layer
        </button>
        {feature.sourceId && (
          <button
            type="button"
            onClick={() => onMention(feature.sourceId, `${feature.sourceId} (${feature.sourceType} source)`)}
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-xs font-medium text-foreground"
          >
            <AtSign className="w-3 h-3" />
            Mention source
          </button>
        )}
      </div>
    </div>
  );
}
