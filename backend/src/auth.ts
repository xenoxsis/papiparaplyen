import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getPool, sql } from "./db";
import { touchPresence } from "./presence";

const COOKIE_NAME = "auth_token";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days (matches JWT expiry)

/** Set the JWT as an httpOnly cookie on the response. */
export function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

/** Clear the auth cookie (logout). */
export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

/** Extract the JWT string from a request (cookie first, then Bearer header). */
export function extractToken(req: Request): string | null {
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[
    COOKIE_NAME
  ];
  if (cookieToken) return cookieToken;
  const header = req.headers["authorization"];
  return header?.startsWith("Bearer ") ? header.slice(7) : null;
}

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = "7d";

export type JwtPayload = {
  memberId: number;
  roles: string[];
};

/** Sign a JWT for a member. */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

/** Verify a JWT and return the payload, or null if invalid. */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/** Express middleware: requires a valid JWT. Sets res.locals.jwt on success. */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  res.locals.jwt = payload;
  touchPresence(payload.memberId);
  next();
}

/** Returns the member_id from the verified JWT payload, or null. */
export function callerId(res: Response): number | null {
  return (res.locals.jwt as JwtPayload | undefined)?.memberId ?? null;
}

/** Returns true if the caller has the Administrator role (from JWT). */
export function isAdmin(res: Response): boolean {
  const payload = res.locals.jwt as JwtPayload | undefined;
  return payload?.roles.includes("Administrator") ?? false;
}

/** Sends 403 and returns false if caller is not an admin. */
export async function requireAdmin(
  req: Request,
  res: Response,
): Promise<boolean> {
  if (!isAdmin(res)) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

/** Fetch roles for a member from the DB (used at login time). */
export async function getMemberRoles(memberId: number): Promise<string[]> {
  const pool = await getPool();
  const result = await pool.request().input("memberId", sql.Int, memberId)
    .query(`
    SELECT r.name FROM dbo.member_roles mr
    JOIN dbo.roles r ON r.id = mr.role_id
    WHERE mr.member_id = @memberId
  `);
  return result.recordset.map((r: { name: string }) => r.name);
}
