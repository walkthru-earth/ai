/**
 * Dynamic URL resolvers for weather forecasts and Overture Maps releases.
 * Each resolver fetches from a GitHub state file first, then falls back to probing.
 */

import { S3_BASE } from "./datasets/types";

const WEATHER_BASE = `${S3_BASE}/indices/weather/model=GraphCast_GFS`;
const PROBE_BASE = "https://data.source.coop/walkthru-earth";

/* ── Weather prefix resolution ───────────────────────────────────── */

const WEATHER_STATE_URL =
  "https://raw.githubusercontent.com/walkthru-earth/walkthru-weather-index/refs/heads/main/state/noaa-last-seen.txt";

function parseWeatherState(text: string): { date: string; hour: number } | null {
  const match = text.match(/GRAP_v100_GFS_(\d{4})(\d{2})(\d{2})(\d{2})_f\d+_f\d+/);
  if (!match) return null;
  const [, year, month, day, hour] = match;
  return { date: `${year}-${month}-${day}`, hour: parseInt(hour, 10) };
}

function recentDates(count = 7): string[] {
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

let _weatherPrefixPromise: Promise<string> | null = null;

export function resolveWeatherPrefix(): Promise<string> {
  if (_weatherPrefixPromise) return _weatherPrefixPromise;

  _weatherPrefixPromise = (async () => {
    // 1. Try the authoritative state file first (single fetch)
    try {
      const res = await fetch(WEATHER_STATE_URL);
      if (res.ok) {
        const text = (await res.text()).trim();
        const parsed = parseWeatherState(text);
        if (parsed) {
          return `${WEATHER_BASE}/date=${parsed.date}/hour=${parsed.hour}`;
        }
      }
    } catch {
      // fall through to probing
    }

    // 2. Fallback: probe recent dates with HEAD requests
    const probe = async (date: string, hour: number): Promise<string | null> => {
      try {
        const probeUrl = `${PROBE_BASE}/indices/weather/model=GraphCast_GFS/date=${date}/hour=${hour}/h3_res=2/data.parquet`;
        const res = await fetch(probeUrl, { method: "HEAD" });
        return res.ok ? `${WEATHER_BASE}/date=${date}/hour=${hour}` : null;
      } catch {
        return null;
      }
    };

    const dates = recentDates(7);
    for (const date of dates) {
      const results = await Promise.all([probe(date, 12), probe(date, 0)]);
      const found = results.find(Boolean);
      if (found) return found;
    }

    return `${WEATHER_BASE}/date=${dates[dates.length - 1]}/hour=0`;
  })();

  return _weatherPrefixPromise;
}

/* ── Overture release resolution ─────────────────────────────────── */

const OVERTURE_STATE_URL =
  "https://raw.githubusercontent.com/walkthru-earth/walkthru-overture-index/refs/heads/main/state/last-release.txt";
const OVERTURE_FALLBACK = "2026-03-18.0";

let _overtureReleasePromise: Promise<string> | null = null;

export function resolveOvertureRelease(): Promise<string> {
  if (_overtureReleasePromise) return _overtureReleasePromise;

  _overtureReleasePromise = (async () => {
    try {
      const res = await fetch(OVERTURE_STATE_URL);
      if (res.ok) {
        const text = (await res.text()).trim();
        if (/^\d{4}-\d{2}-\d{2}\.\d+$/.test(text)) return text;
      }
    } catch {
      // fall through
    }
    return OVERTURE_FALLBACK;
  })();

  return _overtureReleasePromise;
}
