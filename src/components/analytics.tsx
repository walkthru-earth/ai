"use client";

import { Suspense, useEffect } from "react";
import { initPostHog, PostHogPageView } from "@/lib/posthog";

export function Analytics() {
  useEffect(() => {
    initPostHog();
  }, []);
  return (
    <Suspense fallback={null}>
      <PostHogPageView />
    </Suspense>
  );
}
