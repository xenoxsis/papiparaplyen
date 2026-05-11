import { Router } from "express";
import { getPool, sql } from "../db";
import { callerId, isAdmin, requireAdmin, requireAuth } from "../auth";
import {
  createNotification,
  createNotificationForMany,
} from "../notifications";
import {
  queueNewNightEmail,
  sendShiftAssignedEmail,
  sendShiftUnassignedEmail,
  sendShiftDeletedEmail,
} from "../scheduleEmails";
import { logEvent } from "../audit";

const router = Router();

type NightRow = {
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
  assigned_member_name: string | null;
  assigned_member_initials: string | null;
};

async function fetchNightWithOptOuts(
  pool: Awaited<ReturnType<typeof getPool>>,
  nightId: number,
) {
  const nightResult = await pool.request().input("id", sql.Int, nightId).query(`
      SELECT n.id, n.number, n.name,
             CONVERT(varchar(10), n.date, 120) AS date,
             n.time_from, n.time_to, n.location,
             n.vagt_member_id, n.vagt_confirmed,
             n.created_at, n.updated_at,
             vm.name AS assigned_member_name,
             vm.initials AS assigned_member_initials
      FROM dbo.club_nights n
      LEFT JOIN dbo.members vm ON vm.id = n.vagt_member_id
      WHERE n.id = @id
    `);

  const optOutsResult = await pool.request().input("nightId", sql.Int, nightId)
    .query(`
      SELECT m.id, m.name, m.initials
      FROM dbo.club_night_opt_outs o
      JOIN dbo.members m ON m.id = o.member_id
      WHERE o.club_night_id = @nightId
    `);

  return {
    ...nightResult.recordset[0],
    vagt_confirmed:
      nightResult.recordset[0].vagt_confirmed === true ||
      nightResult.recordset[0].vagt_confirmed === 1,
    opted_out_members: optOutsResult.recordset,
  };
}

