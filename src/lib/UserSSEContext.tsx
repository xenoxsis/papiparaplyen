"use client";

/**
 * UserSSEContext
 *
 * Owns exactly ONE SSE connection per logged-in user
 * (to /api/notifications/stream, keyed "user:<memberId>").
 *
 * Any number of components can subscribe via useUserSSE() to receive
 * every raw parsed event object.  The broadcaster on the server sends:
 *   { event: "notification", data: ... }
 *   { event: "chat_message", data: { channelId, message } }
 *   { event: "message_edited", data: { channelId, message } }
 *   { event: "message_deleted", data: { channelId, message } }
 *   { event: "typing", data: { channelId, memberId, name } }
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import type { ApiClubNight } from "@/lib/api";

export type UserSSEEvent =
  | { event: "notification"; data: unknown }
  | { event: "chat_message"; data: { channelId: number; message: unknown } }
  | { event: "message_edited"; data: { channelId: number; message: unknown } }
  | { event: "message_deleted"; data: { channelId: number; message: unknown } }
  | {
      event: "typing";
      data: { channelId: number; memberId: number; name: string };
    }
  | { event: "roles_changed"; data?: unknown }
  | {
      event: "schedule_updated";
      data:
        | { type: "night_confirmed"; night: ApiClubNight }
        | {
            type: "review_submitted";
            memberId: number;
            memberName: string;
            memberInitials: string;
            reviewedAt: string;
          };
    };

type Handler = (evt: UserSSEEvent) => void;

interface UserSSEContextValue {
  subscribe: (handler: Handler) => void;
  unsubscribe: (handler: Handler) => void;
}

const UserSSEContext = createContext<UserSSEContextValue>({
  subscribe: () => {},
  unsubscribe: () => {},
});

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export function UserSSEProvider({
  userId,
  children,
}: {
  userId: number | null;
  children: ReactNode;
}) {
  const handlers = useRef<Set<Handler>>(new Set());
  const esRef = useRef<EventSource | null>(null);
  const retryDelay = useRef(1_000);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);

  const dispatch = useCallback((evt: UserSSEEvent) => {
    for (const h of handlers.current) {
      try {
        h(evt);
      } catch {
        /* ignore handler errors */
      }
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    cancelled.current = false;

    function connect() {
      if (cancelled.current) return;

      // Cookies are sent automatically (withCredentials=true for cross-origin;
      // same-origin via Next.js rewrite means cookies always travel with the request).
      const es = new EventSource(`${BASE}/api/notifications/stream`, {
        withCredentials: true,
      });
      esRef.current = es;

      es.onopen = () => {
        retryDelay.current = 1_000;
      };

      es.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data) as UserSSEEvent;
          if (parsed.event) dispatch(parsed);
        } catch {
          /* ignore malformed frames */
        }
      };

      es.onerror = () => {
        es.close();
        if (!cancelled.current) {
          retryTimer.current = setTimeout(() => {
            retryDelay.current = Math.min(retryDelay.current * 2, 30_000);
            connect();
          }, retryDelay.current);
        }
      };
    }

    connect();

    return () => {
      cancelled.current = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [userId, dispatch]);

  const subscribe = useCallback((h: Handler) => {
    handlers.current.add(h);
  }, []);
  const unsubscribe = useCallback((h: Handler) => {
    handlers.current.delete(h);
  }, []);

  return (
    <UserSSEContext.Provider value={{ subscribe, unsubscribe }}>
      {children}
    </UserSSEContext.Provider>
  );
}

/** Subscribe to all user SSE events. Handler is called for every event. */
export function useUserSSE(handler: Handler) {
  const { subscribe, unsubscribe } = useContext(UserSSEContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const stable: Handler = (evt) => handlerRef.current(evt);
    subscribe(stable);
    return () => unsubscribe(stable);
  }, [subscribe, unsubscribe]);
}
