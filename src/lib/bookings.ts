import {
  formatClock,
  formatDay,
  formatLongDay,
  formatMonthDay,
  formatWhen,
} from "@/lib/format-time";
import type { BookingMode, BookingSettings, WeekdayKey } from "@/lib/types";

export const WEEKDAY_ORDER: WeekdayKey[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

export const DEFAULT_OPEN_DAYS: WeekdayKey[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
];

export const DEFAULT_BOOKING_SETTINGS: Omit<BookingSettings, "page_id"> = {
  enabled: true,
  booking_mode: "hourly",
  slot_minutes: 60,
  open_time: "09:00",
  close_time: "18:00",
  open_days: [...DEFAULT_OPEN_DAYS],
  timezone: "Asia/Tbilisi",
  buffer_minutes: 0,
  max_advance_days: 60,
};

export function weekdayLabel(day: WeekdayKey) {
  const labels: Record<WeekdayKey, string> = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  };
  return labels[day];
}

export function normalizeOpenDays(value: unknown): WeekdayKey[] {
  if (!Array.isArray(value)) return [...DEFAULT_OPEN_DAYS];
  const allowed = new Set<string>(WEEKDAY_ORDER);
  const out: WeekdayKey[] = [];
  for (const raw of value) {
    const key = String(raw).trim().toLowerCase();
    if (allowed.has(key) && !out.includes(key as WeekdayKey)) {
      out.push(key as WeekdayKey);
    }
  }
  return out.length > 0 ? out : [...DEFAULT_OPEN_DAYS];
}

/** Normalize optional resource override; empty/null → null (inherit Page). */
export function normalizeOptionalOpenDays(
  value: unknown,
): WeekdayKey[] | null {
  if (value == null) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  if (!Array.isArray(value)) return null;
  const allowed = new Set<string>(WEEKDAY_ORDER);
  const out: WeekdayKey[] = [];
  for (const raw of value) {
    const key = String(raw).trim().toLowerCase();
    if (allowed.has(key) && !out.includes(key as WeekdayKey)) {
      out.push(key as WeekdayKey);
    }
  }
  return out.length > 0 ? out : null;
}

export function bookingModeLabel(mode: BookingMode) {
  if (mode === "hourly") return "By the hour";
  if (mode === "day") return "Full day";
  return "Multiple days";
}

export function bookingModeHint(mode: BookingMode) {
  if (mode === "hourly") return "Haircuts, tables, calls";
  if (mode === "day") return "Events, day use";
  return "Stays, check-in to check-out";
}

export function formatBookingWhen(
  startsAt: string,
  endsAt: string,
  mode: BookingMode,
  opts?: { hour12?: boolean },
) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(+start) || Number.isNaN(+end)) return "";

  if (mode === "hourly") return formatWhen(start, end, opts);
  if (mode === "day") return formatLongDay(start);
  return `${formatMonthDay(start)} → ${formatMonthDay(end)}, ${end.getFullYear()}`;
}

export function statusLabel(status: string) {
  if (status === "pending") return "Pending";
  if (status === "cancelled") return "Cancelled";
  if (status === "completed") return "Done";
  return "Booked";
}

/** Build ends_at ISO from a local start datetime string + mode. */
export function computeEndsAt(
  startsLocal: string,
  mode: BookingMode,
  slotMinutes: number,
): string | null {
  const start = new Date(startsLocal);
  if (Number.isNaN(+start)) return null;
  const end = new Date(start);
  if (mode === "hourly") {
    end.setMinutes(end.getMinutes() + slotMinutes);
  } else if (mode === "day") {
    end.setHours(23, 59, 0, 0);
  } else {
    // multi_day: default one night → next day same clock
    end.setDate(end.getDate() + 1);
  }
  return end.toISOString();
}

export function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toDateInputValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Local calendar Y-M-D (browser zone). */
export function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(+d) ? null : d;
}

/** Weekday for a calendar YYYY-MM-DD (desk / browser local). */
export function weekdayKeyFromYmd(ymd: string): WeekdayKey | null {
  const d = parseYmd(ymd);
  if (!d) return null;
  const map: WeekdayKey[] = [
    "sun",
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
  ];
  return map[d.getDay()] ?? null;
}

export function addDaysYmd(ymd: string, days: number) {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

/** Sunday-start month cells; null = empty pad. */
export function monthGrid(year: number, monthIndex: number): (number | null)[] {
  const first = new Date(year, monthIndex, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function parseHmMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Local wall-clock hourly starts for a YMD day within open/close. */
export function hourlySlotStarts(
  ymd: string,
  openTime: string,
  closeTime: string,
  slotMinutes: number,
): string[] {
  const open = parseHmMinutes(openTime);
  const close = parseHmMinutes(closeTime);
  if (open == null || close == null || slotMinutes < 1 || close <= open) return [];
  const out: string[] = [];
  for (let t = open; t + slotMinutes <= close; t += slotMinutes) {
    const hh = Math.floor(t / 60);
    const mm = t % 60;
    out.push(`${ymd}T${pad2(hh)}:${pad2(mm)}`);
  }
  return out;
}

export function formatSlotLabel(localStart: string, hour12: boolean) {
  const d = new Date(localStart);
  if (Number.isNaN(+d)) return localStart;
  return formatClock(d, { hour12 });
}

export function formatDayHeader(ymd: string) {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  return formatDay(d);
}

export function formatMonthTitle(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}
