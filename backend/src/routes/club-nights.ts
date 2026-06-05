import { Router } from "express";
import { getPool, sql } from "../db";
import {
  callerId,
  isAdmin,
  requireAdmin,
  requireAuth,
  extractToken,
  verifyToken,
} from "../auth";
import {
  createNotification,
  createNotificationForMany,
} from "../notifications";
import {
  queueNewNightEmail,
  sendShiftAssignedEmail,
  sendShiftUnassignedEmail,
  sendShiftDeletedEmail,
  sendShiftCancelledEmail,
  sendFollowerChangedEmails,
  sendFollowerDeletedEmails,
  sendFollowerCancelledEmails,
} from "../scheduleEmails";
import { logEvent } from "../audit";
import { broadcastToUser, getConnectedUserIds } from "../broadcaster";
import { buildIcal, type IcalEvent } from "../ical";

const router = Router();

type NightRow = {
  id: number;
  number: number;
  name: string;
  date: string;
  time_from: string;
  time_to: string;
  location: string;
  location_id: number | null;
  location_name: string | null;
  location_address: string | null;
  vagt_member_id: number | null;
  vagt_confirmed: boolean;
  cancelled: boolean;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  assigned_member_name: string | null;
  assigned_member_initials: string | null;
  vagt_member_has_avatar: boolean | number;
  status: string;
};

async function fetchNightWithOptOuts(
  pool: Awaited<ReturnType<typeof getPool>>,
  nightId: number,
) {
  const nightResult = await pool.request().input("id", sql.Int, nightId).query(`
      SELECT n.id, n.number, n.name,
             CONVERT(varchar(10), n.date, 120) AS date,
             n.time_from, n.time_to, n.location,
             n.location_id, l.name AS location_name, l.address AS location_address,
             n.vagt_member_id, n.vagt_confirmed,
             n.cancelled, n.cancelled_at,
             n.created_at, n.updated_at,
             vm.name AS assigned_member_name,
             vm.initials AS assigned_member_initials,
             CASE WHEN ma.member_id IS NOT NULL THEN 1 ELSE 0 END AS vagt_member_has_avatar,
             n.[status]
      FROM dbo.club_nights n
      LEFT JOIN dbo.members vm ON vm.id = n.vagt_member_id
      LEFT JOIN dbo.locations l ON l.id = n.location_id
      LEFT JOIN dbo.member_avatars ma ON ma.member_id = n.vagt_member_id
      WHERE n.id = @id
    `);

  const optOutsResult = await pool.request().input("nightId", sql.Int, nightId)
    .query(`
      SELECT m.id, m.name, m.initials
      FROM dbo.club_night_opt_outs o
      JOIN dbo.members m ON m.id = o.member_id
      WHERE o.club_night_id = @nightId
    `);

  const row = nightResult.recordset[0];
  return {
    ...row,
    vagt_confirmed: row.vagt_confirmed === true || row.vagt_confirmed === 1,
    cancelled: row.cancelled === true || row.cancelled === 1,
    vagt_member_has_avatar:
      row.vagt_member_has_avatar === true || row.vagt_member_has_avatar === 1,
    opted_out_members: optOutsResult.recordset,
  };
}

// GET /api/club-nights
// ?upcoming=true  — only return nights with date >= today (DB-side filter)
router.get("/", async (req, res) => {
  const upcomingOnly = req.query.upcoming === "true";

  // Administrators see all nights (including drafts); everyone else only sees published ones.
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;
  const callerIsAdmin = payload?.roles.includes("Administrator") ?? false;

  const draftFilter = callerIsAdmin ? "" : "AND n.[status] = N'published'";
  const dateFilter = upcomingOnly
    ? "AND n.date >= CAST(GETDATE() AS DATE)"
    : "";
  const whereClause =
    draftFilter || dateFilter ? `WHERE 1=1 ${draftFilter} ${dateFilter}` : "";

  const pool = await getPool();
  const nightsResult = await pool.request().query(`
    SELECT n.id, n.number, n.name,
           CONVERT(varchar(10), n.date, 120) AS date,
           n.time_from, n.time_to, n.location,
           n.location_id, l.name AS location_name, l.address AS location_address,
           n.vagt_member_id, n.vagt_confirmed,
           n.cancelled, n.cancelled_at,
           n.created_at, n.updated_at,
           vm.name AS assigned_member_name,
           vm.initials AS assigned_member_initials,
           CASE WHEN ma.member_id IS NOT NULL THEN 1 ELSE 0 END AS vagt_member_has_avatar,
           n.[status]
    FROM dbo.club_nights n
    LEFT JOIN dbo.members vm ON vm.id = n.vagt_member_id
    LEFT JOIN dbo.locations l ON l.id = n.location_id
    LEFT JOIN dbo.member_avatars ma ON ma.member_id = n.vagt_member_id
    ${whereClause}
    ORDER BY n.date
  `);

  const optOutsResult = await pool.request().query(`
    SELECT o.club_night_id, m.id, m.name, m.initials
    FROM dbo.club_night_opt_outs o
    JOIN dbo.members m ON m.id = o.member_id
    ${upcomingOnly ? "WHERE o.club_night_id IN (SELECT id FROM dbo.club_nights WHERE date >= CAST(GETDATE() AS DATE))" : ""}
  `);

  const nights = nightsResult.recordset.map((n: NightRow) => ({
    ...n,
    vagt_confirmed:
      n.vagt_confirmed === true || (n.vagt_confirmed as unknown) === 1,
    cancelled: n.cancelled === true || (n.cancelled as unknown) === 1,
    vagt_member_has_avatar:
      n.vagt_member_has_avatar === true ||
      (n.vagt_member_has_avatar as unknown) === 1,
    opted_out_members: optOutsResult.recordset
      .filter((o: { club_night_id: number }) => o.club_night_id === n.id)
      .map(
        (o: {
          club_night_id: number;
          id: number;
          name: string;
          initials: string;
        }) => ({
          id: o.id,
          name: o.name,
          initials: o.initials,
        }),
      ),
  }));

  res.json(nights);
});

