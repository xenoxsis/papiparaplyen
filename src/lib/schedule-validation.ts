/**
 * Per-night rule validation for vagter — extracted from auto-assign.ts so the
 * calendar view can highlight rule violations on manually-placed assignments
 * without having to re-run the full auto-assigner.
 *
 * `auto-assign.ts` imports the same rule primitives so the calendar and the
 * auto-assigner can never drift apart.
 */

import type { ApiClubNight, ApiMember } from "./api";

export type Violation = {
  code:
    | "two_in_a_row"
    | "weekday_after_sunday"
    | "no_weekends"
    | "opted_out";
  message: string;
};

export type Assignment = {
  nightId: number;
  memberId: number;
  /** ISO `YYYY-MM-DD`. */
  date: string;
};

// ── Rule primitives (pure) ───────────────────────────────────────────────────

/**
 * Two-in-a-row: candidate may not be the assignee of the club night immediately
 * preceding or following this one in the sorted club-night list. "In a row"
 * means consecutive club nights, not adjacent calendar days — club nights are
 * sparse and a vagt back-to-back across two club nights is the load to avoid.
 *
 * The `assigned` list should NOT contain an entry for `nightDate` itself; the
 * caller is responsible for excluding the night being evaluated.
 */
export function violatesTwoInARow(
  candidateId: number,
  nightDate: string,
  assigned: Assignment[],
): boolean {
  const sorted = [...assigned].sort((a, b) => a.date.localeCompare(b.date));
  // Index of the first assignment whose date is >= this night's date.
  const idx = sorted.findIndex((a) => a.date >= nightDate);
  const prev =
    idx === -1
      ? sorted[sorted.length - 1]
      : idx > 0
        ? sorted[idx - 1]
        : undefined;
  const next = idx !== -1 ? sorted[idx] : undefined;
  if (prev?.memberId === candidateId) return true;
  if (next?.memberId === candidateId && next.date > nightDate) return true;
  return false;
}

/**
 * Weekday-after-Sunday: candidate may not work a Mon–Sat night if they worked
 * the immediately preceding Sunday (same 7-day window).
 */
export function violatesWeekdayAfterSunday(
  candidateId: number,
  nightDate: string,
  assigned: Assignment[],
): boolean {
  const d = parseLocalDate(nightDate);
  const dow = d.getDay(); // 0 = Sun … 6 = Sat
  if (dow === 0) return false; // not a weekday

  const sunday = new Date(d);
  sunday.setDate(d.getDate() - dow);
  const sundayStr = isoLocalDate(sunday);

  return assigned.some(
    (a) => a.memberId === candidateId && a.date === sundayStr,
  );
}

/** Sat / Sun. */
export function isWeekendDate(nightDate: string): boolean {
  const dow = parseLocalDate(nightDate).getDay();
  return dow === 0 || dow === 6;
}

// ── Main validator ───────────────────────────────────────────────────────────

/**
 * Returns the list of rules a manually-placed assignment would violate.
 * Used by the calendar view to draw warning rings around offending cells.
 *
 * The caller passes the full set of nights and an `effective(night)` resolver
 * that returns the member currently *staged* for each night (taking pending
 * draft changes into account).
 */
export function validateAssignment(
  memberId: number,
  night: ApiClubNight,
  allNights: ApiClubNight[],
  effective: (n: ApiClubNight) => { id: number } | null,
  vagter: ApiMember[],
): Violation[] {
  const violations: Violation[] = [];
  const member = vagter.find((v) => v.id === memberId);
  if (!member) return violations;

  // Opted-out
  if (night.opted_out_members.some((o) => o.id === memberId)) {
    violations.push({
      code: "opted_out",
      message: "Vagten har meldt fra denne aften",
    });
  }

  // Build the assignment landscape from every other night's effective member.
  const assigned: Assignment[] = [];
  for (const n of allNights) {
    if (n.id === night.id) continue;
    const v = effective(n);
    if (v) assigned.push({ nightId: n.id, memberId: v.id, date: n.date });
  }

  if (
    !member.rule_allow_two_in_a_row &&
    violatesTwoInARow(memberId, night.date, assigned)
  ) {
    violations.push({
      code: "two_in_a_row",
      message: "Ville give to vagter i træk",
    });
  }

  if (
    !member.rule_allow_weekday_after_sunday &&
    violatesWeekdayAfterSunday(memberId, night.date, assigned)
  ) {
    violations.push({
      code: "weekday_after_sunday",
      message: "Arbejdede søndagen inden denne hverdag",
    });
  }

  if (member.rule_no_weekends && isWeekendDate(night.date)) {
    violations.push({
      code: "no_weekends",
      message: "Vagten tager ikke weekendaftener",
    });
  }

  return violations;
}

// ── Local helpers ────────────────────────────────────────────────────────────

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isoLocalDate(d: Date): string {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${d.getFullYear()}-${m < 10 ? `0${m}` : m}-${day < 10 ? `0${day}` : day}`;
}

