/**
 * scheduleEmails.ts
 *
 * Debounced email dispatch for schedule-related events.
 *
 * NEW NIGHTS DIGEST
 * When club nights are created back-to-back (e.g. admin adds a full season),
 * we don't want an email for every single night. Instead we accumulate nights
 * in memory and send one digest email after the debounce window has elapsed
 * without a new night being added.
 *
 * Default debounce: 30 minutes. Override with SCHEDULE_EMAIL_DEBOUNCE_MS env var.
 *
 * SHIFT ASSIGNMENT
 * Fires immediately when the admin saves draft assignments (one email per
 * newly-assigned vagt). No batching needed because each person only gets one
 * email about their own shift.
 */

import { getPool, sql } from "./db";
import {
  sendEmail,
  newNightsDigestEmailHtml,
  shiftAssignedEmailHtml,
  shiftUnassignedEmailHtml,
  shiftDeletedEmailHtml,
  mentionEmailHtml,
  NightSummary,
} from "./email";
import { isRecentlyActive } from "./presence";
import { logEvent } from "./audit";

const DEBOUNCE_MS = Number(
  process.env.SCHEDULE_EMAIL_DEBOUNCE_MS ?? 30 * 60 * 1000,
);

// ── New nights debounce state (in-process singleton) ─────────────────────────

let pendingNights: NightSummary[] = [];
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Call this every time a new club night is created.
 * Accumulates the night and resets the debounce timer.
 */
export function queueNewNightEmail(night: NightSummary): void {
  pendingNights.push(night);

  if (debounceTimer !== null) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    const batch = pendingNights.slice();
    pendingNights = [];
    debounceTimer = null;
    sendNewNightsDigest(batch).catch((err) =>
      console.error("[scheduleEmails] digest send failed:", err),
    );
  }, DEBOUNCE_MS);

  console.log(
    `[scheduleEmails] Queued night "${night.name}" — digest fires in ${Math.round(DEBOUNCE_MS / 60_000)} min (${pendingNights.length} pending)`,
  );
}

async function sendNewNightsDigest(nights: NightSummary[]): Promise<void> {
  if (nights.length === 0) return;

  const pool = await getPool();

  // Fetch all non-banned Vagt + Administrator members who have email_on_nights = 1
  const result = await pool.request().query(`
    SELECT DISTINCT m.name, m.email
    FROM dbo.members m
    JOIN dbo.member_roles mr ON mr.member_id = m.id
    JOIN dbo.roles r ON r.id = mr.role_id
    LEFT JOIN dbo.users u ON u.member_id = m.id
    WHERE r.name IN (N'Vagt', N'Administrator')
      AND ISNULL(u.banned, 0) = 0
      AND ISNULL(u.email_on_nights, 1) = 1
      AND m.email IS NOT NULL
      AND m.is_virtual = 0
  `);

  const recipients: { name: string; email: string }[] = result.recordset;
  const subject =
    nights.length === 1
      ? `Ny klubaften tilføjet: ${nights[0].name}`
      : `${nights.length} nye klubaftener tilføjet til vagtplanen`;

  console.log(
    `[scheduleEmails] Sending new-nights digest (${nights.length} night(s)) to ${recipients.length} recipient(s)`,
  );

  // Build HTML once using the first recipient's name as a representative preview
  const previewRecipient = recipients[0]?.name ?? "Vagt";
  const htmlPreview = newNightsDigestEmailHtml(nights, previewRecipient);

  await Promise.allSettled(
    recipients.map((r) =>
      sendEmail(r.email, subject, newNightsDigestEmailHtml(nights, r.name)),
    ),
  );

  logEvent({
    eventType: "email.sent",
    detail: {
      type: "nights_digest",
      subject,
      nightCount: nights.length,
      recipientCount: recipients.length,
      html: htmlPreview,
    },
  });
}

// ── Shift assignment email ────────────────────────────────────────────────────

/**
 * Send an immediate assignment email to the newly assigned vagt.
 * Looks up email address from DB, so caller only needs the member ID.
 */
