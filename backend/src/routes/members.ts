import { Router } from "express";
import * as crypto from "crypto";
import { getPool, sql } from "../db";
import { requireAdmin, requireAuth } from "../auth";
import { sendEmail, resetPasswordEmailHtml } from "../email";
import { logEvent } from "../audit";
import { broadcastToUser } from "../broadcaster";

const SUPERUSER_EMAIL = (process.env.SUPERUSER_EMAIL ?? "").toLowerCase();
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

// ── Helper: map a DB row → API member shape ─────────────────────────────────
function mapMember(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    email: row.email,
    joined_date: row.joined_date,
    banned: row.banned === true || row.banned === 1,
    is_virtual: row.is_virtual === true || row.is_virtual === 1,
    show_on_about_page:
      row.show_on_about_page === true || row.show_on_about_page === 1,
    rule_allow_two_in_a_row:
      row.rule_allow_two_in_a_row === true || row.rule_allow_two_in_a_row === 1,
    rule_allow_weekday_after_sunday:
      row.rule_allow_weekday_after_sunday === true ||
      row.rule_allow_weekday_after_sunday === 1,
    rule_no_weekends:
      row.rule_no_weekends === true || row.rule_no_weekends === 1,
    roles: row.roles_agg
      ? (row.roles_agg as string).split(",")
      : ([] as string[]),
    is_superuser:
      typeof row.email === "string" &&
      row.email.toLowerCase() === SUPERUSER_EMAIL,
    has_avatar: row.has_avatar === 1 || row.has_avatar === true,
  };
}

// ── Base SELECT fragment used in every member query ─────────────────────────
const MEMBER_SELECT = `
  SELECT m.id, m.name, m.initials, m.email, m.joined_date,
         m.is_virtual, m.show_on_about_page,
         m.rule_allow_two_in_a_row, m.rule_allow_weekday_after_sunday,
         m.rule_no_weekends,
         ISNULL(u.banned, 0) AS banned,
         STRING_AGG(r.name, ',') AS roles_agg,
         CASE WHEN ma.member_id IS NOT NULL THEN 1 ELSE 0 END AS has_avatar
  FROM dbo.members m
  LEFT JOIN dbo.users u ON u.member_id = m.id
  LEFT JOIN dbo.member_roles mr ON mr.member_id = m.id
  LEFT JOIN dbo.roles r ON r.id = mr.role_id
  LEFT JOIN dbo.member_avatars ma ON ma.member_id = m.id
`;

const MEMBER_GROUP_BY = `
  GROUP BY m.id, m.name, m.initials, m.email, m.joined_date,
           m.is_virtual, m.show_on_about_page,
           m.rule_allow_two_in_a_row, m.rule_allow_weekday_after_sunday,
           m.rule_no_weekends, u.banned, ma.member_id
`;

const router = Router();

