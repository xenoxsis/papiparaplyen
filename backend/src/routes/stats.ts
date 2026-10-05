/**
 * /api/stats
 *
 * POST /pageview — public, cookie-less page-view beacon (see 029_page_views.sql)
 * GET  /         — Administrator-only statistics overview
 *
 * Privacy: visitors are identified only by a truncated SHA-256 of
 * (daily salt + IP + User-Agent). The salt lives in memory, rotates at
 * Danish midnight and is never persisted, so stored hashes cannot be
 * reversed or linked across days. A server restart rotates the salt
 * early, which at worst counts a returning visitor twice that day.
 */

import crypto from "crypto";
import { Router } from "express";
import { getPool, sql } from "../db";
import { extractToken, requireAdmin, requireAuth, verifyToken } from "../auth";
import { countRecentlyActive } from "../presence";

const router = Router();

const TZ = "Romance Standard Time"; // Europe/Copenhagen in SQL Server
/** SQL expression: UTC DATETIME2 column → Danish calendar date. */
const dkDate = (col: string) =>
  `CAST((${col} AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}' AS DATE)`;

// ── Daily salt ───────────────────────────────────────────────────────────────

let saltDay = "";
let salt = "";

function danishDay(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Copenhagen",
  }).format(new Date()); // YYYY-MM-DD
}

function currentSalt(): string {
  const day = danishDay();
  if (day !== saltDay) {
    saltDay = day;
    salt = crypto.randomBytes(32).toString("hex");
  }
  return salt;
}

// ── Beacon helpers ───────────────────────────────────────────────────────────

const BOT_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|go-http/i;

function deviceOf(ua: string): "mobile" | "tablet" | "desktop" {
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android|windows phone/i.test(ua)) return "mobile";
  return "desktop";
}

function normalisePath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  let path = raw.split(/[?#]/)[0];
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path.slice(0, 300) || "/";
}

function ownHosts(): Set<string> {
  const hosts = new Set<string>(["localhost"]);
  try {
    if (process.env.FRONTEND_URL)
      hosts.add(new URL(process.env.FRONTEND_URL).hostname);
  } catch {
    /* ignore */
  }
  return hosts;
}
const OWN_HOSTS = ownHosts();

function referrerHost(raw: unknown, reqHost: string | undefined): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "");
    if (!host || OWN_HOSTS.has(host) || host === reqHost) return null;
    return host.slice(0, 255);
  } catch {
    return null;
  }
}

// POST /api/stats/pageview — fire-and-forget beacon from the frontend
router.post("/pageview", async (req, res) => {
  res.status(204).end();

  const ua = String(req.headers["user-agent"] ?? "");
  if (!ua || BOT_RE.test(ua)) return;
  if (req.headers["dnt"] === "1" || req.headers["sec-gpc"] === "1") return;

  const path = normalisePath(req.body?.path);
  if (!path || path.startsWith("/api")) return;

  const rawIp = req.ip ?? req.socket.remoteAddress ?? "";
  const ip = /^\d+\.\d+\.\d+\.\d+:\d+$/.test(rawIp)
    ? rawIp.replace(/:\d+$/, "")
    : rawIp;
  const visitorHash = crypto
    .createHash("sha256")
    .update(`${currentSalt()}|${ip}|${ua}`)
    .digest("hex")
    .slice(0, 16);

  const token = extractToken(req);
  const isMember = !!(token && verifyToken(token));

  try {
    const pool = await getPool();
    await pool
      .request()
      .input("path", sql.NVarChar(300), path)
      .input(
        "referrer",
        sql.NVarChar(255),
        referrerHost(req.body?.referrer, req.hostname),
      )
      .input("hash", sql.Char(16), visitorHash)
      .input("isMember", sql.Bit, isMember)
      .input("device", sql.NVarChar(10), deviceOf(ua)).query(`
        INSERT INTO dbo.page_views (path, referrer_host, visitor_hash, is_member, device)
        VALUES (@path, @referrer, @hash, @isMember, @device)
      `);
  } catch (err) {
    console.error("[stats] pageview insert failed:", (err as Error).message);
  }
});

