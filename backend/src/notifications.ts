import { getPool, sql } from "./db";
import { broadcastToUser } from "./broadcaster";
import { isSilenced } from "./silence";
import { sendPushToMembers } from "./push";

export type NotificationType =
  | "swap_requested"
  | "swap_accepted"
  | "swap_cancelled"
  | "shift_assigned"
  | "shift_unassigned"
  | "shift_deleted"
  | "shift_cancelled"
  | "nights_added"
  | "nights_published"
  | "mentioned"
  | "night_changed"
  | "night_deleted"
  | "night_cancelled";

export interface Notification {
  id: number;
  member_id: number;
  type: NotificationType;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

/** Insert a notification in the DB and push it over SSE to the recipient. */
export async function createNotification(
  memberId: number,
  type: NotificationType,
  body: string,
  link?: string,
): Promise<void> {
  if (isSilenced()) {
    console.info(
      `[notifications] SILENCED — skipping notification type=${type} to memberId=${memberId}`,
    );
    return;
  }
  const pool = await getPool();

  const result = await pool
    .request()
    .input("memberId", sql.Int, memberId)
    .input("type", sql.NVarChar(50), type)
    .input("body", sql.NVarChar(500), body)
    .input("link", sql.NVarChar(255), link ?? null).query(`
      INSERT INTO dbo.notifications (member_id, type, body, link)
      OUTPUT
        INSERTED.id,
        INSERTED.member_id,
        INSERTED.type,
        INSERTED.body,
        INSERTED.link,
        INSERTED.is_read,
        INSERTED.created_at
      VALUES (@memberId, @type, @body, @link)
    `);

  const notification: Notification = result.recordset[0];
  broadcastToUser(memberId, { event: "notification", data: notification });
  // Fire-and-forget push — never blocks or throws
  sendPushToMembers([memberId], type, body, link);
}

/** Create the same notification for multiple members. */
export async function createNotificationForMany(
  memberIds: number[],
  type: NotificationType,
  body: string,
  link?: string,
): Promise<void> {
  await Promise.all(
    memberIds.map((id) => createNotification(id, type, body, link)),
  );
}
