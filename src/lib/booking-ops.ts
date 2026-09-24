import {
  DEFAULT_BOOKING_SETTINGS,
  normalizeOpenDays,
} from "@/lib/bookings";
import {
  capacityUnitsFor,
  effectiveWindowForPair,
  loadActiveResources,
} from "@/lib/resource-ops";
import { combinedProviderWindow } from "@/lib/resource-hours";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  BookableResource,
  Booking,
  BookingMode,
  BookingSettings,
  WeekdayKey,
} from "@/lib/types";

function normalizeMode(value: unknown): BookingMode {
  if (value === "day" || value === "multi_day" || value === "hourly") return value;
  return "hourly";
}

export function normalizeBookingSettings(
  pageId: string,
  row: Partial<BookingSettings> | null,
): BookingSettings {
  return {
    page_id: pageId,
    enabled: row?.enabled ?? DEFAULT_BOOKING_SETTINGS.enabled,
    booking_mode: normalizeMode(row?.booking_mode),
    slot_minutes: row?.slot_minutes ?? DEFAULT_BOOKING_SETTINGS.slot_minutes,
    open_time: row?.open_time ?? DEFAULT_BOOKING_SETTINGS.open_time,
    close_time: row?.close_time ?? DEFAULT_BOOKING_SETTINGS.close_time,
    open_days: normalizeOpenDays(
      row?.open_days ?? DEFAULT_BOOKING_SETTINGS.open_days,
    ),
    timezone: row?.timezone ?? DEFAULT_BOOKING_SETTINGS.timezone,
    buffer_minutes: row?.buffer_minutes ?? DEFAULT_BOOKING_SETTINGS.buffer_minutes,
    max_advance_days: row?.max_advance_days ?? DEFAULT_BOOKING_SETTINGS.max_advance_days,
    updated_at: row?.updated_at,
  };
}

export async function loadBookingSettings(pageId: string): Promise<BookingSettings> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("messenger_booking_settings")
    .select("*")
    .eq("page_id", pageId)
    .maybeSingle();
  return normalizeBookingSettings(pageId, data);
}

/** Convert a wall-clock date+time in `timeZone` to a UTC Date. */
export function zonedWallTimeToUtc(
  dateYmd: string,
  timeHm: string,
  timeZone: string,
): Date {
  const [y, mo, d] = dateYmd.split("-").map(Number);
  const [hh, mm] = timeHm.split(":").map(Number);
  if (!y || !mo || !d || Number.isNaN(hh) || Number.isNaN(mm)) {
    return new Date(NaN);
  }

  // Start with a UTC guess, then correct using the zone's offset at that instant.
  let utcMs = Date.UTC(y, mo - 1, d, hh, mm, 0, 0);
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(utcMs));

    const get = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value ?? NaN);

    let hour = get("hour");
    if (hour === 24) hour = 0;

    const asUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      hour,
      get("minute"),
      get("second"),
    );
    const desired = Date.UTC(y, mo - 1, d, hh, mm, 0, 0);
    utcMs += desired - asUtc;
  }
  return new Date(utcMs);
}

