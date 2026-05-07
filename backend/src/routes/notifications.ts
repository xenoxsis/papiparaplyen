import { Router, Request, Response } from "express";
import { getPool, sql } from "../db";
import { requireAuth, verifyToken } from "../auth";
import { callerId } from "../auth";
import { initSseResponse } from "../broadcaster";

const router = Router();

// GET /api/notifications/stream  — per-user SSE stream (auth via ?token=)
router.get("/stream", async (req: Request, res: Response) => {
  const token = req.query.token as string | undefined;
  const jwtPayload = token ? verifyToken(token) : null;
  if (!jwtPayload) {
    res.status(401).end();
    return;
  }

  const channelKey = `user:${jwtPayload.memberId}`;
  initSseResponse(channelKey, res, () => {
    /* cleanup handled inside */
  });
});

// GET /api/notifications  — fetch notifications for the calling user
router.get("/", requireAuth, async (_req, res) => {
  const memberId = callerId(res);
  if (!memberId) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  const result = await pool.request().input("memberId", sql.Int, memberId)
    .query(`
      SELECT TOP 50
        id, member_id, type, body, link, is_read, created_at
      FROM dbo.notifications
      WHERE member_id = @memberId
      ORDER BY created_at DESC
    `);

  const unreadCount = result.recordset.filter(
    (n: { is_read: boolean | number }) => !n.is_read,
  ).length;

  return res.json({
    notifications: result.recordset.map(
      (n: { is_read: boolean | number; [key: string]: unknown }) => ({
        ...n,
        is_read: n.is_read === true || n.is_read === 1,
      }),
    ),
    unreadCount,
  });
});

// PATCH /api/notifications/read-all  — mark all as read
router.patch("/read-all", requireAuth, async (_req, res) => {
  const memberId = callerId(res);
  if (!memberId) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .query(
      "UPDATE dbo.notifications SET is_read = 1 WHERE member_id = @memberId AND is_read = 0",
    );

  return res.json({ ok: true });
});

// PATCH /api/notifications/:id/read  — mark one as read
router.patch("/:id/read", requireAuth, async (req, res) => {
  const memberId = callerId(res);
  if (!memberId) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  await pool
    .request()
    .input("id", sql.Int, Number(req.params.id))
    .input("memberId", sql.Int, memberId)
    .query(
      "UPDATE dbo.notifications SET is_read = 1 WHERE id = @id AND member_id = @memberId",
    );

  return res.json({ ok: true });
});

export default router;
