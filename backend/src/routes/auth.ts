import bcrypt from "bcrypt";
import crypto from "crypto";
import { Router } from "express";
import { getPool, sql } from "../db";
import {
  signToken,
  getMemberRoles,
  requireAuth,
  setAuthCookie,
  clearAuthCookie,
} from "../auth";
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
  setAuthCookie(res, token);
  return res.json({
    id: row.member_id,
    name: row.name,
    initials: row.initials,
    roles,
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
        INSERT INTO dbo.users (email, password, provider, provider_id, member_id, banned, email_on_mention, email_on_nights, email_on_shift)
        VALUES (@email, @password, 'local', NULL, @memberId, 0, 0, 0, 0)
      `);

    await transaction.commit();

    const roles = await getMemberRoles(newMemberId);
    const token = signToken({ memberId: newMemberId, roles });
    setAuthCookie(res, token);
    return res.status(201).json({
      id: newMemberId,
      name: trimmedName,
      initials,
      roles,
    });
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
});

// POST /api/auth/logout
router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  return res.json({ ok: true });
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
  if ((newPassword as string).length < 10) {
    return res
      .status(400)
      .json({ error: "newPassword must be at least 10 characters" });
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

// GET /api/auth/email-prefs — get own email notification preferences
router.get("/email-prefs", requireAuth, async (_req, res) => {
  const memberId: number = res.locals.jwt.memberId;
  const pool = await getPool();
  const result = await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .query(
      "SELECT email_on_mention, email_on_nights, email_on_shift, email_consent_at FROM dbo.users WHERE member_id = @memberId",
    );
  if (result.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });
  const row = result.recordset[0];
  return res.json({
    email_on_mention:
      row.email_on_mention === true || row.email_on_mention === 1,
    email_on_nights: row.email_on_nights === true || row.email_on_nights === 1,
    email_on_shift: row.email_on_shift === true || row.email_on_shift === 1,
    needs_consent:
      row.email_consent_at === null || row.email_consent_at === undefined,
  });
});

// PATCH /api/auth/email-prefs — update own email notification preferences
router.patch("/email-prefs", requireAuth, async (req, res) => {
  const memberId: number = res.locals.jwt.memberId;
  const pool = await getPool();
  const updates: string[] = [];
  const request = pool.request().input("memberId", sql.Int, memberId);

  if (typeof req.body.email_on_mention === "boolean") {
    request.input("emailOnMention", sql.Bit, req.body.email_on_mention ? 1 : 0);
    updates.push("email_on_mention = @emailOnMention");
  }
  if (typeof req.body.email_on_nights === "boolean") {
    request.input("emailOnNights", sql.Bit, req.body.email_on_nights ? 1 : 0);
    updates.push("email_on_nights = @emailOnNights");
  }
  if (typeof req.body.email_on_shift === "boolean") {
    request.input("emailOnShift", sql.Bit, req.body.email_on_shift ? 1 : 0);
    updates.push("email_on_shift = @emailOnShift");
  }

  // Stamp consent timestamp on explicit confirmation or when opting into any pref (GDPR Art. 7)
  const shouldStampConsent =
    req.body.consent_confirmed === true ||
    [
      req.body.email_on_mention,
      req.body.email_on_nights,
      req.body.email_on_shift,
    ].some((v) => v === true);
  if (shouldStampConsent) {
    updates.push("email_consent_at = COALESCE(email_consent_at, GETDATE())");
  }

  if (updates.length > 0) {
    await request.query(
      `UPDATE dbo.users SET ${updates.join(", ")} WHERE member_id = @memberId`,
    );
  }

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
  if ((newPassword as string).length < 10) {
    return res
      .status(400)
      .json({ error: "Adgangskode skal være mindst 10 tegn" });
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

// GET /api/auth/me/export — GDPR Art. 20 data portability
router.get("/me/export", requireAuth, async (_req, res) => {
  const memberId: number = res.locals.jwt.memberId;
  const pool = await getPool();

  const [member, userRow, messages, notifications, shifts] = await Promise.all([
    pool
      .request()
      .input("id", sql.Int, memberId)
      .query(
        "SELECT id, name, initials, email, joined_date FROM dbo.members WHERE id = @id",
      ),
    pool
      .request()
      .input("id", sql.Int, memberId)
      .query(
        "SELECT provider, email_on_mention, email_on_nights, email_on_shift, email_consent_at FROM dbo.users WHERE member_id = @id",
      ),
    pool
      .request()
      .input("id", sql.Int, memberId)
      .query(
        "SELECT id, channel_id, body, sent_at, edited_at FROM dbo.messages WHERE sender_id = @id AND is_deleted = 0 ORDER BY sent_at",
      ),
    pool
      .request()
      .input("id", sql.Int, memberId)
      .query(
        "SELECT id, type, content, created_at, read_at FROM dbo.notifications WHERE member_id = @id ORDER BY created_at",
      ),
    pool
      .request()
      .input("id", sql.Int, memberId)
      .query(
        "SELECT n.id, n.number, n.name, n.date, n.time_from, n.time_to FROM dbo.club_nights n WHERE n.vagt_member_id = @id ORDER BY n.date",
      ),
  ]);

  return res.json({
    exported_at: new Date().toISOString(),
    member: member.recordset[0] ?? null,
    account: userRow.recordset[0] ?? null,
    messages: messages.recordset,
    notifications: notifications.recordset,
    shifts: shifts.recordset,
  });
});

// DELETE /api/auth/me — GDPR Art. 17 right to erasure
router.delete("/me", requireAuth, async (_req, res) => {
  const memberId: number = res.locals.jwt.memberId;
  const pool = await getPool();

  // Prevent erasure of the protected superuser account
  const SUPERUSER_EMAIL = process.env.SUPERUSER_EMAIL ?? "";
  const memberRow = await pool
    .request()
    .input("id", sql.Int, memberId)
    .query("SELECT email FROM dbo.members WHERE id = @id");
  if (
    memberRow.recordset[0]?.email?.toLowerCase() ===
    SUPERUSER_EMAIL.toLowerCase()
  ) {
    return res.status(403).json({ error: "This account is protected" });
  }

  const transaction = pool.transaction();
  await transaction.begin();
  try {
    // Anonymise message content authored by this member
    await transaction
      .request()
      .input("memberId", sql.Int, memberId)
      .query(
        "UPDATE dbo.messages SET body = NULL, is_deleted = 1 WHERE sender_id = @memberId",
      );

    // Remove notifications
    await transaction
      .request()
      .input("memberId", sql.Int, memberId)
      .query("DELETE FROM dbo.notifications WHERE member_id = @memberId");

    // Remove password reset tokens
    await transaction
      .request()
      .input("memberId", sql.Int, memberId)
      .query(
        "DELETE FROM dbo.password_reset_tokens WHERE member_id = @memberId",
      );

    // Remove role assignments
    await transaction
      .request()
      .input("memberId", sql.Int, memberId)
      .query("DELETE FROM dbo.member_roles WHERE member_id = @memberId");

    // Remove user account row (passwords, OAuth tokens)
    await transaction
      .request()
      .input("memberId", sql.Int, memberId)
      .query("DELETE FROM dbo.users WHERE member_id = @memberId");

    // Anonymise member row — preserve id for referential integrity (shifts etc.)
    await transaction.request().input("memberId", sql.Int, memberId).query(`
        UPDATE dbo.members
        SET name = 'Deleted User', initials = '??', email = NULL
        WHERE id = @memberId
      `);

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  clearAuthCookie(res);
  return res.json({ ok: true, message: "Account and personal data erased" });
});

export default router;