export function formatInZone(isoOrDate: string | Date, timeZone: string) {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function parseHm(value: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
  bufferMinutes: number,
) {
  const buf = bufferMinutes * 60_000;
  const a0 = aStart.getTime() - buf;
  const a1 = aEnd.getTime() + buf;
  const b0 = bStart.getTime();
  const b1 = bEnd.getTime();
  return a0 < b1 && b0 < a1;
}

export function isCapacityConflictError(error: {
  code?: string | null;
  message?: string | null;
} | null): boolean {
  return (
    error?.code === "23P01" ||
    error?.message?.includes("messenger_bookings_no_capacity_overlap") === true
  );
}

/**
 * Busy intervals for conflict checks on a capacity unit (staff/room/…).
 * - No resourceId → entire Page calendar (legacy / no resources).
 * - With resourceId → bookings where that unit is primary OR assigned,
 *   plus null-resource (legacy) bookings that block everyone.
 */
type BusyRow = {
  starts: Date;
  ends: Date;
  resource_id: string | null;
  assigned_resource_id: string | null;
};

async function loadBusyRows(
  pageId: string,
  fromIso: string,
  toIso: string,
  excludeBookingId?: string | null,
): Promise<BusyRow[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("messenger_bookings")
    .select("id, starts_at, ends_at, status, resource_id, assigned_resource_id")
    .eq("page_id", pageId)
    .neq("status", "cancelled")
    .lt("starts_at", toIso)
    .gt("ends_at", fromIso)
    .limit(300);

  return (data ?? [])
    .filter((row) => row.status !== "cancelled")
    .filter((row) => !excludeBookingId || row.id !== excludeBookingId)
    .map((row) => ({
      starts: new Date(row.starts_at as string),
      ends: new Date(row.ends_at as string),
      resource_id: (row.resource_id as string | null) ?? null,
      assigned_resource_id: (row.assigned_resource_id as string | null) ?? null,
    }));
}

function busyForResource(
  rows: BusyRow[],
  resourceId?: string | null,
): Array<{ starts: Date; ends: Date }> {
  return rows
    .filter((row) => {
      if (!resourceId) return true;
      const rid = row.resource_id;
      const aid = row.assigned_resource_id;
      return rid === null || rid === resourceId || aid === resourceId;
    })
    .map((row) => ({ starts: row.starts, ends: row.ends }));
}

async function loadBusyRanges(
  pageId: string,
  fromIso: string,
  toIso: string,
  excludeBookingId?: string | null,
  resourceId?: string | null,
): Promise<Array<{ starts: Date; ends: Date }>> {
  const rows = await loadBusyRows(pageId, fromIso, toIso, excludeBookingId);
  return busyForResource(rows, resourceId);
}

function hoursForResource(
  settings: BookingSettings,
  resource?: BookableResource | null,
): { open_time: string; close_time: string; open_days: WeekdayKey[] } {
  return {
    open_time: resource?.open_time?.trim() || settings.open_time,
    close_time: resource?.close_time?.trim() || settings.close_time,
    open_days:
      resource?.open_days && resource.open_days.length > 0
        ? resource.open_days
        : settings.open_days,
  };
}

const SHORT_TO_KEY: Record<string, WeekdayKey> = {
  mon: "mon",
  tue: "tue",
  wed: "wed",
  thu: "thu",
  fri: "fri",
  sat: "sat",
  sun: "sun",
};

/** Weekday key for a YYYY-MM-DD date in a timezone. */
export function weekdayKeyForYmd(
  dateYmd: string,
  timeZone: string,
): WeekdayKey | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return null;
  const instant = zonedWallTimeToUtc(dateYmd, "12:00", timeZone);
  if (Number.isNaN(+instant)) return null;
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  })
    .format(instant)
    .slice(0, 3)
    .toLowerCase();
  return SHORT_TO_KEY[short] ?? null;
}

function ymdInTimezone(isoOrDate: string | Date, timeZone: string): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function ymdsSpanned(
  starts: Date,
  ends: Date,
  timeZone: string,
): string[] {
  const startYmd = ymdInTimezone(starts, timeZone);
  let endYmd = ymdInTimezone(ends, timeZone);
  // If ends exactly at midnight / open of next day, don't require that day
  const endHm = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(ends);
  if (endHm === "00:00" || endHm === "24:00") {
    endYmd = addDaysYmd(endYmd, -1);
  }
  if (endYmd < startYmd) return [startYmd];
  const out: string[] = [];
  let cursor = startYmd;
  for (let i = 0; i < 400; i++) {
    out.push(cursor);
    if (cursor === endYmd) break;
    cursor = addDaysYmd(cursor, 1);
  }
  return out;
}

function isOpenOnDates(
  openDays: WeekdayKey[],
  starts: Date,
  ends: Date,
  timeZone: string,
): boolean {
  const set = new Set(openDays);
  for (const ymd of ymdsSpanned(starts, ends, timeZone)) {
    const key = weekdayKeyForYmd(ymd, timeZone);
    if (!key || !set.has(key)) return false;
  }
  return true;
}

function withinHoursFor(
  settings: BookingSettings,
  starts: Date,
  openTime: string,
  closeTime: string,
) {
  if (settings.booking_mode !== "hourly") return true;
  const open = parseHm(openTime);
  const close = parseHm(closeTime);
  if (!open || !close) return true;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: settings.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(starts);
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  const startMin = h * 60 + m;
  const openMin = open.h * 60 + open.m;
  const closeMin = close.h * 60 + close.m;
  const endMin = startMin + settings.slot_minutes;
  return startMin >= openMin && endMin <= closeMin;
}

