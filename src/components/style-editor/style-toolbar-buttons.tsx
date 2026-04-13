/**
 * Style editor toolbar buttons for @mentions (sources/layers) and / commands.
 * Custom implementations since the style editor doesn't use MCP servers.
 *
 * Architecture: buttons live in the toolbar, dropdowns are portaled to the
 * parent StyleEditorInput via the open/onClose props so they span full width.
 */

import { AtSign, Search, Slash } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { getStyleInventory } from "@/services/style-store";

/* ── Types ──────────────────────────────────────────────────────── */

interface StyleResource {
  uri: string;
  label: string;
  type: "source" | "layer";
  layerType?: string;
}

interface StyleCommand {
  id: string;
  label: string;
  prefix: string;
  description: string;
}

/* ── Commands ───────────────────────────────────────────────────── */

const STYLE_COMMANDS: StyleCommand[] = [
  {
    id: "paint",
    label: "/paint",
    prefix: "Change the paint properties of ",
    description: "Modify fill, line, or symbol paint",
  },
  { id: "layout", label: "/layout", prefix: "Change the layout of ", description: "Visibility, text, icon layout" },
  { id: "filter", label: "/filter", prefix: "Set a filter on ", description: "Layer data filters" },
  { id: "source", label: "/source", prefix: "Add or modify source: ", description: "Vector, raster, GeoJSON sources" },
  { id: "layer", label: "/layer", prefix: "Add a new layer: ", description: "Add fill, line, symbol, etc." },
  { id: "light", label: "/light", prefix: "Set the global light to ", description: "Ambient + directional light" },
  { id: "terrain", label: "/terrain", prefix: "Enable 3D terrain with ", description: "DEM source + exaggeration" },
  { id: "labels", label: "/labels", prefix: "Style the labels: ", description: "Text styling across layers" },
  { id: "3d", label: "/3d", prefix: "Add 3D building extrusions with ", description: "fill-extrusion layers" },
  { id: "theme", label: "/theme", prefix: "Apply a theme: ", description: "Dark, light, pastel, monochrome" },
  { id: "load", label: "/load", prefix: "Load style from URL: ", description: "Fetch remote style JSON" },
  { id: "preset", label: "/preset", prefix: "Load the preset style: ", description: "VersaTiles presets" },
  { id: "export", label: "/export", prefix: "__export__", description: "Download style JSON" },
  { id: "validate", label: "/validate", prefix: "__validate__", description: "Check for style errors" },
];

export { STYLE_COMMANDS };

/* ── Toolbar Icon Buttons ───────────────────────────────────────── */

export function StyleResourceButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-8 h-8 rounded-md flex items-center justify-center transition-colors",
        "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        active && "bg-muted/50 text-foreground",
      )}
      title="Mention source or layer (@)"
    >
      <AtSign className="w-3.5 h-3.5" />
    </button>
  );
}

export function StyleCommandButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-8 h-8 rounded-md flex items-center justify-center transition-colors",
        "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        active && "bg-muted/50 text-foreground",
      )}
      title="Style commands (/)"
    >
      <Slash className="w-3.5 h-3.5" />
    </button>
  );
}

/* ── Full-width Dropdown Panels (rendered by parent) ────────────── */

export function ResourceDropdown({ onSelect, onClose }: { onSelect: (text: string) => void; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const resources = useMemo((): StyleResource[] => {
    const inventory = getStyleInventory();
    const items: StyleResource[] = [];
    for (const s of inventory.sources) {
      items.push({
        uri: `style://source/${s.id}`,
        label: `${s.id} (${s.type} source)`,
        type: "source",
      });
    }
    for (const l of inventory.layers) {
      items.push({
        uri: `style://layer/${l.id}`,
        label: `${l.id} [${l.type}]${l.source ? ` < ${l.source}` : ""}`,
        type: "layer",
        layerType: l.type,
      });
    }
    return items;
  }, []);

  const filtered = useMemo(() => {
    if (!search) return resources;
    const q = search.toLowerCase();
    return resources.filter((r) => r.label.toLowerCase().includes(q));
  }, [resources, search]);

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const handleSelect = useCallback(
    (resource: StyleResource) => {
      onSelect(`@${resource.type}:${resource.uri.split("/").pop()} `);
      onClose();
    },
    [onSelect, onClose],
  );

  if (resources.length === 0) {
    return (
      <div
        ref={dropdownRef}
        className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-3"
      >
        <div className="text-xs text-muted-foreground text-center">No style loaded. Load a style first.</div>
      </div>
    );
  }

  return (
    <div
      ref={dropdownRef}
      className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-popover border border-border rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col"
    >
      <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-2 border-b border-border/40">
        <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sources & layers..."
          className="flex-1 text-sm bg-transparent border-0 outline-none text-foreground placeholder:text-muted-foreground"
        />
        <span className="text-[10px] text-muted-foreground">{filtered.length} items</span>
      </div>
      <div className="overflow-y-auto p-1.5">
        {filtered.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground text-center">No matches</div>}
        {filtered.map((r) => (
          <button
            key={r.uri}
            type="button"
            onClick={() => handleSelect(r)}
            className="w-full text-left px-2.5 py-1.5 rounded-md text-xs hover:bg-muted/50 transition-colors flex items-center gap-2"
          >
            <span
              className={cn(
                "w-2 h-2 rounded-full flex-shrink-0",
                r.type === "source" ? "bg-earth-cyan" : "bg-primary/60",
              )}
            />
            <span className="truncate text-foreground">{r.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function CommandDropdown({
  onSelect,
  onAction,
  onClose,
  filterText,
}: {
  onSelect: (text: string) => void;
  onAction: (action: string) => void;
  onClose: () => void;
  filterText?: string;
}) {
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Use filterText from keyboard typing, or local search from the search input
  const activeFilter = filterText || search;

  const filtered = useMemo(() => {
    if (!activeFilter) return STYLE_COMMANDS;
    // Strip leading "/" from filter
    const q = activeFilter.replace(/^\//, "").toLowerCase();
    if (!q) return STYLE_COMMANDS;
    return STYLE_COMMANDS.filter((c) => c.id.includes(q) || c.description.toLowerCase().includes(q));
  }, [activeFilter]);

  useEffect(() => {
    if (!filterText) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [filterText]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const handleSelect = useCallback(
    (cmd: StyleCommand) => {
      if (cmd.prefix === "__export__" || cmd.prefix === "__validate__") {
        onAction(cmd.prefix);
      } else {
        onSelect(cmd.prefix);
      }
      onClose();
    },
    [onSelect, onAction, onClose],
  );

  return (
    <div
      ref={dropdownRef}
      className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-popover border border-border rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col"
    >
      {!filterText && (
        <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-2 border-b border-border/40">
          <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commands..."
            className="flex-1 text-sm bg-transparent border-0 outline-none text-foreground placeholder:text-muted-foreground"
          />
        </div>
      )}
      <div className="overflow-y-auto p-1.5">
        {filtered.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground text-center">No matches</div>}
        {filtered.map((cmd) => (
          <button
            key={cmd.id}
            type="button"
            onClick={() => handleSelect(cmd)}
            className="w-full text-left px-2.5 py-2 rounded-md text-xs hover:bg-muted/50 transition-colors flex items-center gap-2"
          >
            <span className="font-mono text-primary/80 font-semibold w-16 flex-shrink-0">{cmd.label}</span>
            <span className="text-muted-foreground truncate">{cmd.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
