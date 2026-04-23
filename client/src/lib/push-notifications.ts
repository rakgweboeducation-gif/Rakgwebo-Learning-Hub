import { playNotificationSound } from "./notification-sound";

let notificationPermission: NotificationPermission = "default";

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") {
    notificationPermission = "granted";
    return true;
  }
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  notificationPermission = result;
  return result === "granted";
}

export function getNotificationPermission(): NotificationPermission {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

export async function showNotification(
  title: string,
  options: {
    body?: string;
    icon?: string;
    tag?: string;
    data?: Record<string, unknown>;
    requireInteraction?: boolean;
  } = {}
) {
  playNotificationSound();

  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const defaultIcon = "/icons/icon-192x192.png";

  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body: options.body,
      icon: options.icon || defaultIcon,
      badge: "/icons/icon-72x72.png",
      tag: options.tag,
      data: options.data,
      requireInteraction: options.requireInteraction || false,
      vibrate: [200, 100, 200],
    });
  } else {
    new Notification(title, {
      body: options.body,
      icon: options.icon || defaultIcon,
      tag: options.tag,
    });
  }
}

export async function updateAppBadge(count: number) {
  if ("setAppBadge" in navigator) {
    try {
      if (count > 0) {
        await (navigator as any).setAppBadge(count);
      } else {
        await (navigator as any).clearAppBadge();
      }
    } catch {
    }
  }
}

export function sendNotificationForMessage(senderName: string, message: string) {
  showNotification(`New message from ${senderName}`, {
    body: message.length > 100 ? message.substring(0, 100) + "..." : message,
    tag: `chat-${senderName}`,
    data: { url: "/chat" },
  });
}

export function sendNotificationForAnnouncement(title: string, content: string) {
  showNotification(`Announcement: ${title}`, {
    body: content.length > 120 ? content.substring(0, 120) + "..." : content,
    tag: `announcement-${Date.now()}`,
    data: { url: "/" },
    requireInteraction: true,
  });
}

export function sendNotificationForSessionUpdate(type: string, details: string) {
  const titles: Record<string, string> = {
    accepted: "Session Accepted!",
    rejected: "Session Declined",
    requested: "New Session Request",
    completed: "Session Completed",
    started: "Session Starting Now",
  };
  showNotification(titles[type] || "Session Update", {
    body: details,
    tag: `session-${type}-${Date.now()}`,
    data: { url: "/schedule" },
  });
}

export function sendNotificationForTutorFound(tutorName: string) {
  showNotification("Tutor Available!", {
    body: `${tutorName} is available for a tutoring session.`,
    tag: `tutor-${tutorName}`,
    data: { url: "/tutors" },
  });
}
