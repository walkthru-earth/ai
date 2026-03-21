/**
 * Full-screen cinematic scene: globe → zoom → hex extraction → data sections.
 * Uses drei ScrollControls for scroll-driven camera + animation state machine.
 */

import { Scroll, ScrollControls, useScroll } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { motion } from "framer-motion";
import { ArrowRight, Map, MessageSquare, Sparkles as SparklesIcon } from "lucide-react";
import { forwardRef, Suspense, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { ApiKeyCheck } from "@/components/ApiKeyCheck";
import type { GeoIP } from "@/lib/use-geo-ip";
import { basePath } from "@/lib/utils";
import { Globe } from "./globe";
import { CursorLight, HexPrism, useCursorTracker } from "./hex-prism";

/* ── Types ───────────────────────────────────────────────────── */

interface Stat {
  label: string;
  value: string;
}

type SectionKey = "terrain" | "population" | "building" | "weather" | "places";

interface SectionDef {
  key: SectionKey;
  color: string;
  emissive: string;
  suggestion: string;
  formatValue: (d: Record<string, number>) => { big: string; suffix?: string; sub: string };
  formatStats: (d: Record<string, number>) => Stat[];
  insight: (d: Record<string, number>, city: string) => string;
}

type SectionData = Partial<Record<SectionKey, Record<string, number> | null>>;

/* ── Helpers ─────────────────────────────────────────────────── */

function fmt(n: number): string {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
  return Math.round(n).toLocaleString();
}

/* ── Section definitions ─────────────────────────────────────── */

const SECTIONS: SectionDef[] = [
  {
    key: "terrain",
    color: "#2dd4bf",
    emissive: "#10b981",
    suggestion: "Terrain analysis around me",
    formatValue: (d) => ({ big: `${Math.round(d.elev)}`, suffix: "m", sub: "elevation" }),
    formatStats: (d) => [
      { label: "slope", value: `${d.slope?.toFixed(1)}°` },
      { label: "ruggedness", value: d.tri < 150 ? "Low" : d.tri < 300 ? "Moderate" : "High" },
    ],
    insight: (d, city) => {
      const elev = Math.round(d.elev);
      if (elev < 50) return `${city} sits near sea level — flat terrain ideal for walking and cycling.`;
      if (elev < 500)
        return `At ${elev}m with ${d.slope?.toFixed(1)}° slope — terrain shapes how your neighborhood is built.`;
      return `${city} is ${elev}m above sea level — elevation impacts drainage, construction, and microclimate.`;
    },
  },
  {
    key: "population",
    color: "#f472b6",
    emissive: "#ec4899",
    suggestion: "Population trends in my area",
    formatValue: (d) => ({ big: fmt(d.pop_2025), sub: "people" }),
    formatStats: (d) => {
      const growth = d.pop_2025 > 0 ? `${((d.pop_2100 / d.pop_2025 - 1) * 100).toFixed(0)}%` : "—";
      return [
        { label: "by 2050", value: fmt(d.pop_2050) },
        { label: "by 2100", value: fmt(d.pop_2100) },
        { label: "growth", value: growth },
      ];
    },
    insight: (d, city) => {
      const growth = d.pop_2025 > 0 ? (d.pop_2100 / d.pop_2025 - 1) * 100 : 0;
      if (growth > 50)
        return `${city} grows ${growth.toFixed(0)}% by 2100 — more housing, transit, and services needed.`;
      if (growth > 0) return `Moderate growth ahead — gradual densification over coming decades.`;
      return `Population stable or declining — a pattern that reshapes infrastructure planning.`;
    },
  },
  {
    key: "building",
    color: "#fbbf24",
    emissive: "#f59e0b",
    suggestion: "Building density around me",
    formatValue: (d) => ({ big: fmt(d.building_count), sub: "buildings" }),
    formatStats: (d) => [
      { label: "avg height", value: d.avg_height_m != null ? `${d.avg_height_m.toFixed(1)}m` : "—" },
      { label: "tallest", value: d.max_height_m != null ? `${Math.round(d.max_height_m)}m` : "—" },
      { label: "coverage", value: d.coverage_ratio != null ? `${(d.coverage_ratio * 100).toFixed(0)}%` : "—" },
    ],
    insight: (d, city) => {
      const coverage = d.coverage_ratio ? (d.coverage_ratio * 100).toFixed(0) : "0";
      return `${coverage}% building coverage at ${d.avg_height_m?.toFixed(1) ?? "?"}m average — this density shapes heat, airflow, and livability in ${city}.`;
    },
  },
  {
    key: "weather",
    color: "#38bdf8",
    emissive: "#0ea5e9",
    suggestion: "5-day weather forecast",
    formatValue: (d) => ({ big: d.temperature_2m_C?.toFixed(0) ?? "—", suffix: "°C", sub: "right now" }),
    formatStats: (d) => [
      { label: "wind", value: `${d.wind_speed_10m_ms?.toFixed(1)} m/s` },
      { label: "precip", value: `${d.precip_mm?.toFixed(1)}mm` },
    ],
    insight: (d, city) => {
      const temp = d.temperature_2m_C;
      if (temp > 35) return `${temp.toFixed(0)}°C — extreme heat affecting outdoor activity and energy demand.`;
      if (temp > 25)
        return `Warm ${temp.toFixed(0)}°C in ${city}. Wind at ${d.wind_speed_10m_ms?.toFixed(1)} m/s helps with comfort.`;
      return `${temp.toFixed(0)}°C with ${d.wind_speed_10m_ms?.toFixed(1)} m/s wind — comfortable conditions.`;
    },
  },
  {
    key: "places",
    color: "#a78bfa",
    emissive: "#8b5cf6",
    suggestion: "What's around me?",
    formatValue: (d) => ({ big: fmt(d.place_count), sub: "places nearby" }),
    formatStats: (d) => [
      { label: "restaurants", value: fmt(d.n_restaurant) },
      { label: "cafes", value: fmt(d.n_cafe) },
      { label: "schools", value: fmt(d.n_school) },
      { label: "hospitals", value: fmt(d.n_hospital) },
    ],
    insight: (d, city) => {
      const total = d.place_count;
      if (total > 200)
        return `${fmt(total)} places — ${city} is rich with amenities, meaning shorter trips and a walkable neighborhood.`;
      if (total > 50) return `${fmt(total)} POIs with ${fmt(d.n_restaurant)} restaurants — a well-served area.`;
      return `${fmt(total)} places in your cell — essential services may require longer trips.`;
    },
  },
];

const TOTAL_PAGES = 7;

/* ── Scroll phase computation ────────────────────────────────── */

interface Phase {
  zoomProgress: number;
  extractProgress: number;
  globeFade: number;
  activeSectionIndex: number;
  offset: number;
}

function getPhase(offset: number): Phase {
  const zoomProgress = THREE.MathUtils.clamp((offset - 0.14) / 0.14, 0, 1);
  const extractProgress = THREE.MathUtils.clamp((offset - 0.28) / 0.14, 0, 1);
  const globeFade = THREE.MathUtils.clamp((offset - 0.28) / 0.1, 0, 1);

  const dataStart = 0.42;
  const dataEnd = 0.92;
  const dataProgress = THREE.MathUtils.clamp((offset - dataStart) / (dataEnd - dataStart), 0, 1);
  const activeSectionIndex = Math.min(Math.floor(dataProgress * 5), 4);

  return { zoomProgress, extractProgress, globeFade, activeSectionIndex, offset };
}

/* ── 3D Scene — all animation in useFrame, no stale props ───── */

function SceneContent({ geo }: { geo: GeoIP | null }) {
  const scroll = useScroll();
  const { camera } = useThree();
  const lat = geo ? parseFloat(geo.latitude) : undefined;
  const lng = geo ? parseFloat(geo.longitude) : undefined;

  const globeRef = useRef<{ setPhase: (z: number, f: number, c: string) => void }>(null);
  const hexRef = useRef<{ setPhase: (e: number, c: string, em: string, visible: boolean) => void }>(null);

  // Logging milestones (fire once per phase)
  const loggedPhases = useRef<Set<string>>(new Set());
  const logOnce = (key: string, msg: string, data?: object) => {
    if (!loggedPhases.current.has(key)) {
      loggedPhases.current.add(key);
      console.log(`[Scene] ${msg}`, data ?? "");
    }
  };

  useCursorTracker();

  useEffect(() => {
    console.log(
      "[Scene] Mounted — geo:",
      geo ? `${geo.city}, ${geo.country} (${geo.latitude}, ${geo.longitude})` : "null",
    );
  }, [geo]);

  useFrame(() => {
    const phase = getPhase(scroll.offset);
    const section = SECTIONS[phase.activeSectionIndex];

    // Log phase transitions
    if (phase.offset > 0.01) logOnce("scroll", "Scroll started", { offset: phase.offset.toFixed(3) });
    if (phase.zoomProgress > 0.01) logOnce("zoom", "Globe zoom phase", { zoom: phase.zoomProgress.toFixed(3) });
    if (phase.zoomProgress > 0.99) logOnce("zoom-done", "Globe zoom complete");
    if (phase.extractProgress > 0.01) logOnce("extract", "Hex extraction started");
    if (phase.extractProgress > 0.99) logOnce("extract-done", "Hex extraction complete");
    if (phase.globeFade > 0.99) logOnce("globe-gone", "Globe fully faded");
    if (phase.offset > 0.42)
      logOnce(`section-${phase.activeSectionIndex}`, `Data section: ${section.key}`, {
        index: phase.activeSectionIndex,
      });

    // Camera
    let targetZ: number;
    if (phase.offset < 0.28) {
      targetZ = THREE.MathUtils.lerp(5, 2.5, phase.zoomProgress);
    } else {
      targetZ = THREE.MathUtils.lerp(2.5, 3.2, phase.extractProgress);
    }
    camera.position.z += (targetZ - camera.position.z) * 0.05;
    camera.lookAt(0, 0, 0);

    // Update globe via imperative ref
    globeRef.current?.setPhase(phase.zoomProgress, phase.globeFade, section.emissive);
    // Update hex via imperative ref
    hexRef.current?.setPhase(phase.extractProgress, section.color, section.emissive, phase.offset > 0.25);
  });

  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[3, 4, 5]} intensity={0.8} />
      <CursorLight emissive={SECTIONS[0].emissive} />

      <ImperativeGlobe ref={globeRef} lat={lat} lng={lng} />
      <ImperativeHex ref={hexRef} lat={lat} lng={lng} />
    </>
  );
}

