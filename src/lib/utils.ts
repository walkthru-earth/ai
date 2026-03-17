import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Base path for static assets — mirrors next.config.ts basePath */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/ai";
