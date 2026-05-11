import { Router } from "express";
import { getPool, sql } from "../db";
import { callerId, isAdmin, requireAuth } from "../auth";
import { broadcastToUser, getConnectedUserIds } from "../broadcaster";

const router = Router();

// POST /api/schedule-reviews — upsert reviewed_at for the calling member
router.post("/", requireAuth, async (req, res) => {
  const caller = callerId(res);
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

  // Enrich with member details for the broadcast
  const memberRow = await pool
    .request()
    .input("memberId", sql.Int, caller)
    .query("SELECT name, initials FROM dbo.members WHERE id = @memberId");
  const member = memberRow.recordset[0];
  const payload = {
    event: "schedule_updated",
    data: {
      type: "review_submitted",
      memberId: caller,
      memberName: member?.name ?? "",
      memberInitials: member?.initials ?? "",
      reviewedAt: now,
    },
  };
  for (const uid of getConnectedUserIds()) broadcastToUser(uid, payload);
  return res.json({ ok: true, reviewed_at: now });
});

// GET /api/schedule-reviews/me — returns the calling member's own review
router.get("/me", requireAuth, async (req, res) => {
  const caller = callerId(res);
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

// GET /api/schedule-reviews — admin only; enriched list of all reviews + virtual members
router.get("/", requireAuth, async (req, res) => {
  if (!isAdmin(res)) return res.status(403).json({ error: "Forbidden" });

  const pool = await getPool();

  // Real reviews
  const reviewsResult = await pool.request().query(`
    SELECT r.id, r.member_id, r.reviewed_at,
           m.name AS member_name, m.initials AS member_initials,
           0 AS is_virtual
    FROM dbo.club_schedule_reviews r
    JOIN dbo.members m ON m.id = r.member_id
  `);

  // Virtual members (they have no review rows — show as auto-approved)
  const virtualResult = await pool.request().query(`
    SELECT NULL AS id, m.id AS member_id, NULL AS reviewed_at,
           m.name AS member_name, m.initials AS member_initials,
           1 AS is_virtual
    FROM dbo.members m
    WHERE m.is_virtual = 1
  `);

  const combined = [
    ...reviewsResult.recordset,
    ...virtualResult.recordset,
  ].sort((a, b) => {
    // Virtual members last, then most-recently-reviewed first
    if (a.is_virtual !== b.is_virtual) return a.is_virtual ? 1 : -1;
    if (!a.reviewed_at) return 1;
    if (!b.reviewed_at) return -1;
    return String(b.reviewed_at).localeCompare(String(a.reviewed_at));
  });

  return res.json(combined);
});

export default router;
