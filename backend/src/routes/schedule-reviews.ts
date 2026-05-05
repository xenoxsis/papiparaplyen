import { Router } from "express";
import { readTable, writeTable } from "../db";
import { callerId, isAdmin } from "../auth";

const router = Router();

interface DbScheduleReview {
  id: number;
  member_id: number;
  reviewed_at: string;
}

interface DbMember {
  id: number;
  name: string;
  initials: string;
}

// POST /api/schedule-reviews — upsert reviewed_at for the calling member
router.post("/", (req, res) => {
  const caller = callerId(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  const reviews = readTable<DbScheduleReview>("club_schedule_reviews");
  const now = new Date().toISOString();
  const existing = reviews.findIndex((r) => r.member_id === caller);
  if (existing !== -1) {
    reviews[existing].reviewed_at = now;
  } else {
    const newId = reviews.length
      ? Math.max(...reviews.map((r) => r.id)) + 1
      : 1;
    reviews.push({ id: newId, member_id: caller, reviewed_at: now });
  }
  writeTable("club_schedule_reviews", reviews);
  return res.json({ ok: true, reviewed_at: now });
});

// GET /api/schedule-reviews/me — returns the calling member's own review
router.get("/me", (req, res) => {
  const caller = callerId(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });
  const reviews = readTable<DbScheduleReview>("club_schedule_reviews");
  const review = reviews.find((r) => r.member_id === caller) ?? null;
  return res.json(review);
});

// GET /api/schedule-reviews — admin only; enriched list of all reviews
router.get("/", (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Forbidden" });
  const reviews = readTable<DbScheduleReview>("club_schedule_reviews");
  const members = readTable<DbMember>("members");
  const enriched = reviews.map((r) => {
    const m = members.find((mem) => mem.id === r.member_id);
    return {
      ...r,
      member_name: m?.name ?? null,
      member_initials: m?.initials ?? null,
    };
  });
  return res.json(enriched);
});

export default router;