// GET /api/members/public — unauthenticated, limited fields for the About page
router.get("/public", async (_req, res) => {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT m.id, m.name, m.initials, m.show_on_about_page,
           STRING_AGG(r.name, ',') AS roles_agg,
           CASE WHEN ma.member_id IS NOT NULL THEN 1 ELSE 0 END AS has_avatar
    FROM dbo.members m
    LEFT JOIN dbo.users u ON u.member_id = m.id
    LEFT JOIN dbo.member_roles mr ON mr.member_id = m.id
    LEFT JOIN dbo.roles r ON r.id = mr.role_id
    LEFT JOIN dbo.member_avatars ma ON ma.member_id = m.id
    WHERE ISNULL(u.banned, 0) = 0 AND m.is_virtual = 0
    GROUP BY m.id, m.name, m.initials, m.show_on_about_page, ma.member_id
    ORDER BY m.id
  `);
  res.json(
    result.recordset.map((row: Record<string, unknown>) => ({
      id: row.id,
      name: row.name,
      initials: row.initials,
      show_on_about_page:
        row.show_on_about_page === true || row.show_on_about_page === 1,
      roles: row.roles_agg ? (row.roles_agg as string).split(",") : [],
      has_avatar: row.has_avatar === 1 || row.has_avatar === true,
    })),
  );
});

// GET /api/members
router.get("/", requireAuth, async (_req, res) => {
  const pool = await getPool();
  const result = await pool.request().query(`
    ${MEMBER_SELECT}
    ${MEMBER_GROUP_BY}
    ORDER BY m.id
  `);
  res.json(result.recordset.map(mapMember));
});

// GET /api/members/:id
router.get("/:id", requireAuth, async (req, res) => {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, Number(req.params.id)).query(`
      ${MEMBER_SELECT}
      WHERE m.id = @id
      ${MEMBER_GROUP_BY}
    `);
  if (result.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });
  return res.json(mapMember(result.recordset[0]));
});

// POST /api/members — create a virtual member (admin only)
router.post("/", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { name, initials } = req.body ?? {};
  if (!name || !initials) {
    return res.status(400).json({ error: "name and initials are required" });
  }
  const trimmedName = (name as string).trim();
  const trimmedInitials = (initials as string).trim().toUpperCase();
  const today = new Date().toISOString().slice(0, 10);
  const pool = await getPool();

  // Check initials uniqueness
  const existing = await pool
    .request()
    .input("initials", sql.NVarChar, trimmedInitials)
    .query("SELECT 1 FROM dbo.members WHERE initials = @initials");
  if (existing.recordset.length > 0) {
    return res.status(409).json({ error: "Initialer er allerede i brug" });
  }

  const transaction = pool.transaction();
  await transaction.begin();
  try {
    const memberResult = await transaction
      .request()
      .input("name", sql.NVarChar, trimmedName)
      .input("initials", sql.NVarChar, trimmedInitials)
      .input("joinedDate", sql.Date, today).query(`
        INSERT INTO dbo.members (name, initials, joined_date, is_virtual, show_on_about_page)
        OUTPUT INSERTED.id
        VALUES (@name, @initials, @joinedDate, 1, 0)
      `);

    const newMemberId: number = memberResult.recordset[0].id;

    // Auto-assign Vagt role
    await transaction.request().input("memberId", sql.Int, newMemberId).query(`
      INSERT INTO dbo.member_roles (member_id, role_id)
      SELECT @memberId, id FROM dbo.roles WHERE name = 'Vagt'
    `);

    await transaction.commit();

    const newMember = await pool.request().input("id", sql.Int, newMemberId)
      .query(`
        ${MEMBER_SELECT}
        WHERE m.id = @id
        ${MEMBER_GROUP_BY}
      `);

    logEvent({
      eventType: "member.create_virtual",
      detail: {
        memberId: newMemberId,
        name: trimmedName,
        initials: trimmedInitials,
      },
    });

    return res.status(201).json(mapMember(newMember.recordset[0]));
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
});

// PATCH /api/members/:id  — update banned / show_on_about_page
router.patch("/:id", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const pool = await getPool();
  const memberId = Number(req.params.id);

  // Superuser cannot be banned
  const targetCheck = await pool
    .request()
    .input("id", sql.Int, memberId)
    .query("SELECT m.email FROM dbo.members m WHERE m.id = @id");
  if (targetCheck.recordset[0]?.email?.toLowerCase() === SUPERUSER_EMAIL) {
    return res.status(403).json({ error: "This account is protected" });
  }

  if (typeof req.body.banned === "boolean") {
    // When banning, also revoke the iCal token so the feed immediately stops working
    const icalClause = req.body.banned ? ", ical_token = NULL" : "";
    await pool
      .request()
      .input("banned", sql.Bit, req.body.banned ? 1 : 0)
      .input("memberId", sql.Int, memberId)
      .query(
        `UPDATE dbo.users SET banned = @banned${icalClause} WHERE member_id = @memberId`,
      );
  }

  if (typeof req.body.show_on_about_page === "boolean") {
    await pool
      .request()
      .input("val", sql.Bit, req.body.show_on_about_page ? 1 : 0)
      .input("memberId", sql.Int, memberId)
      .query(
        "UPDATE dbo.members SET show_on_about_page = @val WHERE id = @memberId",
      );
  }

  const RULE_COLUMNS = [
    "rule_allow_two_in_a_row",
    "rule_allow_weekday_after_sunday",
    "rule_no_weekends",
  ] as const;
  for (const col of RULE_COLUMNS) {
    if (typeof req.body[col] === "boolean") {
      await pool
        .request()
        .input("val", sql.Bit, req.body[col] ? 1 : 0)
        .input("memberId", sql.Int, memberId)
        .query(`UPDATE dbo.members SET ${col} = @val WHERE id = @memberId`);
    }
  }

  const result = await pool.request().input("id", sql.Int, memberId).query(`
    ${MEMBER_SELECT}
    WHERE m.id = @id
    ${MEMBER_GROUP_BY}
  `);
  if (result.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });
  return res.json(mapMember(result.recordset[0]));
});

// PUT /api/members/:id/roles  — replace Vagt/Administrator roles
router.put("/:id/roles", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const newRoleNames: string[] = req.body.roles ?? [];
  const memberId = Number(req.params.id);
  const pool = await getPool();

  // Superuser must always keep Administrator role
  const targetCheck = await pool
    .request()
    .input("id", sql.Int, memberId)
    .query("SELECT m.email, m.is_virtual FROM dbo.members m WHERE m.id = @id");
  if (targetCheck.recordset[0]?.email?.toLowerCase() === SUPERUSER_EMAIL) {
    if (!newRoleNames.includes("Administrator")) {
      return res
        .status(403)
        .json({ error: "Cannot remove Administrator from this account" });
    }
  }
  // Virtual members must always keep Vagt role
  if (targetCheck.recordset[0]?.is_virtual) {
    if (!newRoleNames.includes("Vagt")) {
      return res
        .status(403)
        .json({ error: "Virtuelle medlemmer skal have rollen Vagt" });
    }
  }

  const memberCheck = await pool
    .request()
    .input("id", sql.Int, memberId)
    .query("SELECT id FROM dbo.members WHERE id = @id");
  if (memberCheck.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });

  const transaction = pool.transaction();
  await transaction.begin();
  try {
    // Remove existing Vagt/Administrator/Tilskuer rows for this member
    await transaction.request().input("memberId", sql.Int, memberId).query(`
        DELETE mr FROM dbo.member_roles mr
        JOIN dbo.roles r ON r.id = mr.role_id
        WHERE mr.member_id = @memberId AND r.name IN ('Vagt','Administrator','Tilskuer')
      `);

    // Add new role rows
    for (const roleName of newRoleNames) {
      await transaction
        .request()
        .input("memberId", sql.Int, memberId)
        .input("roleName", sql.NVarChar, roleName).query(`
          INSERT INTO dbo.member_roles (member_id, role_id)
          SELECT @memberId, id FROM dbo.roles WHERE name = @roleName
        `);
    }
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  const result = await pool.request().input("id", sql.Int, memberId).query(`
    ${MEMBER_SELECT}
    WHERE m.id = @id
    ${MEMBER_GROUP_BY}
  `);
  const row = result.recordset[0];

  // Notify the affected user so their frontend can refresh the token immediately
  broadcastToUser(memberId, { event: "roles_changed" });

  return res.json(mapMember(row));
});

// POST /api/members/:id/realize — assign email to a virtual member.
// If a real member already owns that email → merge (transfer shifts, delete virtual).
// If no member owns that email → clear is_virtual, create user row, send invite email.
router.post("/:id/realize", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const virtualId = Number(req.params.id);
  const { email } = req.body ?? {};
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "email is required" });
  }
  const normalizedEmail = (email as string).trim().toLowerCase();

  const pool = await getPool();

  // Confirm the member is actually virtual
  const virtualCheck = await pool
    .request()
    .input("id", sql.Int, virtualId)
    .query("SELECT is_virtual FROM dbo.members WHERE id = @id");
  if (virtualCheck.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });
  if (!virtualCheck.recordset[0].is_virtual) {
    return res.status(400).json({ error: "Ikke et virtuelt medlem" });
  }

  // Check if email belongs to an existing member
  const emailCheck = await pool
    .request()
    .input("email", sql.NVarChar, normalizedEmail)
    .query("SELECT id, name FROM dbo.members WHERE email = @email");

  if (emailCheck.recordset.length > 0) {
    // ── Merge into existing real member ──────────────────────────────────────
    const realId: number = emailCheck.recordset[0].id;
    const realName: string = emailCheck.recordset[0].name;
    const today = new Date().toISOString().slice(0, 10);

    const transaction = pool.transaction();
    await transaction.begin();
    try {
      // Transfer shifts: past ones auto-confirm, future ones keep their state
      await transaction
        .request()
        .input("realId", sql.Int, realId)
        .input("virtualId", sql.Int, virtualId)
        .input("today", sql.Date, today).query(`
          UPDATE dbo.club_nights
          SET vagt_member_id = @realId,
              vagt_confirmed = CASE WHEN date < @today THEN 1 ELSE vagt_confirmed END
          WHERE vagt_member_id = @virtualId
        `);

      // Delete the virtual member (clean up roles first for FK safety)
      await transaction
        .request()
        .input("virtualId", sql.Int, virtualId)
        .query("DELETE FROM dbo.member_roles WHERE member_id = @virtualId");
      await transaction
        .request()
        .input("virtualId", sql.Int, virtualId)
        .query("DELETE FROM dbo.members WHERE id = @virtualId");

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    logEvent({
      eventType: "member.realize_merge",
      detail: { virtualId, realId, email: normalizedEmail },
    });

    return res.json({ merged: true, memberId: realId, name: realName });
  }

  // ── No existing user — convert virtual to a real member (no password yet) ─
  const transaction = pool.transaction();
  await transaction.begin();
  try {
    await transaction
      .request()
      .input("email", sql.NVarChar, normalizedEmail)
      .input("id", sql.Int, virtualId).query(`
        UPDATE dbo.members
        SET email = @email, is_virtual = 0, show_on_about_page = 1
        WHERE id = @id
      `);

    // Create users row (no password — will be set via invite link)
    await transaction.request().input("memberId", sql.Int, virtualId).query(`
      INSERT INTO dbo.users (password, member_id, banned, email_on_mention, email_on_nights, email_on_shift)
      VALUES (NULL, @memberId, 0, 0, 0, 0)
    `);

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  // Send password-setup invite email (24-hour token)
  try {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool
      .request()
      .input("token", sql.NVarChar(64), token)
      .input("memberId", sql.Int, virtualId)
      .input("expiresAt", sql.DateTime2, expiresAt).query(`
        INSERT INTO dbo.password_reset_tokens (token, member_id, expires_at, used)
        VALUES (@token, @memberId, @expiresAt, 0)
      `);

    const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`;
    await sendEmail(
      normalizedEmail,
      "Opret din adgangskode — Esbjerg Brætspil",
      resetPasswordEmailHtml(resetUrl),
    );

    logEvent({
      eventType: "member.realize_invite",
      detail: { virtualId, email: normalizedEmail },
    });
  } catch (err) {
    console.error("[members] realize invite email failed:", err);
  }

  const updated = await pool.request().input("id", sql.Int, virtualId).query(`
    ${MEMBER_SELECT}
    WHERE m.id = @id
    ${MEMBER_GROUP_BY}
  `);
  return res.json({
    merged: false,
    memberId: virtualId,
    member: mapMember(updated.recordset[0]),
  });
});

