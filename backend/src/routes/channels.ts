import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { getPool, sql } from "../db";
import { requireAuth, verifyToken, extractToken } from "../auth";
import {
  broadcast,
  getConnectedUserIds,
  initSseResponse,
} from "../broadcaster";
import {
  createNotification,
  createNotificationForMany,
} from "../notifications";
import { sendMentionEmail } from "../scheduleEmails";

const router = Router();

const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "For mange beskeder, prøv igen om lidt" },
});

/** Wraps an async route handler so unhandled errors are forwarded via next(). */
const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

/** Broadcast a chat event to all currently-connected member user-streams. */
function broadcastChatMessage(
  channelId: number,
  message: unknown,
  event:
    | "chat_message"
    | "message_edited"
    | "message_deleted"
    | "typing" = "chat_message",
) {
  const payload = { event, data: { channelId, message } };
  for (const id of getConnectedUserIds()) {
    broadcast(`user:${id}`, payload);
  }
}

// GET /api/channels/:id/stream  — SSE endpoint
router.get("/:id/stream", async (req: Request, res: Response) => {
  const channelId = Number(req.params.id);

  // Auth via cookie or Authorization header
  const token = extractToken(req);
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

  const lastEventId = req.headers["last-event-id"]
    ? Number(req.headers["last-event-id"])
    : undefined;

  initSseResponse(
    channelId,
    res,
    () => {
      /* cleanup handled inside */
    },
    lastEventId,
  );
});

// GET /api/channels
router.get(
  "/",
  requireAuth,
  asyncRoute(async (_req, res) => {
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
  }),
);

// GET /api/channels/:id/members  — list members in a channel
router.get(
  "/:id/members",
  requireAuth,
  asyncRoute(async (req, res) => {
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
      JOIN dbo.channel_members cm ON cm.member_id = m.id
      LEFT JOIN dbo.users u ON u.member_id = m.id
      WHERE cm.channel_id = @channelId
        AND ISNULL(u.banned, 0) = 0
      ORDER BY m.name
    `);

    res.json(result.recordset);
  }),
);

// GET /api/channels/:id/messages
router.get(
  "/:id/messages",
  requireAuth,
  asyncRoute(async (req, res) => {
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
             m.edited_at, m.is_deleted,
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
  }),
);

// POST /api/channels/:id/messages
router.post(
  "/:id/messages",
  requireAuth,
  messageLimiter,
  asyncRoute(async (req, res) => {
    const pool = await getPool();
    const channelId = Number(req.params.id);
    const senderId = (res.locals.jwt as { memberId: number }).memberId;
    const isSwap = req.body.type === "shift_swap";

    // Role-gate vagter channel for writes
    const chanTypeResult = await pool
      .request()
      .input("channelId", sql.Int, channelId)
      .query("SELECT type FROM dbo.channels WHERE id = @channelId");
    const chanType: string | undefined = chanTypeResult.recordset[0]?.type;
    if (chanType === "vagter") {
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

    // ── Input validation ───────────────────────────────────────────────
    const rawBody: unknown = req.body.body;
    if (typeof rawBody !== "string" || rawBody.trim().length === 0) {
      res
        .status(400)
        .json({ error: "Message body must be a non-empty string" });
      return;
    }
    const MAX_LENGTH = 4_000;
    if (rawBody.length > MAX_LENGTH) {
      res.status(400).json({
        error: `Message body must be at most ${MAX_LENGTH} characters`,
      });
      return;
    }
    // Sanitise: trim edges, strip null bytes
    const sanitisedBody = rawBody.trim().replace(/\0/g, "");

    const insertResult = await pool
      .request()
      .input("channelId", sql.Int, channelId)
      .input("senderId", sql.Int, senderId)
      .input("body", sql.NVarChar(sql.MAX), sanitisedBody)
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
             m.edited_at, m.is_deleted,
             m.type, m.shift_night_id, m.swap_status, m.taken_by_member_id,
             s.name AS sender_name, s.initials AS sender_initials,
             NULL AS taken_by_name, NULL AS taken_by_initials
      FROM dbo.messages m
      LEFT JOIN dbo.members s ON s.id = m.sender_id
      WHERE m.id = @id
    `);

    broadcast(channelId, { event: "message", data: row.recordset[0] });
    broadcastChatMessage(channelId, row.recordset[0]);

    // Parse @[Name](memberId) mentions and notify each mentioned member
    const mentionPattern = /@\[([^\]]+)\]\((\d+)\)/g;
    const mentionedIds = new Set<number>();
    let match: RegExpExecArray | null;
    while ((match = mentionPattern.exec(sanitisedBody ?? "")) !== null) {
      const mentionedId = Number(match[2]);
      if (mentionedId && mentionedId !== senderId) {
        mentionedIds.add(mentionedId);
      }
    }
    if (mentionedIds.size > 0) {
      const senderName: string = row.recordset[0]?.sender_name ?? "Nogen";
      // Fetch channel name for the mention email
      const chanNameResult = await pool
        .request()
        .input("channelId", sql.Int, channelId)
        .query("SELECT name FROM dbo.channels WHERE id = @channelId");
      const channelName: string =
        chanNameResult.recordset[0]?.name ?? "kanalen";
      const messageBody: string = req.body.body ?? "";
      await createNotificationForMany(
        Array.from(mentionedIds),
        "mentioned",
        `${senderName} n\u00e6vnte dig i en besked`,
        "/member/dashboard",
      );
      // Send mention email to each mentioned member (respects email_on_mention pref)
      for (const mentionedId of mentionedIds) {
        sendMentionEmail(
          mentionedId,
          senderName,
          channelName,
          messageBody,
        ).catch((err) =>
          console.error("[channels] mention email failed:", err),
        );
      }
    }

    // Notify channel members about the new swap request (excluding sender)
    if (isSwap) {
      const nightName: string =
        row.recordset[0]?.shift_night_name ?? "en aften";
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
  }),
);

