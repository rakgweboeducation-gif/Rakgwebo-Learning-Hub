import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Bell, X } from "lucide-react";
import {
  requestNotificationPermission,
  getNotificationPermission,
  updateAppBadge,
  sendNotificationForMessage,
  sendNotificationForAnnouncement,
  sendNotificationForSessionUpdate,
} from "@/lib/push-notifications";

export function NotificationManager() {
  const { user } = useAuth();
  const [showBanner, setShowBanner] = useState(false);
  const prevUnreadTotal = useRef<number>(0);
  const prevAnnouncementIds = useRef<Set<number>>(new Set());
  const prevSessionStatuses = useRef<Map<number, string>>(new Map());
  const isFirstLoad = useRef(true);

  const { data: unreadCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/chat/unread"],
    enabled: !!user,
    refetchInterval: 5000,
  });

  const { data: announcements } = useQuery<any[]>({
    queryKey: ["/api/announcements"],
    enabled: !!user,
    refetchInterval: 15000,
  });

  const { data: sessions } = useQuery<any[]>({
    queryKey: ["/api/tutor-sessions"],
    enabled: !!user,
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (user && "Notification" in window) {
      const perm = getNotificationPermission();
      if (perm === "default") {
        const dismissed = sessionStorage.getItem("notification-banner-dismissed");
        if (!dismissed) {
          const timer = setTimeout(() => setShowBanner(true), 2000);
          return () => clearTimeout(timer);
        }
      }
    }
  }, [user]);

  const handleEnableNotifications = async () => {
    await requestNotificationPermission();
    setShowBanner(false);
    sessionStorage.setItem("notification-banner-dismissed", "true");
  };

  const handleDismissBanner = () => {
    setShowBanner(false);
    sessionStorage.setItem("notification-banner-dismissed", "true");
  };

  useEffect(() => {
    const totalUnread = Object.values(unreadCounts).reduce(
      (sum: number, c) => sum + (c as number),
      0
    );

    updateAppBadge(totalUnread);

    if (!isFirstLoad.current && totalUnread > prevUnreadTotal.current) {
      const diff = totalUnread - prevUnreadTotal.current;
      sendNotificationForMessage(
        "Chat",
        `You have ${diff} new unread message${diff > 1 ? "s" : ""}`
      );
    }
    prevUnreadTotal.current = totalUnread;
  }, [unreadCounts]);

  useEffect(() => {
    if (!announcements || announcements.length === 0) return;

    if (!isFirstLoad.current) {
      for (const a of announcements) {
        if (!prevAnnouncementIds.current.has(a.id)) {
          sendNotificationForAnnouncement(a.title, a.content || "");
        }
      }
    }
    prevAnnouncementIds.current = new Set(announcements.map((a: any) => a.id));
  }, [announcements]);

  useEffect(() => {
    if (!sessions || sessions.length === 0) return;

    if (!isFirstLoad.current) {
      for (const s of sessions) {
        const prevStatus = prevSessionStatuses.current.get(s.id);
        if (prevStatus && prevStatus !== s.status) {
          const isTutor = user?.role === "tutor";
          let details = "";
          if (s.status === "accepted") {
            details = isTutor
              ? `You accepted the session with ${s.learnerName || "a learner"}`
              : `Your tutoring session has been accepted!`;
          } else if (s.status === "rejected") {
            details = `The session request was declined.`;
          } else if (s.status === "requested" && isTutor) {
            details = `New session request from ${s.learnerName || "a learner"}`;
          } else if (s.status === "completed") {
            details = `Your tutoring session has been completed.`;
          }
          if (details) {
            sendNotificationForSessionUpdate(s.status, details);
          }
        }
      }
    }
    const newMap = new Map<number, string>();
    for (const s of sessions) {
      newMap.set(s.id, s.status);
    }
    prevSessionStatuses.current = newMap;
  }, [sessions, user?.role]);

  useEffect(() => {
    if (isFirstLoad.current) {
      const timer = setTimeout(() => {
        isFirstLoad.current = false;
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 bg-card border border-border rounded-xl shadow-lg p-4 flex items-start gap-3" data-testid="notification-banner">
      <div className="p-2 bg-primary/10 rounded-lg shrink-0">
        <Bell className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Enable Notifications</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Get notified about new messages, announcements, and session updates.
        </p>
        <div className="flex gap-2 mt-2">
          <Button size="sm" onClick={handleEnableNotifications} data-testid="button-enable-notifications">
            Enable
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDismissBanner} data-testid="button-dismiss-notifications">
            Not now
          </Button>
        </div>
      </div>
      <button onClick={handleDismissBanner} className="text-muted-foreground hover:text-foreground shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