// ── GET /api/stats ───────────────────────────────────────────────────────────

const ALLOWED_DAYS = [7, 30, 90, 365];

router.get("/", requireAuth, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const requested = Number(req.query.days);
  const days = ALLOWED_DAYS.includes(requested) ? requested : 30;

  const pool = await getPool();
  const r = () => pool.request().input("days", sql.Int, days);

  // Range boundaries in Danish local days, converted back to UTC for the
  // DATETIME2 columns (all stored with SYSUTCDATETIME()).
  const bounds = `
    DECLARE @todayDk DATE = CAST((SYSUTCDATETIME() AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}' AS DATE);
    DECLARE @sinceDk DATE = DATEADD(day, -(@days - 1), @todayDk);
    DECLARE @prevDk  DATE = DATEADD(day, -@days, @sinceDk);
    DECLARE @since     DATETIME2 = CAST((CAST(@sinceDk AS DATETIME2) AT TIME ZONE '${TZ}') AT TIME ZONE 'UTC' AS DATETIME2);
    DECLARE @prevSince DATETIME2 = CAST((CAST(@prevDk  AS DATETIME2) AT TIME ZONE '${TZ}') AT TIME ZONE 'UTC' AS DATETIME2);
    DECLARE @todayUtc  DATETIME2 = CAST((CAST(@todayDk AS DATETIME2) AT TIME ZONE '${TZ}') AT TIME ZONE 'UTC' AS DATETIME2);
  `;

  const [
    totals,
    daily,
    hourly,
    pages,
    referrers,
    devices,
    members,
    roles,
    nights,
    shiftsPerVagt,
    activity,
    channels,
    boardgames,
  ] = await Promise.all([
    r().query(`${bounds}
      SELECT
        (SELECT COUNT(DISTINCT visitor_hash) FROM dbo.page_views
          WHERE created_at >= DATEADD(minute, -5, SYSUTCDATETIME()))             AS live_visitors,
        (SELECT COUNT(*) FROM dbo.page_views WHERE created_at >= @todayUtc)     AS today_views,
        (SELECT COUNT(DISTINCT visitor_hash) FROM dbo.page_views
          WHERE created_at >= @todayUtc)                                         AS today_visitors,
        (SELECT COUNT(*) FROM dbo.page_views WHERE created_at >= @since)        AS range_views,
        (SELECT COUNT(DISTINCT visitor_hash) FROM dbo.page_views
          WHERE created_at >= @since)                                            AS range_visitors,
        (SELECT COUNT(*) FROM dbo.page_views
          WHERE created_at >= @prevSince AND created_at < @since)                AS prev_views,
        (SELECT COUNT(DISTINCT visitor_hash) FROM dbo.page_views
          WHERE created_at >= @prevSince AND created_at < @since)                AS prev_visitors,
        (SELECT COUNT(*) FROM dbo.page_views
          WHERE created_at >= @since AND is_member = 1)                          AS member_views,
        (SELECT MIN(created_at) FROM dbo.page_views)                             AS tracking_since,
        CAST(@sinceDk AS NVARCHAR(10))                                           AS since_date,
        CAST(@todayDk AS NVARCHAR(10))                                           AS today_date
    `),
    r().query(`${bounds}
      SELECT CAST(${dkDate("created_at")} AS NVARCHAR(10)) AS date,
             COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors
      FROM dbo.page_views WHERE created_at >= @since
      GROUP BY ${dkDate("created_at")}
    `),
    r().query(`${bounds}
      SELECT DATEPART(hour, (created_at AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}') AS hour,
             COUNT(*) AS views
      FROM dbo.page_views WHERE created_at >= @since
      GROUP BY DATEPART(hour, (created_at AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}')
    `),
    r().query(`${bounds}
      SELECT TOP 15 path, COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors
      FROM dbo.page_views WHERE created_at >= @since
      GROUP BY path ORDER BY views DESC
    `),
    r().query(`${bounds}
      SELECT TOP 10 referrer_host AS host, COUNT(*) AS views
      FROM dbo.page_views WHERE created_at >= @since AND referrer_host IS NOT NULL
      GROUP BY referrer_host ORDER BY views DESC
    `),
    r().query(`${bounds}
      SELECT device, COUNT(*) AS views
      FROM dbo.page_views WHERE created_at >= @since
      GROUP BY device ORDER BY views DESC
    `),
    r().query(`${bounds}
      SELECT
        (SELECT COUNT(*) FROM dbo.members m JOIN dbo.users u ON u.member_id = m.id
          WHERE u.banned = 0)                                                    AS total,
        (SELECT COUNT(*) FROM dbo.members m JOIN dbo.users u ON u.member_id = m.id
          WHERE u.banned = 0 AND m.joined_date >= @sinceDk)                      AS new_in_range,
        (SELECT COUNT(*) FROM dbo.users WHERE banned = 1)                        AS banned,
        (SELECT COUNT(*) FROM dbo.members WHERE is_virtual = 1)                  AS virtual_members,
        (SELECT COUNT(*) FROM dbo.member_avatars)                                AS with_avatar,
        (SELECT COUNT(*) FROM dbo.users
          WHERE banned = 0 AND email_consent_at IS NOT NULL)                     AS email_consent,
        (SELECT COUNT(*) FROM dbo.users WHERE banned = 0 AND email_on_mention = 1) AS email_on_mention,
        (SELECT COUNT(*) FROM dbo.users WHERE banned = 0 AND email_on_nights = 1)  AS email_on_nights,
        (SELECT COUNT(*) FROM dbo.users WHERE banned = 0 AND email_on_shift = 1)   AS email_on_shift,
        (SELECT COUNT(DISTINCT actor_member_id) FROM dbo.audit_log
          WHERE event_type IN ('login.success', 'oauth.login')
            AND created_at >= @since)                                            AS logged_in_in_range
    `),
    pool.request().query(`
      SELECT r.name AS role, COUNT(*) AS count
      FROM dbo.member_roles mr
      JOIN dbo.roles r ON r.id = mr.role_id
      JOIN dbo.users u ON u.member_id = mr.member_id AND u.banned = 0
      GROUP BY r.name ORDER BY count DESC
    `),
    r().query(`${bounds}
      SELECT
        (SELECT COUNT(*) FROM dbo.club_nights
          WHERE date >= @todayDk AND status = 'published' AND cancelled = 0)    AS upcoming,
        (SELECT COUNT(*) FROM dbo.club_nights
          WHERE date >= @todayDk AND status = 'published' AND cancelled = 0
            AND vagt_member_id IS NULL)                                          AS upcoming_unassigned,
        (SELECT COUNT(*) FROM dbo.club_nights
          WHERE date >= @todayDk AND status = 'published' AND cancelled = 0
            AND vagt_member_id IS NOT NULL AND vagt_confirmed = 0)               AS upcoming_unconfirmed,
        (SELECT COUNT(*) FROM dbo.club_nights
          WHERE date >= @todayDk AND status = 'draft')                           AS drafts,
        (SELECT COUNT(*) FROM dbo.club_nights
          WHERE date >= @sinceDk AND date < @todayDk
            AND status = 'published' AND cancelled = 0)                          AS held_in_range,
        (SELECT COUNT(*) FROM dbo.club_nights
          WHERE date >= @sinceDk AND date <= @todayDk AND cancelled = 1)         AS cancelled_in_range
    `),
    r().query(`${bounds}
      SELECT m.id, m.name, m.is_virtual,
             SUM(CASE WHEN n.date <  @todayDk THEN 1 ELSE 0 END) AS past,
             SUM(CASE WHEN n.date >= @todayDk THEN 1 ELSE 0 END) AS upcoming
      FROM dbo.club_nights n
      JOIN dbo.members m ON m.id = n.vagt_member_id
      WHERE n.status = 'published' AND n.cancelled = 0
        AND n.date >= DATEADD(day, -365, @todayDk)
      GROUP BY m.id, m.name, m.is_virtual
      ORDER BY past DESC, upcoming DESC, m.name
    `),
    r().query(`${bounds}
      SELECT
        (SELECT COUNT(*) FROM dbo.messages
          WHERE sent_at >= @since AND is_deleted = 0
            AND (type IS NULL OR type <> 'shift_swap'))                          AS messages,
        (SELECT COUNT(DISTINCT sender_id) FROM dbo.messages
          WHERE sent_at >= @since AND is_deleted = 0)                            AS chatters,
        (SELECT COUNT(*) FROM dbo.messages
          WHERE sent_at >= @since AND type = 'shift_swap')                       AS handovers,
        (SELECT COUNT(*) FROM dbo.messages
          WHERE sent_at >= @since AND type = 'shift_swap'
            AND swap_status = 'taken')                                           AS handovers_taken,
        (SELECT COUNT(*) FROM dbo.shift_swaps WHERE created_at >= @since)        AS swaps,
        (SELECT COUNT(*) FROM dbo.shift_swaps
          WHERE created_at >= @since AND status = 'accepted')                    AS swaps_accepted,
        (SELECT COUNT(*) FROM dbo.audit_log
          WHERE event_type = 'email.sent' AND created_at >= @since)              AS emails_sent
    `),
    r().query(`${bounds}
      SELECT c.name, COUNT(m.id) AS messages
      FROM dbo.channels c
      LEFT JOIN dbo.messages m ON m.channel_id = c.id
        AND m.sent_at >= @since AND m.is_deleted = 0
        AND (m.type IS NULL OR m.type <> 'shift_swap')
      GROUP BY c.name ORDER BY messages DESC
    `),
    pool.request().query(`
      SELECT
        (SELECT COUNT(DISTINCT bgg_id) FROM dbo.member_boardgames)    AS member_games,
        (SELECT COUNT(DISTINCT member_id) FROM dbo.member_boardgames) AS owners,
        (SELECT COUNT(*) FROM dbo.club_boardgames)                    AS club_games
    `),
  ]);

  const t = totals.recordset[0];

  // Fill the daily series so days without traffic show as zero.
  const byDate = new Map<string, { views: number; visitors: number }>(
    daily.recordset.map((d: { date: string; views: number; visitors: number }) => [
      d.date,
      { views: d.views, visitors: d.visitors },
    ]),
  );
  const series: { date: string; views: number; visitors: number }[] = [];
  const cursor = new Date(`${t.since_date}T00:00:00Z`);
  const end = new Date(`${t.today_date}T00:00:00Z`);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    series.push({ date: key, ...(byDate.get(key) ?? { views: 0, visitors: 0 }) });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const hours = Array.from({ length: 24 }, () => 0);
  for (const h of hourly.recordset as { hour: number; views: number }[])
    hours[h.hour] = h.views;

  const m = members.recordset[0];
  return res.json({
    days,
    visitors: {
      live: t.live_visitors,
      online_members: countRecentlyActive(),
      today: { views: t.today_views, visitors: t.today_visitors },
      range: { views: t.range_views, visitors: t.range_visitors },
      previous: { views: t.prev_views, visitors: t.prev_visitors },
      member_views: t.member_views,
      tracking_since: t.tracking_since,
      daily: series,
      hourly: hours,
      top_pages: pages.recordset,
      referrers: referrers.recordset,
      devices: devices.recordset,
    },
    members: {
      total: m.total,
      new_in_range: m.new_in_range,
      banned: m.banned,
      virtual: m.virtual_members,
      with_avatar: m.with_avatar,
      email_consent: m.email_consent,
      email_on_mention: m.email_on_mention,
      email_on_nights: m.email_on_nights,
      email_on_shift: m.email_on_shift,
      logged_in_in_range: m.logged_in_in_range,
      roles: roles.recordset,
    },
    nights: nights.recordset[0],
    shifts_per_vagt: shiftsPerVagt.recordset.map(
      (s: { id: number; name: string; is_virtual: boolean | number; past: number; upcoming: number }) => ({
        ...s,
        is_virtual: s.is_virtual === true || s.is_virtual === 1,
      }),
    ),
    activity: { ...activity.recordset[0], channels: channels.recordset },
    boardgames: boardgames.recordset[0],
  });
});

export default router;
