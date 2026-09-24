/**
 * One time format for the whole desk.
 *   clock   → "6:42 PM"           (no leading zero, 12h) / "18:42" (24h)
 *   day     → "Wed, Sep 30"
 *   when    → "Wed, Sep 30 · 3:00–4:00 PM"
 *   relative→ "6:42 PM" today, "Sep 30" otherwise
 */

const SHORT_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function asDate(input: string | number | Date): Date | null {
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(+d) ? null : d;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export type ClockOptions = {
  /** Default true → "6:42 PM". false → "18:42". */
  hour12?: boolean;
  /** Omit ":00" on whole hours when true → "3 PM". */
  compact?: boolean;
  /** Omit the meridiem (used for the start of a range that shares it). */
  noMeridiem?: boolean;
};

export function formatClock(
  input: string | number | Date,
  opts: ClockOptions = {},
): string {
  const d = asDate(input);
  if (!d) return "";
  const hour12 = opts.hour12 !== false;
  const h = d.getHours();
  const m = d.getMinutes();
  if (!hour12) return `${pad2(h)}:${pad2(m)}`;
  const meridiem = h < 12 ? "AM" : "PM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  const minutes = opts.compact && m === 0 ? "" : `:${pad2(m)}`;
  return opts.noMeridiem ? `${hh}${minutes}` : `${hh}${minutes} ${meridiem}`;
}

export function formatDay(input: string | number | Date): string {
  const d = asDate(input);
  if (!d) return "";
  return `${SHORT_DAY[d.getDay()]}, ${SHORT_MONTH[d.getMonth()]} ${d.getDate()}`;
}

export function formatMonthDay(input: string | number | Date): string {
  const d = asDate(input);
  if (!d) return "";
  return `${SHORT_MONTH[d.getMonth()]} ${d.getDate()}`;
}

export function formatLongDay(input: string | number | Date): string {
  const d = asDate(input);
  if (!d) return "";
  return `${SHORT_DAY[d.getDay()]}, ${SHORT_MONTH[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "3:00–4:00 PM" · "11:30 AM–1:00 PM" · 24h: "15:00–16:00" */
export function formatClockRange(
  start: string | number | Date,
  end: string | number | Date,
  opts: ClockOptions = {},
): string {
  const a = asDate(start);
  const b = asDate(end);
  if (!a || !b) return "";
  const hour12 = opts.hour12 !== false;
  if (!hour12) {
    return `${formatClock(a, opts)}–${formatClock(b, opts)}`;
  }
  const sameMeridiem = a.getHours() < 12 === b.getHours() < 12;
  const first = formatClock(a, { ...opts, noMeridiem: sameMeridiem });
  return `${first}–${formatClock(b, opts)}`;
}

/** "Wed, Sep 30 · 3:00–4:00 PM" */
export function formatWhen(
  start: string | number | Date,
  end: string | number | Date,
  opts: ClockOptions = {},
): string {
  const a = asDate(start);
  if (!a) return "";
  return `${formatDay(a)} · ${formatClockRange(a, end, opts)}`;
}

/** "Wed, Sep 30 · 6:42 PM" */
export function formatDayClock(
  input: string | number | Date,
  opts: ClockOptions = {},
): string {
  const d = asDate(input);
  if (!d) return "";
  return `${formatDay(d)} · ${formatClock(d, opts)}`;
}

/** Sidebar / list style: today → clock, else → "Sep 30". */
export function formatRelativeShort(input: string | number | Date): string {
  const d = asDate(input);
  if (!d) return "";
  const now = new Date();
  if (isSameDay(d, now)) return formatClock(d);
  if (d.getFullYear() === now.getFullYear()) return formatMonthDay(d);
  return `${formatMonthDay(d)} ${d.getFullYear()}`;
}

/** Message bubble style: today → "6:42 PM", else → "Sep 30 · 6:42 PM". */
export function formatMessageTime(input: string | number | Date): string {
  const d = asDate(input);
  if (!d) return "";
  const now = new Date();
  if (isSameDay(d, now)) return formatClock(d);
  return `${formatMonthDay(d)} · ${formatClock(d)}`;
}

/** "just now" · "2 min ago" · "6:42 PM" */
export function formatAgo(
  input: string | number | Date,
  labels?: { justNow?: string; minAgo?: (n: number) => string },
): string {
  const d = asDate(input);
  if (!d) return "";
  const diff = Date.now() - +d;
  if (diff < 45_000) return labels?.justNow ?? "just now";
  if (diff < 3_600_000) {
    const n = Math.max(1, Math.round(diff / 60_000));
    return labels?.minAgo?.(n) ?? `${n} min ago`;
  }
  return formatClock(d);
}

/** "HH:MM" wall-clock string → pretty label for the active clock mode. */
export function formatHm(hm: string, opts: ClockOptions = {}): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return hm;
  const d = new Date(2000, 0, 1, Number(m[1]), Number(m[2]));
  return formatClock(d, opts);
}

/** "09:00–18:00" or "9:00 AM–6:00 PM" from two HH:MM strings. */
export function formatHmRange(
  open: string,
  close: string,
  opts: ClockOptions = {},
): string {
  const parse = (hm: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
    return m ? new Date(2000, 0, 1, Number(m[1]), Number(m[2])) : null;
  };
  const a = parse(open);
  const b = parse(close);
  if (!a || !b) return `${open}–${close}`;
  return formatClockRange(a, b, opts);
}
