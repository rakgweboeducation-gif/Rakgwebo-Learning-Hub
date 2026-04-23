function isCapacitor(): boolean {
  return typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();
}

function getApiBaseUrl(): string {
  if (isCapacitor()) {
    return import.meta.env.VITE_API_URL || "https://rakgwebo-learning-hub-magutulela4.replit.app";
  }
  return "";
}

export const API_BASE = getApiBaseUrl();

export function apiUrl(path: string): string {
  return API_BASE + path;
}
