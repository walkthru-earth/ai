"use client";

import {
  ArrowRight,
  Building2,
  Cloud,
  Map,
  MessageSquare,
  Monitor,
  Moon,
  Mountain,
  Sun,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiKeyCheck } from "@/components/ApiKeyCheck";
import { WalkthruLogo } from "@/components/walkthru-logo";

const DATASETS = [
  {
    id: "weather",
    icon: Cloud,
    name: "Weather",
    cells: "GraphCast AI",
    color: "from-blue-500/20 to-cyan-500/10 border-blue-500/20",
  },
  {
    id: "terrain",
    icon: Mountain,
    name: "Terrain",
    cells: "10.5B cells",
    color: "from-emerald-500/20 to-green-500/10 border-emerald-500/20",
  },
  {
    id: "building",
    icon: Building2,
    name: "Buildings",
    cells: "2.75B",
    color: "from-amber-500/20 to-orange-500/10 border-amber-500/20",
  },
  {
    id: "population",
    icon: Users,
    name: "Population",
    cells: "SSP2 to 2100",
    color: "from-rose-500/20 to-pink-500/10 border-rose-500/20",
  },
];

const ANALYSES = [
  "Urban Density",
  "Housing Pressure",
  "Landslide Risk",
  "Vertical Living",
  "Population Growth",
  "Shrinking Cities",
];

type Theme = "light" | "dark" | "system";

function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    if (stored && ["dark", "light", "system"].includes(stored)) {
      setTheme(stored);
    } else {
      // No stored theme — detect system preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(prefersDark ? "dark" : "light");
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
    } else {
      root.classList.toggle("dark", theme === "dark");
    }
    localStorage.setItem("theme", theme);

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => root.classList.toggle("dark", mq.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme, mounted]);

  const cycle = () => {
    const order: Theme[] = ["dark", "light", "system"];
    setTheme(order[(order.indexOf(theme) + 1) % order.length]);
  };

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const label = theme === "dark" ? "Dark mode" : theme === "light" ? "Light mode" : "System theme";

  return (
    <button
      onClick={cycle}
      className="p-2 rounded-lg transition-all text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      title={label}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background atmosphere */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-earth-blue/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-earth-cyan/5 rounded-full blur-[100px]" />
      </div>

      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between px-4 sm:px-6 pt-4">
        <div className="flex items-center gap-2">
          <WalkthruLogo size={20} />
          <span className="text-sm font-bold text-foreground">walkthru.earth</span>
        </div>
        <ThemeSwitcher />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pt-10 sm:pt-20 pb-16">
        {/* Hero */}
        <div className="text-center mb-14 sm:mb-20">
          <div className="flex justify-center mb-6">
            <WalkthruLogo size={48} />
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl tracking-tight text-foreground leading-[1.05] mb-4 sm:mb-6">
            Walkthru
            <br />
            <span className="italic text-earth-cyan">world&apos;s data</span>
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed px-4">
            Ask questions about cities, climate, terrain, and population. Get instant answers as interactive maps,
            charts, and tables.
          </p>
        </div>

        {/* CTA */}
        <div className="flex justify-center mb-16 sm:mb-24 px-4">
          <div className="glass-panel rounded-2xl p-5 sm:p-6 max-w-md w-full">
            <ApiKeyCheck>
              <div className="flex flex-col gap-3">
                <Link
                  href="/explore"
                  className="group flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl font-semibold text-sm bg-earth-blue text-white transition-all hover:brightness-110"
                >
                  <Map className="w-4 h-4" />
                  Open Explorer
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/chat"
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-sm text-muted-foreground bg-card border border-border hover:bg-muted/50 transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  Chat Mode
                </Link>
              </div>
            </ApiKeyCheck>
          </div>
        </div>

        {/* Datasets Grid */}
        <div className="mb-12 sm:mb-16">
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <span className="font-[family-name:var(--font-mono)] text-xs text-muted-foreground tracking-widest uppercase">
              01
            </span>
            <div className="h-px flex-1 bg-border" />
            <span className="text-sm text-muted-foreground">Datasets</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
            {DATASETS.map((ds) => {
              const Icon = ds.icon;
              return (
                <div
                  key={ds.id}
                  className={`rounded-xl border bg-gradient-to-br p-3 sm:p-4 transition-all hover:scale-[1.02] cursor-default ${ds.color}`}
                >
                  <Icon className="w-5 h-5 mb-2 sm:mb-3 opacity-80 text-foreground" />
                  <p className="font-semibold text-foreground text-sm">{ds.name}</p>
                  <p className="font-[family-name:var(--font-mono)] text-xs text-muted-foreground mt-0.5">{ds.cells}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cross-Indices */}
        <div className="mb-12 sm:mb-16">
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <span className="font-[family-name:var(--font-mono)] text-xs text-muted-foreground tracking-widest uppercase">
              02
            </span>
            <div className="h-px flex-1 bg-border" />
            <span className="text-sm text-muted-foreground">Cross-Index Analyses</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {ANALYSES.map((name) => (
              <span
                key={name}
                className="px-3 py-1.5 rounded-lg border border-border bg-card/50 text-sm text-muted-foreground hover:text-foreground hover:border-earth-cyan/30 transition-colors cursor-default"
              >
                {name}
              </span>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div className="mb-12 sm:mb-16">
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <span className="font-[family-name:var(--font-mono)] text-xs text-muted-foreground tracking-widest uppercase">
              03
            </span>
            <div className="h-px flex-1 bg-border" />
            <span className="text-sm text-muted-foreground">How it works</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {[
              { step: "Ask", desc: "Natural language questions about cities, climate, terrain", icon: MessageSquare },
              { step: "Query", desc: "AI queries billions of geospatial records in real time", icon: Zap },
              {
                step: "Visualize",
                desc: "Results rendered as interactive maps, charts, tables, and insights",
                icon: Map,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.step} className="glass-panel-subtle rounded-xl p-4 sm:p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <Icon className="w-4 h-4 text-foreground" />
                    <span className="font-semibold text-foreground text-sm">{item.step}</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <footer className="pt-8 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            <a href="https://walkthru.earth" className="hover:text-foreground transition-colors">
              walkthru.earth
            </a>{" "}
            &middot; CC BY 4.0
          </p>
        </footer>
      </div>
    </div>
  );
}