// GET /api/club-nights
// ?upcoming=true  — only return nights with date >= today (DB-side filter)
router.get("/", async (req, res) => {
  const upcomingOnly = req.query.upcoming === "true";
  const pool = await getPool();
  const nightsResult = await pool.request().query(`
    SELECT n.id, n.number, n.name,
           CONVERT(varchar(10), n.date, 120) AS date,
           n.time_from, n.time_to, n.location,
           n.vagt_member_id, n.vagt_confirmed,
           n.created_at, n.updated_at,
           vm.name AS assigned_member_name,
           vm.initials AS assigned_member_initials
    FROM dbo.club_nights n
    LEFT JOIN dbo.members vm ON vm.id = n.vagt_member_id
    ${upcomingOnly ? "WHERE n.date >= CAST(GETDATE() AS DATE)" : ""}
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

// POST /api/club-nights
router.post("/", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const pool = await getPool();
  const now = new Date().toISOString();

  // Get next number
  const maxResult = await pool
    .request()
    .query(
      "SELECT ISNULL(MAX(number),0)+1 AS next_number, ISNULL(MAX(id),0)+1 AS next_id FROM dbo.club_nights",
    );
  const nextNumber: number =
    req.body.number ?? maxResult.recordset[0].next_number;

  const insertResult = await pool
    .request()
    .input("number", sql.Int, nextNumber)
    .input("name", sql.NVarChar, req.body.name ?? "Klubaften")
    .input("date", sql.Date, req.body.date)
    .input("timeFrom", sql.NVarChar, req.body.time_from ?? "18:00")
    .input("timeTo", sql.NVarChar, req.body.time_to ?? "23:00")
    .input("location", sql.NVarChar, req.body.location ?? "Kulturhuset")
    .input("vagtMemberId", sql.Int, req.body.vagt_member_id ?? null)
    .input("createdAt", sql.DateTime2, now)
    .input("updatedAt", sql.DateTime2, now).query(`
      INSERT INTO dbo.club_nights
        (number, name, date, time_from, time_to, location, vagt_member_id, vagt_confirmed, created_at, updated_at)
      OUTPUT INSERTED.id
      VALUES (@number, @name, @date, @timeFrom, @timeTo, @location, @vagtMemberId, 0, @createdAt, @updatedAt)
    `);

  const newId: number = insertResult.recordset[0].id;
  const night = await fetchNightWithOptOuts(pool, newId);

  // Notify all Vagt members about the new club night
  const vagtMembers = await pool.request().query(`
    SELECT DISTINCT mr.member_id
    FROM dbo.member_roles mr
    JOIN dbo.roles r ON r.id = mr.role_id
    WHERE r.name IN (N'Vagt', N'Administrator')
  `);
  const vagtMemberIds: number[] = vagtMembers.recordset.map(
    (r: { member_id: number }) => r.member_id,
  );
  await createNotificationForMany(
    vagtMemberIds,
    "nights_added",
    `Ny klubaften tilføjet: ${night.name}`,
    "/member/schedule",
  );

  // Queue debounced digest email to all Vagter/Admins
  queueNewNightEmail({
    name: night.name,
    date: night.date,
    time_from: night.time_from,
    time_to: night.time_to,
    location: night.location,
  });

  logEvent({
    eventType: "shift.create",
    actorMemberId: callerId(res),
    detail: { nightId: newId, name: night.name, date: night.date },
  });

  return res.status(201).json(night);
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
          sendShiftUnassignedEmail(previousVagtId, {
            name: updatedNight.name,
            date: updatedNight.date,
            time_from: updatedNight.time_from,
            time_to: updatedNight.time_to,
            location: updatedNight.location,
          }).catch((err) =>
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
      sendShiftUnassignedEmail(previousVagt as number, {
        name: updatedNight.name,
        date: updatedNight.date,
        time_from: updatedNight.time_from,
        time_to: updatedNight.time_to,
        location: updatedNight.location,
      }).catch((err) =>
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
    SELECT n.id, n.name, n.time_from, n.time_to, n.location, n.vagt_member_id,
           CONVERT(varchar(10), n.date, 120) AS date,
           vm.name AS assigned_member_name
    FROM dbo.club_nights n
    LEFT JOIN dbo.members vm ON vm.id = n.vagt_member_id
    WHERE n.id = @id
  `);
  if (nightCheck.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });

  const current = nightCheck.recordset[0];
  const { name, time_from, time_to, location } = req.body as {
    name?: string;
    time_from?: string;
    time_to?: string;
    location?: string;
  };

  // Destructive change = time or location changed while a vagt is assigned
  const destructive =
    (time_from !== undefined && time_from !== current.time_from) ||
    (time_to !== undefined && time_to !== current.time_to) ||
    (location !== undefined && location !== current.location);
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
      location: location ?? current.location,
    }).catch((err) =>
      console.error("[scheduleEmails] shift-unassigned send failed:", err),
    );
  }

  await pool
    .request()
    .input("name", sql.NVarChar, name ?? current.name)
    .input("timeFrom", sql.NVarChar, time_from ?? current.time_from)
    .input("timeTo", sql.NVarChar, time_to ?? current.time_to)
    .input("location", sql.NVarChar, location ?? current.location)
    .input("updatedAt", sql.DateTime2, new Date().toISOString())
    .input("id", sql.Int, nightId).query(`
      UPDATE dbo.club_nights
      SET name = @name, time_from = @timeFrom, time_to = @timeTo,
          location = @location, updated_at = @updatedAt
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
        ...(location !== undefined && location !== current.location
          ? { location: { from: current.location, to: location } }
          : {}),
      },
    },
  });
  return res.json(editedNight);
});

// DELETE /api/club-nights/:id — admin only
router.delete("/:id", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const pool = await getPool();
  const nightId = Number(req.params.id);

  const nightCheck = await pool.request().input("id", sql.Int, nightId).query(`
    SELECT n.id, n.name, CONVERT(varchar(10), n.date, 120) AS date,
           n.time_from, n.time_to, n.location, n.vagt_member_id
    FROM dbo.club_nights n
    WHERE n.id = @id
  `);
  if (nightCheck.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });

  const night = nightCheck.recordset[0];
  const assignedVagtId: number | null = night.vagt_member_id ?? null;

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
  return res.status(200).json({ ok: true });
});

export default router;
