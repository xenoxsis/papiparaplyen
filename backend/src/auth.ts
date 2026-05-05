import { Request, Response } from "express";
import { readTable } from "./db";

interface DbUser {
  id: number;
  member_id: number;
  banned: boolean;
}

interface DbMemberRole {
  member_id: number;
  role_id: number;
}

interface DbRole {
  id: number;
  name: string;
}

/** Returns the member_id of the caller from X-Member-Id header, or null. */
export function callerId(req: Request): number | null {
  const header = req.headers["x-member-id"];
  if (!header) return null;
  const id = Number(header);
  return isNaN(id) ? null : id;
}

/** Returns true if the caller (via X-Member-Id) has the Administrator role. */
export function isAdmin(req: Request): boolean {
  const memberId = callerId(req);
  if (memberId === null) return false;

  // Confirm the user account exists and is not banned
  const users = readTable<DbUser>("users");
  const user = users.find((u) => u.member_id === memberId);
  if (!user || user.banned) return false;

  const memberRoles = readTable<DbMemberRole>("member_roles");
  const roles = readTable<DbRole>("roles");
  const adminRole = roles.find((r) => r.name === "Administrator");
  if (!adminRole) return false;

  return memberRoles.some(
    (mr) => mr.member_id === memberId && mr.role_id === adminRole.id,
  );
}

/** Sends 403 and returns false if caller is not an admin. */
export function requireAdmin(req: Request, res: Response): boolean {
  if (!isAdmin(req)) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}
