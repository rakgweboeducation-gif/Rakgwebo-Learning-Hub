```ts
function isCapacitor(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as any)?.Capacitor?.isNativePlatform?.()
  );
}

function getApiBaseUrl(): string {
  // If running inside Capacitor (mobile app)
  if (isCapacitor()) {
    return (
      import.meta.env.VITE_API_URL ||
      "https://rakgwebo-learning-hub-magutulela4.replit.app"
    );
  }

  // In browser (Render / normal web)
  return "";
}

export const API_BASE: string = getApiBaseUrl();

export function apiUrl(path: string): string {
  if (!path.startsWith("/")) {
    path = "/" + path;
  }
  return API_BASE + path;
}
```
