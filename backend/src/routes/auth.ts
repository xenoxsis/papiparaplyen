import bcrypt from "bcrypt";
import crypto from "crypto";
import { Router } from "express";
import { getPool, sql } from "../db";
import { signToken, getMemberRoles, requireAuth } from "../auth";
import {
  sendEmail,
  resetPasswordEmailHtml,
  oauthAccountEmailHtml,
} from "../email";

const SALT_ROUNDS = 12;

const router = Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }

  const pool = await getPool();

  const userResult = await pool
    .request()
    .input("email", sql.NVarChar, (email as string).toLowerCase()).query(`
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
  if (!passwordMatch)
    return res.status(401).json({ error: "Invalid credentials" });

  const rolesResult = await pool
    .request()
    .input("memberId", sql.Int, row.member_id).query(`
      SELECT r.name
      FROM dbo.member_roles mr
      JOIN dbo.roles r ON r.id = mr.role_id
      WHERE mr.member_id = @memberId
    `);

  const roles = rolesResult.recordset.map((r: { name: string }) => r.name);
  const token = signToken({ memberId: row.member_id, roles });
  return res.json({
    id: row.member_id,
    name: row.name,
    initials: row.initials,
    roles,
    token,
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

  const existing = await pool
    .request()
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
    const memberResult = await transaction
      .request()
      .input("name", sql.NVarChar, trimmedName)
      .input("initials", sql.NVarChar, initials)
      .input("email", sql.NVarChar, normalizedEmail)
      .input("joinedDate", sql.Date, today).query(`
        INSERT INTO dbo.members (name, initials, email, joined_date)
        OUTPUT INSERTED.id
        VALUES (@name, @initials, @email, @joinedDate)
      `);

    const newMemberId: number = memberResult.recordset[0].id;

    await transaction
      .request()
      .input("email", sql.NVarChar, normalizedEmail)
      .input("password", sql.NVarChar, hashedPassword)
      .input("memberId", sql.Int, newMemberId).query(`
        INSERT INTO dbo.users (email, password, provider, provider_id, member_id, banned)
        VALUES (@email, @password, 'local', NULL, @memberId, 0)
      `);

    await transaction.commit();

    const roles = await getMemberRoles(newMemberId);
    const token = signToken({ memberId: newMemberId, roles });
    return res.status(201).json({
      id: newMemberId,
      name: trimmedName,
      initials,
      roles,
      token,
    });
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
});

// PATCH /api/auth/me — update own display name
router.patch("/me", requireAuth, async (req, res) => {
  const { name } = req.body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  const trimmedName = name.trim();
  const parts = trimmedName.split(/\s+/);
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();

  const pool = await getPool();
  const memberId: number = res.locals.jwt.memberId;

  await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .input("name", sql.NVarChar, trimmedName)
    .input("initials", sql.NVarChar, initials)
    .query(
      "UPDATE dbo.members SET name = @name, initials = @initials WHERE id = @memberId",
    );

  return res.json({ id: memberId, name: trimmedName, initials });
});

// POST /api/auth/change-password — change own password
router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ error: "currentPassword and newPassword are required" });
  }
  if ((newPassword as string).length < 6) {
    return res
      .status(400)
      .json({ error: "newPassword must be at least 6 characters" });
  }

  const pool = await getPool();
  const memberId: number = res.locals.jwt.memberId;

  const userResult = await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .query(
      "SELECT id, password, provider FROM dbo.users WHERE member_id = @memberId",
    );

  if (userResult.recordset.length === 0) {
    return res.status(404).json({ error: "User not found" });
  }

  const row = userResult.recordset[0];
  if (row.provider !== "local") {
    return res.status(400).json({
      error: `Din konto bruger ${row.provider === "google" ? "Google" : "Facebook"} login og har ingen adgangskode`,
    });
  }

  const match = await bcrypt.compare(currentPassword as string, row.password);
  if (!match) {
    return res.status(401).json({ error: "Forkert nuværende adgangskode" });
  }

  const hashed = await bcrypt.hash(newPassword as string, SALT_ROUNDS);
  await pool
    .request()
    .input("userId", sql.Int, row.id)
    .input("password", sql.NVarChar, hashed)
    .query("UPDATE dbo.users SET password = @password WHERE id = @userId");

  return res.json({ ok: true });
});

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body ?? {};
  // Always return ok to prevent user enumeration
  res.json({ ok: true });

  if (!email || typeof email !== "string") return;

  const pool = await getPool();
  const normalizedEmail = (email as string).trim().toLowerCase();

  const result = await pool
    .request()
    .input("email", sql.NVarChar, normalizedEmail).query(`
      SELECT m.id, m.email, u.provider
      FROM dbo.members m
      JOIN dbo.users u ON u.member_id = m.id
      WHERE m.email = @email
    `);

  if (result.recordset.length === 0) return;
  const row = result.recordset[0];

  const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

  if (row.provider !== "local") {
    await sendEmail(
      normalizedEmail,
      "Adgangskode nulstilling — Pap i Paraplyen",
      oauthAccountEmailHtml(row.provider),
    ).catch(console.error);
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await pool
    .request()
    .input("token", sql.NVarChar(64), token)
    .input("memberId", sql.Int, row.id)
    .input("expiresAt", sql.DateTime2, expiresAt).query(`
      INSERT INTO dbo.password_reset_tokens (token, member_id, expires_at, used)
      VALUES (@token, @memberId, @expiresAt, 0)
    `);

  const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`;
  await sendEmail(
    normalizedEmail,
    "Nulstil din adgangskode — Pap i Paraplyen",
    resetPasswordEmailHtml(resetUrl),
  ).catch(console.error);
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body ?? {};
  if (!token || !newPassword) {
    return res
      .status(400)
      .json({ error: "token and newPassword are required" });
  }
  if ((newPassword as string).length < 6) {
    return res
      .status(400)
      .json({ error: "Adgangskode skal være mindst 6 tegn" });
  }

  const pool = await getPool();

  const tokenResult = await pool
    .request()
    .input("token", sql.NVarChar(64), token).query(`
      SELECT id, member_id, expires_at, used
      FROM dbo.password_reset_tokens
      WHERE token = @token
    `);

  if (tokenResult.recordset.length === 0) {
    return res.status(400).json({ error: "Ugyldigt nulstillingslink" });
  }

  const row = tokenResult.recordset[0];
  if (row.used) {
    return res.status(400).json({ error: "Dette link er allerede brugt" });
  }
  if (new Date(row.expires_at) < new Date()) {
    return res.status(400).json({ error: "Nulstillingslinket er udløbet" });
  }

  const hashed = await bcrypt.hash(newPassword as string, SALT_ROUNDS);

  await pool
    .request()
    .input("memberId", sql.Int, row.member_id)
    .input("password", sql.NVarChar, hashed)
    .query(
      "UPDATE dbo.users SET password = @password WHERE member_id = @memberId",
    );

  await pool
    .request()
    .input("id", sql.Int, row.id)
    .query("UPDATE dbo.password_reset_tokens SET used = 1 WHERE id = @id");

  return res.json({ ok: true });
});

export default router;
