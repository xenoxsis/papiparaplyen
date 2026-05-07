/**
 * presence.ts
 *
 * Lightweight in-memory last-seen tracker.
 * Updated on every authenticated request via requireAuth middleware.
 * Used to suppress emails when the recipient is actively using the site.
 */

const lastSeen = new Map<number, number>(); // memberId -> Date.now() ms

/** Record that a member just made an authenticated request. */
export function touchPresence(memberId: number): void {
  lastSeen.set(memberId, Date.now());
}

/**
 * Returns true if the member was active within `windowMs` milliseconds.
 * Defaults to 5 minutes.
 */
export function isRecentlyActive(
  memberId: number,
  windowMs = 5 * 60 * 1000,
): boolean {
  const ts = lastSeen.get(memberId);
  if (ts === undefined) return false;
  return Date.now() - ts < windowMs;
}
