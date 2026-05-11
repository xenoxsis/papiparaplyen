/**
 * GET /api/audit-log
 *
 * Superuser-only endpoint for browsing structured audit events.
 * Access is limited to the account whose email matches SUPERUSER_EMAIL.
 */

import { Router } from "express";
import { getPool, sql } from "../db";
import { requireAuth } from "../auth";

const router = Router();

const SUPERUSER_EMAIL = (process.env.SUPERUSER_EMAIL ?? "").toLowerCase();

async function isSuperuser(memberId: number): Promise<boolean> {
  if (!SUPERUSER_EMAIL) return false;
  const pool = await getPool();
  const result = await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .query(
      "SELECT m.email FROM dbo.members m JOIN dbo.users u ON u.member_id = m.id WHERE m.id = @memberId",
    );
  const email: string | undefined = result.recordset[0]?.email;
  return !!email && email.toLowerCase() === SUPERUSER_EMAIL;
}

// GET /api/audit-log
router.get("/", requireAuth, async (req, res) => {
  const memberId: number = res.locals.jwt.memberId;
  if (!(await isSuperuser(memberId))) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const {
    eventType,
    actorEmail,
    targetEmail,
    from,
    to,
    search,
    page = "0",
    limit = "100",
  } = req.query as Record<string, string | undefined>;

  const pageNum = Math.max(0, Number(page));
  const limitNum = Math.min(200, Math.max(1, Number(limit)));
  const offset = pageNum * limitNum;

  const pool = await getPool();

  // Build parameter/condition pairs once — applied to both data and count queries
  const conditions: string[] = [];
  interface ParamDef {
    name: string;
    type: unknown;
    value: unknown;
  }
  const paramDefs: ParamDef[] = [];

  if (eventType) {
    paramDefs.push({
      name: "eventType",
      type: sql.NVarChar(50),
      value: eventType,
    });
    conditions.push("a.event_type = @eventType");
  }
  if (actorEmail) {
    paramDefs.push({
      name: "actorEmail",
      type: sql.NVarChar(255),
      value: `%${actorEmail}%`,
    });
    conditions.push("a.actor_email LIKE @actorEmail");
  }
  if (targetEmail) {
    paramDefs.push({
      name: "targetEmail",
      type: sql.NVarChar(255),
      value: `%${targetEmail}%`,
    });
    conditions.push("a.target_email LIKE @targetEmail");
  }
  if (from) {
    paramDefs.push({
      name: "from",
      type: sql.DateTime2,
      value: new Date(from),
    });
    conditions.push("a.created_at >= @from");
  }
  if (to) {
    paramDefs.push({ name: "to", type: sql.DateTime2, value: new Date(to) });
    conditions.push("a.created_at <= @to");
  }
  if (search) {
    paramDefs.push({
      name: "search",
      type: sql.NVarChar(sql.MAX),
      value: `%${search}%`,
    });
    conditions.push(
      "(a.detail LIKE @search OR a.actor_email LIKE @search OR a.target_email LIKE @search)",
    );
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  function buildRequest() {
    const r = pool.request();
    for (const p of paramDefs)
      r.input(p.name, p.type as Parameters<typeof r.input>[1], p.value);
    return r;
  }

  const dataRequest = buildRequest()
    .input("limit", sql.Int, limitNum)
    .input("offset", sql.Int, offset);
  const countRequest = buildRequest();

  const [dataResult, countResult] = await Promise.all([
    dataRequest.query(`
      SELECT
        a.id,
        a.event_type,
        a.actor_member_id,
        a.actor_email,
        am.name   AS actor_name,
        a.target_member_id,
        a.target_email,
        tm.name   AS target_name,
        a.detail,
        a.ip,
        a.created_at
      FROM dbo.audit_log a
      LEFT JOIN dbo.members am ON am.id = a.actor_member_id
      LEFT JOIN dbo.members tm ON tm.id = a.target_member_id
      ${whereClause}
      ORDER BY a.created_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `),
    countRequest.query(`
      SELECT COUNT(*) AS total FROM dbo.audit_log a ${whereClause}
    `),
  ]);

  return res.json({
    rows: dataResult.recordset.map((r) => ({
      ...r,
      detail: r.detail
        ? (() => {
            try {
              return JSON.parse(r.detail);
            } catch {
              return r.detail;
            }
          })()
        : null,
    })),
    total: countResult.recordset[0]?.total ?? 0,
    page: pageNum,
    limit: limitNum,
  });
});

// GET /api/audit-log/event-types — distinct event types for filter dropdowns
router.get("/event-types", requireAuth, async (_req, res) => {
  const memberId: number = res.locals.jwt.memberId;
  if (!(await isSuperuser(memberId))) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const pool = await getPool();
  const result = await pool
    .request()
    .query("SELECT DISTINCT event_type FROM dbo.audit_log ORDER BY event_type");
  return res.json(
    result.recordset.map((r: { event_type: string }) => r.event_type),
  );
});

export default router;
