/**
 * Shared ThemeSwitcher — cycles dark → light → system.
 * Reads/writes via centralized settings store. Theme application handled by useThemeEffect in App.tsx.
 */

import { Monitor, Moon, Sun } from "lucide-react";
import { type Theme, updateSettings, useSettings } from "@/lib/settings-store";

export function ThemeSwitcher({ className = "" }: { className?: string }) {
  const { theme } = useSettings();

  const cycle = () => {
    const order: Theme[] = ["dark", "light", "system"];
    updateSettings({ theme: order[(order.indexOf(theme) + 1) % order.length] });
  };

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const label = theme === "dark" ? "Dark mode" : theme === "light" ? "Light mode" : "System theme";

  return (
    <button
      type="button"
      onClick={cycle}
      className={`p-1.5 rounded-lg transition-all text-muted-foreground hover:bg-muted/50 ${className}`}
      title={label}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}
