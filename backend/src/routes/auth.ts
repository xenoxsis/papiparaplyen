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
import { logEvent } from "../audit";

const SALT_ROUNDS = 12;
const SUPERUSER_EMAIL = (process.env.SUPERUSER_EMAIL ?? "").toLowerCase();

const router = Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }

  const pool = await getPool();
  const normalizedLoginEmail = (email as string).toLowerCase();

  const userResult = await pool
    .request()
    .input("email", sql.NVarChar, normalizedLoginEmail).query(`
      SELECT u.id, u.password, u.banned, u.member_id,
             m.name, m.initials
      FROM dbo.users u
      JOIN dbo.members m ON m.id = u.member_id
      WHERE m.email = @email
    `);

  if (userResult.recordset.length === 0) {
    logEvent({
      eventType: "login.failure",
      actorEmail: normalizedLoginEmail,
      ip: req.ip,
      detail: { reason: "user_not_found" },
    });
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const row = userResult.recordset[0];
  if (row.banned) {
    logEvent({
      eventType: "login.failure",
      actorEmail: normalizedLoginEmail,
      actorMemberId: row.member_id,
      ip: req.ip,
      detail: { reason: "banned" },
    });
    return res.status(403).json({ error: "Account banned" });
  }

  // Account has no password — it was created via OAuth only
  if (!row.password) {
    logEvent({
      eventType: "login.failure",
      actorEmail: normalizedLoginEmail,
      actorMemberId: row.member_id,
      ip: req.ip,
      detail: { reason: "no_password" },
    });
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const passwordMatch = await bcrypt.compare(password, row.password);
  if (!passwordMatch) {
    logEvent({
      eventType: "login.failure",
      actorEmail: normalizedLoginEmail,
      actorMemberId: row.member_id,
      ip: req.ip,
      detail: { reason: "wrong_password" },
    });
    return res.status(401).json({ error: "Invalid credentials" });
  }

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
  logEvent({
    eventType: "login.success",
    actorMemberId: row.member_id,
    actorEmail: normalizedLoginEmail,
    ip: req.ip,
  });
  return res.json({
    id: row.member_id,
    name: row.name,
    initials: row.initials,
    roles,
    is_superuser: normalizedLoginEmail === SUPERUSER_EMAIL,
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
      .input("password", sql.NVarChar, hashedPassword)
      .input("memberId", sql.Int, newMemberId).query(`
        INSERT INTO dbo.users (password, member_id, banned, email_on_mention, email_on_nights, email_on_shift)
        VALUES (@password, @memberId, 0, 0, 0, 0)
      `);

    await transaction.commit();

    const roles = await getMemberRoles(newMemberId);
    const token = signToken({ memberId: newMemberId, roles });
    setAuthCookie(res, token);
    logEvent({
      eventType: "auth.register",
      actorMemberId: newMemberId,
      actorEmail: normalizedEmail,
      ip: req.ip,
    });
    return res.status(201).json({
      id: newMemberId,
      name: trimmedName,
      initials,
      roles,
      is_superuser: normalizedEmail === SUPERUSER_EMAIL,
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

// POST /api/auth/refresh — re-issue JWT with fresh roles from DB
router.post("/refresh", requireAuth, async (_req, res) => {
  const memberId: number = res.locals.jwt.memberId;
  const pool = await getPool();
  const [memberResult, rolesResult] = await Promise.all([
    pool
      .request()
      .input("memberId", sql.Int, memberId)
      .query(
        "SELECT m.name, m.initials, m.email FROM dbo.members m WHERE m.id = @memberId",
      ),
    pool
      .request()
      .input("memberId", sql.Int, memberId)
      .query(
        `SELECT r.name FROM dbo.member_roles mr
         JOIN dbo.roles r ON r.id = mr.role_id
         WHERE mr.member_id = @memberId`,
      ),
  ]);
  if (memberResult.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });
  const row = memberResult.recordset[0];
  const email: string = (row.email ?? "").toLowerCase();
  const roles: string[] = rolesResult.recordset.map(
    (r: { name: string }) => r.name,
  );
  const token = signToken({ memberId, roles });
  setAuthCookie(res, token);
  return res.json({
    id: memberId,
    name: row.name as string,
    initials: row.initials as string,
    roles,
    is_superuser: !!SUPERUSER_EMAIL && email === SUPERUSER_EMAIL,
  });
});

// GET /api/auth/me — return current user with fresh is_superuser flag
router.get("/me", requireAuth, async (_req, res) => {
  const memberId: number = res.locals.jwt.memberId;
  const roles: string[] = res.locals.jwt.roles;
  const pool = await getPool();
  const result = await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .query(
      "SELECT m.name, m.initials, m.email FROM dbo.members m WHERE m.id = @memberId",
    );
  if (result.recordset.length === 0)
    return res.status(404).json({ error: "Not found" });
  const row = result.recordset[0];
  const email: string = (row.email ?? "").toLowerCase();
  return res.json({
    id: memberId,
    name: row.name as string,
    initials: row.initials as string,
    roles,
    is_superuser: !!SUPERUSER_EMAIL && email === SUPERUSER_EMAIL,
  });
});

// PATCH /api/auth/me — update own display name
router.patch("/me", requireAuth, async (req, res) => {
  const { name } = req.body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  const trimmedName = name.trim();
  if (trimmedName.length > 100) {
    return res
      .status(400)
      .json({ error: "name must be at most 100 characters" });
  }
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
    .query("SELECT id, password FROM dbo.users WHERE member_id = @memberId");

  if (userResult.recordset.length === 0) {
    return res.status(404).json({ error: "User not found" });
  }

  const row = userResult.recordset[0];
  if (!row.password) {
    // Look up linked OAuth providers for an informative error message
    const opResult = await pool
      .request()
      .input("userId", sql.Int, row.id)
      .query(
        "SELECT provider FROM dbo.user_oauth_providers WHERE user_id = @userId",
      );
    const names = opResult.recordset
      .map((p: { provider: string }) =>
        p.provider === "google"
          ? "Google"
          : p.provider === "facebook"
            ? "Facebook"
            : p.provider,
      )
      .join(" og ");
    return res.status(400).json({
      error: names
        ? `Din konto bruger ${names} login og har ingen adgangskode`
        : "Din konto har ingen adgangskode",
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
      SELECT m.id, m.email, u.id AS user_id, u.password
      FROM dbo.members m
      JOIN dbo.users u ON u.member_id = m.id
      WHERE m.email = @email
    `);

  if (result.recordset.length === 0) return;
  const row = result.recordset[0];

  const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

  if (!row.password) {
    // Pure OAuth account — look up which providers are linked
    const opResult = await pool
      .request()
      .input("userId", sql.Int, row.user_id)
      .query(
        "SELECT provider FROM dbo.user_oauth_providers WHERE user_id = @userId",
      );
    const providerName: string = opResult.recordset[0]?.provider ?? "oauth";
    const oauthHtml = oauthAccountEmailHtml(providerName);
    await sendEmail(
      normalizedEmail,
      "Adgangskode nulstilling — Esbjerg Brætspil",
      oauthHtml,
    ).catch(console.error);
    logEvent({
      eventType: "email.sent",
      targetMemberId: row.id,
      targetEmail: normalizedEmail,
      detail: {
        type: "oauth_account_notice",
        subject: "Adgangskode nulstilling — Esbjerg Brætspil",
        provider: providerName,
      },
    });
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
  const resetHtml = resetPasswordEmailHtml(resetUrl);
  await sendEmail(
    normalizedEmail,
    "Nulstil din adgangskode — Esbjerg Brætspil",
    resetHtml,
  ).catch(console.error);
  logEvent({
    eventType: "email.password_reset",
    targetMemberId: row.id,
    targetEmail: normalizedEmail,
    detail: {
      subject: "Nulstil din adgangskode — Esbjerg Brætspil",
      tokenExpiry: expiresAt.toISOString(),
    },
  });
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
        "SELECT email_on_mention, email_on_nights, email_on_shift, email_consent_at FROM dbo.users WHERE member_id = @id",
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

    // Remove OAuth provider links
    const userRow = await transaction
      .request()
      .input("memberId", sql.Int, memberId)
      .query("SELECT id FROM dbo.users WHERE member_id = @memberId");
    if (userRow.recordset.length > 0) {
      await transaction
        .request()
        .input("userId", sql.Int, userRow.recordset[0].id)
        .query("DELETE FROM dbo.user_oauth_providers WHERE user_id = @userId");
    }

    // Remove user account row
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

  logEvent({ eventType: "auth.erasure", actorMemberId: memberId });
  clearAuthCookie(res);
  return res.json({ ok: true, message: "Account and personal data erased" });
});

// GET /api/auth/bgg-prefs
router.get("/bgg-prefs", requireAuth, async (req, res) => {
  const memberId: number = res.locals.jwt.memberId;
  const defaults = {
    bgg_share_collection: true,
    bgg_share_name: true,
    game_count: 0,
  };
  try {
    const pool = await getPool();
    const [prefsResult, countResult] = await Promise.all([
      pool
        .request()
        .input("memberId", sql.Int, memberId)
        .query(
          "SELECT bgg_share_collection, bgg_share_name FROM dbo.users WHERE member_id = @memberId",
        ),
      pool
        .request()
        .input("memberId", sql.Int, memberId)
        .query(
          "SELECT COUNT(*) AS cnt FROM dbo.member_boardgames WHERE member_id = @memberId",
        ),
    ]);
    if (prefsResult.recordset.length === 0) return res.json(defaults);
    const row = prefsResult.recordset[0];
    return res.json({
      bgg_share_collection:
        row.bgg_share_collection === 1 || row.bgg_share_collection === true,
      bgg_share_name: row.bgg_share_name === 1 || row.bgg_share_name === true,
      game_count: countResult.recordset[0]?.cnt ?? 0,
    });
  } catch {
    // Columns may not exist yet (migration pending) — return defaults
    return res.json(defaults);
  }
});

// PATCH /api/auth/bgg-prefs
router.patch("/bgg-prefs", requireAuth, async (req, res) => {
  const memberId: number = res.locals.jwt.memberId;
  const { bgg_share_collection, bgg_share_name } = req.body ?? {};
  const updates: string[] = [];
  const pool = await getPool();
  const request = pool.request().input("memberId", sql.Int, memberId);
  if (typeof bgg_share_collection === "boolean") {
    updates.push("bgg_share_collection = @shareCollection");
    request.input("shareCollection", sql.Bit, bgg_share_collection ? 1 : 0);
  }
  if (typeof bgg_share_name === "boolean") {
    updates.push("bgg_share_name = @shareName");
    request.input("shareName", sql.Bit, bgg_share_name ? 1 : 0);
  }
  if (updates.length === 0)
    return res.status(400).json({ error: "Nothing to update" });
  try {
    await request.query(
      `UPDATE dbo.users SET ${updates.join(", ")} WHERE member_id = @memberId`,
    );
  } catch {
    // Columns may not exist yet (migration pending) — silently ignore
    return res.json({ ok: true });
  }
  return res.json({ ok: true });
});

// GET /api/auth/ical-token — return existing token or null
router.get("/ical-token", requireAuth, async (_req, res) => {
  const memberId: number = res.locals.jwt.memberId;
  const pool = await getPool();
  const result = await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .query("SELECT ical_token FROM dbo.users WHERE member_id = @memberId");
  const token: string | null = result.recordset[0]?.ical_token ?? null;
  return res.json({ token });
});

// POST /api/auth/ical-token — generate (or return existing) personal iCal feed token
router.post("/ical-token", requireAuth, async (_req, res) => {
  const memberId: number = res.locals.jwt.memberId;
  const pool = await getPool();

  const existing = await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .query("SELECT ical_token FROM dbo.users WHERE member_id = @memberId");

  const currentToken: string | null = existing.recordset[0]?.ical_token ?? null;
  if (currentToken) {
    return res.json({ token: currentToken });
  }

  const token = crypto.randomBytes(32).toString("hex");
  await pool
    .request()
    .input("token", sql.NVarChar(64), token)
    .input("memberId", sql.Int, memberId)
    .query(
      "UPDATE dbo.users SET ical_token = @token WHERE member_id = @memberId",
    );

  return res.json({ token });
});

// DELETE /api/auth/ical-token — revoke personal iCal feed token
router.delete("/ical-token", requireAuth, async (_req, res) => {
  const memberId: number = res.locals.jwt.memberId;
  const pool = await getPool();

  await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .query(
      "UPDATE dbo.users SET ical_token = NULL WHERE member_id = @memberId",
    );

  return res.json({ ok: true });
});

export default router;
