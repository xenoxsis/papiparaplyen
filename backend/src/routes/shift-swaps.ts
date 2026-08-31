/**
 * routes/shift-swaps.ts — /api/shift-swaps
 *
 * Mutual shift swaps ("Byt vagt"): a targeted 1:1 proposal where member A
 * offers their shift in exchange for member B's shift.
 *
 * Accepting trades both assignments and confirms both shifts in one
 * transaction — neither member has to press "Bekræft vagt" afterwards, since
 * both already agreed by making/accepting the proposal.
 *
 * The older broadcast flow (any vagt may take an offered shift) is a HANDOVER
 * and still lives in routes/channels.ts as a chat message.
 */

import { Router } from "express";
import { getPool, sql } from "../db";
import { callerId, isAdmin, requireAuth } from "../auth";
import { createNotification } from "../notifications";
import { logEvent } from "../audit";
import { broadcastToUser, getConnectedUserIds } from "../broadcaster";
import {
  broadcastSwap,
  fetchPendingSwapsForMember,
  fetchSwapById,
  hasPendingHandover,
  nightLabel,
  voidPendingSwapsForNight,
  type ShiftSwap,
  type ShiftSwapNight,
} from "../shiftSwaps";
import {
  sendSwapAcceptedEmail,
  sendSwapDeclinedEmail,
  sendSwapProposedEmail,
} from "../scheduleEmails";
import { fetchNightWithOptOuts } from "./club-nights";

const router = Router();

type NightCheckRow = {
  id: number;
  name: string;
  date: string;
  time_from: string;
  time_to: string;
  location: string;
  vagt_member_id: number | null;
  status: string;
  cancelled: boolean | number;
  assignee_is_virtual: boolean | number | null;
};

const truthy = (v: unknown) => v === true || v === 1;

/** Load the facts needed to validate a night as either side of a swap. */
async function loadNightForSwap(
  pool: Awaited<ReturnType<typeof getPool>>,
  nightId: number,
): Promise<NightCheckRow | null> {
  const result = await pool.request().input("id", sql.Int, nightId).query(`
      SELECT n.id, n.name,
             CONVERT(varchar(10), n.date, 120) AS date,
             n.time_from, n.time_to,
             ISNULL(l.name + N', ' + l.address, n.location) AS location,
             n.vagt_member_id, n.[status], n.cancelled,
             vm.is_virtual AS assignee_is_virtual
      FROM dbo.club_nights n
      LEFT JOIN dbo.locations l  ON l.id  = n.location_id
      LEFT JOIN dbo.members   vm ON vm.id = n.vagt_member_id
      WHERE n.id = @id
    `);
  return result.recordset[0] ?? null;
}

/** A night can only take part in a swap while it is still ahead of us. */
function isInFuture(night: { date: string; time_to: string }): boolean {
  const end = new Date(`${night.date}T${night.time_to || "23:59:59"}`);
  if (!Number.isFinite(end.getTime())) return true;
  return end > new Date();
}

async function isOptedOut(
  pool: Awaited<ReturnType<typeof getPool>>,
  nightId: number,
  memberId: number,
): Promise<boolean> {
  const result = await pool
    .request()
    .input("nightId", sql.Int, nightId)
    .input("memberId", sql.Int, memberId)
    .query(
      "SELECT TOP 1 1 AS found FROM dbo.club_night_opt_outs WHERE club_night_id = @nightId AND member_id = @memberId",
    );
  return result.recordset.length > 0;
}

/** Push both traded nights to every connected schedule view. */
async function broadcastTradedNights(
  pool: Awaited<ReturnType<typeof getPool>>,
  nightIds: number[],
): Promise<void> {
  const userIds = getConnectedUserIds();
  for (const nightId of nightIds) {
    const night = await fetchNightWithOptOuts(pool, nightId);
    const payload = {
      event: "schedule_updated",
      data: { type: "night_confirmed", night },
    };
    for (const uid of userIds) broadcastToUser(uid, payload);
  }
}

const toSummary = (night: ShiftSwapNight) => ({
  name: night.name,
  date: night.date,
  time_from: night.time_from,
  time_to: night.time_to,
  location: night.location,
});

// GET /api/shift-swaps — live proposals the caller is party to
router.get("/", requireAuth, async (req, res) => {
  const caller = callerId(res);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  const swaps = await fetchPendingSwapsForMember(pool, caller);
  return res.json(swaps);
});

