// src/lib/api-config.ts

function isCapacitor(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as any).Capacitor?.isNativePlatform?.()
  );
}

function getApiBaseUrl(): string {
  if (isCapacitor()) {
    return (
      import.meta.env.VITE_API_URL ||
      "https://rakgwebo-learning-hub-magutulela4.replit.app"
    );
  }

  // browser / web → use relative API
  return "";
}

export const API_BASE = getApiBaseUrl();

// ✅ THIS IS THE IMPORTANT EXPORT
export function apiUrl(path: string): string {
  if (!path.startsWith("/")) {
    path = "/" + path;
  }
  return API_BASE + path;
}