function buildRange(
  settings: BookingSettings,
  date: string,
  time?: string | null,
  endDate?: string | null,
): { starts: Date; ends: Date; error?: string } {
  const mode = settings.booking_mode;
  const tz = settings.timezone;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { starts: new Date(NaN), ends: new Date(NaN), error: "date must be YYYY-MM-DD" };
  }

  if (mode === "hourly") {
    const t = time?.trim() || "";
    if (!parseHm(t)) {
      return {
        starts: new Date(NaN),
        ends: new Date(NaN),
        error: "time (HH:mm) is required for hourly bookings",
      };
    }
    const starts = zonedWallTimeToUtc(date, t, tz);
    const ends = addMinutes(starts, settings.slot_minutes);
    return { starts, ends };
  }

  if (mode === "day") {
    const starts = zonedWallTimeToUtc(date, settings.open_time, tz);
    const ends = zonedWallTimeToUtc(date, settings.close_time, tz);
    return { starts, ends };
  }

  const checkout = (endDate?.trim() || date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkout)) {
    return {
      starts: new Date(NaN),
      ends: new Date(NaN),
      error: "end_date must be YYYY-MM-DD",
    };
  }
  const starts = zonedWallTimeToUtc(date, settings.open_time, tz);
  const ends = zonedWallTimeToUtc(checkout, settings.close_time, tz);
  if (ends <= starts) {
    return {
      starts,
      ends,
      error: "end_date must be after date for multi-day stays",
    };
  }
  return { starts, ends };
}

function withinHours(settings: BookingSettings, starts: Date, ends: Date) {
  return withinHoursFor(
    settings,
    starts,
    settings.open_time,
    settings.close_time,
  );
}

function withinAdvanceWindow(settings: BookingSettings, starts: Date) {
  const now = Date.now();
  if (starts.getTime() < now - 60_000) return false;
  const max = now + settings.max_advance_days * 86_400_000;
  return starts.getTime() <= max;
}

export type AvailabilityResult = {
  ok: boolean;
  available: boolean;
  mode: BookingMode;
  message: string;
  requested?: string;
  free_slots?: string[];
  /** Primary booked resource (service, staff, …). */
  resource_id?: string | null;
  resource_name?: string | null;
  /** Capacity unit reserved when primary has associations. */
  assigned_resource_id?: string | null;
  assigned_resource_name?: string | null;
};

/** True if this capacity unit is free for the interval. */
function isResourceIntervalFree(input: {
  settings: BookingSettings;
  resource: BookableResource;
  starts: Date;
  ends: Date;
  busy: Array<{ starts: Date; ends: Date }>;
}): boolean {
  const hours = hoursForResource(input.settings, input.resource);
  if (
    !isOpenOnDates(
      hours.open_days,
      input.starts,
      input.ends,
      input.settings.timezone,
    )
  ) {
    return false;
  }
  if (
    !withinHoursFor(
      input.settings,
      input.starts,
      hours.open_time,
      hours.close_time,
    )
  ) {
    return false;
  }
  return !input.busy.some((b) =>
    overlaps(
      input.starts,
      input.ends,
      b.starts,
      b.ends,
      input.settings.buffer_minutes,
    ),
  );
}

async function findFreeAssignment(input: {
  pageId: string;
  settings: BookingSettings;
  primary: BookableResource;
  all: BookableResource[];
  starts: Date;
  ends: Date;
  excludeBookingId?: string | null;
  /** Preloaded page busy rows for this interval (avoids N queries). */
  busyRows?: BusyRow[];
}): Promise<{
  primary: BookableResource;
  capacity: BookableResource;
} | null> {
  const byId = new Map(input.all.map((r) => [r.id, r]));
  const units = capacityUnitsFor(input.primary, byId);
  const fallback = {
    open_time: input.settings.open_time,
    close_time: input.settings.close_time,
    open_days: input.settings.open_days,
  };
  const busyRows =
    input.busyRows ??
    (await loadBusyRows(
      input.pageId,
      input.starts.toISOString(),
      input.ends.toISOString(),
      input.excludeBookingId,
    ));

  for (const unit of units) {
    const effective =
      input.primary.id === unit.id
        ? {
            open_time: unit.open_time?.trim() || fallback.open_time,
            close_time: unit.close_time?.trim() || fallback.close_time,
            open_days:
              unit.open_days && unit.open_days.length > 0
                ? unit.open_days
                : fallback.open_days,
          }
        : effectiveWindowForPair({
            primary: input.primary,
            capacity: unit,
            fallback,
          });
    if (!effective) continue;
    if (
      !isOpenOnDates(
        effective.open_days,
        input.starts,
        input.ends,
        input.settings.timezone,
      )
    ) {
      continue;
    }
    if (
      !withinHoursFor(
        input.settings,
        input.starts,
        effective.open_time,
        effective.close_time,
      )
    ) {
      continue;
    }
    const free = isResourceIntervalFree({
      settings: input.settings,
      resource: unit,
      starts: input.starts,
      ends: input.ends,
      busy: busyForResource(busyRows, unit.id),
    });
    if (free) {
      return { primary: input.primary, capacity: unit };
    }
  }
  return null;
}

