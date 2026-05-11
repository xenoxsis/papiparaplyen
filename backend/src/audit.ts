/**
 * audit.ts
 *
 * Shared helper for writing structured audit log entries.
 * All writes are fire-and-forget: a logging failure never throws
 * or blocks the primary request.
 */

import { getPool, sql } from "./db";

export type AuditEventType =
  // Auth
  | "login.success"
  | "login.failure"
  | "auth.register"
  | "oauth.login"
  | "oauth.register"
  | "email.password_reset"
  | "auth.erasure"
  // Schedule mutations
  | "shift.create"
  | "shift.edit"
  | "shift.delete"
  | "shift.assign"
  | "shift.unassign"
  | "shift.confirm"
  | "shift.optout"
  | "shift.optout_remove"
  // Vagter page
  | "vagter.settings"
  | "vagter.checklist_create"
  | "vagter.checklist_edit"
  | "vagter.checklist_delete"
  // Emails
  | "email.sent";

export interface AuditParams {
  eventType: AuditEventType;
  /** Member ID of whoever triggered the action */
  actorMemberId?: number | null;
  /** Email of the actor (denormalised for durability) */
  actorEmail?: string | null;
  /** Member ID this action targeted (e.g. shift assignee) */
  targetMemberId?: number | null;
  /** Email this action targeted (denormalised for durability) */
  targetEmail?: string | null;
  /** Structured detail — will be JSON-stringified */
  detail?: Record<string, unknown> | null;
  /** IPv4/IPv6 address from the request */
  ip?: string | null;
}

export function logEvent(params: AuditParams): void {
  const {
    eventType,
    actorMemberId = null,
    actorEmail = null,
    targetMemberId = null,
    targetEmail = null,
    detail = null,
    ip = null,
  } = params;

  // Actor email can be looked up lazily from DB — pass null if unknown and rely on actorMemberId
  const detailJson = detail ? JSON.stringify(detail) : null;

  getPool()
    .then((pool) =>
      pool
        .request()
        .input("eventType", sql.NVarChar(50), eventType)
        .input("actorMemberId", sql.Int, actorMemberId)
        .input("actorEmail", sql.NVarChar(255), actorEmail)
        .input("targetMemberId", sql.Int, targetMemberId)
        .input("targetEmail", sql.NVarChar(255), targetEmail)
        .input("detail", sql.NVarChar(sql.MAX), detailJson)
        .input("ip", sql.NVarChar(45), ip).query(`
          INSERT INTO dbo.audit_log
            (event_type, actor_member_id, actor_email, target_member_id, target_email, detail, ip)
          VALUES
            (@eventType, @actorMemberId, @actorEmail, @targetMemberId, @targetEmail, @detail, @ip)
        `),
    )
    .catch((err) =>
      console.error(`[audit] Failed to log event "${eventType}":`, err),
    );
}
