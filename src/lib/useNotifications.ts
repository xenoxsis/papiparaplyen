"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  ApiNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./api";
import { useUserSSE } from "./UserSSEContext";

export function useNotifications(userId: number | null) {
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Load initial notifications from the API
  useEffect(() => {
    if (!userId) return;
    getNotifications()
      .then(({ notifications: data, unreadCount: count }) => {
        setNotifications(data);
        setUnreadCount(count);
      })
      .catch(() => {
        /* ignore — user may not be fully authed yet */
      });
  }, [userId]);

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

  return { notifications, unreadCount, markRead, markAllRead };
}