function assignmentFields(assignment: {
  primary: BookableResource;
  capacity: BookableResource;
}) {
  const same = assignment.primary.id === assignment.capacity.id;
  return {
    resource_id: assignment.primary.id,
    resource_name: assignment.primary.name,
    assigned_resource_id: same ? null : assignment.capacity.id,
    assigned_resource_name: same ? null : assignment.capacity.name,
  };
}

export async function checkAvailability(input: {
  pageId: string;
  settings: BookingSettings;
  date: string;
  time?: string | null;
  end_date?: string | null;
  excludeBookingId?: string | null;
  /** Pin a specific resource; omit for any-available when resources exist. */
  resourceId?: string | null;
  /**
   * When false, skip computing free_slots (desk save path).
   * Defaults true so AI tools still get alternatives on conflict.
   */
  includeFreeSlots?: boolean;
}): Promise<AvailabilityResult> {
  const { settings } = input;
  const wantSlots = input.includeFreeSlots !== false;
  if (!settings.enabled) {
    return {
      ok: false,
      available: false,
      mode: settings.booking_mode,
      message: "Online booking is turned off for this Page.",
    };
  }

  const range = buildRange(settings, input.date, input.time, input.end_date);
  if (range.error || Number.isNaN(+range.starts) || Number.isNaN(+range.ends)) {
    return {
      ok: false,
      available: false,
      mode: settings.booking_mode,
      message: range.error ?? "Could not parse the requested time.",
    };
  }

  if (!withinAdvanceWindow(settings, range.starts)) {
    return {
      ok: true,
      available: false,
      mode: settings.booking_mode,
      message: `That time is outside the bookable window (up to ${settings.max_advance_days} days ahead, and not in the past).`,
      requested: formatInZone(range.starts, settings.timezone),
    };
  }

  const resources = await loadActiveResources(input.pageId);
  const requested = `${formatInZone(range.starts, settings.timezone)} → ${formatInZone(range.ends, settings.timezone)}`;
  const slotSuggest = async (resourceId: string | null) =>
    wantSlots && settings.booking_mode === "hourly"
      ? await listFreeSlotLabels(
          input.pageId,
          settings,
          input.date,
          input.excludeBookingId,
          resourceId,
          resources,
        )
      : undefined;

  // Legacy: no active resources → page-level calendar
  if (resources.length === 0) {
    if (
      !isOpenOnDates(
        settings.open_days,
        range.starts,
        range.ends,
        settings.timezone,
      )
    ) {
      return {
        ok: true,
        available: false,
        mode: settings.booking_mode,
        message: `That day is closed (open: ${settings.open_days.join(", ")}).`,
        requested: formatInZone(range.starts, settings.timezone),
      };
    }

    if (!withinHours(settings, range.starts, range.ends)) {
      return {
        ok: true,
        available: false,
        mode: settings.booking_mode,
        message: `That time is outside open hours (${settings.open_time}–${settings.close_time} ${settings.timezone}).`,
        requested: formatInZone(range.starts, settings.timezone),
        free_slots: await slotSuggest(null),
      };
    }

    const busy = await loadBusyRanges(
      input.pageId,
      range.starts.toISOString(),
      range.ends.toISOString(),
      input.excludeBookingId,
    );
    const conflict = busy.some((b) =>
      overlaps(range.starts, range.ends, b.starts, b.ends, settings.buffer_minutes),
    );

    if (conflict) {
      return {
        ok: true,
        available: false,
        mode: settings.booking_mode,
        message: "That slot is already taken.",
        requested,
        free_slots: await slotSuggest(null),
      };
    }

    return {
      ok: true,
      available: true,
      mode: settings.booking_mode,
      message: "Slot is free.",
      requested,
    };
  }

  const intervalBusy = await loadBusyRows(
    input.pageId,
    range.starts.toISOString(),
    range.ends.toISOString(),
    input.excludeBookingId,
  );

  // Specific resource (may be a service with linked staff)
  if (input.resourceId) {
    const resource = resources.find((r) => r.id === input.resourceId);
    if (!resource) {
      return {
        ok: false,
        available: false,
        mode: settings.booking_mode,
        message: "That resource was not found or is inactive.",
      };
    }
    const assignment = await findFreeAssignment({
      pageId: input.pageId,
      settings,
      primary: resource,
      all: resources,
      starts: range.starts,
      ends: range.ends,
      excludeBookingId: input.excludeBookingId,
      busyRows: intervalBusy,
    });
    if (!assignment) {
      const hours = hoursForResource(settings, resource);
      return {
        ok: true,
        available: false,
        mode: settings.booking_mode,
        message:
          resource.kind === "service" && resource.linked_ids.length > 0
            ? `${resource.name} has no assigned staff member who is working and free then.`
            : `${resource.name} is not free then (hours ${hours.open_time}–${hours.close_time}).`,
        requested,
        resource_id: resource.id,
        resource_name: resource.name,
        free_slots: await slotSuggest(resource.id),
      };
    }
    const fields = assignmentFields(assignment);
    return {
      ok: true,
      available: true,
      mode: settings.booking_mode,
      message: fields.assigned_resource_name
        ? `${resource.name} is free (with ${fields.assigned_resource_name}).`
        : `${resource.name} is free.`,
      requested,
      ...fields,
    };
  }

  // Any available — first free primary by sort_order (services use linked capacity)
  for (const resource of resources) {
    const assignment = await findFreeAssignment({
      pageId: input.pageId,
      settings,
      primary: resource,
      all: resources,
      starts: range.starts,
      ends: range.ends,
      excludeBookingId: input.excludeBookingId,
      busyRows: intervalBusy,
    });
    if (assignment) {
      const fields = assignmentFields(assignment);
      return {
        ok: true,
        available: true,
        mode: settings.booking_mode,
        message: fields.assigned_resource_name
          ? `Slot is free (will book ${fields.resource_name} with ${fields.assigned_resource_name}).`
          : `Slot is free (will assign ${fields.resource_name}).`,
        requested,
        ...fields,
      };
    }
  }

  return {
    ok: true,
    available: false,
    mode: settings.booking_mode,
    message: "No resource is free at that time.",
    requested,
    free_slots: await slotSuggest(null),
  };
}