// GET /api/club-nights/ical  — public subscription feed (all future confirmed nights)
router.get("/ical", async (_req, res) => {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT n.id, n.name,
           CONVERT(varchar(10), n.date, 120) AS date,
           n.time_from, n.time_to,
           ISNULL(l.name + N', ' + l.address, n.location) AS location,
           n.updated_at
    FROM dbo.club_nights n
    LEFT JOIN dbo.locations l ON l.id = n.location_id
    WHERE n.date >= CAST(GETDATE() AS DATE)
      AND n.[status] = N'published'
      AND n.vagt_confirmed = 1
      AND n.cancelled = 0
    ORDER BY n.date
  `);

  const events: IcalEvent[] = result.recordset.map(
    (n: {
      id: number;
      name: string;
      date: string;
      time_from: string;
      time_to: string;
      location: string;
      updated_at: string;
    }) => ({
      uid: `clubnight-${n.id}@paraplyen`,
      summary: n.name,
      location: n.location ?? "",
      date: n.date,
      timeFrom: n.time_from,
      timeTo: n.time_to,
      updatedAt: n.updated_at,
    }),
  );

  const ical = buildIcal("Esbjerg Br\u00e6tspil - Arrangementer", events);
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="klubaftener.ics"'); // Public feed: allow CDNs and calendar app proxies to cache for 1 hour
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.send(ical);
});

// GET /api/club-nights/ical/me?token=<ical_token>  — personal vagter shift feed
// Uses a secret token stored in dbo.users instead of the session cookie
// because calendar clients cannot send cookies.
router.get("/ical/me", async (req, res) => {
  const { token } = req.query as Record<string, string | undefined>;
  if (!token || typeof token !== "string") {
    res.status(401).json({ error: "token required" });
    return;
  }

  const pool = await getPool();
  const tokenResult = await pool
    .request()
    .input("token", sql.NVarChar(64), token).query(`
      SELECT u.member_id, u.banned, m.name
      FROM dbo.users u
      JOIN dbo.members m ON m.id = u.member_id
      WHERE u.ical_token = @token
    `);

  if (tokenResult.recordset.length === 0) {
    res.status(401).end();
    return;
  }
  const row = tokenResult.recordset[0];
  if (row.banned) {
    res.status(403).end();
    return;
  }

  const memberId: number = row.member_id;
  const memberName: string = row.name;

  const shiftsResult = await pool.request().input("memberId", sql.Int, memberId)
    .query(`
      SELECT n.id, n.name,
             CONVERT(varchar(10), n.date, 120) AS date,
             n.time_from, n.time_to,
             ISNULL(l.name + N', ' + l.address, n.location) AS location,
             n.updated_at
      FROM dbo.club_nights n
      LEFT JOIN dbo.locations l ON l.id = n.location_id
      WHERE n.vagt_member_id = @memberId
        AND n.cancelled = 0
      ORDER BY n.date
    `);

  const events: IcalEvent[] = shiftsResult.recordset.map(
    (n: {
      id: number;
      name: string;
      date: string;
      time_from: string;
      time_to: string;
      location: string;
      updated_at: string;
    }) => ({
      uid: `shift-${n.id}@paraplyen`,
      summary: `Vagt \u2013 ${n.name}`,
      location: n.location ?? "",
      date: n.date,
      timeFrom: n.time_from,
      timeTo: n.time_to,
      updatedAt: n.updated_at,
      description: `Vagt - ${memberName}`,
    }),
  );

  const ical = buildIcal("Esbjerg Br\u00e6tspil - Vagter", events);
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="mine-vagter.ics"'); // Private feed: client may cache but proxies must not share between users
  res.setHeader("Cache-Control", "private, max-age=3600");
  return res.send(ical);
});

// GET /api/club-nights/following — returns IDs of nights the current user follows.
// Returns [] without error if not authenticated (public page friendly).
router.get("/following", async (req, res) => {
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload) return res.json([]);

  const pool = await getPool();
  const result = await pool
    .request()
    .input("memberId", sql.Int, payload.memberId)
    .query(
      "SELECT club_night_id AS id FROM dbo.club_night_followers WHERE member_id = @memberId",
    );
  return res.json(result.recordset.map((r: { id: number }) => r.id));
});

// POST /api/club-nights/:id/follow
router.post("/:id/follow", requireAuth, async (req, res) => {
  const memberId = callerId(res);
  const nightId = Number(req.params.id);
  const pool = await getPool();

  const nightCheck = await pool
    .request()
    .input("id", sql.Int, nightId)
    .query("SELECT id, cancelled FROM dbo.club_nights WHERE id = @id");
  if (nightCheck.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });

  const isNightCancelled =
    nightCheck.recordset[0].cancelled === true ||
    nightCheck.recordset[0].cancelled === 1;
  if (isNightCancelled)
    return res.status(400).json({ error: "Cannot follow a cancelled night" });

  // Upsert — silently succeeds if already following
  await pool
    .request()
    .input("nightId", sql.Int, nightId)
    .input("memberId", sql.Int, memberId).query(`
      IF NOT EXISTS (
        SELECT 1 FROM dbo.club_night_followers
        WHERE club_night_id = @nightId AND member_id = @memberId
      )
        INSERT INTO dbo.club_night_followers (club_night_id, member_id)
        VALUES (@nightId, @memberId)
    `);

  return res.status(201).json({ ok: true });
});

// DELETE /api/club-nights/:id/follow
router.delete("/:id/follow", requireAuth, async (req, res) => {
  const memberId = callerId(res);
  const nightId = Number(req.params.id);
  const pool = await getPool();

  await pool
    .request()
    .input("nightId", sql.Int, nightId)
    .input("memberId", sql.Int, memberId)
    .query(
      "DELETE FROM dbo.club_night_followers WHERE club_night_id = @nightId AND member_id = @memberId",
    );

  return res.status(200).json({ ok: true });
});

// POST /api/club-nights
router.post("/", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const pool = await getPool();
  const now = new Date().toISOString();

  const newFrom: string = req.body.time_from ?? "18:00";
  const newTo: string = req.body.time_to ?? "23:00";

  // ── Same-day conflict handling ────────────────────────────────────────────
  // A live (non-cancelled) night on this date blocks creation, exactly as
  // before. Cancelled nights whose times overlap the new one are overwritten
  // (deleted); non-overlapping cancelled nights are kept so the schedule
  // history stays visible (e.g. a cancelled late shift when adding an early one).
  // Times are "HH:MM" (zero-padded) so string compare is chronological.
  const sameDay = await pool
    .request()
    .input("date", sql.Date, req.body.date)
    .query(
      "SELECT id, cancelled, time_from, time_to FROM dbo.club_nights WHERE date = @date",
    );

  const isRowCancelled = (r: { cancelled: boolean | number }) =>
    r.cancelled === true || r.cancelled === 1;

  if (sameDay.recordset.some((r: NightRow) => !isRowCancelled(r))) {
    return res
      .status(409)
      .json({ error: "Der er allerede en klubaften på denne dato" });
  }

  const replacedCancelledIds: number[] = sameDay.recordset
    .filter(
      (r: { time_from: string; time_to: string; cancelled: boolean | number }) =>
        isRowCancelled(r) && r.time_from < newTo && r.time_to > newFrom,
    )
    .map((r: { id: number }) => r.id);

  // Get next number
  const maxResult = await pool
    .request()
    .query(
      "SELECT ISNULL(MAX(number),0)+1 AS next_number, ISNULL(MAX(id),0)+1 AS next_id FROM dbo.club_nights",
    );
  const nextNumber: number =
    req.body.number ?? maxResult.recordset[0].next_number;

  // Resolve location_id and legacy location text
  const locationId: number | null = req.body.location_id ?? null;
  let locationText: string = req.body.location ?? "";
  if (locationId) {
    const locResult = await pool
      .request()
      .input("lid", sql.Int, locationId)
      .query("SELECT name, address FROM dbo.locations WHERE id = @lid");
    if (locResult.recordset.length > 0) {
      const loc = locResult.recordset[0];
      locationText = `${loc.name}, ${loc.address}`;
    }
  }
  if (!locationText) locationText = "Kulturhuset";

  // Delete the overwritten cancelled nights and insert the new one atomically.
  // The cancelled nights already notified their vagt/followers at cancel time,
  // so this is a silent cleanup. opt_outs have no cascade (delete manually);
  // followers cascade with the night.
  const tx = pool.transaction();
  await tx.begin();
  try {
    for (const id of replacedCancelledIds) {
      await tx
        .request()
        .input("id", sql.Int, id)
        .query("DELETE FROM dbo.club_night_opt_outs WHERE club_night_id = @id");
      await tx
        .request()
        .input("id", sql.Int, id)
        .query("DELETE FROM dbo.club_nights WHERE id = @id");
    }

    const insertResult = await tx
      .request()
      .input("number", sql.Int, nextNumber)
      .input("name", sql.NVarChar, req.body.name ?? "Klubaften")
      .input("date", sql.Date, req.body.date)
      .input("timeFrom", sql.NVarChar, newFrom)
      .input("timeTo", sql.NVarChar, newTo)
      .input("location", sql.NVarChar, locationText)
      .input("locationId", sql.Int, locationId)
      .input("vagtMemberId", sql.Int, req.body.vagt_member_id ?? null)
      .input("createdAt", sql.DateTime2, now)
      .input("updatedAt", sql.DateTime2, now).query(`
        INSERT INTO dbo.club_nights
          (number, name, date, time_from, time_to, location, location_id, vagt_member_id, vagt_confirmed, [status], created_at, updated_at)
        OUTPUT INSERTED.id
        VALUES (@number, @name, @date, @timeFrom, @timeTo, @location, @locationId, @vagtMemberId, 0, N'draft', @createdAt, @updatedAt)
      `);

    await tx.commit();

    const newId: number = insertResult.recordset[0].id;
    const night = await fetchNightWithOptOuts(pool, newId);

    // Night is created in draft mode — notifications and emails are sent only
    // when all drafts are published via POST /api/club-nights/publish-drafts.

    logEvent({
      eventType: "shift.create",
      actorMemberId: callerId(res),
      detail: {
        nightId: newId,
        name: night.name,
        date: night.date,
        replacedCancelledIds,
      },
    });

    return res
      .status(201)
      .json({ ...night, replaced_cancelled_ids: replacedCancelledIds });
  } catch (err) {
    await tx.rollback();
    console.error("[club-nights] create failed:", err);
    return res.status(500).json({ error: "Kunne ikke oprette klubaften" });
  }
});

// PATCH /api/club-nights/:id  — update vagt_member_id / vagt_confirmed
router.patch("/:id", requireAuth, async (req, res) => {
  const caller = callerId(res);
  const assigning = req.body.vagt_member_id;
  const selfAssign = typeof assigning === "number" && assigning === caller;
  if (!selfAssign && !isAdmin(res)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const pool = await getPool();
  const nightId = Number(req.params.id);

  const nightCheck = await pool
    .request()
    .input("id", sql.Int, nightId)
    .query("SELECT vagt_member_id FROM dbo.club_nights WHERE id = @id");
  if (nightCheck.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });

  if ("vagt_member_id" in req.body && req.body.vagt_member_id !== null) {
    // Block if opted out
    const optCheck = await pool
      .request()
      .input("nightId", sql.Int, nightId)
      .input("memberId", sql.Int, req.body.vagt_member_id)
      .query(
        "SELECT 1 FROM dbo.club_night_opt_outs WHERE club_night_id=@nightId AND member_id=@memberId",
      );
    if (optCheck.recordset.length > 0) {
      return res.status(409).json({ error: "Vagt har meldt fra denne aften" });
    }
    const currentVagt = nightCheck.recordset[0].vagt_member_id;
    const isChanging = currentVagt !== req.body.vagt_member_id;

    // Check if the newly assigned member is virtual (auto-confirm)
    const virtualCheck = await pool
      .request()
      .input("memberId", sql.Int, req.body.vagt_member_id)
      .query("SELECT is_virtual FROM dbo.members WHERE id = @memberId");
    const assigneeIsVirtual =
      virtualCheck.recordset[0]?.is_virtual === true ||
      virtualCheck.recordset[0]?.is_virtual === 1;

    await pool
      .request()
      .input("vagtMemberId", sql.Int, req.body.vagt_member_id)
      // Virtual members always get vagt_confirmed=1; changing to a real member → reset to 0
      .input(
        "newConfirmed",
        sql.Bit,
        assigneeIsVirtual ? 1 : isChanging ? 0 : -1,
      )
      .input("updatedAt", sql.DateTime2, new Date().toISOString())
      .input("id", sql.Int, nightId).query(`
        UPDATE dbo.club_nights
        SET vagt_member_id = @vagtMemberId,
            vagt_confirmed = CASE
              WHEN @newConfirmed = -1 THEN vagt_confirmed
              ELSE @newConfirmed
            END,
            updated_at = @updatedAt
        WHERE id = @id
      `);

    // Skip assignment notifications/emails for virtual members
    // But still notify any real previous vagt who is being unassigned
    if (assigneeIsVirtual && isChanging) {
      const updatedNight = await fetchNightWithOptOuts(pool, nightId);
      const previousVagtId = nightCheck.recordset[0].vagt_member_id as
        | number
        | null;
      if (previousVagtId !== null) {
        // Check if previous vagt was also virtual
        const prevVirtualCheck = await pool
          .request()
          .input("memberId", sql.Int, previousVagtId)
          .query("SELECT is_virtual FROM dbo.members WHERE id = @memberId");
        const prevIsVirtual =
          prevVirtualCheck.recordset[0]?.is_virtual === true ||
          prevVirtualCheck.recordset[0]?.is_virtual === 1;
        if (!prevIsVirtual) {
          await createNotification(
            previousVagtId,
            "shift_unassigned",
            `Du er blevet fjernet fra vagten: ${updatedNight.name}`,
            "/member/schedule",
          );
          sendShiftUnassignedEmail(
            previousVagtId,
            {
              name: updatedNight.name,
              date: updatedNight.date,
              time_from: updatedNight.time_from,
              time_to: updatedNight.time_to,
              location: updatedNight.location,
            },
            callerId(res),
          ).catch((err) =>
            console.error(
              "[scheduleEmails] shift-unassigned send failed:",
              err,
            ),
          );
        }
      }
      return res.json(updatedNight);
    }
  } else if ("vagt_member_id" in req.body) {
    await pool
      .request()
      .input("updatedAt", sql.DateTime2, new Date().toISOString())
      .input("id", sql.Int, nightId).query(`
        UPDATE dbo.club_nights
        SET vagt_member_id = NULL, vagt_confirmed = 0, updated_at = @updatedAt
        WHERE id = @id
      `);
  }

  const updatedNight = await fetchNightWithOptOuts(pool, nightId);

  // Notify the newly assigned vagt (only if vagt changed to a real member)
  const previousVagt = nightCheck.recordset[0].vagt_member_id;
  const newVagt =
    "vagt_member_id" in req.body
      ? (req.body.vagt_member_id ?? null)
      : undefined;
  if (
    typeof newVagt === "number" &&
    newVagt !== null &&
    newVagt !== previousVagt
  ) {
    await createNotification(
      newVagt,
      "shift_assigned",
      `Du er blevet tildelt vagten: ${updatedNight.name}`,
      "/member/schedule",
    );
    // Send assignment email (fire-and-forget — don't block the response)
    sendShiftAssignedEmail(newVagt, {
      name: updatedNight.name,
      date: updatedNight.date,
      time_from: updatedNight.time_from,
      time_to: updatedNight.time_to,
      location: updatedNight.location,
    }).catch((err) =>
      console.error("[scheduleEmails] shift-assigned send failed:", err),
    );
    logEvent({
      eventType: "shift.assign",
      actorMemberId: callerId(res),
      targetMemberId: newVagt,
      detail: {
        nightId,
        name: updatedNight.name,
        date: updatedNight.date,
        previousVagt,
      },
    });
  } else if (newVagt === null && previousVagt !== null) {
    // Only notify real (non-virtual) vagtere when unassigning
    const prevVirtualCheck2 = await pool
      .request()
      .input("memberId", sql.Int, previousVagt as number)
      .query("SELECT is_virtual FROM dbo.members WHERE id = @memberId");
    const prevWasVirtual =
      prevVirtualCheck2.recordset[0]?.is_virtual === true ||
      prevVirtualCheck2.recordset[0]?.is_virtual === 1;
    if (!prevWasVirtual) {
      await createNotification(
        previousVagt as number,
        "shift_unassigned",
        `Du er blevet fjernet fra vagten: ${updatedNight.name}`,
        "/member/schedule",
      );
      sendShiftUnassignedEmail(
        previousVagt as number,
        {
          name: updatedNight.name,
          date: updatedNight.date,
          time_from: updatedNight.time_from,
          time_to: updatedNight.time_to,
          location: updatedNight.location,
        },
        callerId(res),
      ).catch((err) =>
        console.error("[scheduleEmails] shift-unassigned send failed:", err),
      );
      logEvent({
        eventType: "shift.unassign",
        actorMemberId: callerId(res),
        targetMemberId: previousVagt as number,
        detail: { nightId, name: updatedNight.name, date: updatedNight.date },
      });
    }
  }

  return res.json(updatedNight);
});

// POST /api/club-nights/:id/confirm
router.post("/:id/confirm", requireAuth, async (req, res) => {
  const caller = callerId(res);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  const nightId = Number(req.params.id);

  const nightCheck = await pool
    .request()
    .input("id", sql.Int, nightId)
    .query("SELECT vagt_member_id FROM dbo.club_nights WHERE id = @id");
  if (nightCheck.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });

  const vagtMemberId = nightCheck.recordset[0].vagt_member_id;
  if (vagtMemberId !== caller && !isAdmin(res)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  await pool
    .request()
    .input("updatedAt", sql.DateTime2, new Date().toISOString())
    .input("id", sql.Int, nightId)
    .query(
      "UPDATE dbo.club_nights SET vagt_confirmed=1, updated_at=@updatedAt WHERE id=@id",
    );

  const confirmedNight = await fetchNightWithOptOuts(pool, nightId);
  logEvent({
    eventType: "shift.confirm",
    actorMemberId: caller,
    detail: { nightId, name: confirmedNight.name, date: confirmedNight.date },
  });
  const payload = {
    event: "schedule_updated",
    data: { type: "night_confirmed", night: confirmedNight },
  };
  for (const uid of getConnectedUserIds()) broadcastToUser(uid, payload);
  return res.json(confirmedNight);
});

// POST /api/club-nights/:id/opt-out
router.post("/:id/opt-out", requireAuth, async (req, res) => {
  const memberId = callerId(res);
  if (!memberId) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  const nightId = Number(req.params.id);

  const nightCheck = await pool
    .request()
    .input("id", sql.Int, nightId)
    .query("SELECT vagt_member_id FROM dbo.club_nights WHERE id = @id");
  if (nightCheck.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });

  const exists = await pool
    .request()
    .input("nightId", sql.Int, nightId)
    .input("memberId", sql.Int, memberId)
    .query(
      "SELECT 1 FROM dbo.club_night_opt_outs WHERE club_night_id=@nightId AND member_id=@memberId",
    );
  if (exists.recordset.length > 0) return res.status(200).json({ ok: true });

  await pool
    .request()
    .input("nightId", sql.Int, nightId)
    .input("memberId", sql.Int, memberId)
    .query(
      "INSERT INTO dbo.club_night_opt_outs (club_night_id, member_id) VALUES (@nightId, @memberId)",
    );

  logEvent({
    eventType: "shift.optout",
    actorMemberId: memberId,
    detail: { nightId },
  });

  // If the opting-out member is the assigned vagt, clear the assignment
  if (nightCheck.recordset[0].vagt_member_id === memberId) {
    await pool
      .request()
      .input("updatedAt", sql.DateTime2, new Date().toISOString())
      .input("id", sql.Int, nightId)
      .query(
        "UPDATE dbo.club_nights SET vagt_member_id = NULL, vagt_confirmed = 0, updated_at = @updatedAt WHERE id = @id",
      );
  }

  return res.status(201).json({ ok: true });
});

// DELETE /api/club-nights/:id/opt-out
router.delete("/:id/opt-out", requireAuth, async (req, res) => {
  const memberId = callerId(res);
  if (!memberId) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  await pool
    .request()
    .input("nightId", sql.Int, Number(req.params.id))
    .input("memberId", sql.Int, memberId)
    .query(
      "DELETE FROM dbo.club_night_opt_outs WHERE club_night_id=@nightId AND member_id=@memberId",
    );

  logEvent({
    eventType: "shift.optout_remove",
    actorMemberId: memberId,
    detail: { nightId: Number(req.params.id) },
  });
  return res.status(200).json({ ok: true });
});

// PUT /api/club-nights/:id — admin only — edit metadata (name, time_from, time_to, location)
router.put("/:id", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const pool = await getPool();
  const nightId = Number(req.params.id);

  const nightCheck = await pool.request().input("id", sql.Int, nightId).query(`
    SELECT n.id, n.name, n.time_from, n.time_to, n.location, n.location_id,
           n.vagt_member_id,
           CONVERT(varchar(10), n.date, 120) AS date,
           vm.name AS assigned_member_name
    FROM dbo.club_nights n
    LEFT JOIN dbo.members vm ON vm.id = n.vagt_member_id
    WHERE n.id = @id
  `);
  if (nightCheck.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });

  const current = nightCheck.recordset[0];
  const {
    name,
    time_from,
    time_to,
    location_id: incomingLocationId,
  } = req.body as {
    name?: string;
    time_from?: string;
    time_to?: string;
    location_id?: number | null;
  };

  // Resolve new location text for the legacy column and emails
  let resolvedLocationText: string = current.location;
  let finalLocationId: number | null = current.location_id ?? null;
  if (incomingLocationId !== undefined) {
    finalLocationId = incomingLocationId;
    if (incomingLocationId) {
      const locResult = await pool
        .request()
        .input("lid", sql.Int, incomingLocationId)
        .query("SELECT name, address FROM dbo.locations WHERE id = @lid");
      if (locResult.recordset.length > 0) {
        const loc = locResult.recordset[0];
        resolvedLocationText = `${loc.name}, ${loc.address}`;
      }
    }
  }

  // Destructive change = time or location changed while a vagt is assigned
  const destructive =
    (time_from !== undefined && time_from !== current.time_from) ||
    (time_to !== undefined && time_to !== current.time_to) ||
    (incomingLocationId !== undefined &&
      incomingLocationId !== current.location_id);
  const hadVagt = current.vagt_member_id !== null;

  if (destructive && hadVagt) {
    // Clear assignment + confirmation
    await pool
      .request()
      .input("updatedAt", sql.DateTime2, new Date().toISOString())
      .input("id", sql.Int, nightId)
      .query(
        "UPDATE dbo.club_nights SET vagt_member_id = NULL, vagt_confirmed = 0, updated_at = @updatedAt WHERE id = @id",
      );
    // Delete all opt-outs
    await pool
      .request()
      .input("nightId", sql.Int, nightId)
      .query(
        "DELETE FROM dbo.club_night_opt_outs WHERE club_night_id = @nightId",
      );
    // Notify the previously assigned member
    await createNotification(
      current.vagt_member_id,
      "shift_unassigned",
      `Du er blevet fjernet fra vagten pga. ændringer i tid/sted: ${current.name}`,
      "/member/schedule",
    );
    // Send unassignment email (fire-and-forget)
    sendShiftUnassignedEmail(current.vagt_member_id, {
      name: current.name,
      date: current.date,
      time_from: time_from ?? current.time_from,
      time_to: time_to ?? current.time_to,
      location: resolvedLocationText,
    }).catch((err) =>
      console.error("[scheduleEmails] shift-unassigned send failed:", err),
    );
  }

  await pool
    .request()
    .input("name", sql.NVarChar, name ?? current.name)
    .input("timeFrom", sql.NVarChar, time_from ?? current.time_from)
    .input("timeTo", sql.NVarChar, time_to ?? current.time_to)
    .input("location", sql.NVarChar, resolvedLocationText)
    .input("locationId", sql.Int, finalLocationId)
    .input("updatedAt", sql.DateTime2, new Date().toISOString())
    .input("id", sql.Int, nightId).query(`
      UPDATE dbo.club_nights
      SET name = @name, time_from = @timeFrom, time_to = @timeTo,
          location = @location, location_id = @locationId, updated_at = @updatedAt
      WHERE id = @id
    `);

  const editedNight = await fetchNightWithOptOuts(pool, nightId);
  logEvent({
    eventType: "shift.edit",
    actorMemberId: callerId(res),
    detail: {
      nightId,
      changes: {
        ...(name !== undefined && name !== current.name
          ? { name: { from: current.name, to: name } }
          : {}),
        ...(time_from !== undefined && time_from !== current.time_from
          ? { time_from: { from: current.time_from, to: time_from } }
          : {}),
        ...(time_to !== undefined && time_to !== current.time_to
          ? { time_to: { from: current.time_to, to: time_to } }
          : {}),
        ...(incomingLocationId !== undefined &&
        incomingLocationId !== current.location_id
          ? {
              location_id: {
                from: current.location_id,
                to: incomingLocationId,
              },
            }
          : {}),
      },
    },
  });

  // Notify followers if anything actually changed
  const anyChange =
    (name !== undefined && name !== current.name) ||
    (time_from !== undefined && time_from !== current.time_from) ||
    (time_to !== undefined && time_to !== current.time_to) ||
    (incomingLocationId !== undefined &&
      incomingLocationId !== current.location_id);
  if (anyChange) {
    const oldNight = {
      name: current.name,
      date: current.date,
      time_from: current.time_from,
      time_to: current.time_to,
      location: current.location,
    };
    const newNight = {
      name: editedNight.name,
      date: editedNight.date,
      time_from: editedNight.time_from,
      time_to: editedNight.time_to,
      location: editedNight.location,
    };

    // Get followers for in-app notifications
    const followerRows = await pool
      .request()
      .input("nightId", sql.Int, nightId)
      .query(
        "SELECT member_id FROM dbo.club_night_followers WHERE club_night_id = @nightId",
      );
    const followerIds: number[] = followerRows.recordset.map(
      (r: { member_id: number }) => r.member_id,
    );
    await createNotificationForMany(
      followerIds,
      "night_changed",
      `En klubaften du følger er ændret: ${editedNight.name}`,
      "/events",
    );

    sendFollowerChangedEmails(nightId, { old: oldNight, new: newNight }).catch(
      (err) =>
        console.error("[scheduleEmails] follower-changed send failed:", err),
    );
  }

  return res.json(editedNight);
});

// POST /api/club-nights/:id/cancel — admin only
router.post("/:id/cancel", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const pool = await getPool();
  const nightId = Number(req.params.id);

  const nightCheck = await pool.request().input("id", sql.Int, nightId).query(`
    SELECT n.id, n.name, CONVERT(varchar(10), n.date, 120) AS date,
           n.time_from, n.time_to, n.location, n.vagt_member_id, n.cancelled
    FROM dbo.club_nights n
    WHERE n.id = @id
  `);
  if (nightCheck.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });

  const nightData = nightCheck.recordset[0];
  const alreadyCancelled =
    nightData.cancelled === true || nightData.cancelled === 1;
  if (alreadyCancelled)
    return res.status(409).json({ error: "Already cancelled" });

  await pool
    .request()
    .input("id", sql.Int, nightId)
    .input("cancelledAt", sql.DateTime2, new Date().toISOString())
    .query(
      "UPDATE dbo.club_nights SET cancelled = 1, cancelled_at = @cancelledAt WHERE id = @id",
    );

  const cancelledNight = await fetchNightWithOptOuts(pool, nightId);

  const nightSummary = {
    name: nightData.name as string,
    date: nightData.date as string,
    time_from: nightData.time_from as string,
    time_to: nightData.time_to as string,
    location: nightData.location as string,
  };

  const assignedVagtId: number | null = nightData.vagt_member_id ?? null;

  // Notify + email the confirmed vagt
  if (assignedVagtId !== null) {
    await createNotification(
      assignedVagtId,
      "shift_cancelled",
      `Klubaften du var tildelt er aflyst: ${nightData.name}`,
      "/member/schedule",
    );
    sendShiftCancelledEmail(assignedVagtId, nightSummary).catch((err) =>
      console.error("[scheduleEmails] shift-cancelled send failed:", err),
    );
  }

  // Notify + email all followers (excluding the vagt who already got a notice)
  const followerRows = await pool
    .request()
    .input("nightId", sql.Int, nightId)
    .query(
      "SELECT member_id FROM dbo.club_night_followers WHERE club_night_id = @nightId",
    );
  const followerIds: number[] = followerRows.recordset.map(
    (r: { member_id: number }) => r.member_id,
  );
  const followersToNotify = followerIds.filter((id) => id !== assignedVagtId);
  await createNotificationForMany(
    followersToNotify,
    "night_cancelled",
    `En klubaften du fulgte er aflyst: ${nightData.name}`,
    "/events",
  );
  sendFollowerCancelledEmails(nightId, nightSummary).catch((err) =>
    console.error("[scheduleEmails] follower-cancelled send failed:", err),
  );

  logEvent({
    eventType: "shift.cancel",
    actorMemberId: callerId(res),
    targetMemberId: assignedVagtId,
    detail: { nightId, name: nightData.name, date: nightData.date },
  });

  // Broadcast so schedule page updates live
  const payload = {
    event: "schedule_updated",
    data: { type: "night_cancelled", night: cancelledNight },
  };
  for (const uid of getConnectedUserIds()) broadcastToUser(uid, payload);

  return res.json(cancelledNight);
});

// DELETE /api/club-nights/:id — admin only
router.delete("/:id", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const pool = await getPool();
  const nightId = Number(req.params.id);

  const nightCheck = await pool.request().input("id", sql.Int, nightId).query(`
    SELECT n.id, n.name, CONVERT(varchar(10), n.date, 120) AS date,
           n.time_from, n.time_to, n.location, n.vagt_member_id,
           n.vagt_confirmed, n.cancelled
    FROM dbo.club_nights n
    WHERE n.id = @id
  `);
  if (nightCheck.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });

  const night = nightCheck.recordset[0];

  // Block deletion of a confirmed (and not yet cancelled) shift — use cancel instead
  const isConfirmed =
    night.vagt_confirmed === true || night.vagt_confirmed === 1;
  const isCancelled = night.cancelled === true || night.cancelled === 1;
  if (isConfirmed && !isCancelled) {
    return res.status(409).json({
      error:
        "Cannot delete a confirmed shift — cancel it first using POST /:id/cancel",
    });
  }

  const assignedVagtId: number | null = night.vagt_member_id ?? null;

  // Fetch followers before deleting (CASCADE removes them alongside the night)
  const followerRows = await pool
    .request()
    .input("nightId", sql.Int, nightId)
    .query(
      "SELECT member_id FROM dbo.club_night_followers WHERE club_night_id = @nightId",
    );
  const followerIds: number[] = followerRows.recordset.map(
    (r: { member_id: number }) => r.member_id,
  );

  await pool
    .request()
    .input("nightId", sql.Int, nightId)
    .query(
      "DELETE FROM dbo.club_night_opt_outs WHERE club_night_id = @nightId",
    );
  await pool
    .request()
    .input("id", sql.Int, nightId)
    .query("DELETE FROM dbo.club_nights WHERE id = @id");

  // Notify + email the displaced vagt
  if (assignedVagtId !== null) {
    await createNotification(
      assignedVagtId,
      "shift_deleted",
      `Klubaften du var tildelt er slettet: ${night.name}`,
      "/member/schedule",
    );
    sendShiftDeletedEmail(assignedVagtId, {
      name: night.name,
      date: night.date,
      time_from: night.time_from,
      time_to: night.time_to,
      location: night.location,
    }).catch((err) =>
      console.error("[scheduleEmails] shift-deleted send failed:", err),
    );
  }

  logEvent({
    eventType: "shift.delete",
    actorMemberId: callerId(res),
    targetMemberId: assignedVagtId,
    detail: { nightId, name: night.name, date: night.date },
  });

  // Notify + email followers (excluding the assigned vagt who already got a separate notice)
  const followersToNotify = followerIds.filter((id) => id !== assignedVagtId);
  await createNotificationForMany(
    followersToNotify,
    "night_deleted",
    `En klubaften du fulgte er slettet: ${night.name}`,
    "/events",
  );
  sendFollowerDeletedEmails(nightId, {
    name: night.name,
    date: night.date,
    time_from: night.time_from,
    time_to: night.time_to,
    location: night.location,
  }).catch((err) =>
    console.error("[scheduleEmails] follower-deleted send failed:", err),
  );

  return res.status(200).json({ ok: true });
});

// POST /api/club-nights/:id/publish — admin only
// Publishes a single draft night (so admins can release them one at a time
// instead of all at once), then notifies + emails Vagter/Administrators.
router.post("/:id/publish", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const pool = await getPool();
  const nightId = Number(req.params.id);

  const nightCheck = await pool
    .request()
    .input("id", sql.Int, nightId)
    .query(`
      SELECT n.id, n.name, CONVERT(varchar(10), n.date, 120) AS date,
             n.time_from, n.time_to, n.location, n.[status]
      FROM dbo.club_nights n
      WHERE n.id = @id
    `);
  if (nightCheck.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });

  const draft = nightCheck.recordset[0] as {
    id: number;
    name: string;
    date: string;
    time_from: string;
    time_to: string;
    location: string;
    status: string;
  };
  if (draft.status !== "draft") {
    return res.status(409).json({ error: "Klubaften er allerede udgivet" });
  }

  await pool
    .request()
    .input("id", sql.Int, nightId)
    .query("UPDATE dbo.club_nights SET [status] = N'published' WHERE id = @id");

  // Notify all Vagt + Administrator members about the newly published night.
  const vagtMembersResult = await pool.request().query(`
    SELECT DISTINCT mr.member_id
    FROM dbo.member_roles mr
    JOIN dbo.roles r ON r.id = mr.role_id
    WHERE r.name IN (N'Vagt', N'Administrator')
  `);
  const vagtMemberIds: number[] = vagtMembersResult.recordset.map(
    (r: { member_id: number }) => r.member_id,
  );

  await createNotificationForMany(
    vagtMemberIds,
    "nights_published",
    `Ny klubaften er klar til gennemgang: ${draft.name}`,
    "/member/schedule",
  );

  // Queue debounced digest email (existing 30-min debounce collapses repeats).
  queueNewNightEmail({
    name: draft.name,
    date: draft.date,
    time_from: draft.time_from,
    time_to: draft.time_to,
    location: draft.location,
  });

  logEvent({
    eventType: "shift.publish",
    actorMemberId: callerId(res),
    detail: { nightId, name: draft.name, date: draft.date },
  });

  // Reuse the drafts_published broadcast shape (single-element array): the
  // schedule page already updates admins and adds the night for Vagter.
  const publishedNight = await fetchNightWithOptOuts(pool, nightId);
  const payload = {
    event: "schedule_updated",
    data: { type: "drafts_published", nights: [publishedNight] },
  };
  for (const uid of getConnectedUserIds()) broadcastToUser(uid, payload);

  return res.status(200).json(publishedNight);
});

// POST /api/club-nights/publish-drafts — admin only
// Publishes all draft nights at once, then sends a single batch notification
// and queues a single digest email to all Vagter/Administrators.
router.post("/publish-drafts", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const pool = await getPool();

  // Fetch all draft nights
  const draftsResult = await pool.request().query(`
    SELECT n.id, n.name,
           CONVERT(varchar(10), n.date, 120) AS date,
           n.time_from, n.time_to, n.location
    FROM dbo.club_nights n
    WHERE n.[status] = N'draft'
    ORDER BY n.date
  `);

  const drafts = draftsResult.recordset as Array<{
    id: number;
    name: string;
    date: string;
    time_from: string;
    time_to: string;
    location: string;
  }>;

  if (drafts.length === 0) {
    return res.status(200).json({ published: 0, nights: [] });
  }

  // Publish all drafts in a single update
  const draftIds = drafts.map((d) => d.id).join(",");
  await pool.request().query(`
    UPDATE dbo.club_nights
    SET [status] = N'published'
    WHERE id IN (${draftIds})
  `);

  // Send a single batch notification to all Vagt + Administrator members
  const vagtMembersResult = await pool.request().query(`
    SELECT DISTINCT mr.member_id
    FROM dbo.member_roles mr
    JOIN dbo.roles r ON r.id = mr.role_id
    WHERE r.name IN (N'Vagt', N'Administrator')
  `);
  const vagtMemberIds: number[] = vagtMembersResult.recordset.map(
    (r: { member_id: number }) => r.member_id,
  );

  const count = drafts.length;
  const notifBody =
    count === 1
      ? `Ny klubaften er klar til gennemgang: ${drafts[0].name}`
      : `${count} nye klubaftener er klar til gennemgang`;

  await createNotificationForMany(
    vagtMemberIds,
    "nights_published",
    notifBody,
    "/member/schedule",
  );

  // Queue debounced digest emails (existing 30-min debounce collapses them)
  for (const night of drafts) {
    queueNewNightEmail({
      name: night.name,
      date: night.date,
      time_from: night.time_from,
      time_to: night.time_to,
      location: night.location,
    });
  }

  logEvent({
    eventType: "shift.publish_drafts",
    actorMemberId: callerId(res),
    detail: { count, nightIds: drafts.map((d) => d.id) },
  });

  // Broadcast so schedule page updates live for any connected admins
  const publishedNights = await Promise.all(
    drafts.map((d) => fetchNightWithOptOuts(pool, d.id)),
  );
  const payload = {
    event: "schedule_updated",
    data: { type: "drafts_published", nights: publishedNights },
  };
  for (const uid of getConnectedUserIds()) broadcastToUser(uid, payload);

  return res.status(200).json({ published: count, nights: publishedNights });
});

export default router;
