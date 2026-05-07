"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  ApiNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./api";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export function useNotifications(userId: number | null) {
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);

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

  // Open per-user SSE stream for real-time pushes
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("auth_token")
          : null;
      if (!token) return;

      const es = new EventSource(
        `${BASE}/api/notifications/stream?token=${encodeURIComponent(token)}`,
      );
      esRef.current = es;

      es.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          if (parsed.event === "notification") {
            const n: ApiNotification = parsed.data;
            setNotifications((prev) => [n, ...prev]);
            setUnreadCount((c) => c + 1);
            // Show a toast for the incoming notification
            toast(n.body, { duration: 5000 });
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      es.onerror = () => {
        es.close();
        if (!cancelled) {
          reconnectTimeout.current = setTimeout(() => {
            reconnectDelay.current = Math.min(
              reconnectDelay.current * 2,
              30_000,
            );
            connect();
          }, reconnectDelay.current);
        }
      };

      es.onopen = () => {
        reconnectDelay.current = 1000;
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      esRef.current?.close();
    };
  }, [userId]);

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
