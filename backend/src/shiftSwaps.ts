/**
 * shiftSwaps.ts
 *
 * Shared helpers for mutual shift swaps ("Byt vagt").
 *
 * A swap is a targeted 1:1 proposal: member A offers their shift
 * (from_night) in exchange for member B's shift (to_night). B accepts or
 * declines; accepting trades the two assignments and confirms both — neither
 * member has to press "Bekræft vagt" afterwards, because both already agreed
 * by making/accepting the proposal.
 *
 * Not to be confused with a HANDOVER ("Afgiv vagt"), which is the older
 * broadcast flow: a chat message in the vagter channel
 * (dbo.messages.type = 'shift_swap') that any vagt can take.
 *
 * This module holds everything both the swap routes and the club-night routes
 * need, so club-nights.ts can void proposals without importing the route file.
 */

import { getPool, sql } from "./db";
import { broadcastToUser } from "./broadcaster";
import { createNotification } from "./notifications";
import { formatDanishDate } from "./email";

export type ShiftSwapStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "voided";

export interface ShiftSwapMember {
  id: number;
  name: string;
  initials: string;
  has_avatar: boolean;
}

export interface ShiftSwapNight {
  id: number;
  name: string;
  date: string; // YYYY-MM-DD
  time_from: string;
  time_to: string;
  location: string;
}

export interface ShiftSwap {
  id: number;
  status: ShiftSwapStatus;
  message: string | null;
  created_at: string;
  responded_at: string | null;
  /** The member who proposed the swap — gives up from_night, receives to_night. */
  from_member: ShiftSwapMember;
  /** The member who was asked — gives up to_night, receives from_night. */
  to_member: ShiftSwapMember;
  from_night: ShiftSwapNight;
  to_night: ShiftSwapNight;
}

/** SSE / notification event kinds for a swap's lifecycle. */
export type ShiftSwapEventType =
  | "proposed"
  | "accepted"
  | "declined"
  | "cancelled"
  | "voided";

type Pool = Awaited<ReturnType<typeof getPool>>;

const SWAP_SELECT = `
  SELECT s.id, s.status, s.message, s.created_at, s.responded_at,
         s.from_member_id, fm.name AS from_member_name, fm.initials AS from_member_initials,
         CASE WHEN fma.member_id IS NOT NULL THEN 1 ELSE 0 END AS from_member_has_avatar,
         s.to_member_id,   tm.name AS to_member_name,   tm.initials AS to_member_initials,
         CASE WHEN tma.member_id IS NOT NULL THEN 1 ELSE 0 END AS to_member_has_avatar,
         s.from_night_id, fn.name AS from_night_name,
         CONVERT(varchar(10), fn.date, 120) AS from_night_date,
         fn.time_from AS from_night_time_from, fn.time_to AS from_night_time_to,
         ISNULL(fl.name + N', ' + fl.address, fn.location) AS from_night_location,
         s.to_night_id,   tn.name AS to_night_name,
         CONVERT(varchar(10), tn.date, 120) AS to_night_date,
         tn.time_from AS to_night_time_from, tn.time_to AS to_night_time_to,
         ISNULL(tl.name + N', ' + tl.address, tn.location) AS to_night_location
  FROM dbo.shift_swaps s
  JOIN dbo.members     fm  ON fm.id = s.from_member_id
  JOIN dbo.members     tm  ON tm.id = s.to_member_id
  JOIN dbo.club_nights fn  ON fn.id = s.from_night_id
  JOIN dbo.club_nights tn  ON tn.id = s.to_night_id
  LEFT JOIN dbo.locations      fl  ON fl.id = fn.location_id
  LEFT JOIN dbo.locations      tl  ON tl.id = tn.location_id
  LEFT JOIN dbo.member_avatars fma ON fma.member_id = s.from_member_id
  LEFT JOIN dbo.member_avatars tma ON tma.member_id = s.to_member_id
`;

const truthy = (v: unknown) => v === true || v === 1;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSwap(r: any): ShiftSwap {
  return {
    id: r.id,
    status: r.status,
    message: r.message ?? null,
    created_at: r.created_at,
    responded_at: r.responded_at ?? null,
    from_member: {
      id: r.from_member_id,
      name: r.from_member_name,
      initials: r.from_member_initials,
      has_avatar: truthy(r.from_member_has_avatar),
    },
    to_member: {
      id: r.to_member_id,
      name: r.to_member_name,
      initials: r.to_member_initials,
      has_avatar: truthy(r.to_member_has_avatar),
    },
    from_night: {
      id: r.from_night_id,
      name: r.from_night_name,
      date: r.from_night_date,
      time_from: r.from_night_time_from,
      time_to: r.from_night_time_to,
      location: r.from_night_location,
    },
    to_night: {
      id: r.to_night_id,
      name: r.to_night_name,
      date: r.to_night_date,
      time_from: r.to_night_time_from,
      time_to: r.to_night_time_to,
      location: r.to_night_location,
    },
  };
}