// POST /api/shift-swaps — propose a swap
// Body: { from_night_id, to_night_id, message? }
router.post("/", requireAuth, async (req, res) => {
  const caller = callerId(res);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  const fromNightId = Number(req.body?.from_night_id);
  const toNightId = Number(req.body?.to_night_id);
  if (!Number.isInteger(fromNightId) || !Number.isInteger(toNightId)) {
    return res.status(400).json({ error: "Ugyldige vagter" });
  }
  if (fromNightId === toNightId) {
    return res.status(400).json({ error: "Vælg to forskellige vagter" });
  }

  const rawMessage: unknown = req.body?.message;
  const message =
    typeof rawMessage === "string" && rawMessage.trim().length > 0
      ? rawMessage.trim().slice(0, 500)
      : null;

  const pool = await getPool();
  const fromNight = await loadNightForSwap(pool, fromNightId);
  const toNight = await loadNightForSwap(pool, toNightId);
  if (!fromNight || !toNight) {
    return res.status(404).json({ error: "Klubaften ikke fundet" });
  }

  // The offered shift must be the caller's own, live and ahead of us.
  if (fromNight.vagt_member_id !== caller) {
    return res.status(403).json({ error: "Det er ikke din vagt" });
  }
  if (truthy(fromNight.cancelled) || truthy(toNight.cancelled)) {
    return res.status(409).json({ error: "En af aftenerne er aflyst" });
  }
  if (fromNight.status !== "published" || toNight.status !== "published") {
    return res.status(409).json({ error: "Aftenen er ikke offentliggjort" });
  }
  if (!isInFuture(fromNight) || !isInFuture(toNight)) {
    return res.status(409).json({ error: "Vagten er allerede afholdt" });
  }

  // The target shift must belong to another real member.
  const toMemberId = toNight.vagt_member_id;
  if (toMemberId === null) {
    return res.status(409).json({ error: "Den valgte vagt har ingen vagt på" });
  }
  if (toMemberId === caller) {
    return res.status(400).json({ error: "Du har allerede den vagt" });
  }
  if (truthy(toNight.assignee_is_virtual)) {
    return res
      .status(409)
      .json({ error: "Du kan ikke bytte med en virtuel vagt" });
  }

  // Neither member may be pushed onto a night they explicitly opted out of.
  if (await isOptedOut(pool, toNightId, caller)) {
    return res.status(409).json({ error: "Du har meldt fra den aften" });
  }
  if (await isOptedOut(pool, fromNightId, toMemberId)) {
    return res
      .status(409)
      .json({ error: "Modtageren har meldt fra din aften" });
  }

  // One live request per shift — swap and handover can't both be open.
  const existing = await pool
    .request()
    .input("fromNightId", sql.Int, fromNightId)
    .input("toNightId", sql.Int, toNightId)
    .query(
      "SELECT TOP 1 from_night_id FROM dbo.shift_swaps WHERE status = N'pending' AND from_night_id IN (@fromNightId, @toNightId)",
    );
  if (existing.recordset.length > 0) {
    return res.status(409).json({
      error:
        existing.recordset[0].from_night_id === fromNightId
          ? "Du har allerede foreslået et bytte for denne vagt"
          : "Den valgte vagt er allerede sat til bytte",
    });
  }
  if (await hasPendingHandover(pool, fromNightId)) {
    return res
      .status(409)
      .json({ error: "Du har allerede afgivet denne vagt i vagter-kanalen" });
  }

  const insert = await pool
    .request()
    .input("fromMemberId", sql.Int, caller)
    .input("fromNightId", sql.Int, fromNightId)
    .input("toMemberId", sql.Int, toMemberId)
    .input("toNightId", sql.Int, toNightId)
    .input("message", sql.NVarChar(500), message).query(`
      INSERT INTO dbo.shift_swaps (from_member_id, from_night_id, to_member_id, to_night_id, message)
      OUTPUT INSERTED.id
      VALUES (@fromMemberId, @fromNightId, @toMemberId, @toNightId, @message)
    `);

  const swap = await fetchSwapById(pool, insert.recordset[0].id);
  if (!swap) return res.status(500).json({ error: "Kunne ikke oprette bytte" });

  broadcastSwap(swap, "proposed");
  await createNotification(
    toMemberId,
    "swap_proposed",
    `${swap.from_member.name} vil bytte ${nightLabel(swap.from_night)} for din vagt ${nightLabel(swap.to_night)}`,
    "/member/dashboard",
  );
  sendSwapProposedEmail(
    toMemberId,
    swap.from_member.name,
    toSummary(swap.to_night),
    toSummary(swap.from_night),
    swap.message,
  ).catch((err) =>
    console.error("[shift-swaps] swap-proposed email failed:", err),
  );
  logEvent({
    eventType: "shift.swap_propose",
    actorMemberId: caller,
    targetMemberId: toMemberId,
    detail: {
      swapId: swap.id,
      fromNightId,
      toNightId,
      fromNight: swap.from_night.name,
      toNight: swap.to_night.name,
    },
    ip: req.ip,
  });

  return res.status(201).json(swap);
});

