/**
 * Global theme application effect - call once in App.tsx.
 * Reads theme from settings store, applies to document.documentElement,
 * and listens for system preference changes when theme is "system".
 */

import { useEffect } from "react";
import { useSettings } from "./settings-store";

export function useThemeEffect(): void {
  const { theme } = useSettings();

  useEffect(() => {
    const root = document.documentElement;

    function apply(mode: "dark" | "light") {
      if (mode === "dark") {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      apply(mq.matches ? "dark" : "light");
      const handler = (e: MediaQueryListEvent) => apply(e.matches ? "dark" : "light");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }

    apply(theme);
  }, [theme]);
}
