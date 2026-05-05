import bcrypt from "bcrypt";
import { Router } from "express";
import { getPool, sql } from "../db";

const SALT_ROUNDS = 12;

const router = Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }

  const pool = await getPool();

  const userResult = await pool.request()
    .input("email", sql.NVarChar, (email as string).toLowerCase())
    .query(`
      SELECT u.id, u.password, u.banned, u.member_id,
             m.name, m.initials
      FROM dbo.users u
      JOIN dbo.members m ON m.id = u.member_id
      WHERE m.email = @email
    `);

  if (userResult.recordset.length === 0) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const row = userResult.recordset[0];
  if (row.banned) return res.status(403).json({ error: "Account banned" });

  const passwordMatch = await bcrypt.compare(password, row.password);
  if (!passwordMatch) return res.status(401).json({ error: "Invalid credentials" });

  const rolesResult = await pool.request()
    .input("memberId", sql.Int, row.member_id)
    .query(`
      SELECT r.name
      FROM dbo.member_roles mr
      JOIN dbo.roles r ON r.id = mr.role_id
      WHERE mr.member_id = @memberId
    `);

  return res.json({
    id: row.member_id,
    name: row.name,
    initials: row.initials,
    roles: rolesResult.recordset.map((r: { name: string }) => r.name),
  });
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body ?? {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email and password required" });
  }

  const pool = await getPool();
  const normalizedEmail = (email as string).trim().toLowerCase();

  const existing = await pool.request()
    .input("email", sql.NVarChar, normalizedEmail)
    .query("SELECT 1 FROM dbo.members WHERE email = @email");

  if (existing.recordset.length > 0) {
    return res.status(409).json({ error: "Email already in use" });
  }

  const parts = (name as string).trim().split(/\s+/);
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();

  const hashedPassword = await bcrypt.hash(password as string, SALT_ROUNDS);
  const today = new Date().toISOString().slice(0, 10);
  const trimmedName = (name as string).trim();

  // Insert member and user in a transaction
  const transaction = pool.transaction();
  await transaction.begin();
  try {
    const memberResult = await transaction.request()
      .input("name", sql.NVarChar, trimmedName)
      .input("initials", sql.NVarChar, initials)
      .input("email", sql.NVarChar, normalizedEmail)
      .input("joinedDate", sql.Date, today)
      .query(`
        INSERT INTO dbo.members (name, initials, email, joined_date)
        OUTPUT INSERTED.id
        VALUES (@name, @initials, @email, @joinedDate)
      `);

    const newMemberId: number = memberResult.recordset[0].id;

    await transaction.request()
      .input("email", sql.NVarChar, normalizedEmail)
      .input("password", sql.NVarChar, hashedPassword)
      .input("memberId", sql.Int, newMemberId)
      .query(`
        INSERT INTO dbo.users (email, password, provider, provider_id, member_id, banned)
        VALUES (@email, @password, 'local', NULL, @memberId, 0)
      `);

    await transaction.commit();

    return res.status(201).json({
      id: newMemberId,
      name: trimmedName,
      initials,
      roles: [],
    });
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
});

export default router;
