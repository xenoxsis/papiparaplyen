import { Router } from "express";
import { readTable, writeTable } from "../db";

const router = Router();

interface DbChannel {
  id: number;
  name: string;
  type: string;
}

interface DbMessage {
  id: number;
  channel_id: number;
  sender_id: number | null;
  body: string;
  sent_at: string;
  type?: "shift_swap";
  shift_night_id?: number;
  swap_status?: "pending" | "taken" | "cancelled";
  taken_by_member_id?: number | null;
}

interface DbMember {
  id: number;
  name: string;
  initials: string;
}

// GET /api/channels
router.get("/", (_req, res) => {
  res.json(readTable<DbChannel>("channels"));
});

// GET /api/channels/:id/messages
router.get("/:id/messages", (req, res) => {
  const channelId = Number(req.params.id);
  const messages = readTable<DbMessage>("messages")
    .filter((m) => m.channel_id === channelId)
    .sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  const members = readTable<DbMember>("members");

  const enriched = messages.map((msg) => {
    const sender = msg.sender_id
      ? members.find((m) => m.id === msg.sender_id)
      : null;
    const takenBy = msg.taken_by_member_id
      ? members.find((m) => m.id === msg.taken_by_member_id)
      : null;
    return {
      ...msg,
      sender_name: sender?.name ?? null,
      sender_initials: sender?.initials ?? null,
      taken_by_name: takenBy?.name ?? null,
      taken_by_initials: takenBy?.initials ?? null,
    };
  });

  res.json(enriched);
});

// POST /api/channels/:id/messages
router.post("/:id/messages", (req, res) => {
  const channelId = Number(req.params.id);
  const messages = readTable<DbMessage>("messages");
  const newId = messages.length
    ? Math.max(...messages.map((m) => m.id)) + 1
    : 1;
  const msg: DbMessage = {
    id: newId,
    channel_id: channelId,
    sender_id: req.body.sender_id ?? null,
    body: req.body.body,
    sent_at: new Date().toISOString(),
    ...(req.body.type === "shift_swap" && {
      type: "shift_swap" as const,
      shift_night_id: req.body.shift_night_id,
      swap_status: "pending" as const,
      taken_by_member_id: null,
    }),
  };
  messages.push(msg);
  writeTable("messages", messages);
  const members = readTable<DbMember>("members");
  const sender = msg.sender_id
    ? members.find((m) => m.id === msg.sender_id)
    : null;
  return res.status(201).json({
    ...msg,
    sender_name: sender?.name ?? null,
    sender_initials: sender?.initials ?? null,
  });
});

// PATCH /api/channels/:channelId/messages/:messageId
router.patch("/:channelId/messages/:messageId", (req, res) => {
  const messages = readTable<DbMessage>("messages");
  const idx = messages.findIndex(
    (m) =>
      m.id === Number(req.params.messageId) &&
      m.channel_id === Number(req.params.channelId),
  );
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  if (req.body.body !== undefined) messages[idx].body = req.body.body;
  if (req.body.swap_status !== undefined)
    messages[idx].swap_status = req.body.swap_status;
  if ("taken_by_member_id" in req.body)
    messages[idx].taken_by_member_id = req.body.taken_by_member_id;
  writeTable("messages", messages);
  const members = readTable<DbMember>("members");
  const msg = messages[idx];
  const sender = msg.sender_id
    ? members.find((m) => m.id === msg.sender_id)
    : null;
  const takenBy = msg.taken_by_member_id
    ? members.find((m) => m.id === msg.taken_by_member_id)
    : null;
  return res.json({
    ...msg,
    sender_name: sender?.name ?? null,
    sender_initials: sender?.initials ?? null,
    taken_by_name: takenBy?.name ?? null,
    taken_by_initials: takenBy?.initials ?? null,
  });
});

export default router;