/* ── Imperative Globe wrapper (no prop-driven re-renders) ───── */

const ImperativeGlobe = forwardRef<
  { setPhase: (z: number, f: number, c: string) => void },
  { lat?: number; lng?: number }
>(function ImperativeGlobe({ lat, lng }, ref) {
  const zoomRef = useRef(0);
  const fadeRef = useRef(0);
  const colorRef = useRef("#4fc3f7");

  useImperativeHandle(ref, () => ({
    setPhase(z: number, f: number, c: string) {
      zoomRef.current = z;
      fadeRef.current = f;
      colorRef.current = c;
    },
  }));

  return (
    <Globe
      lat={lat}
      lng={lng}
      zoomProgress={zoomRef.current}
      fadeProgress={fadeRef.current}
      accentColor={colorRef.current}
    />
  );
});

/* ── Imperative Hex wrapper ──────────────────────────────────── */

const ImperativeHex = forwardRef<
  { setPhase: (e: number, c: string, em: string, v: boolean) => void },
  { lat?: number; lng?: number }
>(function ImperativeHex({ lat, lng }, ref) {
  const extractRef = useRef(0);
  const colorRef = useRef("#2dd4bf");
  const emissiveRef = useRef("#10b981");
  const visibleRef = useRef(false);

  useImperativeHandle(ref, () => ({
    setPhase(e: number, c: string, em: string, v: boolean) {
      extractRef.current = e;
      colorRef.current = c;
      emissiveRef.current = em;
      visibleRef.current = v;
    },
  }));

  return (
    <HexPrism
      color={colorRef.current}
      emissive={emissiveRef.current}
      lat={lat}
      lng={lng}
      extractionProgress={extractRef.current}
      visible={visibleRef.current}
    />
  );
});

