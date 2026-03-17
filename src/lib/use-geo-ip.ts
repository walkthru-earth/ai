"use client";

import { useEffect, useState } from "react";

export interface GeoIP {
  city: string;
  country: string;
  country_code: string;
  latitude: string;
  longitude: string;
  region: string;
  timezone: string;
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
        const parsed: GeoIP = {
          city: data.city,
          country: data.country,
          country_code: data.country_code,
          latitude: data.latitude,
          longitude: data.longitude,
          region: data.region,
          timezone: data.timezone,
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