// POST /api/shift-swaps/:id/accept — the asked member takes the trade
router.post("/:id/accept", requireAuth, async (req, res) => {
  const caller = callerId(res);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  const swapId = Number(req.params.id);
  const swap = await fetchSwapById(pool, swapId);
  if (!swap) return res.status(404).json({ error: "Byttet findes ikke" });
  if (swap.to_member.id !== caller) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (swap.status !== "pending") {
    return res.status(409).json({ error: "Byttet er ikke længere aktivt" });
  }

  // Re-validate: the world may have moved since the proposal was made.
  const fromNight = await loadNightForSwap(pool, swap.from_night.id);
  const toNight = await loadNightForSwap(pool, swap.to_night.id);
  const stillValid =
    fromNight !== null &&
    toNight !== null &&
    fromNight.vagt_member_id === swap.from_member.id &&
    toNight.vagt_member_id === swap.to_member.id &&
    !truthy(fromNight.cancelled) &&
    !truthy(toNight.cancelled) &&
    isInFuture(fromNight) &&
    isInFuture(toNight);
  if (!stillValid) {
    await voidPendingSwapsForNight(
      pool,
      swap.from_night.id,
      "vagterne er ændret",
    );
    return res
      .status(409)
      .json({ error: "Vagterne er ændret — byttet kan ikke gennemføres" });
  }

  // Trade both assignments and confirm them in one go.
  const now = new Date().toISOString();
  const tx = pool.transaction();
  await tx.begin();
  try {
    const swapNight = (nightId: number, fromMember: number, toMember: number) =>
      tx
        .request()
        .input("nightId", sql.Int, nightId)
        .input("currentMemberId", sql.Int, fromMember)
        .input("newMemberId", sql.Int, toMember)
        .input("updatedAt", sql.DateTime2, now).query(`
          UPDATE dbo.club_nights
          SET vagt_member_id = @newMemberId, vagt_confirmed = 1, updated_at = @updatedAt
          WHERE id = @nightId AND vagt_member_id = @currentMemberId
        `);

    const a = await swapNight(
      swap.from_night.id,
      swap.from_member.id,
      swap.to_member.id,
    );
    const b = await swapNight(
      swap.to_night.id,
      swap.to_member.id,
      swap.from_member.id,
    );
    const c = await tx
      .request()
      .input("id", sql.Int, swapId)
      .input("respondedAt", sql.DateTime2, now)
      .query(
        "UPDATE dbo.shift_swaps SET status = N'accepted', responded_at = @respondedAt WHERE id = @id AND status = N'pending'",
      );

    if (
      a.rowsAffected[0] !== 1 ||
      b.rowsAffected[0] !== 1 ||
      c.rowsAffected[0] !== 1
    ) {
      throw new Error("swap rows changed under us");
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    console.error("[shift-swaps] accept failed:", err);
    return res
      .status(409)
      .json({ error: "Vagterne er ændret — byttet kan ikke gennemføres" });
  }

  // Any other live proposal touching either night is now stale.
  await voidPendingSwapsForNight(
    pool,
    swap.from_night.id,
    "vagten indgik i et andet bytte",
  );
  await voidPendingSwapsForNight(
    pool,
    swap.to_night.id,
    "vagten indgik i et andet bytte",
  );

  const accepted: ShiftSwap = {
    ...swap,
    status: "accepted",
    responded_at: now,
  };
  broadcastSwap(accepted, "accepted");
  await broadcastTradedNights(pool, [swap.from_night.id, swap.to_night.id]);

  await createNotification(
    swap.from_member.id,
    "swap_accepted",
    `${swap.to_member.name} accepterede byttet — du har nu ${nightLabel(swap.to_night)}`,
    "/member/schedule",
  );
  await createNotification(
    swap.to_member.id,
    "swap_accepted",
    `Byttet med ${swap.from_member.name} er gennemført — du har nu ${nightLabel(swap.from_night)}`,
    "/member/schedule",
  );
  Promise.allSettled([
    sendSwapAcceptedEmail(
      swap.from_member.id,
      swap.to_member.name,
      toSummary(swap.from_night),
      toSummary(swap.to_night),
    ),
    sendSwapAcceptedEmail(
      swap.to_member.id,
      swap.from_member.name,
      toSummary(swap.to_night),
      toSummary(swap.from_night),
    ),
  ]).catch(() => {});

  logEvent({
    eventType: "shift.swap_accept",
    actorMemberId: caller,
    targetMemberId: swap.from_member.id,
    detail: {
      swapId,
      fromNightId: swap.from_night.id,
      toNightId: swap.to_night.id,
      fromNight: swap.from_night.name,
      toNight: swap.to_night.name,
    },
    ip: req.ip,
  });

  return res.json(accepted);
});

// POST /api/shift-swaps/:id/decline — the asked member turns it down
router.post("/:id/decline", requireAuth, async (req, res) => {
  const caller = callerId(res);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  const swapId = Number(req.params.id);
  const swap = await fetchSwapById(pool, swapId);
  if (!swap) return res.status(404).json({ error: "Byttet findes ikke" });
  if (swap.to_member.id !== caller) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (swap.status !== "pending") {
    return res.status(409).json({ error: "Byttet er ikke længere aktivt" });
  }

  const now = new Date().toISOString();
  await pool
    .request()
    .input("id", sql.Int, swapId)
    .input("respondedAt", sql.DateTime2, now)
    .query(
      "UPDATE dbo.shift_swaps SET status = N'declined', responded_at = @respondedAt WHERE id = @id AND status = N'pending'",
    );

  const declined: ShiftSwap = {
    ...swap,
    status: "declined",
    responded_at: now,
  };
  broadcastSwap(declined, "declined");
  await createNotification(
    swap.from_member.id,
    "swap_declined",
    `${swap.to_member.name} afviste byttet — du beholder ${nightLabel(swap.from_night)}`,
    "/member/dashboard",
  );
  sendSwapDeclinedEmail(
    swap.from_member.id,
    swap.to_member.name,
    toSummary(swap.from_night),
  ).catch((err) =>
    console.error("[shift-swaps] swap-declined email failed:", err),
  );
  logEvent({
    eventType: "shift.swap_decline",
    actorMemberId: caller,
    targetMemberId: swap.from_member.id,
    detail: { swapId, fromNightId: swap.from_night.id, toNightId: swap.to_night.id },
    ip: req.ip,
  });

  return res.json(declined);
});

// DELETE /api/shift-swaps/:id — the proposer withdraws their offer
router.delete("/:id", requireAuth, async (req, res) => {
  const caller = callerId(res);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  const pool = await getPool();
  const swapId = Number(req.params.id);
  const swap = await fetchSwapById(pool, swapId);
  if (!swap) return res.status(404).json({ error: "Byttet findes ikke" });
  if (swap.from_member.id !== caller && !isAdmin(res)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (swap.status !== "pending") {
    return res.status(409).json({ error: "Byttet er ikke længere aktivt" });
  }

  const now = new Date().toISOString();
  await pool
    .request()
    .input("id", sql.Int, swapId)
    .input("respondedAt", sql.DateTime2, now)
    .query(
      "UPDATE dbo.shift_swaps SET status = N'cancelled', responded_at = @respondedAt WHERE id = @id AND status = N'pending'",
    );

  const cancelled: ShiftSwap = {
    ...swap,
    status: "cancelled",
    responded_at: now,
  };
  broadcastSwap(cancelled, "cancelled");
  await createNotification(
    swap.to_member.id,
    "swap_cancelled",
    `${swap.from_member.name} trak byttet om ${nightLabel(swap.from_night)} tilbage`,
    "/member/dashboard",
  );
  logEvent({
    eventType: "shift.swap_cancel",
    actorMemberId: caller,
    targetMemberId: swap.to_member.id,
    detail: { swapId, fromNightId: swap.from_night.id, toNightId: swap.to_night.id },
    ip: req.ip,
  });

  return res.json(cancelled);
});

export default router;
