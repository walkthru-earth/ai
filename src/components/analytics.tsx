"use client";

import { initPostHog, PostHogPageView } from "@/lib/posthog";
import { Suspense, useEffect } from "react";

export function Analytics() {
  useEffect(() => { initPostHog(); }, []);
  return (
    <Suspense fallback={null}>
      <PostHogPageView />
    </Suspense>
  );
}
