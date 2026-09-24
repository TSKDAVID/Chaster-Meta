"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  computeEndsAt,
  DEFAULT_BOOKING_SETTINGS,
  formatBookingWhen,
  formatDayHeader,
  formatMonthTitle,
  formatSlotLabel,
  hourlySlotStarts,
  monthGrid,
  parseYmd,
  toYmd,
  WEEKDAY_ORDER,
  weekdayKeyFromYmd,
} from "@/lib/bookings";
import { useI18n } from "@/components/I18nProvider";
import type { TranslateFn } from "@/lib/i18n";
import {
  isResourcesTab,
  type BookingDeskTab,
} from "@/lib/desk-routes";
import { formatAgo, formatClock, formatClockRange, formatHmRange } from "@/lib/format-time";
import {
  combinedProviderWindow,
  effectiveWindowForPair,
  parseHmMinutes,
} from "@/lib/resource-hours";
import DeskToolbar, { Segmented } from "@/components/DeskToolbar";
import TimeSelect from "@/components/TimeSelect";
import {
  IconCaret,
  IconCheck,
  IconChevron,
  IconClose,
  IconJump,
  IconMore,
} from "@/components/icons";
import HelpTip from "@/components/HelpTip";
import ServiceGlyph, { ServiceIconPicker } from "@/components/ServiceGlyph";
import { SERVICE_ICON_IDS, defaultIconForKind } from "@/lib/service-icons";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type {
  BookableResource,
  Booking,
  BookingMode,
  BookingSettings,
  BookingStatus,
  ResourceKind,
  WeekdayKey,
} from "@/lib/types";

type Props = {
  open: boolean;
  onClose?: () => void;
  pageId: string;
  pageName?: string;
  focusPeerId?: string | null;
  focusPeerName?: string | null;
  onError: (message: string | null) => void;
  refreshKey?: number;
  tab?: BookingDeskTab;
  onTabChange?: (tab: BookingDeskTab) => void;
};

type BufferUnit = "minutes" | "hours" | "days";

const MODES: BookingMode[] = ["hourly", "day", "multi_day"];
const BUFFER_PRESETS = [0, 5, 10, 15, 30, 45, 60] as const;
/** Timeline row height per slot, px. */
const SLOT_ROW_PX = 44;
const CATALOG_KINDS: ResourceKind[] = [
  "service",
  "room",
  "equipment",
  "other",
];

const WEEK_KEYS = {
  mon: "bookings.weekMon",
  tue: "bookings.weekTue",
  wed: "bookings.weekWed",
  thu: "bookings.weekThu",
  fri: "bookings.weekFri",
  sat: "bookings.weekSat",
  sun: "bookings.weekSun",
} as const;

function kindLabel(kind: ResourceKind, t: TranslateFn) {
  if (kind === "service") return t("bookings.kindService");
  if (kind === "staff") return t("bookings.kindStaff");
  if (kind === "room") return t("bookings.kindRoom");
  if (kind === "equipment") return t("bookings.kindEquipment");
  return t("bookings.kindOther");
}

function statusLabel(status: string, t: TranslateFn) {
  if (status === "pending") return t("bookings.statusPending");
  if (status === "cancelled") return t("bookings.statusCancelled");
  if (status === "completed") return t("bookings.statusDone");
  return t("bookings.statusBooked");
}

function bookingModeLabel(mode: BookingMode, t: TranslateFn) {
  if (mode === "hourly") return t("bookings.modeHourly");
  if (mode === "day") return t("bookings.modeDay");
  return t("bookings.modeMulti");
}

function bookingModeHint(mode: BookingMode, t: TranslateFn) {
  if (mode === "hourly") return t("bookings.modeHourlyHint");
  if (mode === "day") return t("bookings.modeDayHint");
  return t("bookings.modeMultiHint");
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
}

function resourceHoursLabel(
  r: BookableResource,
  settings: { open_time: string; close_time: string },
  hour12: boolean,
) {
  return formatHmRange(r.open_time ?? settings.open_time, r.close_time ?? settings.close_time, {
    hour12,
  });
}

function canProvideServiceLocal(r: BookableResource): boolean {
  if (r.kind === "service") return false;
  if (r.kind === "staff") return r.serviceable !== false;
  return r.serviceable === true;
}

