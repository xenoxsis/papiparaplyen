/**
 * ical.ts
 *
 * Minimal RFC 5545 iCalendar builder for subscription feeds.
 *
 * Design choices:
 *  - DTSTART/DTEND use local time with TZID=Europe/Copenhagen.
 *  - DTSTAMP / LAST-MODIFIED are UTC.
 *  - REFRESH-INTERVAL + X-PUBLISHED-TTL hint 1 hour so clients re-fetch.
 *  - Lines are folded at 75 octets per RFC 5545 §3.1.
 *  - Stable UIDs ensure calendar clients update existing events on re-fetch.
 */

export type IcalEvent = {
  uid: string;
  summary: string;
  location: string;
  date: string; // YYYY-MM-DD
  timeFrom: string; // HH:MM
  timeTo: string; // HH:MM
  updatedAt: string; // ISO 8601 or SQL datetime string
  description?: string;
};

/** Fold a single iCal content line at 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  const MAX = 75;
  if (line.length <= MAX) return line;
  const parts: string[] = [line.slice(0, MAX)];
  let i = MAX;
  while (i < line.length) {
    parts.push(" " + line.slice(i, i + MAX - 1));
    i += MAX - 1;
  }
  return parts.join("\r\n");
}

/** Escape text property values (SUMMARY, LOCATION, DESCRIPTION). */
function escText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** YYYY-MM-DD + HH:MM  →  iCal local datetime YYYYMMDDTHHMMSS */
function toLocalDt(date: string, time: string): string {
  const [y, m, d] = date.split("-");
  const [hh, mm] = time.split(":");
  return `${y}${m}${d}T${hh}${mm}00`;
}

/** ISO / SQL datetime string  →  iCal UTC datetime YYYYMMDDTHHMMSSz */
function toUtcDt(iso: string): string {
  const dt = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(dt.getUTCDate())}` +
    `T${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}${p(dt.getUTCSeconds())}Z`
  );
}

/** Minimal VTIMEZONE block for Europe/Copenhagen (CET/CEST). */
const VTIMEZONE_COPENHAGEN = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Copenhagen",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10",
  "END:STANDARD",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
].join("\r\n");

/**
 * Build a complete VCALENDAR document (CRLF line endings, RFC 5545).
 * The returned string can be sent directly with Content-Type: text/calendar.
 */
export function buildIcal(calName: string, events: IcalEvent[]): string {
  const now = toUtcDt(new Date().toISOString());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Esbjerg Brætspil//Paraplyen//DA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${escText(calName)}`),
    "X-WR-TIMEZONE:Europe/Copenhagen",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    VTIMEZONE_COPENHAGEN,
  ];

  for (const evt of events) {
    const dtStart = toLocalDt(evt.date, evt.timeFrom);
    const dtEnd = toLocalDt(evt.date, evt.timeTo);
    let lastMod: string;
    try {
      lastMod = toUtcDt(evt.updatedAt);
    } catch {
      lastMod = now;
    }

    lines.push(
      "BEGIN:VEVENT",
      fold(`UID:${evt.uid}`),
      `DTSTAMP:${now}`,
      `DTSTART;TZID=Europe/Copenhagen:${dtStart}`,
      `DTEND;TZID=Europe/Copenhagen:${dtEnd}`,
      fold(`SUMMARY:${escText(evt.summary)}`),
      fold(`LOCATION:${escText(evt.location)}`),
      `LAST-MODIFIED:${lastMod}`,
      "SEQUENCE:0",
    );
    if (evt.description) {
      lines.push(fold(`DESCRIPTION:${escText(evt.description)}`));
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
