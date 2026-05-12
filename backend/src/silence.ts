/**
 * Global silence flag.
 *
 * When silenced, emails and push-notifications are suppressed entirely.
 * This is useful for testing without alerting real users.
 *
 * The flag lives in-memory and resets to false on server restart.
 */

let _silenced = false;

export function isSilenced(): boolean {
  return _silenced;
}

export function setSilenced(value: boolean): void {
  _silenced = value;
  console.info(
    `[silence] notifications/emails are now ${value ? "SILENCED" : "enabled"}`,
  );
}
