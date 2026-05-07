import { Router } from "express";
import { getPool, sql } from "../db";
import { requireAdmin, requireAuth } from "../auth";

const SUPERUSER_EMAIL = "REDACTED";

const router = Router();

// GET /api/members
router.get("/", async (_req, res) => {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT m.id, m.name, m.initials, m.email, m.joined_date,
           ISNULL(u.banned, 0) AS banned,
           STRING_AGG(r.name, ',') AS roles_agg
    FROM dbo.members m
    LEFT JOIN dbo.users u ON u.member_id = m.id
    LEFT JOIN dbo.member_roles mr ON mr.member_id = m.id
    LEFT JOIN dbo.roles r ON r.id = mr.role_id
    GROUP BY m.id, m.name, m.initials, m.email, m.joined_date, u.banned
    ORDER BY m.id
  `);
  res.json(
    result.recordset.map((row) => ({
      ...row,
      banned: row.banned === true || row.banned === 1,
      roles: row.roles_agg ? row.roles_agg.split(",") : [],
      roles_agg: undefined,
    })),
  );
});

// GET /api/members/:id
router.get("/:id", async (req, res) => {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, Number(req.params.id)).query(`
      SELECT m.id, m.name, m.initials, m.email, m.joined_date,
             ISNULL(u.banned, 0) AS banned,
             STRING_AGG(r.name, ',') AS roles_agg
      FROM dbo.members m
      LEFT JOIN dbo.users u ON u.member_id = m.id
      LEFT JOIN dbo.member_roles mr ON mr.member_id = m.id
      LEFT JOIN dbo.roles r ON r.id = mr.role_id
      WHERE m.id = @id
      GROUP BY m.id, m.name, m.initials, m.email, m.joined_date, u.banned
    `);
  if (result.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });
  const row = result.recordset[0];
  return res.json({
    ...row,
    banned: row.banned === true || row.banned === 1,
    roles: row.roles_agg ? row.roles_agg.split(",") : [],
    roles_agg: undefined,
  });
});

// PATCH /api/members/:id  — update banned
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
    await pool
      .request()
      .input("banned", sql.Bit, req.body.banned ? 1 : 0)
      .input("memberId", sql.Int, memberId)
      .query(
        "UPDATE dbo.users SET banned = @banned WHERE member_id = @memberId",
      );
  }

  const result = await pool.request().input("id", sql.Int, memberId).query(`
      SELECT m.id, m.name, m.initials, m.email, m.joined_date,
             ISNULL(u.banned, 0) AS banned,
             STRING_AGG(r.name, ',') AS roles_agg
      FROM dbo.members m
      LEFT JOIN dbo.users u ON u.member_id = m.id
      LEFT JOIN dbo.member_roles mr ON mr.member_id = m.id
      LEFT JOIN dbo.roles r ON r.id = mr.role_id
      WHERE m.id = @id
      GROUP BY m.id, m.name, m.initials, m.email, m.joined_date, u.banned
    `);
  if (result.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });
  const row = result.recordset[0];
  return res.json({
    ...row,
    banned: row.banned === true || row.banned === 1,
    roles: row.roles_agg ? row.roles_agg.split(",") : [],
    roles_agg: undefined,
  });
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
    .query("SELECT m.email FROM dbo.members m WHERE m.id = @id");
  if (targetCheck.recordset[0]?.email?.toLowerCase() === SUPERUSER_EMAIL) {
    if (!newRoleNames.includes("Administrator")) {
      return res
        .status(403)
        .json({ error: "Cannot remove Administrator from this account" });
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
    // Remove existing Vagt/Administrator rows for this member
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
      SELECT m.id, m.name, m.initials, m.email, m.joined_date,
             ISNULL(u.banned, 0) AS banned,
             STRING_AGG(r.name, ',') AS roles_agg
      FROM dbo.members m
      LEFT JOIN dbo.users u ON u.member_id = m.id
      LEFT JOIN dbo.member_roles mr ON mr.member_id = m.id
      LEFT JOIN dbo.roles r ON r.id = mr.role_id
      WHERE m.id = @id
      GROUP BY m.id, m.name, m.initials, m.email, m.joined_date, u.banned
    `);
  const row = result.recordset[0];
  return res.json({
    ...row,
    banned: row.banned === true || row.banned === 1,
    roles: row.roles_agg ? row.roles_agg.split(",") : [],
    roles_agg: undefined,
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
             n.created_at, n.updated_at,
             m.name AS assigned_member_name,
             m.initials AS assigned_member_initials
      FROM dbo.club_nights n
      LEFT JOIN dbo.members m ON m.id = n.vagt_member_id
      WHERE n.vagt_member_id = @memberId
        AND n.vagt_confirmed = 1
        AND n.date >= @today
      ORDER BY n.date
    `);
  res.json(result.recordset);
});

export default router;
