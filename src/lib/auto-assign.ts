/**
 * Auto-assign rule engine for club night shifts (vagtplan).
 *
 * Rules can be enabled/disabled per member via the rule_* flags on ApiMember.
 * See the eligibility filter inside `autoAssign` for how each rule is gated.
 */

import type { ApiClubNight, ApiMember } from "./api";

// ── Types ────────────────────────────────────────────────────────────────────

/** A resolved assignment: night id + the member assigned to it. */
export type Assignment = {
  nightId: number;
  memberId: number;
  /** ISO date string of the night, kept so rules can do date arithmetic. */
  date: string;
};

/**
 * A rule returns `{ ok: true }` when the candidate is eligible,
 * or `{ ok: false, reason: string }` when they should be excluded.
 *
 * @param candidate   The member being evaluated.
 * @param night       The night being filled.
 * @param assigned    All assignments decided so far (saved + pending + earlier
 *                    in the current auto-assign run), sorted by date ascending.
 */
export type Rule = (
  candidate: ApiMember,
  night: ApiClubNight,
  assigned: Assignment[],
) => { ok: true } | { ok: false; reason: string };

// ── Built-in rules ───────────────────────────────────────────────────────────

/**
 * A member may not work two consecutive nights.
 * "Consecutive" means the immediately preceding or following night in the list.
 */
export const ruleNotTwoInARow: Rule = (candidate, night, assigned) => {
  const sorted = [...assigned].sort((a, b) => a.date.localeCompare(b.date));
  const idx = sorted.findIndex((a) => a.date >= night.date);

  // Night directly before this one (in assignment list)
  const prev = idx > 0 ? sorted[idx - 1] : sorted[sorted.length - 1];
  // Night directly after this one
  const next = idx !== -1 ? sorted[idx] : undefined;

  if (prev?.memberId === candidate.id) {
    return { ok: false, reason: "Ville give to vagter i træk" };
  }
  if (next?.memberId === candidate.id && next.date <= night.date) {
    return { ok: false, reason: "Ville give to vagter i træk" };
  }
  return { ok: true };
};

/**
 * A member may not work a weekday night (Mon–Sat) if they worked the Sunday
 * immediately preceding it (i.e. within the same 7-day window).
 */
export const ruleNoWeekdayAfterSunday: Rule = (candidate, night, assigned) => {
  const nightDate = new Date(night.date);
  const dayOfWeek = nightDate.getDay(); // 0 = Sun, 1 = Mon … 6 = Sat

  // Only applies to weekday nights (Mon=1 … Sat=6)
  if (dayOfWeek === 0) return { ok: true };

  // Find the most recent Sunday before this night
  const sundayDate = new Date(nightDate);
  sundayDate.setDate(nightDate.getDate() - dayOfWeek); // rewind to Sunday
  const sundayStr = sundayDate.toISOString().slice(0, 10);

  const workedSunday = assigned.some(
    (a) => a.memberId === candidate.id && a.date === sundayStr,
  );

  if (workedSunday) {
    return {
      ok: false,
      reason: "Arbejdede søndagen inden denne hverdag",
    };
  }
  return { ok: true };
};

/**
 * Opt-in per-member rule: blocks the member from being assigned to any
 * Saturday or Sunday night. Independent of `assigned`.
 */
export function ruleNoWeekends(night: ApiClubNight): {
  blocks: boolean;
} {
  const dow = new Date(night.date).getDay();
  return { blocks: dow === 0 || dow === 6 };
}

// ── Core algorithm ────────────────────────────────────────────────────────────

function shiftCount(memberId: number, assigned: Assignment[]): number {
  return assigned.filter((a) => a.memberId === memberId).length;
}

/**
 * Most recent shift date for a member (ISO YYYY-MM-DD).
 * Returns "" when the member has never worked — sorts lexicographically before
 * any real date, so never-worked members are preferred by the tie-breaker.
 */
function lastShiftDate(memberId: number, assigned: Assignment[]): string {
  let max = "";
  for (const a of assigned) {
    if (a.memberId === memberId && a.date > max) max = a.date;
  }
  return max;
}

export type AutoAssignResult = {
  /** New pendingChanges entries to merge in (nightId → memberId). */
  assignments: Record<number, number>;
  /** Night IDs that could not be filled (no eligible candidate). */
  problemNightIds: number[];
};

/**
 * Auto-assigns vagter to all future nights that are currently unassigned.
 *
 * @param nights         Full list of club nights.
 * @param vagter         Members with the Vagt role.
 * @param pendingChanges Current draft state (nightId → memberId | null).
 */
export function autoAssign(
  nights: ApiClubNight[],
  vagter: ApiMember[],
  pendingChanges: Record<number, number | null>,
): AutoAssignResult {
  const todayStr = new Date().toISOString().slice(0, 10);

  // Build the full picture of already-assigned nights (saved + pending).
  const baseAssigned: Assignment[] = nights
    .filter((n) => {
      if (n.id in pendingChanges) {
        return pendingChanges[n.id] !== null;
      }
      return n.vagt_member_id !== null;
    })
    .map((n) => ({
      nightId: n.id,
      memberId:
        n.id in pendingChanges
          ? (pendingChanges[n.id] as number)
          : (n.vagt_member_id as number),
      date: n.date,
    }));

  // Nights to fill: future, unassigned (not in pendingChanges with a value,
  // and no saved vagt), sorted ascending.
  const toFill = nights
    .filter((n) => {
      if (n.date < todayStr) return false;
      if (n.id in pendingChanges) return pendingChanges[n.id] === null;
      return n.vagt_member_id === null;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const runAssigned: Assignment[] = []; // assignments decided in this run
  const assignments: Record<number, number> = {};
  const problemNightIds: number[] = [];

  for (const night of toFill) {
    const allAssigned = [...baseAssigned, ...runAssigned];

    // Filter out opted-out members
    const optedOutIds = new Set(night.opted_out_members.map((o) => o.id));
    const candidates = vagter.filter((v) => !optedOutIds.has(v.id));

    // Apply rules — each rule can be disabled per-member via rule_* flags.
    const eligible = candidates.filter((m) => {
      if (
        !m.rule_allow_two_in_a_row &&
        !ruleNotTwoInARow(m, night, allAssigned).ok
      )
        return false;
      if (
        !m.rule_allow_weekday_after_sunday &&
        !ruleNoWeekdayAfterSunday(m, night, allAssigned).ok
      )
        return false;
      if (m.rule_no_weekends && ruleNoWeekends(night).blocks) return false;
      return true;
    });

    if (eligible.length === 0) {
      problemNightIds.push(night.id);
      continue;
    }

    // Pick: fewest total shifts first, then prefer the member whose last
    // shift was longest ago (or who's never worked). This spreads shifts
    // out even when rules technically allow stacking.
    const chosen = eligible.reduce((best, m) => {
      const bCount = shiftCount(best.id, allAssigned);
      const mCount = shiftCount(m.id, allAssigned);
      if (mCount !== bCount) return mCount < bCount ? m : best;
      return lastShiftDate(m.id, allAssigned) <
        lastShiftDate(best.id, allAssigned)
        ? m
        : best;
    });

    assignments[night.id] = chosen.id;
    runAssigned.push({
      nightId: night.id,
      memberId: chosen.id,
      date: night.date,
    });
  }

  return { assignments, problemNightIds };
}
