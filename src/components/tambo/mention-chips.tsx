/**
 * Shared mention chip strip for chat inputs.
 *
 * Renders @-mentions as colored pills above the textarea. Clicking a chip removes it.
 * Used by both the explore page (@panel mentions) and style editor (@source/@layer mentions).
 *
 * Mention format: @type:id (e.g. @panel:GeoMap, @source:versatiles-shortbread, @layer:water)
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";

export interface MentionToken {
  full: string;
  type: string;
  id: string;
}

/** Regex matching all @type:id mentions. */
const MENTION_RE = /@(\w+):(\S+)/g;

/** Extract mention tokens from input text. */
export function extractMentions(text: string): MentionToken[] {
  const mentions: MentionToken[] = [];
  for (const match of text.matchAll(MENTION_RE)) {
    mentions.push({ full: match[0], type: match[1], id: match[2] });
  }
  return mentions;
}

/** Color mapping for mention types. */
function mentionColor(type: string): { bg: string; text: string; hover: string } {
  switch (type) {
    case "source":
      return { bg: "bg-earth-cyan/10", text: "text-earth-cyan", hover: "hover:bg-earth-cyan/20" };
    case "layer":
      return { bg: "bg-primary/10", text: "text-primary", hover: "hover:bg-primary/20" };
    case "panel":
      return { bg: "bg-earth-green/10", text: "text-earth-green", hover: "hover:bg-earth-green/20" };
    default:
      return { bg: "bg-muted", text: "text-foreground", hover: "hover:bg-muted/80" };
  }
}

/** Type label abbreviation for the chip badge. */
function typeLabel(type: string): string {
  switch (type) {
    case "source":
      return "S";
    case "layer":
      return "L";
    case "panel":
      return "P";
    default:
      return type[0]?.toUpperCase() ?? "?";
  }
}

/** Strip surrounding quotes from mention IDs (e.g. panel mentions include title in parens). */
function displayId(id: string): string {
  // Remove trailing parenthesized text: GeoMap("My Map") → GeoMap
  return id.replace(/\(.*\)$/, "").replace(/^["']|["']$/g, "");
}

interface MentionChipsProps {
  value: string;
  onRemove: (mention: string) => void;
  className?: string;
}

export function MentionChips({ value, onRemove, className }: MentionChipsProps) {
  const mentions = useMemo(() => extractMentions(value), [value]);
  if (mentions.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1 px-3 pt-2 pb-1", className)}>
      {mentions.map((m) => {
        const color = mentionColor(m.type);
        return (
          <button
            key={m.full}
            type="button"
            onClick={() => onRemove(m.full)}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors",
              color.bg,
              color.text,
              color.hover,
            )}
            title={`Remove ${m.full}`}
          >
            <span>{typeLabel(m.type)}</span>
            <span className="truncate max-w-[120px]">{displayId(m.id)}</span>
            <span className="text-[9px] opacity-60 ml-0.5">&times;</span>
          </button>
        );
      })}
    </div>
  );
}
