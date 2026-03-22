import { latLngToCell } from "h3-js";
import { useEffect, useState } from "react";
import { readStorage, writeStorage } from "@/lib/storage";

/** H3 resolutions covering all datasets: weather(1-5), terrain(1-10), population(1-8), building(3-8) */
const H3_RESOLUTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export interface GeoIP {
  city: string;
  country: string;
  country_code: string;
  latitude: string;
  longitude: string;
  region: string;
  timezone: string;
  /** H3 cell hex strings at key resolutions for the user's location */
  h3Cells?: Record<number, string>;
}

const CACHE_KEY = "walkthru-geoip";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/** Fetches user's geo-IP once, caches in localStorage for 24h. Always null on first render (SSR-safe). */
export function useGeoIP(): GeoIP | null {
  const [geo, setGeo] = useState<GeoIP | null>(null);

  useEffect(() => {
    // Check cache first
    const cached = readStorage<{ data: GeoIP; ts: number } | null>(CACHE_KEY, null);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      setGeo(cached.data);
      return;
    }

    // Fetch fresh
    fetch("https://get.geojs.io/v1/ip/geo.json")
      .then((r) => r.json())
      .then((data) => {
        const lat = parseFloat(data.latitude);
        const lng = parseFloat(data.longitude);
        const h3Cells: Record<number, string> = {};
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
          for (const res of H3_RESOLUTIONS) {
            try {
              h3Cells[res] = latLngToCell(lat, lng, res);
            } catch {
              /* h3 computation failed for this res */
            }
          }
        }
        const parsed: GeoIP = {
          city: data.city,
          country: data.country,
          country_code: data.country_code,
          latitude: data.latitude,
          longitude: data.longitude,
          region: data.region,
          timezone: data.timezone,
          h3Cells: Object.keys(h3Cells).length > 0 ? h3Cells : undefined,
        };
        setGeo(parsed);
        writeStorage(CACHE_KEY, { data: parsed, ts: Date.now() });
      })
      .catch(() => {
        /* geo-ip fetch failed — non-critical */
      });
  }, []);

  return geo;
}
