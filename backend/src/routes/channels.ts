import { Router, Request, Response } from "express";
import { getPool, sql } from "../db";
import { requireAuth } from "../auth";

const router = Router();

// ── SSE broadcaster ───────────────────────────────────────────────────────────
// Maps channelId → set of active SSE response objects
const sseClients = new Map<number, Set<Response>>();

function registerClient(channelId: number, res: Response) {
  if (!sseClients.has(channelId)) sseClients.set(channelId, new Set());
  sseClients.get(channelId)!.add(res);
}

function unregisterClient(channelId: number, res: Response) {
  sseClients.get(channelId)?.delete(res);
}

function broadcast(channelId: number, data: unknown) {
  const clients = sseClients.get(channelId);
  if (!clients || clients.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
      // Flush immediately so the frame isn't held in a compression buffer
      if (
        typeof (res as unknown as { flush?: () => void }).flush === "function"
      ) {
        (res as unknown as { flush: () => void }).flush();
      }
    } catch {
      // client disconnected mid-write — will be cleaned up via close event
    }
  }
}

// GET /api/channels/:id/stream  — SSE endpoint
router.get("/:id/stream", (req: Request, res: Response) => {
  const channelId = Number(req.params.id);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx/IIS buffering
  res.flushHeaders();

  // Send an initial comment to confirm the connection
  res.write(": connected\n\n");
  if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
    (res as unknown as { flush: () => void }).flush();
  }

  registerClient(channelId, res);

  // Heartbeat every 25 s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unregisterClient(channelId, res);
  });
});

// GET /api/channels
router.get("/", async (_req, res) => {
  const pool = await getPool();
  const result = await pool
    .request()
    .query("SELECT id, name, type FROM dbo.channels ORDER BY id");
  res.json(result.recordset);
});

// GET /api/channels/:id/messages
router.get("/:id/messages", async (req, res) => {
  const pool = await getPool();
  const channelId = Number(req.params.id);

  const result = await pool.request().input("channelId", sql.Int, channelId)
    .query(`
      SELECT m.id, m.channel_id, m.sender_id, m.body, m.sent_at,
             m.type, m.shift_night_id, m.swap_status, m.taken_by_member_id,
             s.name  AS sender_name,
             s.initials AS sender_initials,
             t.name  AS taken_by_name,
             t.initials AS taken_by_initials
      FROM dbo.messages m
      LEFT JOIN dbo.members s ON s.id = m.sender_id
      LEFT JOIN dbo.members t ON t.id = m.taken_by_member_id
      WHERE m.channel_id = @channelId
      ORDER BY m.sent_at
    `);

  res.json(result.recordset);
});

// POST /api/channels/:id/messages
router.post("/:id/messages", requireAuth, async (req, res) => {
  const pool = await getPool();
  const channelId = Number(req.params.id);
  const isSwap = req.body.type === "shift_swap";

  const insertResult = await pool
    .request()
    .input("channelId", sql.Int, channelId)
    .input("senderId", sql.Int, req.body.sender_id ?? null)
    .input("body", sql.NVarChar(sql.MAX), req.body.body)
    .input("sentAt", sql.DateTime2, new Date().toISOString())
    .input("type", sql.NVarChar, isSwap ? "shift_swap" : null)
    .input("shiftNightId", sql.Int, isSwap ? req.body.shift_night_id : null)
    .input("swapStatus", sql.NVarChar, isSwap ? "pending" : null).query(`
      INSERT INTO dbo.messages (channel_id, sender_id, body, sent_at, type, shift_night_id, swap_status, taken_by_member_id)
      OUTPUT INSERTED.id
      VALUES (@channelId, @senderId, @body, @sentAt, @type, @shiftNightId, @swapStatus, NULL)
    `);

  const newId: number = insertResult.recordset[0].id;

  const row = await pool.request().input("id", sql.Int, newId).query(`
      SELECT m.id, m.channel_id, m.sender_id, m.body, m.sent_at,
             m.type, m.shift_night_id, m.swap_status, m.taken_by_member_id,
             s.name AS sender_name, s.initials AS sender_initials,
             NULL AS taken_by_name, NULL AS taken_by_initials
      FROM dbo.messages m
      LEFT JOIN dbo.members s ON s.id = m.sender_id
      WHERE m.id = @id
    `);

  broadcast(channelId, { event: "message", data: row.recordset[0] });
  return res.status(201).json(row.recordset[0]);
});

