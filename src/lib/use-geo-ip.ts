import { latLngToCell } from "h3-js";
import { useEffect, useState } from "react";

/** H3 resolutions relevant to our datasets: weather(0-5), terrain(1-10), population(1-8), building(3-8) */
const H3_RESOLUTIONS = [1, 3, 5, 7] as const;

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
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        if (Date.now() - ts < CACHE_TTL) {
          setGeo(data);
          return;
        }
      }
    } catch {
      /* ignore */
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
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ data: parsed, ts: Date.now() }));
        } catch {
          /* quota exceeded */
        }
      })
      .catch(() => {
        /* geo-ip fetch failed — non-critical */
      });
  }, []);

  return geo;
}
