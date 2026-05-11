import { Router, Request, Response } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { getPool, sql } from "../db";
import { signToken, getMemberRoles, setAuthCookie } from "../auth";

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

  // 1. Fast path: look up by provider + provider_id in user_oauth_providers
  const byProvider = await pool
    .request()
    .input("provider", sql.NVarChar, provider)
    .input("providerId", sql.NVarChar, providerId).query(`
      SELECT u.id AS user_id, u.banned, u.member_id, m.name, m.initials
      FROM dbo.user_oauth_providers op
      JOIN dbo.users u   ON u.id = op.user_id
      JOIN dbo.members m ON m.id = u.member_id
      WHERE op.provider = @provider AND op.provider_id = @providerId
    `);

  if (byProvider.recordset.length > 0) {
    const row = byProvider.recordset[0];
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

  // 2. Fall back: look up by email — link this provider to the existing account
  const byEmail = await pool
    .request()
    .input("email", sql.NVarChar, normalizedEmail).query(`
      SELECT u.id AS user_id, u.banned, u.member_id, m.name, m.initials
      FROM dbo.users u
      JOIN dbo.members m ON m.id = u.member_id
      WHERE m.email = @email
    `);

  if (byEmail.recordset.length > 0) {
    const row = byEmail.recordset[0];
    if (row.banned) throw new Error("Account banned");

    // Link the OAuth provider to the existing account (idempotent)
    await pool
      .request()
      .input("userId", sql.Int, row.user_id)
      .input("provider", sql.NVarChar, provider)
      .input("providerId", sql.NVarChar, providerId).query(`
        IF NOT EXISTS (
          SELECT 1 FROM dbo.user_oauth_providers
          WHERE user_id = @userId AND provider = @provider
        )
          INSERT INTO dbo.user_oauth_providers (user_id, provider, provider_id)
          VALUES (@userId, @provider, @providerId)
      `);

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

  // 3. Brand-new user: create member + users row + oauth provider link
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

    const userResult = await transaction
      .request()
      .input("memberId", sql.Int, newMemberId).query(`
        INSERT INTO dbo.users (password, member_id, banned, email_on_mention, email_on_nights, email_on_shift)
        OUTPUT INSERTED.id
        VALUES (NULL, @memberId, 0, 0, 0, 0)
      `);

    const newUserId: number = userResult.recordset[0].id;

    await transaction
      .request()
      .input("userId", sql.Int, newUserId)
      .input("provider", sql.NVarChar, provider)
      .input("providerId", sql.NVarChar, providerId).query(`
        INSERT INTO dbo.user_oauth_providers (user_id, provider, provider_id)
        VALUES (@userId, @provider, @providerId)
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
    (req: Request, res: Response) => {
      const { token, ...user } = req.user as {
        token: string;
        id: number;
        name: string;
        initials: string;
        roles: string[];
      };
      setAuthCookie(res, token);
      const encoded = Buffer.from(JSON.stringify(user)).toString("base64url");
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
    (req: Request, res: Response) => {
      const { token, ...user } = req.user as {
        token: string;
        id: number;
        name: string;
        initials: string;
        roles: string[];
      };
      setAuthCookie(res, token);
      const encoded = Buffer.from(JSON.stringify(user)).toString("base64url");
      res.redirect(`${FRONTEND_URL}/oauth-callback?user=${encoded}`);
    },
  );
} else {
  router.get("/facebook", (_req, res) =>
    res.status(503).json({ error: "Facebook OAuth not configured" }),
  );
}

export default router;