// PATCH /api/channels/:channelId/messages/:messageId
router.patch(
  "/:channelId/messages/:messageId",
  requireAuth,
  asyncRoute(async (req, res) => {
    const pool = await getPool();
    const messageId = Number(req.params.messageId);
    const channelId = Number(req.params.channelId);
    const callerId = (res.locals.jwt as { memberId: number }).memberId;

    const check = await pool
      .request()
      .input("id", sql.Int, messageId)
      .input("channelId", sql.Int, channelId)
      .query(
        "SELECT sender_id FROM dbo.messages WHERE id=@id AND channel_id=@channelId",
      );
    if (check.recordset.length === 0)
      return res.status(404).json({ error: "Not found" });

    // Body edits are owner-only
    const isBodyEdit =
      req.body.body !== undefined && req.body.swap_status === undefined;
    if (isBodyEdit && check.recordset[0].sender_id !== callerId)
      return res.status(403).json({ error: "Forbidden" });

    // swap_status / taken_by_member_id: only the taker or the original sender (or admin) may change
    const isSwapPatch =
      req.body.swap_status !== undefined || "taken_by_member_id" in req.body;
    if (isSwapPatch) {
      const originalSenderId: number | null =
        check.recordset[0].sender_id ?? null;
      const takenById: number | null = req.body.taken_by_member_id ?? null;
      const jwt = res.locals.jwt as { roles: string[]; memberId: number };
      const callerIsAdmin = jwt.roles.includes("Administrator");
      const callerIsOriginalSender = callerId === originalSenderId;
      // Taker: caller sets themselves as taken_by_member_id and status=taken
      const callerIsTaker =
        req.body.swap_status === "taken" && takenById === callerId;
      // Cancellation: only the original sender or admin
      const callerIsCancelling =
        req.body.swap_status === "cancelled" && callerIsOriginalSender;
      if (!callerIsAdmin && !callerIsTaker && !callerIsCancelling) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    const setParts: string[] = [];
    const request = pool
      .request()
      .input("id", sql.Int, messageId)
      .input("channelId", sql.Int, channelId);

    if (req.body.body !== undefined) {
      // Validate and sanitise edited body
      const rawBody: unknown = req.body.body;
      if (typeof rawBody !== "string" || rawBody.trim().length === 0)
        return res
          .status(400)
          .json({ error: "Message body must be a non-empty string" });
      if (rawBody.length > 4_000)
        return res
          .status(400)
          .json({ error: "Message body must be at most 4000 characters" });
      const sanitised = rawBody.trim().replace(/\0/g, "");
      request.input("body", sql.NVarChar(sql.MAX), sanitised);
      setParts.push("body = @body");
      if (isBodyEdit) {
        request.input("editedAt", sql.DateTime2, new Date().toISOString());
        setParts.push("edited_at = @editedAt");
      }
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
             m.edited_at, m.is_deleted,
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
    broadcastChatMessage(
      channelId,
      row.recordset[0],
      isBodyEdit ? "message_edited" : "chat_message",
    );

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
  }),
);

// DELETE /api/channels/:channelId/messages/:messageId  — soft delete (owner only)
router.delete(
  "/:channelId/messages/:messageId",
  requireAuth,
  asyncRoute(async (req, res) => {
    const pool = await getPool();
    const messageId = Number(req.params.messageId);
    const channelId = Number(req.params.channelId);
    const callerId = (res.locals.jwt as { memberId: number }).memberId;

    const check = await pool
      .request()
      .input("id", sql.Int, messageId)
      .input("channelId", sql.Int, channelId)
      .query(
        "SELECT sender_id FROM dbo.messages WHERE id=@id AND channel_id=@channelId",
      );
    if (check.recordset.length === 0)
      return res.status(404).json({ error: "Not found" });
    if (check.recordset[0].sender_id !== callerId)
      return res.status(403).json({ error: "Forbidden" });

    await pool
      .request()
      .input("id", sql.Int, messageId)
      .query(
        "UPDATE dbo.messages SET is_deleted = 1, body = NULL WHERE id = @id",
      );

    const row = await pool.request().input("id", sql.Int, messageId).query(`
      SELECT m.id, m.channel_id, m.sender_id, m.body, m.sent_at,
             m.edited_at, m.is_deleted,
             m.type, m.shift_night_id, m.swap_status, m.taken_by_member_id,
             s.name AS sender_name, s.initials AS sender_initials,
             t.name AS taken_by_name, t.initials AS taken_by_initials
      FROM dbo.messages m
      LEFT JOIN dbo.members s ON s.id = m.sender_id
      LEFT JOIN dbo.members t ON t.id = m.taken_by_member_id
      WHERE m.id = @id
    `);

    broadcast(channelId, { event: "message", data: row.recordset[0] });
    broadcastChatMessage(channelId, row.recordset[0], "message_deleted");

    return res.json(row.recordset[0]);
  }),
);

// POST /api/channels/:id/typing  — ephemeral typing indicator (no DB write)
router.post(
  "/:id/typing",
  requireAuth,
  asyncRoute(async (req, res) => {
    const channelId = Number(req.params.id);
    const { memberId } = res.locals.jwt as { memberId: number };
    const senderName: string = (req.body.name as string | undefined) ?? "Nogen";
    // Broadcast flat typing event — no DB, no message wrapper
    const payload = {
      event: "typing",
      data: { channelId, memberId, name: senderName },
    };
    for (const uid of getConnectedUserIds()) {
      broadcast(`user:${uid}`, payload);
    }
    return res.status(204).end();
  }),
);

// GET /api/channels/:id/last-read  — fetch caller's last-read position for this channel
router.get(
  "/:id/last-read",
  requireAuth,
  asyncRoute(async (req, res) => {
    const pool = await getPool();
    const channelId = Number(req.params.id);
    const memberId = (res.locals.jwt as { memberId: number }).memberId;

    const result = await pool
      .request()
      .input("memberId", sql.Int, memberId)
      .input("channelId", sql.Int, channelId)
      .query(
        "SELECT last_message_id FROM dbo.message_last_read WHERE member_id=@memberId AND channel_id=@channelId",
      );

    return res.json({
      last_message_id: (result.recordset[0]?.last_message_id as number) ?? 0,
    });
  }),
);

// POST /api/channels/:id/mark-read  — upsert last-read position
router.post(
  "/:id/mark-read",
  requireAuth,
  asyncRoute(async (req, res) => {
    const pool = await getPool();
    const channelId = Number(req.params.id);
    const memberId = (res.locals.jwt as { memberId: number }).memberId;
    const messageId = Number(req.body.message_id);
    if (!messageId)
      return res.status(400).json({ error: "message_id required" });

    await pool
      .request()
      .input("memberId", sql.Int, memberId)
      .input("channelId", sql.Int, channelId)
      .input("messageId", sql.Int, messageId)
      .input("now", sql.DateTime2, new Date().toISOString()).query(`
        MERGE dbo.message_last_read AS target
        USING (SELECT @memberId AS member_id, @channelId AS channel_id) AS source
          ON target.member_id = source.member_id AND target.channel_id = source.channel_id
        WHEN MATCHED AND @messageId > target.last_message_id THEN
          UPDATE SET last_message_id = @messageId, updated_at = @now
        WHEN NOT MATCHED THEN
          INSERT (member_id, channel_id, last_message_id, updated_at)
          VALUES (@memberId, @channelId, @messageId, @now);
      `);

    return res.json({ ok: true });
  }),
);

export default router;