async function listFreeSlotLabels(
  pageId: string,
  settings: BookingSettings,
  date: string,
  excludeBookingId?: string | null,
  /** null/undefined = any-available (or legacy); string = that resource only */
  resourceId?: string | null,
  preloadedResources?: BookableResource[],
): Promise<string[]> {
  if (settings.booking_mode !== "hourly") return [];

  const resources = preloadedResources ?? (await loadActiveResources(pageId));
  const useResources = resources.length > 0;
  const scoped = useResources
    ? resourceId
      ? resources.filter((r) => r.id === resourceId)
      : resources
    : [];

  if (useResources && resourceId && scoped.length === 0) return [];

  let openTime = settings.open_time;
  let closeTime = settings.close_time;
  if (scoped.length === 1) {
    const resource = scoped[0];
    const byId = new Map(resources.map((item) => [item.id, item]));
    const capacities = capacityUnitsFor(resource, byId);
    const combined =
      resource.kind === "service" &&
      capacities.some((capacity) => capacity.id !== resource.id)
        ? combinedProviderWindow({
            primary: resource,
            providers: capacities,
            fallback: {
              open_time: settings.open_time,
              close_time: settings.close_time,
              open_days: settings.open_days,
            },
          })
        : null;
    const hours = combined ?? hoursForResource(settings, resource);
    openTime = hours.open_time;
    closeTime = hours.close_time;
  }

  const open = parseHm(openTime);
  const close = parseHm(closeTime);
  if (!open || !close) return [];

  const dayStart = zonedWallTimeToUtc(date, openTime, settings.timezone);
  const dayEnd = zonedWallTimeToUtc(date, closeTime, settings.timezone);
  if (Number.isNaN(+dayStart) || Number.isNaN(+dayEnd)) return [];

  const step = settings.slot_minutes;
  const closeMin = close.h * 60 + close.m;
  const free: string[] = [];

  // One busy fetch for the whole day — reuse across every slot / resource check
  const dayBusy = await loadBusyRows(
    pageId,
    dayStart.toISOString(),
    dayEnd.toISOString(),
    excludeBookingId,
  );

  if (!useResources) {
    const busy = busyForResource(dayBusy, null);
    let cursor = open.h * 60 + open.m;
    while (cursor + step <= closeMin) {
      const hh = String(Math.floor(cursor / 60)).padStart(2, "0");
      const mm = String(cursor % 60).padStart(2, "0");
      const starts = zonedWallTimeToUtc(date, `${hh}:${mm}`, settings.timezone);
      const ends = addMinutes(starts, settings.slot_minutes);
      if (
        withinAdvanceWindow(settings, starts) &&
        !busy.some((b) =>
          overlaps(starts, ends, b.starts, b.ends, settings.buffer_minutes),
        )
      ) {
        free.push(`${hh}:${mm}`);
      }
      cursor += step;
    }
    return free.slice(0, 24);
  }

  let cursor = open.h * 60 + open.m;
  while (cursor + step <= closeMin) {
    const hh = String(Math.floor(cursor / 60)).padStart(2, "0");
    const mm = String(cursor % 60).padStart(2, "0");
    const starts = zonedWallTimeToUtc(date, `${hh}:${mm}`, settings.timezone);
    const ends = addMinutes(starts, settings.slot_minutes);

    if (withinAdvanceWindow(settings, starts)) {
      for (const resource of scoped) {
        const assignment = await findFreeAssignment({
          pageId,
          settings,
          primary: resource,
          all: resources,
          starts,
          ends,
          excludeBookingId,
          busyRows: dayBusy,
        });
        if (assignment) {
          free.push(`${hh}:${mm}`);
          break;
        }
      }
    }
    cursor += step;
  }

  return free.slice(0, 24);
}

