import { Router, Request, Response } from "express";
import { getPool, sql } from "../db";
import { requireAuth, verifyToken } from "../auth";
import { broadcast, initSseResponse } from "../broadcaster";
import {
  createNotification,
  createNotificationForMany,
} from "../notifications";

const router = Router();

// GET /api/channels/:id/stream  — SSE endpoint
router.get("/:id/stream", async (req: Request, res: Response) => {
  const channelId = Number(req.params.id);

  // Auth via query param (EventSource can't send headers)
  const token = req.query.token as string | undefined;
  const jwtPayload = token ? verifyToken(token) : null;
  if (!jwtPayload) {
    res.status(401).end();
    return;
  }

  // For vagter channel, require appropriate role
  const pool = await getPool();
  const chanResult = await pool
    .request()
    .input("channelId", sql.Int, channelId)
    .query("SELECT type FROM dbo.channels WHERE id = @channelId");
  const channelType: string | undefined = chanResult.recordset[0]?.type;
  if (channelType === "vagter") {
    const allowed =
      jwtPayload.roles.includes("Administrator") ||
      jwtPayload.roles.includes("Vagt") ||
      jwtPayload.roles.includes("Tilskuer");
    if (!allowed) {
      res.status(403).end();
      return;
    }
  }

  initSseResponse(channelId, res, () => {
    /* cleanup handled inside */
  });
});

// GET /api/channels
router.get("/", requireAuth, async (_req, res) => {
  const pool = await getPool();
  const jwt = res.locals.jwt as { roles: string[] };
  const canSeeVagterChannel =
    jwt.roles.includes("Administrator") ||
    jwt.roles.includes("Vagt") ||
    jwt.roles.includes("Tilskuer");

  const result = await pool
    .request()
    .query("SELECT id, name, type FROM dbo.channels ORDER BY id");

  const channels = canSeeVagterChannel
    ? result.recordset
    : result.recordset.filter((c: { type: string }) => c.type !== "vagter");

  res.json(channels);
});

// GET /api/channels/:id/members  — list members in a channel
router.get("/:id/members", requireAuth, async (req, res) => {
  const pool = await getPool();
  const channelId = Number(req.params.id);

  // Role-gate vagter channel
  const chanResult = await pool
    .request()
    .input("channelId", sql.Int, channelId)
    .query("SELECT type FROM dbo.channels WHERE id = @channelId");
  const channelType: string | undefined = chanResult.recordset[0]?.type;
  if (channelType === "vagter") {
    const jwt = res.locals.jwt as { roles: string[] };
    const allowed =
      jwt.roles.includes("Administrator") ||
      jwt.roles.includes("Vagt") ||
      jwt.roles.includes("Tilskuer");
    if (!allowed) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const result = await pool.request().input("channelId", sql.Int, channelId)
    .query(`
      SELECT m.id, m.name, m.initials
      FROM dbo.members m
      LEFT JOIN dbo.users u ON u.member_id = m.id
      WHERE ISNULL(u.banned, 0) = 0
      ORDER BY m.name
    `);

  res.json(result.recordset);
});

// GET /api/channels/:id/messages
router.get("/:id/messages", requireAuth, async (req, res) => {
  const pool = await getPool();
  const channelId = Number(req.params.id);

  // Check if this channel is restricted
  const chanResult = await pool
    .request()
    .input("channelId", sql.Int, channelId)
    .query("SELECT type FROM dbo.channels WHERE id = @channelId");
  const channelType: string | undefined = chanResult.recordset[0]?.type;
  if (channelType === "vagter") {
    const jwt = res.locals.jwt as { roles: string[] };
    const allowed =
      jwt.roles.includes("Administrator") ||
      jwt.roles.includes("Vagt") ||
      jwt.roles.includes("Tilskuer");
    if (!allowed) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

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

  // Parse @[Name](memberId) mentions and notify each mentioned member
  const mentionPattern = /@\[([^\]]+)\]\((\d+)\)/g;
  const mentionedIds = new Set<number>();
  let match: RegExpExecArray | null;
  while ((match = mentionPattern.exec(req.body.body ?? "")) !== null) {
    const mentionedId = Number(match[2]);
    const senderId: number | null = req.body.sender_id ?? null;
    if (mentionedId && mentionedId !== senderId) {
      mentionedIds.add(mentionedId);
    }
  }
  if (mentionedIds.size > 0) {
    const senderName: string = row.recordset[0]?.sender_name ?? "Nogen";
    await createNotificationForMany(
      Array.from(mentionedIds),
      "mentioned",
      `${senderName} nævnte dig i en besked`,
      "/member/profile",
    );
  }

  // Notify channel members about the new swap request (excluding sender)
  if (isSwap) {
    const senderId: number | null = req.body.sender_id ?? null;
    const nightName: string = row.recordset[0]?.shift_night_name ?? "en aften";
    const membersResult = await pool
      .request()
      .input("channelId", sql.Int, channelId)
      .query(
        "SELECT member_id FROM dbo.channel_members WHERE channel_id = @channelId",
      );
    const recipientIds: number[] = membersResult.recordset
      .map((r: { member_id: number }) => r.member_id)
      .filter((id: number) => id !== senderId);
    await createNotificationForMany(
      recipientIds,
      "swap_requested",
      `Ny vagtbytning tilgængelig`,
      "/member/schedule",
    );
  }

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

    // Notify the original sender that their swap was accepted
    if (req.body.swap_status === "taken") {
      const { sender_id: senderId, taken_by_name: takerName } =
        row.recordset[0] ?? {};
      if (senderId) {
        await createNotification(
          senderId,
          "swap_accepted",
          `Din vagtbytning blev accepteret${takerName ? ` af ${takerName}` : ""}`,
          "/member/schedule",
        );
      }
    } else if (req.body.swap_status === "cancelled") {
      // Notify channel members that a swap was cancelled
      const { sender_id: senderId } = row.recordset[0] ?? {};
      const membersResult = await pool
        .request()
        .input("channelId", sql.Int, channelId)
        .query(
          "SELECT member_id FROM dbo.channel_members WHERE channel_id = @channelId",
        );
      const recipientIds: number[] = membersResult.recordset
        .map((r: { member_id: number }) => r.member_id)
        .filter((id: number) => id !== senderId);
      await createNotificationForMany(
        recipientIds,
        "swap_cancelled",
        "En vagtbytning er blevet annulleret",
        "/member/schedule",
      );
    }

    return res.json(row.recordset[0]);
  },
);

export default router;
