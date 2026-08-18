/** Minimal RFC 5545 (iCalendar) parsing — just enough for Canvas calendar feeds. No dependencies. */

export interface IcsEvent {
  uid: string;
  summary: string;
  description: string;
  /** ISO timestamp, or null when unparseable. */
  startAt: string | null;
  endAt: string | null;
  url: string | null;
  location: string | null;
  /** True for VALUE=DATE (all-day) entries. */
  allDay: boolean;
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseIcsDate(value: string, allDay: boolean): string | null {
  if (allDay || /^\d{8}$/.test(value)) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(value);
    if (!m) return null;
    // All-day entries become local midnight; callers decide day-end semantics.
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toISOString();
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z === "Z") return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString();
  // Naive local time (TZID handling approximated as machine-local).
  return new Date(+y, +mo - 1, +d, +h, +mi, +s).toISOString();
}

export function parseIcs(text: string): IcsEvent[] {
  // Unfold continuation lines (CRLF followed by space or tab).
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events: IcsEvent[] = [];
  let cur: Record<string, { params: string; value: string }> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) {
        const get = (name: string) => cur![name]?.value ?? "";
        const params = (name: string) => cur![name]?.params ?? "";
        const allDay = /VALUE=DATE(?:;|$)/i.test(params("DTSTART")) || /^\d{8}$/.test(get("DTSTART"));
        events.push({
          uid: get("UID"),
          summary: unescapeText(get("SUMMARY")),
          description: unescapeText(get("DESCRIPTION")),
          startAt: get("DTSTART") ? parseIcsDate(get("DTSTART"), allDay) : null,
          endAt: get("DTEND") ? parseIcsDate(get("DTEND"), allDay) : null,
          url: get("URL") || null,
          location: unescapeText(get("LOCATION")) || null,
          allDay,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const rawName = line.slice(0, idx);
    const name = rawName.split(";")[0].toUpperCase();
    // First occurrence wins (Canvas doesn't repeat properties we care about).
    if (!cur[name]) cur[name] = { params: rawName.toUpperCase(), value: line.slice(idx + 1) };
  }
  return events;
}