export type BookingSummary = {
  id: string;
  status: string;
  service_label: string | null;
  customer_name: string | null;
  notes: string | null;
  resource_id: string | null;
  resource_name?: string | null;
  assigned_resource_id?: string | null;
  assigned_resource_name?: string | null;
  when: string;
  starts_at: string;
  ends_at: string;
};

function toSummary(
  row: Booking,
  timezone: string,
  names?: {
    resourceName?: string | null;
    assignedName?: string | null;
  },
): BookingSummary {
  return {
    id: row.id,
    status: row.status,
    service_label: row.service_label,
    customer_name: row.customer_name,
    notes: row.notes,
    resource_id: row.resource_id ?? null,
    resource_name: names?.resourceName ?? null,
    assigned_resource_id: row.assigned_resource_id ?? null,
    assigned_resource_name: names?.assignedName ?? null,
    when: `${formatInZone(row.starts_at, timezone)} → ${formatInZone(row.ends_at, timezone)}`,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
  };
}

export async function listOpenSlots(input: {
  pageId: string;
  settings: BookingSettings;
  date: string;
  excludeBookingId?: string | null;
  resourceId?: string | null;
}): Promise<{
  ok: boolean;
  message: string;
  date?: string;
  free_slots?: string[];
  mode: BookingMode;
}> {
  if (!input.settings.enabled) {
    return {
      ok: false,
      mode: input.settings.booking_mode,
      message: "Online booking is turned off for this Page.",
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return {
      ok: false,
      mode: input.settings.booking_mode,
      message: "date must be YYYY-MM-DD",
    };
  }

  if (input.settings.booking_mode === "hourly") {
    const free_slots = await listFreeSlotLabels(
      input.pageId,
      input.settings,
      input.date,
      input.excludeBookingId,
      input.resourceId ?? null,
    );
    return {
      ok: true,
      mode: "hourly",
      date: input.date,
      free_slots,
      message:
        free_slots.length > 0
          ? `Open times on ${input.date}: ${free_slots.join(", ")}`
          : `No open hourly slots on ${input.date}.`,
    };
  }

  const availability = await checkAvailability({
    pageId: input.pageId,
    settings: input.settings,
    date: input.date,
    excludeBookingId: input.excludeBookingId,
    resourceId: input.resourceId,
  });
  return {
    ok: true,
    mode: input.settings.booking_mode,
    date: input.date,
    message: availability.available
      ? `${input.date} is available${availability.resource_name ? ` (${availability.resource_name})` : ""}.`
      : availability.message,
    free_slots: availability.available ? [input.date] : [],
  };
}

export async function listCustomerBookings(input: {
  pageId: string;
  peerId: string;
  settings: BookingSettings;
  include_past?: boolean;
}): Promise<{ ok: boolean; message: string; bookings: BookingSummary[] }> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("messenger_bookings")
    .select("*")
    .eq("page_id", input.pageId)
    .eq("peer_id", input.peerId)
    .order("starts_at", { ascending: true })
    .limit(40);

  if (!input.include_past) {
    const cutoff = new Date(Date.now() - 6 * 3600_000).toISOString();
    query = query.gte("ends_at", cutoff).neq("status", "cancelled");
  }

  const { data, error } = await query;
  if (error) {
    return { ok: false, message: error.message, bookings: [] };
  }

  const bookings = (data ?? []).map((row) =>
    toSummary(row as Booking, input.settings.timezone),
  );
  return {
    ok: true,
    message:
      bookings.length === 0
        ? "No bookings found for this customer."
        : `Found ${bookings.length} booking(s).`,
    bookings,
  };
}

