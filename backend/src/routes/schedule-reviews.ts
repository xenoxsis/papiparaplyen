import { Router } from "express";
import { getPool, sql } from "../db";
import { callerId, isAdmin } from "../auth";

const router = Router();

// POST /api/schedule-reviews — upsert reviewed_at for the calling member
router.post("/", async (req, res) => {
  const caller = callerId(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  const now = new Date().toISOString();

  const existing = await pool
    .request()
    .input("memberId", sql.Int, caller)
    .query(
      "SELECT id FROM dbo.club_schedule_reviews WHERE member_id = @memberId",
    );

  if (existing.recordset.length > 0) {
    await pool
      .request()
      .input("reviewedAt", sql.DateTime2, now)
      .input("memberId", sql.Int, caller)
      .query(
        "UPDATE dbo.club_schedule_reviews SET reviewed_at = @reviewedAt WHERE member_id = @memberId",
      );
  } else {
    await pool
      .request()
      .input("memberId", sql.Int, caller)
      .input("reviewedAt", sql.DateTime2, now)
      .query(
        "INSERT INTO dbo.club_schedule_reviews (member_id, reviewed_at) VALUES (@memberId, @reviewedAt)",
      );
  }

  return res.json({ ok: true, reviewed_at: now });
});

// GET /api/schedule-reviews/me — returns the calling member's own review
router.get("/me", async (req, res) => {
  const caller = callerId(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  const result = await pool
    .request()
    .input("memberId", sql.Int, caller)
    .query(
      "SELECT id, member_id, reviewed_at FROM dbo.club_schedule_reviews WHERE member_id = @memberId",
    );

  return res.json(result.recordset[0] ?? null);
});

// GET /api/schedule-reviews — admin only; enriched list of all reviews
router.get("/", async (req, res) => {
  if (!(await isAdmin(req)))
    return res.status(403).json({ error: "Forbidden" });

  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT r.id, r.member_id, r.reviewed_at,
           m.name AS member_name, m.initials AS member_initials
    FROM dbo.club_schedule_reviews r
    JOIN dbo.members m ON m.id = r.member_id
    ORDER BY r.reviewed_at DESC
  `);

  return res.json(result.recordset);
});

export default router;
