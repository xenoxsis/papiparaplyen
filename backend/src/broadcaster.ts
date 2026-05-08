import { Response } from "express";

// ── Generic SSE broadcaster ──────────────────────────────────────────────────
// Keys can be numeric channel IDs or string user channels like "user:42"
type ChannelKey = number | string;

const sseClients = new Map<ChannelKey, Set<Response>>();

// ── Last-Event-ID replay buffer ──────────────────────────────────────────────
// Stores the last BUFFER_SIZE events across all channels so reconnecting
// clients can catch up on events they missed during a brief disconnect.
const BUFFER_SIZE = 1_000;
let nextEventId = 1;

interface BufferedEvent {
  id: number;
  channelKey: ChannelKey;
  payload: string; // raw JSON string — the value of the `data:` line
}

const eventBuffer: BufferedEvent[] = [];

function addToBuffer(channelKey: ChannelKey, payload: string): number {
  const id = nextEventId++;
  eventBuffer.push({ id, channelKey, payload });
  if (eventBuffer.length > BUFFER_SIZE) eventBuffer.shift();
  return id;
}

function getMissedEvents(
  channelKey: ChannelKey,
  afterId: number,
): BufferedEvent[] {
  return eventBuffer.filter(
    (e) => e.channelKey === channelKey && e.id > afterId,
  );
}

export function registerClient(channelKey: ChannelKey, res: Response) {
  if (!sseClients.has(channelKey)) sseClients.set(channelKey, new Set());
  sseClients.get(channelKey)!.add(res);
}

export function unregisterClient(channelKey: ChannelKey, res: Response) {
  const set = sseClients.get(channelKey);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) sseClients.delete(channelKey);
}

/** Returns the member IDs of all currently connected SSE clients. */
export function getConnectedUserIds(): number[] {
  const ids: number[] = [];
  for (const key of sseClients.keys()) {
    if (typeof key === "string" && key.startsWith("user:")) {
      const id = Number(key.slice(5));
      if (!isNaN(id)) ids.push(id);
    }
  }
  return ids;
}

export function broadcast(channelKey: ChannelKey, data: unknown) {
  const jsonData = JSON.stringify(data);
  const id = addToBuffer(channelKey, jsonData);
  const payload = `id: ${id}\ndata: ${jsonData}\n\n`;
  const clients = sseClients.get(channelKey);
  if (!clients || clients.size === 0) return;
  for (const res of clients) {
    try {
      res.write(payload);
      if (
        typeof (res as unknown as { flush?: () => void }).flush === "function"
      ) {
        (res as unknown as { flush: () => void }).flush();
      }
    } catch {
      // client disconnected mid-write — cleaned up via close event
    }
  }
}

/** Start SSE headers on a response and register it in the given channel.
 *  If `lastEventId` is provided (from the `Last-Event-ID` request header),
 *  any buffered events for this channel with id > lastEventId are replayed
 *  immediately before the client is registered for new events.
 */
export function initSseResponse(
  channelKey: ChannelKey,
  res: Response,
  onClose: () => void,
  lastEventId?: number,
) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Replay missed events before accepting live ones
  if (lastEventId !== undefined) {
    const missed = getMissedEvents(channelKey, lastEventId);
    for (const evt of missed) {
      try {
        res.write(`id: ${evt.id}\ndata: ${evt.payload}\n\n`);
      } catch {
        // client already gone
      }
    }
  }

  res.write(": connected\n\n");
  if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
    (res as unknown as { flush: () => void }).flush();
  }
  registerClient(channelKey, res);

  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 25_000);

  res.on("close", () => {
    clearInterval(heartbeat);
    unregisterClient(channelKey, res);
    onClose();
  });
}

/** Broadcast a notification to a specific member's personal SSE channel. */
export function broadcastToUser(memberId: number, data: unknown) {
  broadcast(`user:${memberId}`, data);
}