export async function sendShiftAssignedEmail(
  memberId: number,
  night: NightSummary,
): Promise<void> {
  const pool = await getPool();

  const result = await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .query(
      "SELECT m.name, m.email, m.is_virtual, ISNULL(u.email_on_shift, 1) AS email_on_shift FROM dbo.members m LEFT JOIN dbo.users u ON u.member_id = m.id WHERE m.id = @memberId",
    );

  const member:
    | {
        name: string;
        email: string;
        is_virtual: boolean | number;
        email_on_shift: boolean | number;
      }
    | undefined = result.recordset[0];
  if (!member?.email) return;
  if (member.is_virtual === true || member.is_virtual === 1) return;
  if (member.email_on_shift !== true && member.email_on_shift !== 1) {
    console.log(
      `[scheduleEmails] ${member.name} has email_on_shift=false — skipping`,
    );
    return;
  }

  const subject = `Du er tildelt vagten: ${night.name}`;
  console.log(
    `[scheduleEmails] Sending shift-assigned email to ${member.email} for "${night.name}"`,
  );

  const assignedHtml = shiftAssignedEmailHtml(member.name, night);
  await sendEmail(member.email, subject, assignedHtml);
  logEvent({
    eventType: "email.sent",
    targetMemberId: memberId,
    targetEmail: member.email,
    detail: {
      type: "shift_assigned",
      subject,
      nightName: night.name,
      nightDate: night.date,
      html: assignedHtml,
    },
  });
}

// ── Shift deleted email ───────────────────────────────────────────────────

/**
 * Send an immediate email to a vagt whose assigned night was deleted by an admin.
 */
export async function sendShiftDeletedEmail(
  memberId: number,
  night: NightSummary,
): Promise<void> {
  const pool = await getPool();

  const result = await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .query(
      "SELECT m.name, m.email, m.is_virtual, ISNULL(u.email_on_shift, 1) AS email_on_shift FROM dbo.members m LEFT JOIN dbo.users u ON u.member_id = m.id WHERE m.id = @memberId",
    );

  const member:
    | {
        name: string;
        email: string;
        is_virtual: boolean | number;
        email_on_shift: boolean | number;
      }
    | undefined = result.recordset[0];
  if (!member?.email) return;
  if (member.is_virtual === true || member.is_virtual === 1) return;
  if (member.email_on_shift !== true && member.email_on_shift !== 1) return;

  const subject = `Klubaften slettet: ${night.name}`;
  console.log(
    `[scheduleEmails] Sending shift-deleted email to ${member.email} for "${night.name}"`,
  );

  const deletedHtml = shiftDeletedEmailHtml(member.name, night);
  await sendEmail(member.email, subject, deletedHtml);
  logEvent({
    eventType: "email.sent",
    targetMemberId: memberId,
    targetEmail: member.email,
    detail: {
      type: "shift_deleted",
      subject,
      nightName: night.name,
      nightDate: night.date,
      html: deletedHtml,
    },
  });
}

// ── Shift unassignment email ─────────────────────────────────────────────────

/**
 * Send an immediate email to a vagt who was unassigned.
 * Pass `actorMemberId` when the removal was done manually by an admin so the
 * email can say "removed by <name>".  Omit it for automatic removals caused by
 * a change to the night's time or location.
 */
export async function sendShiftUnassignedEmail(
  memberId: number,
  night: NightSummary,
  actorMemberId?: number | null,
): Promise<void> {
  const pool = await getPool();

  const result = await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .query(
      "SELECT m.name, m.email, m.is_virtual, ISNULL(u.email_on_shift, 1) AS email_on_shift FROM dbo.members m LEFT JOIN dbo.users u ON u.member_id = m.id WHERE m.id = @memberId",
    );

  const member:
    | {
        name: string;
        email: string;
        is_virtual: boolean | number;
        email_on_shift: boolean | number;
      }
    | undefined = result.recordset[0];
  if (!member?.email) return;
  if (member.is_virtual === true || member.is_virtual === 1) return;
  if (member.email_on_shift !== true && member.email_on_shift !== 1) {
    console.log(
      `[scheduleEmails] ${member.name} has email_on_shift=false — skipping unassign email`,
    );
    return;
  }

  const isManual = actorMemberId != null;
  let actorName: string | undefined;
  if (isManual) {
    const actorResult = await pool
      .request()
      .input("actorId", sql.Int, actorMemberId)
      .query("SELECT name FROM dbo.members WHERE id = @actorId");
    actorName = actorResult.recordset[0]?.name as string | undefined;
  }

  const subject = `Du er blevet afmeldt vagten: ${night.name}`;
  console.log(
    `[scheduleEmails] Sending shift-unassigned email to ${member.email} for "${night.name}"`,
  );

  const unassignedHtml = shiftUnassignedEmailHtml(
    member.name,
    night,
    isManual ? { isManual: true, actorName } : { isManual: false },
  );
  await sendEmail(member.email, subject, unassignedHtml);
  logEvent({
    eventType: "email.sent",
    targetMemberId: memberId,
    targetEmail: member.email,
    detail: {
      type: "shift_unassigned",
      subject,
      nightName: night.name,
      nightDate: night.date,
      html: unassignedHtml,
    },
  });
}

