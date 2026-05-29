/**
 * push.ts
 *
 * OneSignal Web Push integration.
 *
 * Each logged-in user is linked to their member ID as a OneSignal
 * External User ID (set by the frontend via OneSignal.login(String(memberId))).
 * This lets us target pushes by member ID with no subscription table.
 *
 * Fire-and-forget: sendPushToMembers never throws or blocks the caller.
 */

import type { NotificationType } from "./notifications";

/**
 * Notification types that trigger a push notification.
 * Remove any entry to silence push for that type without touching
 * notification creation logic elsewhere.
 */
export const PUSH_ENABLED_TYPES: NotificationType[] = [
  "swap_requested",
  "swap_accepted",
  "swap_cancelled",
  "shift_assigned",
  "shift_unassigned",
  "shift_deleted",
  "shift_cancelled",
  "nights_added",
  "nights_published",
  "mentioned",
  "night_changed",
  "night_deleted",
  "night_cancelled",
];

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;

/**
 * Send a push notification to one or more members via OneSignal.
 * Only fires if the type is in PUSH_ENABLED_TYPES and env vars are set.
 * Never throws — all errors are logged and swallowed.
 */
export async function sendPushToMembers(
  memberIds: number[],
  type: NotificationType,
  body: string,
  link?: string,
): Promise<void> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_API_KEY) return;
  if (!PUSH_ENABLED_TYPES.includes(type)) return;
  if (memberIds.length === 0) return;

  try {
    const payload: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      target_channel: "push",
      include_aliases: {
        external_id: memberIds.map(String),
      },
      headings: { en: "Esbjerg Brætspil", da: "Esbjerg Brætspil" },
      contents: { en: body, da: body },
    };

    if (link) {
      payload.url = link;
    }

    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(
        `[push] OneSignal request failed: ${response.status} ${text}`,
      );
    }
  } catch (err) {
    console.error("[push] sendPushToMembers failed:", err);
  }
}
