import { WEEKDAY_ORDER } from "@/lib/bookings";
import type { BookableResource, WeekdayKey } from "@/lib/types";

export type AvailabilityWindow = {
  open_time: string;
  close_time: string;
  open_days: WeekdayKey[];
};

type FallbackWindow = AvailabilityWindow;

export function parseHmMinutes(
  value: string | null | undefined,
): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatHm(minutes: number): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function ownWindow(
  resource: BookableResource,
  fallback: FallbackWindow,
): AvailabilityWindow {
  return {
    open_time: resource.open_time?.trim() || fallback.open_time,
    close_time: resource.close_time?.trim() || fallback.close_time,
    open_days:
      resource.open_days && resource.open_days.length > 0
        ? resource.open_days
        : fallback.open_days,
  };
}

/**
 * A linked staff member determines when a service can be delivered.
 * The service's own hours are only used when it has no assigned staff.
 */
export function effectiveWindowForPair(opts: {
  primary: BookableResource;
  capacity: BookableResource;
  fallback: FallbackWindow;
}): AvailabilityWindow | null {
  const { primary, capacity, fallback } = opts;
  const window =
    primary.kind === "service" && capacity.kind === "staff"
      ? ownWindow(capacity, fallback)
      : primary.id === capacity.id
        ? ownWindow(primary, fallback)
        : ownWindow(capacity, fallback);

  const open = parseHmMinutes(window.open_time);
  const close = parseHmMinutes(window.close_time);
  if (open == null || close == null || close <= open) return null;
  if (window.open_days.length === 0) return null;
  return window;
}

/**
 * Combined service hours span from the earliest assigned staff start to the
 * latest finish. Open days are the union of all assigned staff days.
 * Individual slot checks still require at least one staff member to be
 * working and free, so gaps are never offered as available appointments.
 */
export function combinedProviderWindow(opts: {
  primary: BookableResource;
  providers: BookableResource[];
  fallback: FallbackWindow;
}): AvailabilityWindow | null {
  const windows = opts.providers
    .map((capacity) =>
      effectiveWindowForPair({
        primary: opts.primary,
        capacity,
        fallback: opts.fallback,
      }),
    )
    .filter((window): window is AvailabilityWindow => Boolean(window));

  if (windows.length === 0) return null;

  const starts = windows
    .map((window) => parseHmMinutes(window.open_time))
    .filter((value): value is number => value != null);
  const finishes = windows
    .map((window) => parseHmMinutes(window.close_time))
    .filter((value): value is number => value != null);
  if (starts.length === 0 || finishes.length === 0) return null;

  const daySet = new Set(windows.flatMap((window) => window.open_days));
  return {
    open_time: formatHm(Math.min(...starts)),
    close_time: formatHm(Math.max(...finishes)),
    open_days: WEEKDAY_ORDER.filter((day) => daySet.has(day)),
  };
}
