"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  ApiNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationsReadByLink,
} from "./api";
import { useUserSSE } from "./UserSSEContext";

export function useNotifications(userId: number | null) {
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(() => {
    if (!userId) return;
    getNotifications()
      .then(({ notifications: data, unreadCount: count }) => {
        setNotifications(data);
        setUnreadCount(count);
      })
      .catch(() => {
        /* ignore */
      });
  }, [userId]);

  // Load initial notifications from the API
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Subscribe to the shared user SSE stream for real-time pushes
  useUserSSE((evt) => {
    if (evt.event !== "notification") return;
    const n = evt.data as ApiNotification;
    setNotifications((prev) => [n, ...prev]);
    setUnreadCount((c) => c + 1);
    toast(n.body, { duration: 5000 });
  });

  const markRead = useCallback(async (id: number) => {
    await markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, []);

  const markReadByLink = useCallback(
    async (link: string) => {
      await markNotificationsReadByLink(link);
      setNotifications((prev) =>
        prev.map((n) => (n.link === link ? { ...n, is_read: true } : n)),
      );
      setUnreadCount((prev) => {
        // Recount from updated state
        return Math.max(
          0,
          prev -
            notifications.filter((n) => n.link === link && !n.is_read).length,
        );
      });
    },
    [notifications],
  );

  return {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    markReadByLink,
    refresh,
  };
}