// PATCH /api/channels/:channelId/messages/:messageId
router.patch(
  "/:channelId/messages/:messageId",
  requireAuth,
  async (req, res) => {
    const pool = await getPool();
    const messageId = Number(req.params.messageId);
    const channelId = Number(req.params.channelId);

    const check = await pool
      .request()
      .input("id", sql.Int, messageId)
      .input("channelId", sql.Int, channelId)
      .query(
        "SELECT 1 FROM dbo.messages WHERE id=@id AND channel_id=@channelId",
      );
    if (check.recordset.length === 0)
      return res.status(404).json({ error: "Not found" });

    const setParts: string[] = [];
    const request = pool
      .request()
      .input("id", sql.Int, messageId)
      .input("channelId", sql.Int, channelId);

    if (req.body.body !== undefined) {
      request.input("body", sql.NVarChar(sql.MAX), req.body.body);
      setParts.push("body = @body");
    }
    if (req.body.swap_status !== undefined) {
      request.input("swapStatus", sql.NVarChar, req.body.swap_status);
      setParts.push("swap_status = @swapStatus");
    }
    if ("taken_by_member_id" in req.body) {
      request.input(
        "takenByMemberId",
        sql.Int,
        req.body.taken_by_member_id ?? null,
      );
      setParts.push("taken_by_member_id = @takenByMemberId");
    }

    if (setParts.length > 0) {
      await request.query(
        `UPDATE dbo.messages SET ${setParts.join(", ")} WHERE id=@id AND channel_id=@channelId`,
      );
    }

    const row = await pool.request().input("id", sql.Int, messageId).query(`
      SELECT m.id, m.channel_id, m.sender_id, m.body, m.sent_at,
             m.type, m.shift_night_id, m.swap_status, m.taken_by_member_id,
             s.name AS sender_name, s.initials AS sender_initials,
             t.name AS taken_by_name, t.initials AS taken_by_initials
      FROM dbo.messages m
      LEFT JOIN dbo.members s ON s.id = m.sender_id
      LEFT JOIN dbo.members t ON t.id = m.taken_by_member_id
      WHERE m.id = @id
    `);

    // When a swap is accepted, automatically opt-out the original sender
    if (req.body.swap_status === "taken") {
      const { sender_id: senderId, shift_night_id: shiftNightId } =
        row.recordset[0] ?? {};
      if (senderId && shiftNightId) {
        const existing = await pool
          .request()
          .input("nightId", sql.Int, shiftNightId)
          .input("memberId", sql.Int, senderId)
          .query(
            "SELECT 1 FROM dbo.club_night_opt_outs WHERE club_night_id=@nightId AND member_id=@memberId",
          );
        if (existing.recordset.length === 0) {
          await pool
            .request()
            .input("nightId", sql.Int, shiftNightId)
            .input("memberId", sql.Int, senderId)
            .query(
              "INSERT INTO dbo.club_night_opt_outs (club_night_id, member_id) VALUES (@nightId, @memberId)",
            );
        }
        // Clear vagt assignment if sender was assigned
        await pool
          .request()
          .input("senderId", sql.Int, senderId)
          .input("shiftNightId", sql.Int, shiftNightId)
          .input("updatedAt", sql.DateTime2, new Date().toISOString())
          .query(
            "UPDATE dbo.club_nights SET vagt_member_id = NULL, vagt_confirmed = 0, updated_at = @updatedAt WHERE id = @shiftNightId AND vagt_member_id = @senderId",
          );
      }
    }

    broadcast(channelId, { event: "message", data: row.recordset[0] });
    return res.json(row.recordset[0]);
  },
);

export default router;