export async function getCustomerBooking(input: {
  pageId: string;
  peerId: string;
  settings: BookingSettings;
  bookingId: string;
}): Promise<{ ok: boolean; message: string; booking?: BookingSummary }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_bookings")
    .select("*")
    .eq("id", input.bookingId)
    .eq("page_id", input.pageId)
    .eq("peer_id", input.peerId)
    .maybeSingle();

  if (error) return { ok: false, message: error.message };
  if (!data) {
    return {
      ok: false,
      message: "Booking not found for this customer (check the booking id).",
    };
  }

  const booking = toSummary(data as Booking, input.settings.timezone);
  return { ok: true, message: "Booking found.", booking };
}

export type CreateBookingResult = {
  ok: boolean;
  message: string;
  booking?: BookingSummary;
};

export async function createAiBooking(input: {
  pageId: string;
  peerId: string;
  settings: BookingSettings;
  date: string;
  time?: string | null;
  end_date?: string | null;
  service_label?: string | null;
  customer_name?: string | null;
  notes?: string | null;
  /** Pin a resource; omit for any-available assignment. */
  resourceId?: string | null;
}): Promise<CreateBookingResult> {
  const availability = await checkAvailability({
    pageId: input.pageId,
    settings: input.settings,
    date: input.date,
    time: input.time,
    end_date: input.end_date,
    resourceId: input.resourceId,
  });

  if (!availability.ok || !availability.available) {
    return {
      ok: false,
      message:
        availability.message +
        (availability.free_slots?.length
          ? ` Free times that day: ${availability.free_slots.join(", ")}.`
          : ""),
    };
  }

  const range = buildRange(
    input.settings,
    input.date,
    input.time,
    input.end_date,
  );
  if (range.error || Number.isNaN(+range.starts)) {
    return { ok: false, message: range.error ?? "Invalid time" };
  }

  const primaryId = availability.resource_id ?? null;
  const capacityId = availability.assigned_resource_id ?? null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_bookings")
    .insert({
      page_id: input.pageId,
      peer_id: input.peerId,
      customer_name: input.customer_name?.trim() || null,
      service_label: input.service_label?.trim() || null,
      notes: input.notes?.trim() || null,
      resource_id: primaryId,
      assigned_resource_id: capacityId,
      starts_at: range.starts.toISOString(),
      ends_at: range.ends.toISOString(),
      status: "confirmed",
      source: "ai",
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      message: isCapacityConflictError(error)
        ? "That team member was just booked for another service. Please choose another time."
        : error?.message ?? "Failed to save booking",
    };
  }

  const booking = toSummary(data as Booking, input.settings.timezone, {
    resourceName: availability.resource_name,
    assignedName: availability.assigned_resource_name,
  });
  const who = availability.assigned_resource_name
    ? `${availability.resource_name} with ${availability.assigned_resource_name}`
    : availability.resource_name;
  return {
    ok: true,
    message: who ? `Booked ${booking.when} (${who})` : `Booked ${booking.when}`,
    booking,
  };
}

export async function cancelCustomerBooking(input: {
  pageId: string;
  peerId: string;
  settings: BookingSettings;
  bookingId: string;
}): Promise<CreateBookingResult> {
  const existing = await getCustomerBooking(input);
  if (!existing.ok || !existing.booking) {
    return { ok: false, message: existing.message };
  }
  if (existing.booking.status === "cancelled") {
    return {
      ok: true,
      message: "That booking was already cancelled.",
      booking: existing.booking,
    };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_bookings")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", input.bookingId)
    .eq("page_id", input.pageId)
    .eq("peer_id", input.peerId)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, message: error?.message ?? "Failed to cancel booking" };
  }

  const booking = toSummary(data as Booking, input.settings.timezone);
  return { ok: true, message: `Cancelled booking ${booking.when}`, booking };
}

export async function completeCustomerBooking(input: {
  pageId: string;
  peerId: string;
  settings: BookingSettings;
  bookingId: string;
}): Promise<CreateBookingResult> {
  const existing = await getCustomerBooking(input);
  if (!existing.ok || !existing.booking) {
    return { ok: false, message: existing.message };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_bookings")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", input.bookingId)
    .eq("page_id", input.pageId)
    .eq("peer_id", input.peerId)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, message: error?.message ?? "Failed to complete booking" };
  }

  const booking = toSummary(data as Booking, input.settings.timezone);
  return { ok: true, message: `Marked booking done (${booking.when})`, booking };
}