/** Human-readable "Klubaften 52 (12. marts 2026)" for notification bodies. */
export function nightLabel(night: ShiftSwapNight): string {
  return `${night.name} (${formatDanishDate(night.date)})`;
}

export async function fetchSwapById(
  pool: Pool,
  id: number,
): Promise<ShiftSwap | null> {
  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .query(`${SWAP_SELECT} WHERE s.id = @id`);
  const row = result.recordset[0];
  return row ? mapSwap(row) : null;
}

/** All live proposals the member is party to, newest first. */
export async function fetchPendingSwapsForMember(
  pool: Pool,
  memberId: number,
): Promise<ShiftSwap[]> {
  const result = await pool.request().input("memberId", sql.Int, memberId)
    .query(`${SWAP_SELECT}
      WHERE s.status = N'pending'
        AND (s.from_member_id = @memberId OR s.to_member_id = @memberId)
      ORDER BY s.created_at DESC`);
  return result.recordset.map(mapSwap);
}

/** Push a swap lifecycle event to both parties over SSE. */
export function broadcastSwap(swap: ShiftSwap, type: ShiftSwapEventType): void {
  const payload = { event: "shift_swap", data: { type, swap } };
  broadcastToUser(swap.from_member.id, payload);
  broadcastToUser(swap.to_member.id, payload);
}

/**
 * Void every live proposal that involves a night, because the night changed
 * underneath it (reassigned, cancelled, or its details were edited). Both
 * parties are notified so nobody is left waiting on a dead proposal.
 *
 * Safe to call for any night — it's a no-op when there are no pending swaps.
 */
export async function voidPendingSwapsForNight(
  pool: Pool,
  nightId: number,
  reason: string,
): Promise<void> {
  const pending = await pool.request().input("nightId", sql.Int, nightId)
    .query(`${SWAP_SELECT}
      WHERE s.status = N'pending'
        AND (s.from_night_id = @nightId OR s.to_night_id = @nightId)`);
  if (pending.recordset.length === 0) return;

  const swaps = pending.recordset.map(mapSwap);
  await pool
    .request()
    .input("nightId", sql.Int, nightId)
    .input("respondedAt", sql.DateTime2, new Date().toISOString()).query(`
      UPDATE dbo.shift_swaps
      SET status = N'voided', responded_at = @respondedAt
      WHERE status = N'pending' AND (from_night_id = @nightId OR to_night_id = @nightId)
    `);

  for (const swap of swaps) {
    const voided: ShiftSwap = { ...swap, status: "voided" };
    broadcastSwap(voided, "voided");
    const body = `Vagtbyttet mellem ${nightLabel(swap.from_night)} og ${nightLabel(swap.to_night)} bortfaldt: ${reason}`;
    await createNotification(
      swap.from_member.id,
      "swap_voided",
      body,
      "/member/dashboard",
    );
    await createNotification(
      swap.to_member.id,
      "swap_voided",
      body,
      "/member/dashboard",
    );
  }
}

/**
 * Void proposals involving a night and then remove the rows entirely.
 * Used before a club night is hard-deleted, since shift_swaps has FKs to
 * dbo.club_nights (no cascade — two paths to the same table).
 */
export async function deleteSwapsForNight(
  pool: Pool,
  nightId: number,
  reason: string,
): Promise<void> {
  await voidPendingSwapsForNight(pool, nightId, reason);
  await pool
    .request()
    .input("nightId", sql.Int, nightId)
    .query(
      "DELETE FROM dbo.shift_swaps WHERE from_night_id = @nightId OR to_night_id = @nightId",
    );
}

/** True when the night already has a live handover request in the chat. */
export async function hasPendingHandover(
  pool: Pool,
  nightId: number,
): Promise<boolean> {
  const result = await pool
    .request()
    .input("nightId", sql.Int, nightId)
    .query(
      "SELECT TOP 1 1 AS found FROM dbo.messages WHERE type = N'shift_swap' AND swap_status = N'pending' AND shift_night_id = @nightId",
    );
  return result.recordset.length > 0;
}

/** True when the night is already offered in a live swap proposal. */
export async function hasPendingSwap(
  pool: Pool,
  nightId: number,
): Promise<boolean> {
  const result = await pool
    .request()
    .input("nightId", sql.Int, nightId)
    .query(
      "SELECT TOP 1 1 AS found FROM dbo.shift_swaps WHERE status = N'pending' AND (from_night_id = @nightId OR to_night_id = @nightId)",
    );
  return result.recordset.length > 0;
}
