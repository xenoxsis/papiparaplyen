/**
 * Auto-assign rule engine for club night shifts (vagtplan).
 *
 * Rules can be enabled/disabled per member via the rule_* flags on ApiMember.
 * The rule primitives live in `schedule-validation.ts` so the calendar view
 * and the auto-assigner can never drift apart.
 */

import type { ApiClubNight, ApiMember } from "./api";
import {
  type Assignment,
  isWeekendDate,
  violatesTwoInARow,
  violatesWeekdayAfterSunday,
} from "./schedule-validation";

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
        violatesTwoInARow(m.id, night.date, allAssigned)
      )
        return false;
      if (
        !m.rule_allow_weekday_after_sunday &&
        violatesWeekdayAfterSunday(m.id, night.date, allAssigned)
      )
        return false;
      if (m.rule_no_weekends && isWeekendDate(night.date)) return false;
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
