import { Router } from "express";
import { readTable, writeTable } from "../db";
import { callerId, isAdmin, requireAdmin } from "../auth";

const router = Router();

interface DbClubNight {
  id: number;
  number: number;
  name: string;
  date: string;
  time_from: string;
  time_to: string;
  location: string;
  vagt_member_id: number | null;
  vagt_confirmed: boolean;
  created_at: string;
  updated_at: string;
}

interface DbMember {
  id: number;
  name: string;
  initials: string;
}

interface DbOptOut {
  id: number;
  club_night_id: number;
  member_id: number;
}

function enrich(n: DbClubNight, members: DbMember[], optOuts: DbOptOut[]) {
  const vagt = n.vagt_member_id
    ? members.find((m) => m.id === n.vagt_member_id)
    : null;
  const optedOutMembers = optOuts
    .filter((o) => o.club_night_id === n.id)
    .map((o) => {
      const m = members.find((mem) => mem.id === o.member_id);
      return m ? { id: m.id, name: m.name, initials: m.initials } : null;
    })
    .filter(Boolean) as { id: number; name: string; initials: string }[];
  return {
    ...n,
    assigned_member_name: vagt?.name ?? null,
    assigned_member_initials: vagt?.initials ?? null,
    opted_out_members: optedOutMembers,
  };
}

// GET /api/club-nights
router.get("/", (_req, res) => {
  const nights = readTable<DbClubNight>("club_nights").sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const members = readTable<DbMember>("members");
  const optOuts = readTable<DbOptOut>("club_night_opt_outs");
  res.json(nights.map((n) => enrich(n, members, optOuts)));
});

// POST /api/club-nights
router.post("/", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const nights = readTable<DbClubNight>("club_nights");
  const newId = nights.length ? Math.max(...nights.map((n) => n.id)) + 1 : 1;
  const newNumber = nights.length
    ? Math.max(...nights.map((n) => n.number)) + 1
    : 1;
  const now = new Date().toISOString();
  const night: DbClubNight = {
    id: newId,
    number: req.body.number ?? newNumber,
    name: req.body.name ?? `Klubaften #${newNumber}`,
    date: req.body.date,
    time_from: req.body.time_from ?? "18:00",
    time_to: req.body.time_to ?? "23:00",
    location: req.body.location ?? "Kulturhuset",
    vagt_member_id: req.body.vagt_member_id ?? null,
    vagt_confirmed: false,
    created_at: now,
    updated_at: now,
  };
  nights.push(night);
  writeTable("club_nights", nights);
  const members = readTable<DbMember>("members");
  const optOuts = readTable<DbOptOut>("club_night_opt_outs");
  return res.status(201).json(enrich(night, members, optOuts));
});

// PATCH /api/club-nights/:id  — update vagt_member_id
router.patch("/:id", (req, res) => {
  const caller = callerId(req);
  const assigning = req.body.vagt_member_id;
  // Allow if admin, or if a Vagt is assigning themselves (swap takeover)
  const selfAssign = typeof assigning === "number" && assigning === caller;
  if (!selfAssign && !isAdmin(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const nights = readTable<DbClubNight>("club_nights");
  const idx = nights.findIndex((n) => n.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: "Not found" });

  if ("vagt_member_id" in req.body && req.body.vagt_member_id !== null) {
    // Block assignment if member opted out
    const optOuts = readTable<DbOptOut>("club_night_opt_outs");
    const isOptedOut = optOuts.some(
      (o) =>
        o.club_night_id === nights[idx].id &&
        o.member_id === req.body.vagt_member_id,
    );
    if (isOptedOut) {
      return res.status(409).json({ error: "Vagt har meldt fra denne aften" });
    }
    // Reset confirmation if assigning a different person
    if (nights[idx].vagt_member_id !== req.body.vagt_member_id) {
      nights[idx].vagt_confirmed = false;
    }
    nights[idx].vagt_member_id = req.body.vagt_member_id;
  } else if ("vagt_member_id" in req.body) {
    nights[idx].vagt_member_id = req.body.vagt_member_id;
    nights[idx].vagt_confirmed = false;
  }

  nights[idx].updated_at = new Date().toISOString();

  writeTable("club_nights", nights);
  const members = readTable<DbMember>("members");
  const optOuts = readTable<DbOptOut>("club_night_opt_outs");
  return res.json(enrich(nights[idx], members, optOuts));
});

// POST /api/club-nights/:id/confirm — assigned vagt confirms their shift
router.post("/:id/confirm", (req, res) => {
  const caller = callerId(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });
  const nights = readTable<DbClubNight>("club_nights");
  const idx = nights.findIndex((n) => n.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const night = nights[idx];
  if (night.vagt_member_id !== caller && !isAdmin(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  nights[idx].vagt_confirmed = true;
  nights[idx].updated_at = new Date().toISOString();
  writeTable("club_nights", nights);
  const members = readTable<DbMember>("members");
  const optOuts = readTable<DbOptOut>("club_night_opt_outs");
  return res.json(enrich(nights[idx], members, optOuts));
});

// POST /api/club-nights/:id/opt-out — caller opts themselves out
router.post("/:id/opt-out", (req, res) => {
  const memberId = callerId(req);
  if (!memberId) return res.status(401).json({ error: "Unauthorized" });
  const nightId = Number(req.params.id);
  const nights = readTable<DbClubNight>("club_nights");
  if (!nights.find((n) => n.id === nightId)) {
    return res.status(404).json({ error: "Not found" });
  }
  const optOuts = readTable<DbOptOut>("club_night_opt_outs");
  const alreadyExists = optOuts.some(
    (o) => o.club_night_id === nightId && o.member_id === memberId,
  );
  if (alreadyExists) return res.status(200).json({ ok: true });
  const newId = optOuts.length ? Math.max(...optOuts.map((o) => o.id)) + 1 : 1;
  optOuts.push({ id: newId, club_night_id: nightId, member_id: memberId });
  writeTable("club_night_opt_outs", optOuts);
  return res.status(201).json({ ok: true });
});

// DELETE /api/club-nights/:id/opt-out — caller removes their own opt-out
router.delete("/:id/opt-out", (req, res) => {
  const memberId = callerId(req);
  if (!memberId) return res.status(401).json({ error: "Unauthorized" });
  const nightId = Number(req.params.id);
  const optOuts = readTable<DbOptOut>("club_night_opt_outs");
  const filtered = optOuts.filter(
    (o) => !(o.club_night_id === nightId && o.member_id === memberId),
  );
  writeTable("club_night_opt_outs", filtered);
  return res.status(200).json({ ok: true });
});

// DELETE /api/club-nights/:id — admin only
router.delete("/:id", (req, res) => {
  if (!requireAdmin(req, res)) return;
  const nightId = Number(req.params.id);
  const nights = readTable<DbClubNight>("club_nights");
  const idx = nights.findIndex((n) => n.id === nightId);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  nights.splice(idx, 1);
  writeTable("club_nights", nights);
  // Also clean up opt-outs for this night
  const optOuts = readTable<DbOptOut>("club_night_opt_outs");
  writeTable(
    "club_night_opt_outs",
    optOuts.filter((o) => o.club_night_id !== nightId),
  );
  return res.status(200).json({ ok: true });
});

export default router;