// GET /api/members/:id/shifts  — upcoming confirmed shifts for this member
router.get("/:id/shifts", async (req, res) => {
  const memberId = Number(req.params.id);
  const pool = await getPool();
  const today = new Date().toISOString().slice(0, 10);

  const result = await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .input("today", sql.Date, today).query(`
      SELECT n.id, n.number, n.name, n.date, n.time_from, n.time_to,
             n.location, n.vagt_member_id, n.vagt_confirmed,
             n.cancelled, n.cancelled_at,
             n.created_at, n.updated_at,
             m.name AS assigned_member_name,
             m.initials AS assigned_member_initials,
             CASE WHEN ma.member_id IS NOT NULL THEN 1 ELSE 0 END AS vagt_member_has_avatar
      FROM dbo.club_nights n
      LEFT JOIN dbo.members m ON m.id = n.vagt_member_id
      LEFT JOIN dbo.member_avatars ma ON ma.member_id = n.vagt_member_id
      WHERE n.vagt_member_id = @memberId
        AND n.vagt_confirmed = 1
        AND n.date >= @today
      ORDER BY n.date
    `);
  res.json(
    result.recordset.map((r) => ({
      ...r,
      cancelled: r.cancelled === true || r.cancelled === 1,
    })),
  );
});

export default router;
