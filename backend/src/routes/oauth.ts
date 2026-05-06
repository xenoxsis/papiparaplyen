import { Router } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { getPool, sql } from "../db";
import { signToken, getMemberRoles } from "../auth";

const router = Router();

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3001";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

// ── Shared helper: find or create member + user from OAuth ────────────────────
async function findOrCreateUser(
  email: string,
  displayName: string,
  provider: string,
  providerId: string,
) {
  const pool = await getPool();
  const normalizedEmail = email.toLowerCase().trim();

  // Try to find existing user
  const existing = await pool
    .request()
    .input("email", sql.NVarChar, normalizedEmail).query(`
      SELECT u.id, u.banned, u.member_id, m.name, m.initials
      FROM dbo.users u
      JOIN dbo.members m ON m.id = u.member_id
      WHERE u.email = @email
    `);

  if (existing.recordset.length > 0) {
    const row = existing.recordset[0];
    if (row.banned) throw new Error("Account banned");

    const roles = await getMemberRoles(row.member_id as number);
    const token = signToken({ memberId: row.member_id as number, roles });
    return {
      id: row.member_id as number,
      name: row.name as string,
      initials: row.initials as string,
      roles,
      token,
    };
  }

  // Auto-create new member + user
  const parts = displayName.trim().split(/\s+/);
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  const today = new Date().toISOString().slice(0, 10);

  const transaction = pool.transaction();
  await transaction.begin();
  try {
    const memberResult = await transaction
      .request()
      .input("name", sql.NVarChar, displayName.trim())
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
      .input("provider", sql.NVarChar, provider)
      .input("providerId", sql.NVarChar, providerId)
      .input("memberId", sql.Int, newMemberId).query(`
        INSERT INTO dbo.users (email, password, provider, provider_id, member_id, banned)
        VALUES (@email, '', @provider, @providerId, @memberId, 0)
      `);

    await transaction.commit();
    const roles: string[] = [];
    const token = signToken({ memberId: newMemberId, roles });
    return {
      id: newMemberId,
      name: displayName.trim(),
      initials,
      roles,
      token,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// ── Google ────────────────────────────────────────────────────────────────────
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${BASE_URL}/api/auth/google/callback`,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) return done(new Error("No email provided by Google"));
          const user = await findOrCreateUser(
            email,
            profile.displayName,
            "google",
            profile.id,
          );
          done(null, user);
        } catch (err) {
          done(err as Error);
        }
      },
    ),
  );

  router.get(
    "/google",
    passport.authenticate("google", {
      scope: ["profile", "email"],
      session: false,
    }),
  );

  router.get(
    "/google/callback",
    passport.authenticate("google", {
      session: false,
      failureRedirect: `${FRONTEND_URL}/login?error=oauth`,
    }),
    (req, res) => {
      const encoded = Buffer.from(JSON.stringify(req.user)).toString(
        "base64url",
      );
      res.redirect(`${FRONTEND_URL}/oauth-callback?user=${encoded}`);
    },
  );
} else {
  router.get("/google", (_req, res) =>
    res.status(503).json({ error: "Google OAuth not configured" }),
  );
}

// ── Facebook ─────────────────────────────────────────────────────────────────
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: `${BASE_URL}/api/auth/facebook/callback`,
        profileFields: ["id", "displayName", "emails"],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) return done(new Error("No email provided by Facebook"));
          const user = await findOrCreateUser(
            email,
            profile.displayName,
            "facebook",
            profile.id,
          );
          done(null, user);
        } catch (err) {
          done(err as Error);
        }
      },
    ),
  );

  router.get(
    "/facebook",
    passport.authenticate("facebook", { scope: ["email"], session: false }),
  );

  router.get(
    "/facebook/callback",
    passport.authenticate("facebook", {
      session: false,
      failureRedirect: `${FRONTEND_URL}/login?error=oauth`,
    }),
    (req, res) => {
      const encoded = Buffer.from(JSON.stringify(req.user)).toString(
        "base64url",
      );
      res.redirect(`${FRONTEND_URL}/oauth-callback?user=${encoded}`);
    },
  );
} else {
  router.get("/facebook", (_req, res) =>
    res.status(503).json({ error: "Facebook OAuth not configured" }),
  );
}

export default router;