/* ── HTML overlay (scroll-driven text) ───────────────────────── */

function TextOverlay({ geo, data, city }: { geo: GeoIP | null; data: SectionData; city: string }) {
  return (
    <Scroll html style={{ width: "100%" }}>
      {/* ── Page 0: Title ──────────────────────────── */}
      <div className="absolute top-0 left-0 w-full h-screen flex flex-col items-center justify-end pb-24 sm:pb-32 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, filter: "blur(12px)" }}
          whileInView={{ opacity: 1, filter: "blur(0px)" }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="text-center"
        >
          <h1 className="text-4xl sm:text-6xl font-bold text-foreground tracking-tight mb-3">
            walkthru<span className="text-earth-cyan">.earth</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">Scroll to explore your world</p>
        </motion.div>
      </div>

      {/* ── Page 1: Location reveal ────────────────── */}
      <div
        className="absolute left-0 w-full h-screen flex flex-col items-center justify-end pb-24 sm:pb-32 pointer-events-none"
        style={{ top: "100vh" }}
      >
        {geo && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center"
          >
            <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-2">locating you</p>
            <p className="text-2xl sm:text-3xl font-bold text-foreground">
              {[geo.city, geo.country].filter(Boolean).join(", ")}
            </p>
          </motion.div>
        )}
      </div>

      {/* ── Page 2: Extraction text ────────────────── */}
      <div
        className="absolute left-0 w-full h-screen flex flex-col items-center justify-end pb-24 sm:pb-32 pointer-events-none"
        style={{ top: "200vh" }}
      >
        <motion.p
          initial={{ opacity: 0, filter: "blur(8px)" }}
          whileInView={{ opacity: 1, filter: "blur(0px)" }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-lg sm:text-xl text-muted-foreground italic"
        >
          Extracting your neighborhood...
        </motion.p>
      </div>

      {/* ── Pages 3-7: Data sections ───────────────── */}
      {SECTIONS.map((section, i) => {
        const d = data[section.key];
        const isLoading = d === undefined;
        const hasData = d != null;
        const formatted = hasData ? section.formatValue(d) : null;
        const stats = hasData ? section.formatStats(d) : [];
        const insightText = hasData ? section.insight(d, city) : null;

        return (
          <div
            key={section.key}
            className="absolute left-0 w-full h-screen flex flex-col items-center justify-end pb-10 sm:pb-16 pointer-events-none"
            style={{ top: `${(3 + i) * 100}vh` }}
          >
            <div className="text-center max-w-xl mx-auto px-4 w-full">
              {/* Value */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="mb-3"
              >
                {isLoading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-32 h-14 bg-muted/20 rounded-lg animate-pulse" />
                    <div className="w-20 h-4 bg-muted/15 rounded animate-pulse" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-5xl sm:text-6xl font-bold text-foreground tabular-nums">
                        {formatted?.big ?? "—"}
                      </span>
                      {formatted?.suffix && (
                        <span className="text-2xl sm:text-3xl font-medium text-muted-foreground">
                          {formatted.suffix}
                        </span>
                      )}
                    </div>
                    <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mt-1.5">{formatted?.sub}</p>
                  </>
                )}
              </motion.div>

              {/* Insight */}
              <motion.p
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-sm text-muted-foreground leading-relaxed mb-5 max-w-md mx-auto"
              >
                {isLoading ? (
                  <span className="inline-block w-full">
                    <span className="block w-full h-4 bg-muted/15 rounded animate-pulse mb-1.5" />
                    <span className="block w-3/4 h-4 bg-muted/10 rounded animate-pulse mx-auto" />
                  </span>
                ) : (
                  insightText
                )}
              </motion.p>

              {/* Stat pills */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex flex-wrap justify-center gap-2 sm:gap-2.5 mb-5"
              >
                {isLoading
                  ? Array.from({ length: 3 }, (_, j) => (
                      <div key={j} className="glass-panel-subtle rounded-xl w-[88px] h-[50px] animate-pulse" />
                    ))
                  : stats.map((s) => (
                      <div key={s.label} className="glass-panel-subtle rounded-xl px-4 py-2 text-center">
                        <div className="text-sm font-bold text-foreground">{s.value}</div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</div>
                      </div>
                    ))}
              </motion.div>

              {/* Suggestion chip */}
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.4 }}
                className="pointer-events-auto"
              >
                <a
                  href={`${basePath}/explore`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full glass-panel text-sm font-medium text-muted-foreground hover:text-foreground transition-all hover:scale-[1.03] active:scale-[0.97]"
                >
                  <SparklesIcon className="w-3.5 h-3.5 text-earth-cyan" />
                  {section.suggestion}
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </motion.div>
            </div>
          </div>
        );
      })}

      {/* ── CTA ──────────────────────────────────────── */}
      <div
        className="absolute left-0 w-full h-screen flex flex-col items-center justify-center pointer-events-none"
        style={{ top: `${(TOTAL_PAGES - 1) * 100 + 50}vh` }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="pointer-events-auto"
        >
          <div className="glass-panel rounded-2xl p-6 sm:p-8 max-w-md w-full text-center">
            <p className="text-sm text-muted-foreground mb-5">
              9 datasets &middot; billions of cells &middot; queried in your browser
            </p>
            <ApiKeyCheck>
              <div className="flex flex-col gap-3">
                <a
                  href={`${basePath}/explore`}
                  className="group flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl font-semibold text-sm bg-earth-blue text-white transition-all hover:brightness-110"
                >
                  <Map className="w-4 h-4" />
                  Explore Deeper
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </a>
                <a
                  href={`${basePath}/chat`}
                  className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-sm text-muted-foreground bg-card border border-border hover:bg-muted/50 transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  Chat Mode
                </a>
              </div>
            </ApiKeyCheck>
          </div>
        </motion.div>
      </div>
    </Scroll>
  );
}

/* ── Main scroll wrapper ─────────────────────────────────────── */

function ScrollScene({ geo, data }: { geo: GeoIP | null; data: SectionData }) {
  const city = geo?.city || "your area";

  return (
    <ScrollControls pages={TOTAL_PAGES} damping={0.15}>
      <SceneContent geo={geo} />
      <TextOverlay geo={geo} data={data} city={city} />
      <EffectComposer>
        <Bloom luminanceThreshold={0.8} intensity={0.5} radius={0.7} mipmapBlur />
        <Vignette offset={0.3} darkness={0.4} />
      </EffectComposer>
    </ScrollControls>
  );
}

/* ── Exported Scene ──────────────────────────────────────────── */

interface CinematicSceneProps {
  geo: GeoIP | null;
  data: SectionData;
}

export function CinematicScene({ geo, data }: CinematicSceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 42 }}
      gl={{ antialias: true, powerPreference: "default" }}
      dpr={[1, 1.5]}
      className="!fixed inset-0"
      style={{ background: "#000" }}
    >
      <Suspense fallback={null}>
        <ScrollScene geo={geo} data={data} />
      </Suspense>
    </Canvas>
  );
}
