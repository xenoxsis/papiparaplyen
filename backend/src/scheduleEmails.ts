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
  mentionEmailHtml,
  NightSummary,
} from "./email";
import { isRecentlyActive } from "./presence";

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
  `);

  const recipients: { name: string; email: string }[] = result.recordset;
  const subject =
    nights.length === 1
      ? `Ny klubaften tilføjet: ${nights[0].name}`
      : `${nights.length} nye klubaftener tilføjet til vagtplanen`;

  console.log(
    `[scheduleEmails] Sending new-nights digest (${nights.length} night(s)) to ${recipients.length} recipient(s)`,
  );

  await Promise.allSettled(
    recipients.map((r) =>
      sendEmail(r.email, subject, newNightsDigestEmailHtml(nights, r.name)),
    ),
  );
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
      "SELECT m.name, m.email, ISNULL(u.email_on_shift, 1) AS email_on_shift FROM dbo.members m LEFT JOIN dbo.users u ON u.member_id = m.id WHERE m.id = @memberId",
    );

  const member:
    | { name: string; email: string; email_on_shift: boolean | number }
    | undefined = result.recordset[0];
  if (!member?.email) return;
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

  await sendEmail(
    member.email,
    subject,
    shiftAssignedEmailHtml(member.name, night),
  );
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

  await sendEmail(
    member.email,
    subject,
    mentionEmailHtml(member.name, senderName, channelName, messageBody),
  );
}
