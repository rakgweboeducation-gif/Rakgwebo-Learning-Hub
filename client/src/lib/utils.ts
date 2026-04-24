import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility to merge class names safely
 * Combines clsx + tailwind-merge
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(...inputs));
}
