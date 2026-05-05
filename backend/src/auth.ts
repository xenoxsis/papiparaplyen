import { Request, Response } from "express";
import { getPool, sql } from "./db";

/** Returns the member_id of the caller from X-Member-Id header, or null. */
export function callerId(req: Request): number | null {
  const header = req.headers["x-member-id"];
  if (!header) return null;
  const id = Number(header);
  return isNaN(id) ? null : id;
}

/** Returns true if the caller (via X-Member-Id) has the Administrator role. */
export async function isAdmin(req: Request): Promise<boolean> {
  const memberId = callerId(req);
  if (memberId === null) return false;

  const pool = await getPool();
  const result = await pool.request()
    .input("memberId", sql.Int, memberId)
    .query(`
      SELECT 1
      FROM dbo.users u
      JOIN dbo.member_roles mr ON mr.member_id = u.member_id
      JOIN dbo.roles r         ON r.id = mr.role_id
      WHERE u.member_id = @memberId
        AND u.banned = 0
        AND r.name = 'Administrator'
    `);
  return result.recordset.length > 0;
}

/** Sends 403 and returns false if caller is not an admin. */
export async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  if (!(await isAdmin(req))) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}
