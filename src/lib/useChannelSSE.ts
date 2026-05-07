"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiMessage } from "./api";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Opens an SSE connection to /api/channels/:channelId/stream and calls
 * `onMessage` whenever the server pushes a new or updated message.
 *
 * Automatically reconnects with exponential back-off on unexpected closure.
 * Falls back to a no-op if EventSource is unavailable (SSR / old browsers).
 */
export function useChannelSSE(
  channelId: number | null,
  onMessage: (msg: ApiMessage) => void,
): { connected: boolean } {
  // Keep a stable ref to the callback so we don't need it in the deps array
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (channelId === null) return;
    if (typeof EventSource === "undefined") return; // SSR guard

    let es: EventSource | null = null;
    let retryDelay = 1_000; // start at 1 s, cap at 30 s
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      const token = localStorage.getItem("auth_token") ?? "";
      const url = `${BASE}/api/channels/${channelId}/stream?token=${encodeURIComponent(token)}`;
      es = new EventSource(url);

      es.onopen = () => {
        retryDelay = 1_000; // reset back-off on successful open
        setConnected(true);
      };

      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as {
            event: string;
            data: ApiMessage;
          };
          if (parsed.event === "message") {
            onMessageRef.current(parsed.data);
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        setConnected(false);
        if (!unmounted) {
          retryTimer = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, 30_000);
            connect();
          }, retryDelay);
        }
      };
    }

    connect();

    return () => {
      unmounted = true;
      setConnected(false);
      if (retryTimer !== null) clearTimeout(retryTimer);
      es?.close();
    };
  }, [channelId]);

  return { connected };
}
