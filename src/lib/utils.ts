import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Base path for static assets — mirrors vite.config.ts base */
export const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") || "/ai";