// ── Mention email ─────────────────────────────────────────────────────────

/**
 * Send a mention notification email to a member.
 * Respects the member's email_on_mention preference.
 */
export async function sendMentionEmail(
  memberId: number,
  senderName: string,
  channelName: string,
  messageBody: string,
): Promise<void> {
  const pool = await getPool();

  const result = await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .query(
      "SELECT m.name, m.email, ISNULL(u.email_on_mention, 1) AS email_on_mention FROM dbo.members m LEFT JOIN dbo.users u ON u.member_id = m.id WHERE m.id = @memberId",
    );

  const member:
    | { name: string; email: string; email_on_mention: boolean | number }
    | undefined = result.recordset[0];
  if (!member?.email) return;
  if (member.email_on_mention !== true && member.email_on_mention !== 1) {
    console.log(
      `[scheduleEmails] ${member.name} has email_on_mention=false — skipping`,
    );
    return;
  }
  if (isRecentlyActive(memberId)) {
    console.log(
      `[scheduleEmails] ${member.name} is active — skipping mention email`,
    );
    return;
  }

  const subject = `${senderName} nævnte dig i ${channelName}`;
  console.log(`[scheduleEmails] Sending mention email to ${member.email}`);

  const mentionHtml = mentionEmailHtml(
    member.name,
    senderName,
    channelName,
    messageBody,
  );
  await sendEmail(member.email, subject, mentionHtml);
  logEvent({
    eventType: "email.sent",
    targetMemberId: memberId,
    targetEmail: member.email,
    detail: {
      type: "mention",
      subject,
      senderName,
      channelName,
      html: mentionHtml,
    },
  });
}

// ── GDPR data-retention cleanup jobs ─────────────────────────────────────────

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000; // run once per day

async function runRetentionCleanup(): Promise<void> {
  try {
    const pool = await getPool();

    // Purge used/expired password reset tokens older than 30 days (GDPR Art. 5)
    const tokenResult = await pool.request().query(`
      DELETE FROM dbo.password_reset_tokens
      WHERE (used = 1 OR expires_at < GETDATE())
        AND expires_at < DATEADD(day, -30, GETDATE())
    `);
    if (tokenResult.rowsAffected[0] > 0) {
      console.log(
        `[retention] Purged ${tokenResult.rowsAffected[0]} expired password_reset_tokens`,
      );
    }

    // Purge notifications older than 90 days (GDPR Art. 5)
    const notifResult = await pool.request().query(`
      DELETE FROM dbo.notifications
      WHERE created_at < DATEADD(day, -90, GETDATE())
    `);
    if (notifResult.rowsAffected[0] > 0) {
      console.log(
        `[retention] Purged ${notifResult.rowsAffected[0]} old notifications`,
      );
    }

    // Purge audit log entries older than 90 days
    const auditResult = await pool.request().query(`
      DELETE FROM dbo.audit_log
      WHERE created_at < DATEADD(day, -90, GETUTCDATE())
    `);
    if (auditResult.rowsAffected[0] > 0) {
      console.log(
        `[retention] Purged ${auditResult.rowsAffected[0]} old audit_log entries`,
      );
    }
  } catch (err) {
    console.error("[retention] Cleanup job failed:", err);
  }
}

// Run immediately on startup, then on a daily schedule
runRetentionCleanup().catch(console.error);
setInterval(() => {
  runRetentionCleanup().catch(console.error);
}, RETENTION_INTERVAL_MS);
