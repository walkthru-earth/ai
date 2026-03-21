import { Monitor, Moon, Sparkles, Sun } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { WalkthruLogo } from "@/components/walkthru-logo";
import { type GeoIP, useGeoIP } from "@/lib/use-geo-ip";
import { buildParquetUrl } from "@/services/datasets";
import { preloadDuckDB, runQuery } from "@/services/duckdb-wasm";

const CinematicScene = lazy(() =>
  import("@/components/home/cinematic-scene").then((m) => ({ default: m.CinematicScene })),
);

/* ── Theme Switcher ─────────────────────────────────────────── */

type Theme = "light" | "dark" | "system";

function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    if (stored && ["dark", "light", "system"].includes(stored)) {
      setTheme(stored);
    } else {
      setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (theme === "system") {
      root.classList.toggle("dark", window.matchMedia("(prefers-color-scheme: dark)").matches);
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

  return (
    <button
      onClick={cycle}
      className="p-2 rounded-lg transition-all text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      title={theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System"}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

/* ── Data Hook ──────────────────────────────────────────────── */

type SectionKey = "terrain" | "population" | "building" | "weather" | "places";
type SectionData = Partial<Record<SectionKey, Record<string, number> | null>>;

function useNeighborhoodData(geo: GeoIP | null) {
  const [data, setData] = useState<SectionData>({});
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!geo || fetchedRef.current) return;
    const lat = parseFloat(geo.latitude);
    const lng = parseFloat(geo.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    fetchedRef.current = true;

    const h3 = `h3_latlng_to_cell(${lat}, ${lng}, 5)::BIGINT`;

    (async () => {
      await preloadDuckDB();

      const [terrain, pop, building, weather, places] = await Promise.all([
        buildParquetUrl({ dataset: "terrain", h3Res: 5 }),
        buildParquetUrl({ dataset: "population", h3Res: 5 }),
        buildParquetUrl({ dataset: "building", h3Res: 5 }),
        buildParquetUrl({ dataset: "weather", h3Res: 5 }),
        buildParquetUrl({ dataset: "places", h3Res: 5 }),
      ]);

      const queries: [SectionKey, string][] = [
        ["terrain", `SELECT elev, slope, tri FROM '${terrain.url}' WHERE h3_index = ${h3} LIMIT 1`],
        ["population", `SELECT pop_2025, pop_2050, pop_2100 FROM '${pop.url}' WHERE h3_index = ${h3} LIMIT 1`],
        [
          "building",
          `SELECT building_count, avg_height_m, max_height_m, coverage_ratio FROM '${building.url}' WHERE h3_index = ${h3} LIMIT 1`,
        ],
        [
          "weather",
          `SELECT temperature_2m_C, wind_speed_10m_ms, GREATEST(precipitation_mm_6hr, 0) AS precip_mm FROM '${weather.url}' WHERE h3_index = ${h3} ORDER BY CAST(timestamp AS TIMESTAMP) ASC LIMIT 1`,
        ],
        [
          "places",
          `SELECT place_count, n_restaurant, n_cafe, n_school, n_hospital FROM '${places.url}' WHERE h3_index = ${h3} LIMIT 1`,
        ],
      ];

      for (const [key, sql] of queries) {
        try {
          const result = await runQuery(sql);
          const row = result.sampleRows?.[0] as Record<string, number> | undefined;
          setData((prev) => ({ ...prev, [key]: row ?? null }));
        } catch {
          setData((prev) => ({ ...prev, [key]: null }));
        }
      }
    })();
  }, [geo]);

  return data;
}

/* ── Loading Screen ──────────────────────────────────────────── */

function LoadingScreen() {
  return (
    <div className="h-screen bg-black flex flex-col items-center justify-center gap-4">
      <WalkthruLogo size={40} />
      <div className="flex items-center gap-2 text-muted-foreground">
        <div className="w-1.5 h-1.5 bg-earth-cyan rounded-full animate-pulse" />
        <span className="text-sm">Initializing globe...</span>
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────── */

export default function Home() {
  const geo = useGeoIP();
  const data = useNeighborhoodData(geo);

  return (
    <div className="dark h-screen bg-black text-white relative overflow-hidden">
      {/* Fixed top bar */}
      <div className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 sm:px-6 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <WalkthruLogo size={20} />
          <span className="text-sm font-bold text-white">walkthru.earth</span>
          <Sparkles className="w-3.5 h-3.5 text-earth-cyan" />
        </div>
        <ThemeSwitcher />
      </div>

      {/* CSS vignette overlay */}
      <div
        className="fixed inset-0 z-20 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 50%, #000 100%)",
          opacity: 0.4,
        }}
      />

      {/* Cinematic 3D scene */}
      <Suspense fallback={<LoadingScreen />}>
        <CinematicScene geo={geo} data={data} />
      </Suspense>
    </div>
  );
}