export async function updateCustomerBooking(input: {
  pageId: string;
  peerId: string;
  settings: BookingSettings;
  bookingId: string;
  date?: string | null;
  time?: string | null;
  end_date?: string | null;
  service_label?: string | null;
  customer_name?: string | null;
  notes?: string | null;
  resourceId?: string | null;
}): Promise<CreateBookingResult> {
  const existing = await getCustomerBooking({
    pageId: input.pageId,
    peerId: input.peerId,
    settings: input.settings,
    bookingId: input.bookingId,
  });
  if (!existing.ok || !existing.booking) {
    return { ok: false, message: existing.message };
  }
  if (
    existing.booking.status === "cancelled" ||
    existing.booking.status === "completed"
  ) {
    return {
      ok: false,
      message: `Cannot edit a ${existing.booking.status} booking. Create a new one instead.`,
    };
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  const pinResource =
    input.resourceId !== undefined && input.resourceId !== null
      ? input.resourceId
      : existing.booking.resource_id;

  const wantsReschedule = Boolean(input.date?.trim());
  if (wantsReschedule) {
    const availability = await checkAvailability({
      pageId: input.pageId,
      settings: input.settings,
      date: input.date!.trim(),
      time: input.time,
      end_date: input.end_date,
      excludeBookingId: input.bookingId,
      resourceId: pinResource,
    });
    if (!availability.ok || !availability.available) {
      return {
        ok: false,
        message:
          availability.message +
          (availability.free_slots?.length
            ? ` Free times: ${availability.free_slots.join(", ")}.`
            : ""),
      };
    }
    const range = buildRange(
      input.settings,
      input.date!.trim(),
      input.time,
      input.end_date,
    );
    if (range.error || Number.isNaN(+range.starts)) {
      return { ok: false, message: range.error ?? "Invalid time" };
    }
    patch.starts_at = range.starts.toISOString();
    patch.ends_at = range.ends.toISOString();
    patch.status = "confirmed";
    if (availability.resource_id) {
      patch.resource_id = availability.resource_id;
    }
    patch.assigned_resource_id = availability.assigned_resource_id ?? null;
  } else if (input.resourceId !== undefined) {
    patch.resource_id = input.resourceId || null;
  }

  if (input.service_label !== undefined && input.service_label !== null) {
    patch.service_label = input.service_label.trim() || null;
  }
  if (input.customer_name !== undefined && input.customer_name !== null) {
    patch.customer_name = input.customer_name.trim() || null;
  }
  if (input.notes !== undefined && input.notes !== null) {
    patch.notes = input.notes.trim() || null;
  }

  if (Object.keys(patch).length <= 1) {
    return {
      ok: false,
      message: "Nothing to update. Pass a new date/time and/or service/notes.",
    };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_bookings")
    .update(patch)
    .eq("id", input.bookingId)
    .eq("page_id", input.pageId)
    .eq("peer_id", input.peerId)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      message: isCapacityConflictError(error)
        ? "That team member is already booked for another service at this time."
        : error?.message ?? "Failed to update booking",
    };
  }

  const booking = toSummary(data as Booking, input.settings.timezone);
  return {
    ok: true,
    message: wantsReschedule
      ? `Rescheduled to ${booking.when}`
      : `Updated booking (${booking.when})`,
    booking,
  };
}

export function bookingRulesForPrompt(settings: BookingSettings) {
  const mode =
    settings.booking_mode === "hourly"
      ? `hourly slots of ${settings.slot_minutes} minutes`
      : settings.booking_mode === "day"
        ? "full-day bookings"
        : "multi-day stays (check-in date → check-out date)";

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: settings.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return `Booking is ENABLED.
Mode: ${mode}.
Open hours: ${settings.open_time}–${settings.close_time} (${settings.timezone}).
Open days: ${settings.open_days.join(", ")}.
Buffer between appointments: ${settings.buffer_minutes} minutes.
Customers can book up to ${settings.max_advance_days} days ahead.
Today in business timezone: ${today}.

Tools you can use:
- list_open_slots — show free times on a date (omit resource_id = any free unit)
- check_availability — verify a specific slot (omit resource_id = any free unit)
- list_my_bookings — this customer's appointments (use before cancel/edit)
- get_booking — details for one booking id
- create_booking — create only after customer confirms intent (omit resource_id = assign any free)
- update_booking — reschedule and/or change service/notes (needs booking_id)
- cancel_booking — cancel (needs booking_id)
- complete_booking — mark finished (needs booking_id)

CRITICAL RULES:
- NEVER say a time is free unless check_availability/list_open_slots says so.
- NEVER say booked/cancelled/updated/rescheduled unless the matching tool returned ok=true.
- For cancel/edit/reschedule: call list_my_bookings first if you do not already have the booking id, then use that id.
- Prefer updating the existing booking over creating duplicates.
- If a slot is taken, offer free_slots from the tool result.
- Do not pretend you are "checking" and wait — call tools in the same turn.
- Resolve relative dates like "23rd September" to YYYY-MM-DD using Today above.
- You may only manage bookings for this chat's customer.`;
}