function linkSummary(
  r: BookableResource,
  all: BookableResource[],
  t: TranslateFn,
): { line: string; tone: "ok" | "warn" | "muted" } {
  if (r.kind === "service") {
    const names = (r.linked_ids ?? [])
      .map((id) => all.find((x) => x.id === id)?.name)
      .filter(Boolean) as string[];
    if (names.length === 0) {
      return { line: t("bookings.noOneAssigned"), tone: "warn" };
    }
    return {
      line: `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3}` : ""}`,
      tone: "ok",
    };
  }
  const offered = all.filter(
    (svc) => svc.kind === "service" && (svc.linked_ids ?? []).includes(r.id),
  );
  if (r.kind === "staff") {
    if (offered.length === 0) {
      return { line: t("bookings.noServices"), tone: "muted" };
    }
    return {
      line: `${offered
        .slice(0, 3)
        .map((svc) => svc.name)
        .join(", ")}${offered.length > 3 ? ` +${offered.length - 3}` : ""}`,
      tone: "ok",
    };
  }
  const staffHere = (r.linked_ids ?? [])
    .map((id) => all.find((x) => x.id === id && x.kind === "staff")?.name)
    .filter(Boolean) as string[];
  const bits: string[] = [];
  if (offered.length > 0) {
    bits.push(
      offered.length === 1
        ? t("bookings.nServices", { n: offered.length })
        : t("bookings.nServicesPlural", { n: offered.length }),
    );
  }
  if (staffHere.length > 0) {
    bits.push(t("bookings.nStaff", { n: staffHere.length }));
  }
  if (bits.length === 0) {
    return { line: t("bookings.empty"), tone: "muted" };
  }
  return { line: bits.join(" · "), tone: "ok" };
}

function ResourceThumb({
  resource,
  size = "md",
}: {
  resource: BookableResource;
  size?: "md" | "sm";
}) {
  const sm = size === "sm";
  if (resource.kind === "staff") {
    return (
      <span className={`ch-thumb is-avatar${sm ? " is-sm" : ""}`} aria-hidden>
        {initials(resource.name)}
      </span>
    );
  }
  const iconId =
    resource.icon ?? defaultIconForKind(resource.kind === "service" ? "service" : "room");
  return (
    <span
      className={`ch-thumb is-glyph${resource.kind === "service" ? " is-service" : ""}${sm ? " is-sm" : ""}`}
      aria-hidden
    >
      <ServiceGlyph id={iconId} size={sm ? 13 : 15} />
    </span>
  );
}

function ymdOf(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(+d) ? "" : toYmd(d);
}

function slotLocalFromIso(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return null;
  return `${toYmd(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function isBufferPreset(mins: number) {
  return (BUFFER_PRESETS as readonly number[]).includes(mins);
}

function minutesToCustom(mins: number): { amount: number; unit: BufferUnit } {
  if (mins >= 1440 && mins % 1440 === 0) {
    return { amount: mins / 1440, unit: "days" };
  }
  if (mins >= 60 && mins % 60 === 0) {
    return { amount: mins / 60, unit: "hours" };
  }
  return { amount: mins, unit: "minutes" };
}

function customToMinutes(amount: number, unit: BufferUnit) {
  const n = Math.max(0, Math.round(amount));
  if (unit === "days") return Math.min(14 * 1440, n * 1440);
  if (unit === "hours") return Math.min(14 * 1440, n * 60);
  return Math.min(14 * 1440, n);
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
  bufferMs: number,
) {
  return aStart < bEnd + bufferMs && aEnd + bufferMs > bStart;
}

export default function BookingDrawer({
  open,
  onClose,
  pageId,
  focusPeerId,
  focusPeerName,
  onError,
  refreshKey = 0,
  tab: tabProp = "schedule",
  onTabChange,
}: Props) {
  const { t } = useI18n();
  const bookingTabs = [
    ["schedule", t("bookings.schedule")],
    ["team", t("bookings.team")],
    ["catalog", t("bookings.servicesRooms")],
    ["setup", t("bookings.setup")],
  ] as const;
  const weekdays = t("bookings.weekInitials").split(",");
  const [internalTab, setInternalTab] = useState<BookingDeskTab>("schedule");
  const tab = onTabChange ? tabProp : internalTab;
  function setTab(next: BookingDeskTab) {
    if (onTabChange) onTabChange(next);
    else setInternalTab(next);
  }
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [resources, setResources] = useState<BookableResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [peerOnly, setPeerOnly] = useState(Boolean(focusPeerId));

  const [customerName, setCustomerName] = useState("");
  const [serviceLabel, setServiceLabel] = useState("");
  const [notes, setNotes] = useState("");
  /** "any" or a resource uuid */
  const [resourcePick, setResourcePick] = useState<string>("any");
  const [linkPeer, setLinkPeer] = useState(true);
  const [hour12, setHour12] = useState(false);
  const [bufferCustom, setBufferCustom] = useState(false);
  const [bufferAmount, setBufferAmount] = useState(15);
  const [bufferUnit, setBufferUnit] = useState<BufferUnit>("minutes");

  const [newResourceName, setNewResourceName] = useState("");
  const [newResourceKind, setNewResourceKind] = useState<ResourceKind>("staff");
  const [addingResource, setAddingResource] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(
    null,
  );
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  const [resourceSavedAt, setResourceSavedAt] = useState<number | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [open]);

  const [viewYear, setViewYear] = useState(() => today.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => today.getMonth());
  const [selectedYmd, setSelectedYmd] = useState(() => toYmd(today));
  const [rangeEndYmd, setRangeEndYmd] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [open]);

  const mode = settings?.booking_mode ?? "hourly";

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!pageId) return;
      if (!opts?.silent) {
        setLoading(true);
        onError(null);
      }
      try {
        const peerQ =
          peerOnly && focusPeerId
            ? `&peer_id=${encodeURIComponent(focusPeerId)}`
            : "";
        const [sRes, bRes, rRes] = await Promise.all([
          fetch(`/api/bookings/settings?page_id=${encodeURIComponent(pageId)}`),
          fetch(`/api/bookings?page_id=${encodeURIComponent(pageId)}${peerQ}`),
          fetch(
            `/api/resources?page_id=${encodeURIComponent(pageId)}&include_inactive=1`,
          ),
        ]);
        const sData = await sRes.json();
        const bData = await bRes.json();
        const rData = await rRes.json();
        if (!sRes.ok) throw new Error(sData.error ?? "Failed to load settings");
        if (!bRes.ok) throw new Error(bData.error ?? "Failed to load bookings");
        setSettings(sData.settings);
        setBookings(bData.bookings ?? []);
        if (rRes.ok) {
          setResources(rData.resources ?? []);
        } else {
          setResources([]);
        }
      } catch (err) {
        if (!opts?.silent) {
          onError(err instanceof Error ? err.message : "Booking load failed");
        }
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [pageId, peerOnly, focusPeerId, onError],
  );

  useEffect(() => {
    if (!open) return;
    setPeerOnly(Boolean(focusPeerId));
    setCustomerName(focusPeerName?.trim() || "");
    setLinkPeer(Boolean(focusPeerId));
    setServiceLabel("");
    setNotes("");
    setSelectedSlot(null);
    setSheetOpen(false);
    setEditingId(null);
    setRangeEndYmd(null);
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedYmd(toYmd(d));
  }, [open, focusPeerId, focusPeerName]);

  useEffect(() => {
    if (open && pageId) void load();
  }, [open, pageId, refreshKey, load]);

  useEffect(() => {
    if (!settings) return;
    const mins = settings.buffer_minutes ?? 0;
    if (isBufferPreset(mins)) {
      setBufferCustom(false);
    } else {
      setBufferCustom(true);
      const custom = minutesToCustom(mins);
      setBufferAmount(custom.amount || 1);
      setBufferUnit(custom.unit);
    }
  }, [settings?.buffer_minutes, settings?.page_id]);

  useEffect(() => {
    if (!open || !pageId) return;
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel(`bookings-ledger:${pageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messenger_bookings",
          filter: `page_id=eq.${pageId}`,
        },
        () => {
          void load({ silent: true });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, pageId, load]);

  useEffect(() => {
    if (!open || !onClose) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (addMenuOpen || detailMenuOpen) {
        setAddMenuOpen(false);
        setDetailMenuOpen(false);
        return;
      }
      onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, addMenuOpen, detailMenuOpen]);

  useEffect(() => {
    if (!addMenuOpen && !detailMenuOpen) return;
    function onDoc(e: PointerEvent) {
      const t = e.target as Element | null;
      if (t?.closest?.(".ch-menu-anchor")) return;
      setAddMenuOpen(false);
      setDetailMenuOpen(false);
    }
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [addMenuOpen, detailMenuOpen]);

  const activeBookings = useMemo(
    () =>
      bookings.filter(
        (b) => b.status === "confirmed" || b.status === "pending",
      ),
    [bookings],
  );

  const activeResources = useMemo(
    () => resources.filter((r) => r.active),
    [resources],
  );

  const teamResources = useMemo(
    () => resources.filter((r) => r.kind === "staff"),
    [resources],
  );

  const catalogResources = useMemo(
    () => resources.filter((r) => r.kind !== "staff"),
    [resources],
  );

  const sectionResources = tab === "catalog" ? catalogResources : teamResources;
  const catalogServices = useMemo(
    () => sectionResources.filter((r) => r.kind === "service"),
    [sectionResources],
  );
  const catalogRooms = useMemo(
    () => sectionResources.filter((r) => r.kind !== "service"),
    [sectionResources],
  );

  // Detail pane is never empty when the list has data.
  const effectiveResourceId =
    selectedResourceId && sectionResources.some((r) => r.id === selectedResourceId)
      ? selectedResourceId
      : !addingResource
        ? sectionResources[0]?.id ?? null
        : selectedResourceId;

  const selectedResource = useMemo(
    () => sectionResources.find((r) => r.id === effectiveResourceId) ?? null,
    [sectionResources, effectiveResourceId],
  );

  const resourceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of resources) map.set(r.id, r.name);
    return map;
  }, [resources]);

  const bufferMs = (settings?.buffer_minutes ?? 0) * 60_000;
  const maxAdvance = settings?.max_advance_days ?? 60;

  const maxDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + maxAdvance);
    return d;
  }, [today, maxAdvance]);

  function bookingBlocksCapacity(b: Booking, capacityId: string) {
    return (
      !b.resource_id ||
      b.resource_id === capacityId ||
      b.assigned_resource_id === capacityId
    );
  }

  function capacityResourcesFor(primaryId: string): BookableResource[] {
    const primary = activeResources.find((r) => r.id === primaryId);
    if (!primary) return [];
    if (primary.kind === "service") {
      const hasAssignedStaff = (primary.linked_ids ?? []).some((id) =>
        resources.some(
          (resource) => resource.id === id && resource.kind === "staff",
        ),
      );
      const linkedStaff = (primary.linked_ids ?? [])
        .map((id) => activeResources.find((r) => r.id === id))
        .filter(
          (resource): resource is BookableResource =>
            resource?.kind === "staff" && canProvideServiceLocal(resource),
        );
      return hasAssignedStaff ? linkedStaff : [primary];
    }
    return [primary];
  }

  function isCapacityBusy(capacityId: string, start: number, end: number) {
    return activeBookings.some(
      (b) =>
        b.id !== editingId &&
        bookingBlocksCapacity(b, capacityId) &&
        overlaps(
          start,
          end,
          +new Date(b.starts_at),
          +new Date(b.ends_at),
          bufferMs,
        ),
    );
  }

  function isCapacityWorking(
    primary: BookableResource,
    capacity: BookableResource,
    start: number,
    end: number,
  ) {
    if (!settings) return false;
    const window = effectiveWindowForPair({
      primary,
      capacity,
      fallback: {
        open_time: settings.open_time,
        close_time: settings.close_time,
        open_days: settings.open_days,
      },
    });
    if (!window) return false;

    const starts = new Date(start);
    const ends = new Date(end);
    if (starts.toDateString() !== ends.toDateString()) return false;
    const day = weekdayKeyFromYmd(toYmd(starts));
    if (!day || !window.open_days.includes(day)) return false;

    const startMinutes = starts.getHours() * 60 + starts.getMinutes();
    const endMinutes = ends.getHours() * 60 + ends.getMinutes();
    const opens = parseHmMinutes(window.open_time);
    const closes = parseHmMinutes(window.close_time);
    return (
      opens != null &&
      closes != null &&
      startMinutes >= opens &&
      endMinutes <= closes
    );
  }

  /** Primary is taken when no assigned capacity unit is working and free. */
  function isPrimaryTaken(primaryId: string, start: number, end: number) {
    const primary = activeResources.find((r) => r.id === primaryId);
    if (!primary) return true;
    return capacityResourcesFor(primaryId).every(
      (capacity) =>
        !isCapacityWorking(primary, capacity, start, end) ||
        isCapacityBusy(capacity.id, start, end),
    );
  }

  function isIntervalTaken(start: number, end: number) {
    if (Number.isNaN(start)) return true;
    if (activeResources.length === 0) {
      return activeBookings.some(
        (b) =>
          b.id !== editingId &&
          overlaps(
            start,
            end,
            +new Date(b.starts_at),
            +new Date(b.ends_at),
            bufferMs,
          ),
      );
    }
    if (resourcePick === "any") {
      return activeResources.every((r) => isPrimaryTaken(r.id, start, end));
    }
    return isPrimaryTaken(resourcePick, start, end);
  }

  function isPastOrBeyond(ymd: string) {
    const d = parseYmd(ymd);
    if (!d) return true;
    if (d < today) return true;
    if (d > maxDate) return true;
    return false;
  }

  function dayHasConflict(ymd: string) {
    if (mode === "hourly") {
      const picked =
        resourcePick === "any"
          ? null
          : activeResources.find((resource) => resource.id === resourcePick);
      const window = picked ? availabilityWindowFor(picked) : null;
      const slotsList = hourlySlotStarts(
        ymd,
        window?.open_time ?? settings?.open_time ?? "09:00",
        window?.close_time ?? settings?.close_time ?? "18:00",
        settings?.slot_minutes ?? 60,
      );
      return slotsList.every((slot) => isSlotTaken(slot));
    }
    const dayStart = new Date(`${ymd}T00:00:00`).getTime();
    const dayEnd = new Date(`${ymd}T23:59:59`).getTime();
    return isIntervalTaken(dayStart, dayEnd);
  }

  function isSlotTaken(localStart: string) {
    const start = new Date(localStart).getTime();
    const end = start + (settings?.slot_minutes ?? 60) * 60_000;
    return isIntervalTaken(start, end);
  }

  function availabilityWindowFor(resource: BookableResource) {
    if (!settings) return null;
    const fallback = {
      open_time: settings.open_time,
      close_time: settings.close_time,
      open_days: settings.open_days,
    };
    const capacities = capacityResourcesFor(resource.id);
    if (resource.kind === "service" && capacities.length === 0) return null;
    if (
      resource.kind === "service" &&
      capacities.some((capacity) => capacity.id !== resource.id)
    ) {
      return combinedProviderWindow({
        primary: resource,
        providers: capacities,
        fallback,
      });
    }
    return effectiveWindowForPair({
      primary: resource,
      capacity: resource,
      fallback,
    });
  }

  function effectiveOpenDays(): WeekdayKey[] {
    if (resourcePick !== "any") {
      const r = activeResources.find((x) => x.id === resourcePick);
      if (r) {
        const window = availabilityWindowFor(r);
        if (window) return window.open_days;
      }
    }
    return settings?.open_days ?? DEFAULT_BOOKING_SETTINGS.open_days;
  }

  function isDayOpen(ymd: string) {
    const key = weekdayKeyFromYmd(ymd);
    if (!key) return false;
    return effectiveOpenDays().includes(key);
  }

  function isDaySelectable(ymd: string) {
    if (isPastOrBeyond(ymd)) return false;
    if (!isDayOpen(ymd)) return false;
    if (mode === "multi_day") return true;
    return !dayHasConflict(ymd);
  }

  const slots = useMemo(() => {
    if (mode !== "hourly" || !selectedYmd || !settings) return [];
    const slotMs = settings.slot_minutes * 60_000;
    const picked =
      resourcePick === "any"
        ? null
        : activeResources.find((resource) => resource.id === resourcePick);
    const window = picked ? availabilityWindowFor(picked) : null;
    return hourlySlotStarts(
      selectedYmd,
      window?.open_time ?? settings.open_time,
      window?.close_time ?? settings.close_time,
      settings.slot_minutes,
    ).map((local) => {
      const start = new Date(local).getTime();
      const end = start + slotMs;
      return { local, taken: isIntervalTaken(start, end) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- helpers use latest state
  }, [
    mode,
    selectedYmd,
    settings,
    activeBookings,
    bufferMs,
    activeResources,
    resourcePick,
    editingId,
  ]);

  /** Upcoming = still live (confirmed / pending) and not ended. Everything else is Past. */
  const upcoming = useMemo(
    () =>
      bookings
        .filter(
          (b) =>
            (b.status === "confirmed" || b.status === "pending") &&
            +new Date(b.ends_at) >= nowTick,
        )
        .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)),
    [bookings, nowTick],
  );

  const past = useMemo(
    () =>
      bookings
        .filter(
          (b) =>
            !(
              (b.status === "confirmed" || b.status === "pending") &&
              +new Date(b.ends_at) >= nowTick
            ),
        )
        .sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at))
        .slice(0, 40),
    [bookings, nowTick],
  );

  /** Days in the visible month that carry a live booking. */
  const bookedYmds = useMemo(() => {
    const set = new Set<string>();
    for (const b of activeBookings) set.add(ymdOf(b.starts_at));
    return set;
  }, [activeBookings]);

  /** Live bookings on the selected day, for the timeline. */
  const dayBookings = useMemo(
    () =>
      activeBookings
        .filter((b) => ymdOf(b.starts_at) === selectedYmd)
        .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)),
    [activeBookings, selectedYmd],
  );

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function pickDay(day: number) {
    const ymd = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (isPastOrBeyond(ymd)) return;

    if (mode === "multi_day") {
      if (!selectedYmd || (selectedYmd && rangeEndYmd)) {
        setSelectedYmd(ymd);
        setRangeEndYmd(null);
        setSelectedSlot(null);
        return;
      }
      if (ymd < selectedYmd) {
        setRangeEndYmd(selectedYmd);
        setSelectedYmd(ymd);
      } else if (ymd === selectedYmd) {
        setRangeEndYmd(null);
      } else {
        setRangeEndYmd(ymd);
      }
      setSelectedSlot(null);
      return;
    }

    if (!isDaySelectable(ymd)) return;
    setSelectedYmd(ymd);
    setRangeEndYmd(null);
    setSelectedSlot(null);
  }

  function inRange(ymd: string) {
    if (mode !== "multi_day" || !rangeEndYmd) return false;
    const a = selectedYmd < rangeEndYmd ? selectedYmd : rangeEndYmd;
    const b = selectedYmd < rangeEndYmd ? rangeEndYmd : selectedYmd;
    return ymd >= a && ymd <= b;
  }

  async function saveSettings(next: Partial<BookingSettings>) {
    if (!pageId || !settings) return;
    setSaving(true);
    onError(null);
    try {
      const res = await fetch("/api/bookings/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, ...next, page_id: pageId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save settings");
      setSettings(data.settings);
      setSelectedSlot(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function saveBooking(e?: FormEvent) {
    e?.preventDefault();
    if (!pageId || !settings) return;
    setSaving(true);
    onError(null);
    try {
      let startsAt: string;
      let endsAt: string;

      if (mode === "hourly") {
        if (!selectedSlot) throw new Error(t("bookings.pickTimeSlot"));
        startsAt = new Date(selectedSlot).toISOString();
        endsAt =
          computeEndsAt(selectedSlot, "hourly", settings.slot_minutes) ??
          startsAt;
      } else if (mode === "day") {
        if (!selectedYmd) throw new Error(t("bookings.pickADay"));
        startsAt = new Date(
          `${selectedYmd}T${settings.open_time}:00`,
        ).toISOString();
        endsAt = new Date(
          `${selectedYmd}T${settings.close_time}:00`,
        ).toISOString();
      } else {
        const endYmd = rangeEndYmd || selectedYmd;
        if (!selectedYmd) throw new Error(t("bookings.pickCheckInCheckOut"));
        const a = selectedYmd <= endYmd ? selectedYmd : endYmd;
        const b = selectedYmd <= endYmd ? endYmd : selectedYmd;
        startsAt = new Date(`${a}T${settings.open_time}:00`).toISOString();
        endsAt = new Date(`${b}T${settings.close_time}:00`).toISOString();
      }

      if (+new Date(endsAt) <= +new Date(startsAt)) {
        throw new Error(t("bookings.endAfterStart"));
      }

      const payload = {
        customer_name: customerName.trim() || focusPeerName || null,
        service_label: serviceLabel.trim() || null,
        notes: notes.trim() || null,
        starts_at: startsAt,
        ends_at: endsAt,
        resource_id: resourcePick === "any" ? null : resourcePick,
      };

      const res = await fetch("/api/bookings", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingId
            ? { id: editingId, ...payload }
            : {
                page_id: pageId,
                peer_id: linkPeer && focusPeerId ? focusPeerId : null,
                ...payload,
                status: "confirmed",
                source: "desk",
                assignment: resourcePick === "any" ? "any" : "specific",
              },
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error ?? (editingId ? "Failed to update booking" : "Failed to create booking"),
        );
      }
      const saved = data.booking as Booking | undefined;
      if (saved) {
        setBookings((prev) =>
          [...prev.filter((b) => b.id !== saved.id), saved].sort(
            (a, b) => +new Date(a.starts_at) - +new Date(b.starts_at),
          ),
        );
      }
      setServiceLabel("");
      setNotes("");
      setSelectedSlot(null);
      setEditingId(null);
      setSheetOpen(false);
      void load({ silent: true });
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : editingId
            ? "Failed to update booking"
            : "Failed to create booking",
      );
    } finally {
      setSaving(false);
    }
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingId(null);
  }

  function openSheetForSlot(local: string) {
    setEditingId(null);
    setSelectedSlot(local);
    setSheetOpen(true);
  }

  function openEditBooking(b: Booking) {
    setEditingId(b.id);
    setCustomerName(b.customer_name ?? "");
    setServiceLabel(b.service_label ?? "");
    setNotes(b.notes ?? "");
    setResourcePick(b.resource_id ?? "any");
    const ymd = ymdOf(b.starts_at);
    if (ymd) {
      const d = new Date(b.starts_at);
      setSelectedYmd(ymd);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
    if (mode === "hourly") {
      setSelectedSlot(slotLocalFromIso(b.starts_at));
      setRangeEndYmd(null);
    } else if (mode === "multi_day") {
      setSelectedSlot(null);
      setRangeEndYmd(ymdOf(b.ends_at) || null);
    } else {
      setSelectedSlot(null);
      setRangeEndYmd(null);
    }
    setLinkPeer(Boolean(focusPeerId && b.peer_id === focusPeerId));
    setSheetOpen(true);
  }

  async function addResource() {
    if (!pageId || !newResourceName.trim()) return;
    setSaving(true);
    onError(null);
    try {
      const res = await fetch("/api/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_id: pageId,
          name: newResourceName.trim(),
          kind: newResourceKind,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add resource");
      setNewResourceName("");
      setAddingResource(false);
      const created = data.resource as BookableResource | undefined;
      if (created?.id) {
        setSelectedResourceId(created.id);
      }
      setResourceSavedAt(Date.now());
      await load({ silent: true });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to add resource");
    } finally {
      setSaving(false);
    }
  }

  function beginAdd(kind: ResourceKind) {
    setAddMenuOpen(false);
    setNewResourceKind(kind);
    setAddingResource(true);
  }

  function goToResource(target: BookableResource) {
    setDetailMenuOpen(false);
    setTab(target.kind === "staff" ? "team" : "catalog");
    setSelectedResourceId(target.id);
    setAddingResource(false);
    setResourceSavedAt(null);
  }

  async function patchResource(
    id: string,
    patch: Partial<{
      name: string;
      kind: ResourceKind;
      active: boolean;
      icon: string | null;
      open_time: string | null;
      close_time: string | null;
      open_days: WeekdayKey[] | null;
      linked_ids: string[];
      serviceable: boolean;
    }>,
  ) {
    if (!pageId) return;
    setSaving(true);
    onError(null);
    try {
      const res = await fetch("/api/resources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page_id: pageId, id, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update resource");
      setResourceSavedAt(Date.now());
      await load({ silent: true });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update resource");
    } finally {
      setSaving(false);
    }
  }

  async function removeResource(id: string) {
    if (!pageId) return;
    const target = resources.find((r) => r.id === id);
    const label = target?.name?.trim() || "this item";
    if (
      !confirm(
        t("bookings.deleteConfirm", { label }),
      )
    ) {
      return;
    }
    setDetailMenuOpen(false);
    setSaving(true);
    onError(null);
    try {
      const res = await fetch(
        `/api/resources?page_id=${encodeURIComponent(pageId)}&id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete resource");
      if (resourcePick === id) setResourcePick("any");
      if (selectedResourceId === id) setSelectedResourceId(null);
      setResourceSavedAt(null);
      await load({ silent: true });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to delete resource");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: BookingStatus) {
    setSaving(true);
    onError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update booking");
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update booking");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const s = settings ?? { ...DEFAULT_BOOKING_SETTINGS, page_id: pageId };
  const cells = monthGrid(viewYear, viewMonth);
  const todayYmd = toYmd(today);
  const canConfirm =
    mode === "hourly"
      ? Boolean(selectedSlot)
      : mode === "day"
        ? Boolean(selectedYmd) && isDaySelectable(selectedYmd)
        : Boolean(selectedYmd && rangeEndYmd);

  const pickedResource =
    resourcePick === "any"
      ? null
      : activeResources.find((r) => r.id === resourcePick) ?? null;
  const pickedWindow = pickedResource ? availabilityWindowFor(pickedResource) : null;
  const dayOpen = pickedWindow?.open_time ?? s.open_time;
  const dayClose = pickedWindow?.close_time ?? s.close_time;
  const openMin = parseHmMinutes(dayOpen) ?? 9 * 60;
  const closeMin = parseHmMinutes(dayClose) ?? 18 * 60;
  const spanMin = Math.max(closeMin - openMin, s.slot_minutes);
  const pxPerMin = SLOT_ROW_PX / Math.max(s.slot_minutes, 1);
  const timelineHeight = Math.round(spanMin * pxPerMin);
  const dayStartMs = new Date(`${selectedYmd}T00:00:00`).getTime();
  const nowOffsetPx =
    selectedYmd === todayYmd
      ? ((nowTick - dayStartMs) / 60_000 - openMin) * pxPerMin
      : null;

  const hourMarks: number[] = [];
  for (let m = Math.ceil(openMin / 60) * 60; m <= closeMin; m += 60) {
    hourMarks.push(m);
  }

  const selectedSlotEnd = selectedSlot
    ? new Date(new Date(selectedSlot).getTime() + s.slot_minutes * 60_000)
    : null;

  const sheetWhen =
    mode === "hourly"
      ? selectedSlot && selectedSlotEnd
        ? `${formatDayHeader(selectedYmd)} · ${formatClockRange(selectedSlot, selectedSlotEnd, { hour12 })}`
        : formatDayHeader(selectedYmd)
      : mode === "day"
        ? `${formatDayHeader(selectedYmd)} · ${formatHmRange(s.open_time, s.close_time, { hour12 })}`
        : rangeEndYmd
          ? `${formatDayHeader(selectedYmd)} → ${formatDayHeader(rangeEndYmd)}`
          : formatDayHeader(selectedYmd);

  function resourceLine(b: Booking) {
    const primary = b.resource_id ? resourceNameById.get(b.resource_id) : null;
    const assigned = b.assigned_resource_id
      ? resourceNameById.get(b.assigned_resource_id)
      : null;
    const bits: string[] = [];
    if (b.service_label) bits.push(b.service_label);
    else if (primary) bits.push(primary);
    const staff = assigned && assigned !== primary ? assigned : primary && b.service_label ? primary : null;
    return { head: bits.join(" · "), staff };
  }

  function renderLedgerRow(b: Booking, section: "upcoming" | "past") {
    const started = +new Date(b.starts_at) <= nowTick;
    const live = b.status === "confirmed" || b.status === "pending";
    const { head, staff } = resourceLine(b);
    return (
      <li key={b.id} className={`ch-ledger-row is-${b.status}`}>
        <div className="ch-ledger-main">
          <div className="ch-ledger-when tabular-nums">
            {formatBookingWhen(b.starts_at, b.ends_at, mode, { hour12 })}
          </div>
          <div className="ch-ledger-who">
            <span className="ch-ledger-name">{b.customer_name || t("bookings.unnamed")}</span>
            {head ? <span className="ch-ledger-svc"> · {head}</span> : null}
            {staff ? <span className="ch-ledger-staff"> → {staff}</span> : null}
          </div>
          <div className="ch-ledger-meta">
            <span className={`ch-status-word is-${b.status}`}>{statusLabel(b.status, t)}</span>
            <span aria-hidden>·</span>
            <span>{b.source === "ai" ? t("bookings.sourceAi") : t("bookings.sourceDesk")}</span>
            {b.peer_id ? (
              <>
                <span aria-hidden>·</span>
                <span>{t("bookings.chat")}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="ch-row-actions">
          {live ? (
            <>
              <button
                type="button"
                className="ch-btn ch-btn-text h-7 px-2"
                disabled={saving}
                onClick={() => openEditBooking(b)}
              >
                {t("common.edit")}
              </button>
              {started ? (
                <button
                  type="button"
                  className="ch-btn ch-btn-text h-7 px-2"
                  disabled={saving}
                  onClick={() => void setStatus(b.id, "completed")}
                >
                  {t("common.done")}
                </button>
              ) : null}
              <button
                type="button"
                className="ch-btn ch-btn-text ch-btn-danger h-7 px-2"
                disabled={saving}
                onClick={() => void setStatus(b.id, "cancelled")}
              >
                {t("common.cancel")}
              </button>
            </>
          ) : section === "past" && b.status === "cancelled" ? (
            <button
              type="button"
              className="ch-btn ch-btn-text h-7 px-2"
              disabled={saving}
              onClick={() => void setStatus(b.id, "confirmed")}
            >
              {t("common.restore")}
            </button>
          ) : section === "past" && b.status === "completed" && +new Date(b.ends_at) > nowTick ? (
            <button
              type="button"
              className="ch-btn ch-btn-text h-7 px-2"
              disabled={saving}
              onClick={() => void setStatus(b.id, "confirmed")}
            >
              {t("common.reopen")}
            </button>
          ) : null}
        </div>
      </li>
    );
  }

  function renderResourceListItem(r: BookableResource) {
    const summary = linkSummary(r, resources, t);
    const selected = effectiveResourceId === r.id;
    const trailing =
      tab === "team"
        ? resourceHoursLabel(r, s, hour12)
        : kindLabel(r.kind, t);
    return (
      <li key={r.id}>
        <div
          className={`ch-list-row ch-res-row${selected ? " is-active" : ""}${r.active ? "" : " is-muted"}`}
          role="button"
          tabIndex={0}
          aria-current={selected ? "true" : undefined}
          onClick={() => {
            setSelectedResourceId(r.id);
            setAddingResource(false);
            setDetailMenuOpen(false);
            setResourceSavedAt(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setSelectedResourceId(r.id);
              setAddingResource(false);
              setResourceSavedAt(null);
            }
          }}
        >
          <ResourceThumb resource={r} />
          <span className="ch-res-row-text">
            <span className="ch-list-title">{r.name}</span>
            <span className={`ch-list-meta is-${summary.tone}`}>{summary.line}</span>
          </span>
          <span
            className={`ch-list-trailing tabular-nums${tab === "team" ? " is-value" : ""}`}
          >
            {trailing}
          </span>
        </div>
        {selected ? (
          <div className="ch-mobile-detail">
            {renderResourceEditor(r, { showIdentity: false })}
          </div>
        ) : null}
      </li>
    );
  }

  function renderResourceEditor(r: BookableResource, opts?: { showIdentity?: boolean }) {
    const showIdentity = opts?.showIdentity !== false;
    const linked = new Set(r.linked_ids ?? []);
    const customDays = Boolean(r.open_days?.length);
    const effectiveDays = customDays && r.open_days ? r.open_days : s.open_days;
    const fallbackWindow = {
      open_time: s.open_time,
      close_time: s.close_time,
      open_days: s.open_days,
    };
    const eligibleProviders = resources.filter(
      (o) => o.id !== r.id && o.kind === "staff" && canProvideServiceLocal(o),
    );
    const linkedProviders = resources.filter((o) => o.kind === "staff" && linked.has(o.id));
    const combinedStaffWindow =
      r.kind === "service" && linkedProviders.length > 0
        ? combinedProviderWindow({
            primary: r,
            providers: linkedProviders,
            fallback: fallbackWindow,
          })
        : null;
    const allServices = resources.filter((o) => o.kind === "service");
    const allStaff = resources.filter((o) => o.kind === "staff");
    const roomsForStaff = resources.filter(
      (o) =>
        (o.kind === "room" || o.kind === "equipment" || o.kind === "other") &&
        (o.linked_ids ?? []).includes(r.id),
    );
    const fromStaffHours = r.kind === "service" && linkedProviders.length > 0;

    async function toggleServiceLink(svc: BookableResource, include: boolean, memberId: string) {
      const current = new Set(svc.linked_ids ?? []);
      if (include) current.add(memberId);
      else current.delete(memberId);
      await patchResource(svc.id, { linked_ids: [...current] });
    }

    async function toggleRoomStaff(room: BookableResource, staffId: string, include: boolean) {
      const current = new Set(room.linked_ids ?? []);
      if (include) current.add(staffId);
      else current.delete(staffId);
      await patchResource(room.id, { linked_ids: [...current] });
    }

    function commitName(raw: string) {
      const name = raw.trim();
      if (!name || name === r.name) return;
      void patchResource(r.id, { name });
    }

    return (
      <div key={r.id} className="ch-detail">
        {showIdentity ? (
          <div className="ch-detail-head">
            <div className="ch-detail-head-main">
              <ResourceThumb resource={r} size="sm" />
              <div className="min-w-0">
                <h3 className="ch-detail-title">{r.name}</h3>
                <div className="ch-detail-sub">{kindLabel(r.kind, t)}</div>
              </div>
            </div>
            <div className="ch-detail-actions">
              <HelpTip tip="hints.bookable">
                <label className="ch-switch">
                  <input
                    type="checkbox"
                    checked={r.active}
                    disabled={saving}
                    onChange={(e) => void patchResource(r.id, { active: e.target.checked })}
                  />
                  <span className="ch-switch-track" aria-hidden />
                  <span>{t("bookings.bookable")}</span>
                </label>
              </HelpTip>
              <div className="ch-menu-anchor">
                <button
                  type="button"
                  className="ch-btn ch-btn-text h-8 w-8 px-0"
                  aria-label={t("common.more")}
                  aria-haspopup="menu"
                  aria-expanded={detailMenuOpen}
                  disabled={saving}
                  onClick={() => setDetailMenuOpen((v) => !v)}
                >
                  <IconMore size={15} />
                </button>
                {detailMenuOpen ? (
                  <div className="ch-menu ch-menu-sm" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className="ch-menu-item is-danger"
                      disabled={saving}
                      onClick={() => void removeResource(r.id)}
                    >
                      <span className="ch-menu-item-text">{t("common.delete")}</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="ch-detail-scroll">
          <div className="ch-editor">
            <section className="ch-section">
              <h4 className="ch-section-title">{t("bookings.basics")}</h4>
              <label className="ch-field">
                <span className="ch-label">{t("common.name")}</span>
                <input
                  key={`${r.id}-name-${r.name}`}
                  className="ch-input w-full px-2.5"
                  defaultValue={r.name}
                  disabled={saving}
                  aria-label={t("common.name")}
                  onBlur={(e) => commitName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
              </label>
              {r.kind !== "staff" ? (
                <div className="ch-field">
                  <span className="ch-label">{t("bookings.type")}</span>
                  <div className="ch-seg" role="radiogroup" aria-label={t("bookings.type")}>
                    {CATALOG_KINDS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={r.kind === k}
                        disabled={saving}
                        className={`ch-seg-tab${r.kind === k ? " is-active" : ""}`}
                        onClick={() => {
                          if (r.kind !== k) void patchResource(r.id, { kind: k });
                        }}
                      >
                        {kindLabel(k, t)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {r.kind === "service" || r.kind === "room" || r.kind === "equipment" || r.kind === "other" ? (
                <ServiceIconPicker
                  value={r.icon ?? defaultIconForKind(r.kind === "service" ? "service" : "room")}
                  options={SERVICE_ICON_IDS}
                  disabled={saving}
                  label={t("bookings.icon")}
                  searchLabel={t("bookings.searchIcons")}
                  onChange={(id) => void patchResource(r.id, { icon: id })}
                />
              ) : null}
            </section>

            {r.kind === "service" ? (
              <section className="ch-section">
                <h4 className="ch-section-title">{t("bookings.providedBy")}</h4>
                {eligibleProviders.length === 0 ? (
                  <p className="ch-hint">{t("bookings.addTeamFirst")}</p>
                ) : (
                  <div className="ch-picks">
                    {eligibleProviders.map((o) => {
                      const checked = linked.has(o.id);
                      const window = checked
                        ? effectiveWindowForPair({
                            primary: r,
                            capacity: o,
                            fallback: fallbackWindow,
                          })
                        : null;
                      return (
                        <label key={o.id} className={`ch-pick${checked ? " is-on" : ""}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={saving}
                            onChange={(e) => {
                              const next = new Set(linked);
                              if (e.target.checked) next.add(o.id);
                              else next.delete(o.id);
                              void patchResource(r.id, { linked_ids: [...next] });
                            }}
                          />
                          <span className="ch-pick-check" aria-hidden />
                          <span className="ch-pick-avatar" aria-hidden>
                            {initials(o.name)}
                          </span>
                          <span className="ch-pick-body">
                            <button
                              type="button"
                              className="ch-pick-link"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                goToResource(o);
                              }}
                            >
                              {o.name}
                              <IconJump size={12} className="ch-pick-jump" />
                            </button>
                          </span>
                          {checked ? (
                            <span className="ch-pick-meta tabular-nums">
                              {window
                                ? formatHmRange(window.open_time, window.close_time, { hour12 })
                                : t("bookings.noOverlap")}
                            </span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : r.kind === "staff" ? (
              <>
                <section className="ch-section">
                  <div className="ch-section-head">
                    <h4 className="ch-section-title">{t("bookings.servicesPersonCanTake")}</h4>
                    <HelpTip tip="hints.takesServices">
                      <label className="ch-switch">
                        <input
                          type="checkbox"
                          checked={canProvideServiceLocal(r)}
                          disabled={saving}
                          onChange={(e) =>
                            void patchResource(r.id, { serviceable: e.target.checked })
                          }
                        />
                        <span className="ch-switch-track" aria-hidden />
                        <span>{t("bookings.takesServices")}</span>
                      </label>
                    </HelpTip>
                  </div>
                  {allServices.length === 0 ? (
                    <p className="ch-hint">{t("bookings.addServiceUnder")}</p>
                  ) : (
                    <div className="ch-picks">
                      {allServices.map((svc) => {
                        const checked = (svc.linked_ids ?? []).includes(r.id);
                        return (
                          <label key={svc.id} className={`ch-pick${checked ? " is-on" : ""}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={saving || !canProvideServiceLocal(r)}
                              onChange={(e) =>
                                void toggleServiceLink(svc, e.target.checked, r.id)
                              }
                            />
                            <span className="ch-pick-check" aria-hidden />
                            <span className="ch-pick-body">
                              <button
                                type="button"
                                className="ch-pick-link"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  goToResource(svc);
                                }}
                              >
                                {svc.name}
                                <IconJump size={12} className="ch-pick-jump" />
                              </button>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </section>
                {roomsForStaff.length > 0 ||
                resources.some(
                  (o) => o.kind === "room" || o.kind === "equipment" || o.kind === "other",
                ) ? (
                  <section className="ch-section">
                    <h4 className="ch-section-title">{t("bookings.rooms")}</h4>
                    <div className="ch-picks">
                      {resources
                        .filter(
                          (o) =>
                            o.kind === "room" || o.kind === "equipment" || o.kind === "other",
                        )
                        .map((room) => {
                          const checked = (room.linked_ids ?? []).includes(r.id);
                          return (
                            <label
                              key={room.id}
                              className={`ch-pick${checked ? " is-on" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={saving}
                                onChange={(e) =>
                                  void toggleRoomStaff(room, r.id, e.target.checked)
                                }
                              />
                              <span className="ch-pick-check" aria-hidden />
                              <span className="ch-pick-body">
                                <button
                                  type="button"
                                  className="ch-pick-link"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    goToResource(room);
                                  }}
                                >
                                  {room.name}
                                  <IconJump size={12} className="ch-pick-jump" />
                                </button>
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  </section>
                ) : null}
              </>
            ) : (
              <>
                <section className="ch-section">
                  <h4 className="ch-section-title">{t("bookings.usedFor")}</h4>
                  {allServices.length === 0 ? (
                    <p className="ch-hint">{t("bookings.addServiceFirst")}</p>
                  ) : (
                    <div className="ch-picks">
                      {allServices.map((svc) => {
                        const checked = (svc.linked_ids ?? []).includes(r.id);
                        return (
                          <label key={svc.id} className={`ch-pick${checked ? " is-on" : ""}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={saving}
                              onChange={(e) =>
                                void toggleServiceLink(svc, e.target.checked, r.id)
                              }
                            />
                            <span className="ch-pick-check" aria-hidden />
                            <span className="ch-pick-body">
                              <button
                                type="button"
                                className="ch-pick-link"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  goToResource(svc);
                                }}
                              >
                                {svc.name}
                                <IconJump size={12} className="ch-pick-jump" />
                              </button>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </section>
                <section className="ch-section">
                  <h4 className="ch-section-title">{t("bookings.staff")}</h4>
                  {allStaff.length === 0 ? (
                    <p className="ch-hint">{t("bookings.addTeamFirst")}</p>
                  ) : (
                    <div className="ch-picks">
                      {allStaff.map((person) => {
                        const checked = linked.has(person.id);
                        return (
                          <label
                            key={person.id}
                            className={`ch-pick${checked ? " is-on" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={saving}
                              onChange={(e) => {
                                const next = new Set(linked);
                                if (e.target.checked) next.add(person.id);
                                else next.delete(person.id);
                                void patchResource(r.id, { linked_ids: [...next] });
                              }}
                            />
                            <span className="ch-pick-check" aria-hidden />
                            <span className="ch-pick-avatar" aria-hidden>
                              {initials(person.name)}
                            </span>
                            <span className="ch-pick-body">
                              <button
                                type="button"
                                className="ch-pick-link"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  goToResource(person);
                                }}
                              >
                                {person.name}
                                <IconJump size={12} className="ch-pick-jump" />
                              </button>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            )}

            <section className="ch-section">
              {fromStaffHours ? (
                <>
                  <div className="ch-section-head">
                    <h4 className="ch-section-title">{t("bookings.availability")}</h4>
                    <span className="ch-hint">{t("bookings.fromAssignedStaff")}</span>
                  </div>
                  {combinedStaffWindow ? (
                    <div className="ch-kv">
                      <span className="tabular-nums">
                        {formatHmRange(
                          combinedStaffWindow.open_time,
                          combinedStaffWindow.close_time,
                          { hour12 },
                        )}
                      </span>
                      <span className="ch-kv-muted">
                        {combinedStaffWindow.open_days.map((day) => t(WEEK_KEYS[day])).join(" ")}
                      </span>
                    </div>
                  ) : (
                    <p className="ch-hint">{t("bookings.staffNoHours")}</p>
                  )}
                </>
              ) : (
                <>
                  <div className="ch-section-head">
                    <h4 className="ch-section-title">{t("bookings.availability")}</h4>
                    <span className="ch-hint tabular-nums">
                      {t("bookings.storeHours", { range: formatHmRange(s.open_time, s.close_time, { hour12 }) })}
                    </span>
                  </div>
                  <div className="ch-hours-row">
                    <TimeSelect
                      key={`${r.id}-open-${r.open_time ?? ""}`}
                      value={r.open_time ?? ""}
                      allowEmpty
                      emptyLabel={t("bookings.storeOpens")}
                      hour12={hour12}
                      disabled={saving}
                      aria-label={t("bookings.opens")}
                      className="w-full px-2.5"
                      onChange={(v) => {
                        const next = v || null;
                        if (next !== (r.open_time ?? null)) {
                          void patchResource(r.id, { open_time: next });
                        }
                      }}
                    />
                    <span className="ch-hours-sep">{t("common.to")}</span>
                    <TimeSelect
                      key={`${r.id}-close-${r.close_time ?? ""}`}
                      value={r.close_time ?? ""}
                      allowEmpty
                      emptyLabel={t("bookings.storeCloses")}
                      hour12={hour12}
                      disabled={saving}
                      aria-label={t("bookings.closes")}
                      className="w-full px-2.5"
                      onChange={(v) => {
                        const next = v || null;
                        if (next !== (r.close_time ?? null)) {
                          void patchResource(r.id, { close_time: next });
                        }
                      }}
                    />
                  </div>
                  <div className="ch-section-head" style={{ marginTop: "0.75rem" }}>
                    <h4 className="ch-section-title ch-section-title-sub">{t("bookings.days")}</h4>
                    {customDays ? (
                      <button
                        type="button"
                        className="ch-btn ch-btn-text h-6 px-1.5"
                        disabled={saving}
                        onClick={() => void patchResource(r.id, { open_days: null })}
                      >
                        {t("bookings.useStoreDays")}
                      </button>
                    ) : (
                      <span className="ch-hint">{t("bookings.storeDays")}</span>
                    )}
                  </div>
                  <div className="ch-days" role="group" aria-label={t("bookings.openDays")}>
                    {WEEKDAY_ORDER.map((day) => {
                      const on = effectiveDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          disabled={saving}
                          className={`ch-day${on ? " is-on" : ""}`}
                          aria-pressed={on}
                          onClick={() => {
                            const base = customDays ? [...(r.open_days ?? [])] : [...s.open_days];
                            const next = on ? base.filter((d) => d !== day) : [...base, day];
                            if (next.length === 0) return;
                            void patchResource(r.id, { open_days: next });
                          }}
                        >
                          {t(WEEK_KEYS[day])}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          </div>
        </div>

        <div className="ch-detail-foot">
          {resourceSavedAt ? (
            <span className="ch-saved" role="status">
              <IconCheck size={12} />
              {t("common.saved", {
                when: formatAgo(resourceSavedAt, {
                  justNow: t("common.justNow"),
                  minAgo: (n) => t("common.minAgo", { n }),
                }),
              })}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  const toolbarEnd =
    tab === "schedule" ? (
      <>
        {activeResources.length > 0 ? (
          <select
            className="ch-input ch-input-sm"
            value={resourcePick}
            aria-label={t("bookings.resource")}
            onChange={(e) => {
              setResourcePick(e.target.value);
            }}
          >
            <option value="any">{t("bookings.anyResource")}</option>
            {activeResources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        ) : null}
        {mode === "hourly" ? (
          <div className="ch-seg ch-seg-compact" role="group" aria-label={t("bookings.clock")}>
            <button
              type="button"
              className={`ch-seg-tab${!hour12 ? " is-active" : ""}`}
              onClick={() => setHour12(false)}
            >
              {t("bookings.h24")}
            </button>
            <button
              type="button"
              className={`ch-seg-tab${hour12 ? " is-active" : ""}`}
              onClick={() => setHour12(true)}
            >
              {t("bookings.h12")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="ch-btn ch-btn-primary h-8 px-3"
            disabled={!selectedYmd}
            onClick={() => setSheetOpen(true)}
          >
            {t("bookings.newBooking")}
          </button>
        )}
      </>
    ) : tab === "team" ? (
      <button
        type="button"
        className="ch-btn ch-btn-primary h-8 px-3"
        disabled={saving}
        onClick={() => beginAdd("staff")}
      >
        {t("bookings.addPerson")}
      </button>
    ) : tab === "catalog" ? (
      <div className="ch-menu-anchor">
        <button
          type="button"
          className="ch-btn ch-btn-primary h-8 px-3"
          disabled={saving}
          aria-haspopup="menu"
          aria-expanded={addMenuOpen}
          onClick={() => setAddMenuOpen((v) => !v)}
        >
          {t("bookings.add")}
          <IconCaret size={12} />
        </button>
        {addMenuOpen ? (
          <div className="ch-menu ch-menu-sm" role="menu">
            <button
              type="button"
              role="menuitem"
              className="ch-menu-item"
              onClick={() => beginAdd("service")}
            >
              <ServiceGlyph id="sparkles" size={13} />
              <span className="ch-menu-item-text">{t("bookings.service")}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="ch-menu-item"
              onClick={() => beginAdd("room")}
            >
              <ServiceGlyph id="home" size={13} />
              <span className="ch-menu-item-text">{t("bookings.room")}</span>
            </button>
          </div>
        ) : null}
      </div>
    ) : null;

  return (
    <div data-tour="booking-drawer" className="ch-page" aria-labelledby="booking-page-title">
      <DeskToolbar
        title={t("bookings.title")}
        titleId="booking-page-title"
        onBack={onClose}
        nav={
          <Segmented
            value={tab}
            options={bookingTabs}
            onChange={(next) => {
              if (next === "team" || next === "catalog") {
                setAddingResource(false);
                setNewResourceName("");
                setSelectedResourceId(null);
                setAddMenuOpen(false);
                setDetailMenuOpen(false);
                setResourceSavedAt(null);
              }
              setTab(next);
            }}
            ariaLabel={t("bookings.views")}
          />
        }
        end={toolbarEnd}
      />

      {loading && !settings ? (
        <div className="ch-empty-line">{t("common.loading")}</div>
      ) : tab === "setup" ? (
        <div key="setup" className="ch-page-body">
          <div className="ch-form-2col">
            <section className="ch-section">
              <h3 className="ch-section-title">{t("bookings.bookingShape")}</h3>
              <HelpTip tip="hints.acceptBookings">
                <label className="ch-toggle">
                  <input
                    type="checkbox"
                    className="ch-check"
                    checked={s.enabled}
                    disabled={saving}
                    onChange={(e) => void saveSettings({ enabled: e.target.checked })}
                  />
                  <span>{t("bookings.acceptBookings")}</span>
                </label>
              </HelpTip>
              <div className="ch-modes" role="radiogroup" aria-label={t("bookings.bookingShape")}>
                {MODES.map((m) => {
                  const active = s.booking_mode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={saving}
                      onClick={() => void saveSettings({ booking_mode: m })}
                      className={`ch-mode${active ? " is-active" : ""}`}
                    >
                      <span className="ch-mode-dot" aria-hidden />
                      <span className="ch-mode-text">
                        <span className="ch-mode-title">{bookingModeLabel(m, t)}</span>
                        <span className="ch-mode-hint">{bookingModeHint(m, t)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {s.booking_mode === "hourly" ? (
                <label className="ch-field">
                  <span className="ch-label">{t("bookings.slotLength")}</span>
                  <select
                    className="ch-input w-full px-2.5 py-2"
                    value={s.slot_minutes}
                    disabled={saving}
                    onChange={(e) => void saveSettings({ slot_minutes: Number(e.target.value) })}
                  >
                    {[15, 30, 45, 60, 90, 120].map((n) => (
                      <option key={n} value={n}>
                        {t("bookings.nMin", { n })}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </section>

            <section className="ch-section">
              <h3 className="ch-section-title">{t("bookings.hoursRules")}</h3>
              <div className="ch-grid-2">
                <label className="ch-field">
                  <span className="ch-label">{t("bookings.opens")}</span>
                  <TimeSelect
                    value={s.open_time}
                    disabled={saving}
                    hour12={hour12}
                    className="w-full px-2.5 py-2"
                    onChange={(v) => void saveSettings({ open_time: v })}
                  />
                </label>
                <label className="ch-field">
                  <span className="ch-label">{t("bookings.closes")}</span>
                  <TimeSelect
                    value={s.close_time}
                    disabled={saving}
                    hour12={hour12}
                    className="w-full px-2.5 py-2"
                    onChange={(v) => void saveSettings({ close_time: v })}
                  />
                </label>
              </div>

              <div className="ch-field">
                <span className="ch-label">{t("bookings.openDays")}</span>
                <div className="ch-days" role="group" aria-label={t("bookings.openDays")}>
                  {WEEKDAY_ORDER.map((day) => {
                    const on = s.open_days.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        disabled={saving}
                        className={`ch-day${on ? " is-on" : ""}`}
                        aria-pressed={on}
                        onClick={() => {
                          const next = on
                            ? s.open_days.filter((d) => d !== day)
                            : [...s.open_days, day];
                          if (next.length === 0) return;
                          void saveSettings({ open_days: next });
                        }}
                      >
                        {t(WEEK_KEYS[day])}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="ch-grid-2">
                <div className="ch-field">
                  <span className="ch-label">{t("bookings.buffer")}</span>
                  <select
                    className="ch-input w-full px-2.5 py-2"
                    value={bufferCustom ? "custom" : String(s.buffer_minutes)}
                    disabled={saving}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "custom") {
                        setBufferCustom(true);
                        const seed = minutesToCustom(
                          isBufferPreset(s.buffer_minutes) ? 90 : s.buffer_minutes,
                        );
                        setBufferAmount(seed.amount || 1);
                        setBufferUnit(seed.unit);
                        return;
                      }
                      setBufferCustom(false);
                      void saveSettings({ buffer_minutes: Number(v) });
                    }}
                  >
                    {BUFFER_PRESETS.map((n) => (
                      <option key={n} value={n}>
                        {n === 0 ? t("bookings.none") : t("bookings.nMin", { n })}
                      </option>
                    ))}
                    <option value="custom">{t("bookings.custom")}</option>
                  </select>
                  {bufferCustom ? (
                    <div className="ch-buffer-custom" role="group" aria-label={t("bookings.custom")}>
                      <input
                        type="number"
                        min={1}
                        max={bufferUnit === "days" ? 14 : bufferUnit === "hours" ? 336 : 20160}
                        className="ch-input w-20 px-2.5 py-1.5 tabular-nums"
                        value={bufferAmount}
                        disabled={saving}
                        onChange={(e) => setBufferAmount(Number(e.target.value) || 0)}
                      />
                      <div className="ch-seg ch-seg-compact" role="radiogroup" aria-label={t("bookings.unitMin")}>
                        {(
                          [
                            ["minutes", t("bookings.unitMin")],
                            ["hours", t("bookings.unitHrs")],
                            ["days", t("bookings.unitDays")],
                          ] as const
                        ).map(([unit, label]) => (
                          <button
                            key={unit}
                            type="button"
                            disabled={saving}
                            className={`ch-seg-tab${bufferUnit === unit ? " is-active" : ""}`}
                            aria-pressed={bufferUnit === unit}
                            onClick={() => setBufferUnit(unit)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="ch-btn ch-btn-ghost h-8 px-2.5"
                        disabled={saving || bufferAmount < 1}
                        onClick={() =>
                          void saveSettings({
                            buffer_minutes: customToMinutes(bufferAmount, bufferUnit),
                          })
                        }
                      >
                        {t("bookings.apply")}
                      </button>
                    </div>
                  ) : null}
                </div>
                <label className="ch-field">
                  <span className="ch-label">{t("bookings.bookAhead")}</span>
                  <div className="ch-input-suffix">
                    <input
                      type="number"
                      min={1}
                      max={365}
                      className="ch-input w-full px-2.5 py-2 tabular-nums"
                      value={s.max_advance_days}
                      disabled={saving}
                      onChange={(e) =>
                        void saveSettings({ max_advance_days: Number(e.target.value) || 60 })
                      }
                    />
                    <span>{t("bookings.daysSuffix")}</span>
                  </div>
                </label>
              </div>

              <label className="ch-field">
                <span className="ch-label">{t("bookings.timezone")}</span>
                <input
                  className="ch-input w-full px-2.5 py-2"
                  value={s.timezone}
                  disabled={saving}
                  onChange={(e) => void saveSettings({ timezone: e.target.value })}
                />
              </label>
            </section>
          </div>
        </div>
      ) : isResourcesTab(tab) ? (
        <div key={tab} className={`ch-split${selectedResource ? " has-selection" : ""}`}>
          <section className="ch-split-list" aria-label={tab === "team" ? t("bookings.team") : t("bookings.servicesRooms")}>
            <div className="ch-rail-head">
              <h3 className="ch-rail-title">
                {tab === "team"
                  ? t("bookings.teamCount", { n: sectionResources.length, people: sectionResources.length === 1 ? t("common.person") : t("common.people") })
                  : t("bookings.servicesRooms")}
              </h3>
            </div>
            {addingResource ? (
              <div className="ch-compose-row">
                <span className="ch-compose-kind">{kindLabel(newResourceKind, t)}</span>
                <input
                  className="ch-input flex-1 px-2.5 py-1.5"
                  autoFocus
                  value={newResourceName}
                  disabled={saving}
                  placeholder={t("common.name")}
                  onChange={(e) => setNewResourceName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addResource();
                    }
                    if (e.key === "Escape") {
                      setAddingResource(false);
                      setNewResourceName("");
                    }
                  }}
                />
                <button
                  type="button"
                  className="ch-btn ch-btn-primary h-8 px-3"
                  disabled={saving || !newResourceName.trim()}
                  onClick={() => void addResource()}
                >
                  Add
                </button>
                <button
                  type="button"
                  className="ch-btn ch-btn-text h-8 w-8 px-0"
                  aria-label={t("common.cancel")}
                  disabled={saving}
                  onClick={() => {
                    setAddingResource(false);
                    setNewResourceName("");
                  }}
                >
                  <IconClose size={13} />
                </button>
              </div>
            ) : null}

            {sectionResources.length === 0 ? (
              <div className="ch-empty-line">
                {tab === "team" ? t("bookings.noTeam") : t("bookings.noServicesRooms")}
              </div>
            ) : tab === "team" ? (
              <ul className="ch-list">
                {sectionResources.map((r) => renderResourceListItem(r))}
              </ul>
            ) : (
              <>
                {catalogServices.length > 0 ? (
                  <>
                    <div className="ch-group-head">
                      <h4 className="ch-group-title">{t("bookings.services")}</h4>
                      <span className="ch-group-count tabular-nums">{catalogServices.length}</span>
                    </div>
                    <ul className="ch-list">
                      {catalogServices.map((r) => renderResourceListItem(r))}
                    </ul>
                  </>
                ) : null}
                {catalogRooms.length > 0 ? (
                  <>
                    <div className="ch-group-head">
                      <h4 className="ch-group-title">{t("bookings.rooms")}</h4>
                      <span className="ch-group-count tabular-nums">{catalogRooms.length}</span>
                    </div>
                    <ul className="ch-list">
                      {catalogRooms.map((r) => renderResourceListItem(r))}
                    </ul>
                  </>
                ) : null}
              </>
            )}
          </section>

          <aside className="ch-split-detail" aria-label="Details">
            {!selectedResource ? (
              <div className="ch-empty-line">{t("bookings.selectToEdit")}</div>
            ) : (
              renderResourceEditor(selectedResource)
            )}
          </aside>
        </div>
      ) : (
        <div key="schedule" className="ch-schedule">
          <div className="ch-schedule-main">
            <section className="ch-cal" aria-label="Calendar">
              <div className="ch-cal-head">
                <h3 className="ch-cal-month">{formatMonthTitle(viewYear, viewMonth)}</h3>
                <div className="ch-cal-nav">
                  <button
                    type="button"
                    className="ch-btn ch-btn-text h-7 w-7 px-0"
                    aria-label={t("common.back")}
                    onClick={() => shiftMonth(-1)}
                  >
                    <IconChevron dir="left" size={15} />
                  </button>
                  <button
                    type="button"
                    className="ch-btn ch-btn-text h-7 px-2"
                    onClick={() => {
                      setViewYear(today.getFullYear());
                      setViewMonth(today.getMonth());
                      setSelectedYmd(todayYmd);
                      setSelectedSlot(null);
                    }}
                  >
                    {t("bookings.today")}
                  </button>
                  <button
                    type="button"
                    className="ch-btn ch-btn-text h-7 w-7 px-0"
                    aria-label={t("tour.next")}
                    onClick={() => shiftMonth(1)}
                  >
                    <IconChevron dir="right" size={15} />
                  </button>
                </div>
              </div>

              <div className="ch-cal-weekdays">
                {weekdays.map((d, i) => (
                  <span key={`${d}-${i}`}>{d}</span>
                ))}
              </div>

              <div className="ch-cal-grid">
                {cells.map((day, i) => {
                  if (day == null) {
                    return <span key={`e-${i}`} className="ch-cal-cell is-empty" />;
                  }
                  const ymd = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const pastDay = isPastOrBeyond(ymd);
                  const selectable = isDaySelectable(ymd);
                  const selected = ymd === selectedYmd;
                  const rangeEnd = ymd === rangeEndYmd;
                  const ranged = inRange(ymd);
                  const closed = !pastDay && !isDayOpen(ymd);
                  const disabled = pastDay || (mode !== "multi_day" && !selectable && !closed && !bookedYmds.has(ymd));
                  return (
                    <button
                      key={ymd}
                      type="button"
                      disabled={disabled && !bookedYmds.has(ymd)}
                      onClick={() => {
                        if (bookedYmds.has(ymd) && (pastDay || !selectable)) {
                          setSelectedYmd(ymd);
                          setSelectedSlot(null);
                          return;
                        }
                        pickDay(day);
                      }}
                      className={[
                        "ch-cal-cell",
                        selected || rangeEnd ? "is-selected" : "",
                        ranged && !selected && !rangeEnd ? "is-range" : "",
                        pastDay ? "is-past" : "",
                        closed ? "is-closed" : "",
                        ymd === todayYmd ? "is-today" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span className="ch-cal-num tabular-nums">{day}</span>
                      {bookedYmds.has(ymd) ? <span className="ch-cal-dot" aria-hidden /> : null}
                    </button>
                  );
                })}
              </div>

              <div className="ch-cal-legend">
                <span className="ch-cal-legend-item">
                  <span className="ch-cal-dot is-static" aria-hidden /> {t("bookings.booked")}
                </span>
                <span className="ch-cal-legend-item">
                  <span className="ch-cal-legend-closed" aria-hidden /> {t("bookings.closed")}
                </span>
              </div>
            </section>

            <section className="ch-timeline-wrap" aria-label="Day">
              <div className="ch-timeline-head">
                <h3 className="ch-timeline-day">{formatDayHeader(selectedYmd)}</h3>
                <span className="ch-timeline-count tabular-nums">
                  {dayBookings.length === 0
                    ? t("bookings.free")
                    : t("bookings.nBooked", { n: dayBookings.length })}
                </span>
              </div>

              {mode === "hourly" ? (
                !isDayOpen(selectedYmd) ? (
                  <div className="ch-empty-line">{t("bookings.closed")}</div>
                ) : (
                  <div className="ch-timeline-scroll">
                    <div className="ch-timeline" style={{ height: timelineHeight }}>
                      {hourMarks.map((m) => {
                        const top = (m - openMin) * pxPerMin;
                        const d = new Date(2000, 0, 1, Math.floor(m / 60), m % 60);
                        return (
                          <div key={m} className="ch-timeline-hour" style={{ top }}>
                            <span className="ch-timeline-hour-label tabular-nums">
                              {formatClock(d, { hour12, compact: true })}
                            </span>
                          </div>
                        );
                      })}

                      {slots.map(({ local, taken }) => {
                        const start = new Date(local);
                        const startMin = start.getHours() * 60 + start.getMinutes();
                        const top = (startMin - openMin) * pxPerMin;
                        const isPastSlot = +start + s.slot_minutes * 60_000 <= nowTick;
                        const active = selectedSlot === local && sheetOpen;
                        if (taken) return null;
                        return (
                          <button
                            key={local}
                            type="button"
                            disabled={isPastSlot}
                            className={`ch-timeline-free${active ? " is-active" : ""}${isPastSlot ? " is-past" : ""}`}
                            style={{ top, height: SLOT_ROW_PX }}
                            onClick={() => openSheetForSlot(local)}
                            aria-label={`Book ${formatSlotLabel(local, hour12)}`}
                          >
                            <span className="ch-timeline-free-label tabular-nums">
                              {formatSlotLabel(local, hour12)}
                            </span>
                            <span className="ch-timeline-free-cta">{t("bookings.book")}</span>
                          </button>
                        );
                      })}

                      {dayBookings.map((b) => {
                        const a = new Date(b.starts_at);
                        const e = new Date(b.ends_at);
                        const startMin = a.getHours() * 60 + a.getMinutes();
                        const endMin = e.getHours() * 60 + e.getMinutes();
                        const top = Math.max(0, (startMin - openMin) * pxPerMin);
                        const height = Math.max(
                          22,
                          (Math.min(endMin, closeMin) - Math.max(startMin, openMin)) * pxPerMin - 2,
                        );
                        const { head, staff } = resourceLine(b);
                        return (
                          <div
                            key={b.id}
                            className={`ch-timeline-block is-${b.status}`}
                            style={{ top, height }}
                            title={`${b.customer_name || t("bookings.unnamed")}${head ? ` · ${head}` : ""}`}
                          >
                            <span className="ch-timeline-block-time tabular-nums">
                              {formatClockRange(a, e, { hour12 })}
                            </span>
                            <span className="ch-timeline-block-who">
                              <span className="ch-timeline-block-name">
                                {b.customer_name || t("bookings.unnamed")}
                              </span>
                              {head ? <span className="ch-timeline-block-svc"> · {head}</span> : null}
                              {staff ? <span className="ch-timeline-block-svc"> → {staff}</span> : null}
                            </span>
                          </div>
                        );
                      })}

                      {nowOffsetPx != null && nowOffsetPx >= 0 && nowOffsetPx <= timelineHeight ? (
                        <div className="ch-timeline-now" style={{ top: nowOffsetPx }} aria-hidden>
                          <span className="ch-timeline-now-label tabular-nums">
                            {formatClock(nowTick, { hour12 })}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              ) : (
                <div className="ch-day-summary">
                  {dayBookings.length === 0 ? (
                    <div className="ch-empty-line">{t("bookings.nothingBooked")}</div>
                  ) : (
                    <ul className="ch-ledger">{dayBookings.map((b) => renderLedgerRow(b, "upcoming"))}</ul>
                  )}
                  {mode === "multi_day" ? (
                    <p className="ch-hint" style={{ padding: "0 1rem" }}>
                      {rangeEndYmd
                        ? `${formatDayHeader(selectedYmd)} → ${formatDayHeader(rangeEndYmd)}`
                        : t("bookings.pickCheckInOut")}
                    </p>
                  ) : null}
                </div>
              )}
            </section>
          </div>

          <aside className="ch-ledger-pane" aria-label={t("bookings.onTheBook")}>
            <div className="ch-ledger-head">
              <h3 className="ch-ledger-title">{t("bookings.upcoming")}</h3>
              <div className="ch-ledger-head-end">
                {focusPeerId ? (
                  <label className="ch-toggle ch-toggle-sm">
                    <input
                      type="checkbox"
                      className="ch-check"
                      checked={peerOnly}
                      onChange={(e) => setPeerOnly(e.target.checked)}
                    />
                    {t("bookings.thisChat")}
                  </label>
                ) : null}
                <span className="ch-ledger-count tabular-nums">{upcoming.length}</span>
              </div>
            </div>
            <div className="ch-ledger-scroll">
              {upcoming.length === 0 ? (
                <div className="ch-empty-line">{t("bookings.nothingUpcoming")}</div>
              ) : (
                <ul className="ch-ledger">{upcoming.map((b) => renderLedgerRow(b, "upcoming"))}</ul>
              )}

              {past.length > 0 ? (
                <>
                  <div className="ch-ledger-head is-sub">
                    <h3 className="ch-ledger-title">{t("bookings.past")}</h3>
                    <span className="ch-ledger-count tabular-nums">{past.length}</span>
                  </div>
                  <ul className="ch-ledger is-past">{past.map((b) => renderLedgerRow(b, "past"))}</ul>
                </>
              ) : null}
            </div>
          </aside>

          {sheetOpen ? (
            <>
              <button
                type="button"
                className="ch-sheet-scrim"
                aria-label={t("common.close")}
                onClick={() => setSheetOpen(false)}
              />
              <form
                className="ch-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby="booking-sheet-title"
                onSubmit={(e) => void saveBooking(e)}
              >
                <div className="ch-sheet-head">
                  <div className="min-w-0">
                    <h3 id="booking-sheet-title" className="ch-sheet-title">
                      {editingId ? t("bookings.editBooking") : t("bookings.newBooking")}
                    </h3>
                    <div className="ch-sheet-when tabular-nums">{sheetWhen}</div>
                  </div>
                  <button
                    type="button"
                    className="ch-btn ch-btn-text h-8 w-8 px-0"
                    aria-label={t("common.close")}
                    onClick={closeSheet}
                  >
                    <IconClose size={14} />
                  </button>
                </div>

                <div className="ch-sheet-body">
                  {mode === "hourly" ? (
                    <label className="ch-field">
                      <span className="ch-label">{t("bookings.time")}</span>
                      <select
                        className="ch-input w-full px-2.5 py-2 tabular-nums"
                        value={selectedSlot ?? ""}
                        onChange={(e) => setSelectedSlot(e.target.value || null)}
                      >
                        <option value="">{t("bookings.pickATime")}</option>
                        {slots.map(({ local, taken }) => (
                          <option key={local} value={local} disabled={taken}>
                            {formatSlotLabel(local, hour12)}
                            {taken ? t("bookings.bookedSuffix") : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <label className="ch-field">
                    <span className="ch-label">{t("bookings.customer")}</span>
                    <input
                      className="ch-input w-full px-2.5 py-2"
                      value={customerName}
                      autoFocus
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </label>
                  <label className="ch-field">
                    <span className="ch-label">{t("bookings.service")}</span>
                    <input
                      className="ch-input w-full px-2.5 py-2"
                      value={serviceLabel}
                      onChange={(e) => setServiceLabel(e.target.value)}
                    />
                  </label>
                  {activeResources.length > 0 ? (
                    <label className="ch-field">
                      <span className="ch-label">{t("bookings.resource")}</span>
                      <select
                        className="ch-input w-full px-2.5 py-2"
                        value={resourcePick}
                        onChange={(e) => {
                          setResourcePick(e.target.value);
                        }}
                      >
                        <option value="any">{t("bookings.anyAvailable")}</option>
                        {activeResources.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name} · {kindLabel(r.kind, t)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="ch-field">
                    <span className="ch-label">{t("common.notes")}</span>
                    <textarea
                      className="ch-input w-full resize-y px-2.5 py-2"
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </label>
                  {focusPeerId ? (
                    <label className="ch-toggle">
                      <input
                        type="checkbox"
                        className="ch-check"
                        checked={linkPeer}
                        onChange={(e) => setLinkPeer(e.target.checked)}
                      />
                      <span>
                        {focusPeerName ? t("bookings.linkToChatNamed", { name: focusPeerName }) : t("bookings.linkToChat")}
                      </span>
                    </label>
                  ) : null}
                </div>

                <div className="ch-sheet-foot">
                  <button
                    type="button"
                    className="ch-btn ch-btn-text h-8 px-2.5"
                    onClick={closeSheet}
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !canConfirm}
                    className="ch-btn ch-btn-primary h-8 px-3"
                  >
                    {saving ? t("common.saving") : editingId ? t("common.save") : t("bookings.book")}
                  </button>
                </div>
              </form>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
