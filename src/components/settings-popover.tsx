/**
 * Settings popover — gear icon button that opens a compact settings panel.
 * Contains theme toggle, cross-filter toggle, and query limit (presets + custom input).
 */

import { Link2, Link2Off, Monitor, Moon, Settings, Sun } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  A5_RES_RANGE,
  H3_RES_RANGE,
  QUERY_LIMIT_PRESETS,
  type Theme,
  updateSettings,
  useSettings,
} from "@/lib/settings-store";
import { useCrossFilterEnabled } from "@/services/query-store";

function ThemeButton({ mode, current }: { mode: Theme; current: Theme }) {
  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;
  const label = mode === "dark" ? "Dark" : mode === "light" ? "Light" : "System";
  const active = current === mode;

  return (
    <button
      type="button"
      onClick={() => updateSettings({ theme: mode })}
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </button>
  );
}

function CrossFilterControl() {
  const [enabled, setEnabled] = useCrossFilterEnabled();

  return (
    <div>
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Cross-filter</div>
      <button
        type="button"
        onClick={() => setEnabled(!enabled)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
          enabled ? "bg-earth-blue/15 text-earth-cyan" : "text-muted-foreground hover:bg-muted"
        }`}
      >
        {enabled ? <Link2 className="w-3.5 h-3.5 shrink-0" /> : <Link2Off className="w-3.5 h-3.5 shrink-0" />}
        <span>{enabled ? "Linked — map filters chart & table" : "Off — components independent"}</span>
      </button>
    </div>
  );
}

function QueryLimitControl() {
  const { queryLimit } = useSettings();
  const isCustom = !QUERY_LIMIT_PRESETS.some((p) => p.value === queryLimit);
  const [editingCustom, setEditingCustom] = useState(false);
  const [customValue, setCustomValue] = useState(String(queryLimit));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCustom && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCustom]);

  const applyCustom = () => {
    const num = Math.max(100, Math.min(100000, Number.parseInt(customValue, 10) || 20000));
    updateSettings({ queryLimit: num });
    setCustomValue(String(num));
    setEditingCustom(false);
  };

  return (
    <div>
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Query limit</div>
      <div className="grid grid-cols-4 gap-1 mb-2">
        {QUERY_LIMIT_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => {
              updateSettings({ queryLimit: preset.value });
              setEditingCustom(false);
            }}
            className={`px-2 py-2 rounded-md text-xs font-medium transition-colors ${
              queryLimit === preset.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Custom input */}
      {editingCustom ? (
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            type="number"
            min={100}
            max={100000}
            step={100}
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyCustom();
              if (e.key === "Escape") setEditingCustom(false);
            }}
            onBlur={applyCustom}
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md border border-input bg-background text-foreground text-xs font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setCustomValue(String(queryLimit));
            setEditingCustom(true);
          }}
          className={`w-full px-2.5 py-1.5 rounded-md text-xs transition-colors text-left ${
            isCustom ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {isCustom ? `Custom: ${queryLimit.toLocaleString()}` : "Custom..."}
        </button>
      )}
    </div>
  );
}

function ResInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-5 shrink-0 font-mono">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = Number.parseInt(e.target.value, 10);
          if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
        className="w-14 px-2 py-1.5 rounded-md border border-input bg-background text-foreground text-xs font-mono tabular-nums text-center focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <span className="text-[9px] text-muted-foreground/60">
        {min}–{max}
      </span>
    </div>
  );
}

function GridResolutionControl() {
  const { defaultH3Res, defaultA5Res } = useSettings();

  return (
    <div>
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Grid resolution
      </div>
      <div className="space-y-1.5">
        <ResInput
          label="H3"
          value={defaultH3Res}
          min={H3_RES_RANGE.min}
          max={H3_RES_RANGE.max}
          onChange={(v) => updateSettings({ defaultH3Res: v })}
        />
        <ResInput
          label="A5"
          value={defaultA5Res}
          min={A5_RES_RANGE.min}
          max={A5_RES_RANGE.max}
          onChange={(v) => updateSettings({ defaultA5Res: v })}
        />
      </div>
      <p className="text-[9px] text-muted-foreground/60 mt-1.5">Higher = more detail, slower queries</p>
    </div>
  );
}

function SettingsPanel() {
  const { theme } = useSettings();

  return (
    <div className="w-64 p-3.5 space-y-4">
      {/* Theme */}
      <div>
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Theme</div>
        <div className="flex gap-1">
          <ThemeButton mode="dark" current={theme} />
          <ThemeButton mode="light" current={theme} />
          <ThemeButton mode="system" current={theme} />
        </div>
      </div>

      {/* Cross-filter */}
      <CrossFilterControl />

      {/* Query Limit */}
      <QueryLimitControl />

      {/* Grid Resolution */}
      <GridResolutionControl />
    </div>
  );
}

export function SettingsButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={`p-1.5 rounded-lg transition-colors text-muted-foreground hover:bg-muted/50 ${className}`}
        title="Settings"
      >
        <Settings className="w-3.5 h-3.5" />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-50 rounded-xl border border-border bg-card text-card-foreground shadow-lg"
            style={{ top: pos.top, right: pos.right }}
          >
            <SettingsPanel />
          </div>,
          document.body,
        )}
    </>
  );
}
