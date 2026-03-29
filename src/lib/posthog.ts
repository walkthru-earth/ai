import posthog from "posthog-js";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { basePath } from "@/lib/utils";

let initialized = false;

/** Initialize PostHog - call once in the root layout or provider. */
export function initPostHog() {
  if (initialized || typeof window === "undefined") return;
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) return;

  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: false,
    capture_pageleave: true,
    persistence: "memory", // Cookieless by default - privacy-first
    opt_out_capturing_by_default: false,
  });
  initialized = true;
}

/** Track page views - use as a component in the layout. */
export function PostHogPageView(): null {
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (!pathname || !initialized) return;
    let url = window.origin + basePath + pathname;
    if (search) {
      url += search;
    }
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, search]);

  return null;
}
