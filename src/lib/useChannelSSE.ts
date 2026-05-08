"use client";

import { useRef } from "react";
import type { ApiMessage } from "./api";
import { useUserSSE } from "./UserSSEContext";

/**
 * Subscribes to chat_message events for a specific channel via the shared
 * per-user SSE connection.  Calls `onMessage` whenever the server pushes
 * a new or updated message for `channelId`.
 *
 * The underlying SSE connection is owned by UserSSEContext (one per user).
 * No per-channel connection is opened.
 */
export function useChannelSSE(
  channelId: number | null,
  onMessage: (msg: ApiMessage) => void,
): { connected: boolean } {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useUserSSE((evt) => {
    if (evt.event !== "chat_message") return;
    if (evt.data.channelId !== channelId) return;
    onMessageRef.current(evt.data.message as ApiMessage);
  });

  // Connection status is managed by the context; always report connected
  // (the context handles reconnect internally)
  return { connected: true };
}
