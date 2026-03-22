import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const CardSkeleton = forwardRef<HTMLDivElement, { className?: string; children?: ReactNode }>(
  ({ className, children }, ref) => (
    <div ref={ref} className={cn("rounded-xl border p-4 animate-pulse bg-muted/30", className)}>
      {children}
    </div>
  ),
);
CardSkeleton.displayName = "CardSkeleton";
