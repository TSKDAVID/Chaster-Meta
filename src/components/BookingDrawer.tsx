"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  bookingModeHint,
  bookingModeLabel,
  computeEndsAt,
  DEFAULT_BOOKING_SETTINGS,
  formatBookingWhen,
  formatDayHeader,
  formatMonthTitle,
  formatSlotLabel,
  hourlySlotStarts,
  monthGrid,
  parseYmd,
  statusLabel,
  toYmd,
  WEEKDAY_ORDER,
  weekdayKeyFromYmd,
  weekdayLabel,
} from "@/lib/bookings";
import {
  isResourcesTab,
  type BookingDeskTab,
} from "@/lib/desk-routes";
import {
  IconBack,
  IconCalendar,
  IconChevron,
  IconClock,
  IconGlobe,
  IconLayers,
  IconLink,
  IconUser,
} from "@/components/icons";
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
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const BUFFER_PRESETS = [0, 5, 10, 15, 30, 45, 60] as const;
const RESOURCE_KINDS: ResourceKind[] = [
  "service",
  "staff",
  "room",
  "equipment",
  "other",
];
const CATALOG_KINDS: ResourceKind[] = [
  "service",
  "room",
  "equipment",
  "other",
];

function kindLabel(kind: ResourceKind) {
  if (kind === "service") return "Service";
  if (kind === "staff") return "Team member";
  if (kind === "room") return "Room";
  if (kind === "equipment") return "Equipment";
  return "Other";
}

function kindBlurb(kind: ResourceKind) {
  if (kind === "staff") return "A person who can take appointments.";
  if (kind === "service")
    return "Something customers book. Connect who (or which room) can provide it.";
  if (kind === "room") return "A space that can be booked or used for a service.";
  if (kind === "equipment")
    return "Gear that can be booked or used for a service.";
  return "Anything else you want on the calendar.";
}

function KindMark({ kind }: { kind: ResourceKind }) {
  if (kind === "staff") return <IconUser size={14} />;
  if (kind === "service") return <IconLayers size={14} />;
  return <IconLink size={14} />;
}

function linkSummary(
  r: BookableResource,
  all: BookableResource[],
): { line: string; tone: "ok" | "warn" | "muted" } {
  if (r.kind === "service") {
    const names = (r.linked_ids ?? [])
      .map((id) => all.find((x) => x.id === id)?.name)
      .filter(Boolean) as string[];
    if (names.length === 0) {
      return { line: "Not connected yet — pick who can do this", tone: "warn" };
    }
    return {
      line: `Works with ${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}`,
      tone: "ok",
    };
  }
  const offered = all.filter(
    (s) => s.kind === "service" && (s.linked_ids ?? []).includes(r.id),
  );
  if (offered.length === 0) {
    return {
      line:
        r.kind === "staff"
          ? "Not on any service yet — connect them from Services & rooms"
          : "Not on any service yet",
      tone: "muted",
    };
  }
  return {
    line: `On ${offered
      .slice(0, 3)
      .map((s) => s.name)
      .join(", ")}${offered.length > 3 ? "…" : ""}`,
    tone: "ok",
  };
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
  pageName,
  focusPeerId,
  focusPeerName,
  onError,
  refreshKey = 0,
  tab: tabProp = "schedule",
  onTabChange,
}: Props) {
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
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameDraft, setEditNameDraft] = useState("");

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
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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

  const selectedResource = useMemo(
    () => sectionResources.find((r) => r.id === selectedResourceId) ?? null,
    [sectionResources, selectedResourceId],
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

  function capacityIdsFor(primaryId: string): string[] {
    const primary = activeResources.find((r) => r.id === primaryId);
    if (!primary) return [primaryId];
    const linked = (primary.linked_ids ?? []).filter((id) =>
      activeResources.some((r) => r.id === id),
    );
    return linked.length > 0 ? linked : [primaryId];
  }

  function isCapacityBusy(capacityId: string, start: number, end: number) {
    return activeBookings.some(
      (b) =>
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

  /** Primary is taken only when every capacity unit under it is busy. */
  function isPrimaryTaken(primaryId: string, start: number, end: number) {
    return capacityIdsFor(primaryId).every((id) =>
      isCapacityBusy(id, start, end),
    );
  }

  function isIntervalTaken(start: number, end: number) {
    if (Number.isNaN(start)) return true;
    if (activeResources.length === 0) {
      return activeBookings.some((b) =>
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
      const slotsList = hourlySlotStarts(
        ymd,
        settings?.open_time ?? "09:00",
        settings?.close_time ?? "18:00",
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

  function effectiveOpenDays(): WeekdayKey[] {
    if (resourcePick !== "any") {
      const r = activeResources.find((x) => x.id === resourcePick);
      if (r?.open_days && r.open_days.length > 0) return r.open_days;
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
    return hourlySlotStarts(
      selectedYmd,
      settings.open_time,
      settings.close_time,
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
  ]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return bookings.filter(
      (b) => b.status !== "cancelled" && +new Date(b.ends_at) >= now - 86400000,
    );
  }, [bookings]);

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

  async function createBooking(e?: FormEvent) {
    e?.preventDefault();
    if (!pageId || !settings) return;
    setSaving(true);
    onError(null);
    try {
      let startsAt: string;
      let endsAt: string;

      if (mode === "hourly") {
        if (!selectedSlot) throw new Error("Pick a time slot");
        startsAt = new Date(selectedSlot).toISOString();
        endsAt =
          computeEndsAt(selectedSlot, "hourly", settings.slot_minutes) ??
          startsAt;
      } else if (mode === "day") {
        if (!selectedYmd) throw new Error("Pick a day");
        startsAt = new Date(
          `${selectedYmd}T${settings.open_time}:00`,
        ).toISOString();
        endsAt = new Date(
          `${selectedYmd}T${settings.close_time}:00`,
        ).toISOString();
      } else {
        const endYmd = rangeEndYmd || selectedYmd;
        if (!selectedYmd) throw new Error("Pick check-in and check-out");
        const a = selectedYmd <= endYmd ? selectedYmd : endYmd;
        const b = selectedYmd <= endYmd ? endYmd : selectedYmd;
        startsAt = new Date(`${a}T${settings.open_time}:00`).toISOString();
        endsAt = new Date(`${b}T${settings.close_time}:00`).toISOString();
      }

      if (+new Date(endsAt) <= +new Date(startsAt)) {
        throw new Error("End must be after start");
      }

      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_id: pageId,
          peer_id: linkPeer && focusPeerId ? focusPeerId : null,
          customer_name: customerName.trim() || focusPeerName || null,
          service_label: serviceLabel.trim() || null,
          notes: notes.trim() || null,
          starts_at: startsAt,
          ends_at: endsAt,
          status: "confirmed",
          source: "desk",
          assignment: resourcePick === "any" ? "any" : "specific",
          resource_id: resourcePick === "any" ? null : resourcePick,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create booking");
      setServiceLabel("");
      setNotes("");
      setSelectedSlot(null);
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to create booking");
    } finally {
      setSaving(false);
    }
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
        setEditingNameId(null);
      }
      await load({ silent: true });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to add resource");
    } finally {
      setSaving(false);
    }
  }

  function beginAdd(kind: ResourceKind) {
    setNewResourceKind(kind);
    setAddingResource(true);
    setEditingNameId(null);
  }

  async function commitRename(id: string) {
    const name = editNameDraft.trim();
    const current = resources.find((r) => r.id === id);
    setEditingNameId(null);
    if (!name || !current || name === current.name) return;
    await patchResource(id, { name });
  }

  async function patchResource(
    id: string,
    patch: Partial<{
      name: string;
      kind: ResourceKind;
      active: boolean;
      open_time: string | null;
      close_time: string | null;
      open_days: WeekdayKey[] | null;
      linked_ids: string[];
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
        `Delete “${label}”? This can’t be undone.`,
      )
    ) {
      return;
    }
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
      if (editingNameId === id) setEditingNameId(null);
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
  const canConfirm =
    mode === "hourly"
      ? Boolean(selectedSlot)
      : mode === "day"
        ? Boolean(selectedYmd) && isDaySelectable(selectedYmd)
        : Boolean(selectedYmd && rangeEndYmd);

  const durationLabel =
    mode === "hourly"
      ? `${s.slot_minutes} mins`
      : mode === "day"
        ? "Full day"
        : "Multi-day stay";

  function renderResourceEditor(
    r: BookableResource,
    opts?: { showIdentity?: boolean },
  ) {
    const showIdentity = opts?.showIdentity !== false;
    const linked = new Set(r.linked_ids ?? []);
    const customDays = Boolean(r.open_days?.length);
    const effectiveDays =
      customDays && r.open_days ? r.open_days : s.open_days;
    const providers = resources.filter(
      (o) =>
        o.id !== r.id &&
        (o.kind === "staff" ||
          o.kind === "room" ||
          o.kind === "equipment" ||
          o.kind === "other"),
    );
    const onServices = resources.filter(
      (svc) =>
        svc.kind === "service" && (svc.linked_ids ?? []).includes(r.id),
    );
    return (
      <div key={r.id} className="ch-res-detail">
        <header className="ch-res-detail-head">
          {showIdentity ? (
            <div className="ch-res-detail-title-row">
              <span className="ch-res-kind-mark" aria-hidden>
                <KindMark kind={r.kind} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="ch-res-eyebrow">{kindLabel(r.kind)}</p>
                <h3 className="ch-headline ch-res-detail-name">{r.name}</h3>
                <p className="ch-res-detail-blurb">{kindBlurb(r.kind)}</p>
              </div>
            </div>
          ) : (
            <p className="ch-res-detail-blurb" style={{ margin: 0 }}>
              {kindBlurb(r.kind)}
            </p>
          )}
          <div className="ch-res-detail-actions">
            <label className="ch-res-active">
              <input
                type="checkbox"
                checked={r.active}
                disabled={saving}
                onChange={(e) =>
                  void patchResource(r.id, {
                    active: e.target.checked,
                  })
                }
                style={{ accentColor: "var(--chaster-accent)" }}
              />
              <span>{r.active ? "Shown for booking" : "Hidden"}</span>
            </label>
            <button
              type="button"
              className="ch-btn ch-btn-text h-8 px-2 text-[11px]"
              style={{ color: "var(--chaster-danger-text)" }}
              disabled={saving}
              onClick={() => void removeResource(r.id)}
            >
              Delete
            </button>
          </div>
        </header>

        {r.kind === "service" ? (
          <section className="ch-res-block">
            <div className="ch-res-block-label">
              <IconLink size={12} />
              Who can provide this?
            </div>
            <p className="ch-res-help">
              Check everyone (or every room) that offers this. If any one of
              them is free, customers can book it.
            </p>
            {providers.length === 0 ? (
              <p className="ch-res-empty-hint">
                Add team members under Team first, then come back here.
              </p>
            ) : (
              <div className="ch-res-links">
                {providers.map((o) => {
                  const checked = linked.has(o.id);
                  return (
                    <label
                      key={o.id}
                      className={`ch-res-link${checked ? " is-on" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={saving}
                        onChange={(e) => {
                          const next = new Set(linked);
                          if (e.target.checked) next.add(o.id);
                          else next.delete(o.id);
                          void patchResource(r.id, {
                            linked_ids: [...next],
                          });
                        }}
                      />
                      <span className="ch-res-link-mark" aria-hidden>
                        <KindMark kind={o.kind} />
                      </span>
                      <span className="ch-res-link-text">
                        <span className="ch-res-link-name">{o.name}</span>
                        <span className="ch-res-link-kind">
                          {kindLabel(o.kind)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>
        ) : (
          <section className="ch-res-block">
            <div className="ch-res-block-label">
              <IconLayers size={12} />
              Services this appears on
            </div>
            {onServices.length === 0 ? (
              <p className="ch-res-help">
                {r.kind === "staff"
                  ? "Not connected yet. Open Services & rooms, pick a service, and check this name."
                  : "Not connected to a service yet. Open a service and check this under Who can provide this?"}
              </p>
            ) : (
              <ul className="ch-res-chip-list">
                {onServices.map((svc) => (
                  <li key={svc.id}>
                    <button
                      type="button"
                      className="ch-res-chip"
                      onClick={() => {
                        setTab("catalog");
                        setSelectedResourceId(svc.id);
                      }}
                    >
                      {svc.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="ch-res-block">
          <div className="ch-res-block-label">
            <IconClock size={12} />
            When available
            <span>
              blank = store ({s.open_time}–{s.close_time})
            </span>
          </div>
          <div className="ch-res-hours">
            <input
              type="time"
              className="ch-input ch-res-time"
              defaultValue={r.open_time ?? ""}
              disabled={saving}
              aria-label="Opens"
              onBlur={(e) => {
                const v = e.target.value.trim() || null;
                if (v !== (r.open_time ?? null)) {
                  void patchResource(r.id, { open_time: v });
                }
              }}
            />
            <span className="ch-res-hours-sep">–</span>
            <input
              type="time"
              className="ch-input ch-res-time"
              defaultValue={r.close_time ?? ""}
              disabled={saving}
              aria-label="Closes"
              onBlur={(e) => {
                const v = e.target.value.trim() || null;
                if (v !== (r.close_time ?? null)) {
                  void patchResource(r.id, { close_time: v });
                }
              }}
            />
          </div>
          <div className="ch-res-block-label mt-3">
            <IconCalendar size={12} />
            Open days
            <button
              type="button"
              className="ch-btn ch-btn-text h-6 px-1.5 text-[11px]"
              disabled={saving || !customDays}
              onClick={() => void patchResource(r.id, { open_days: null })}
            >
              {customDays ? "Use store days" : "Using store days"}
            </button>
          </div>
          <div className="ch-res-days" role="group" aria-label="Open days">
            {WEEKDAY_ORDER.map((day) => {
              const on = effectiveDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  disabled={saving}
                  className={`ch-res-day${on ? " is-on" : ""}`}
                  aria-pressed={on}
                  onClick={() => {
                    const base = customDays
                      ? [...(r.open_days ?? [])]
                      : [...s.open_days];
                    const next = on
                      ? base.filter((d) => d !== day)
                      : [...base, day];
                    if (next.length === 0) return;
                    void patchResource(r.id, { open_days: next });
                  }}
                >
                  {weekdayLabel(day)}
                </button>
              );
            })}
          </div>
        </section>

        {tab === "catalog" ? (
          <section className="ch-res-block">
            <div className="ch-res-block-label">Type</div>
            <select
              className="ch-input w-full max-w-xs px-2.5 py-1.5 text-[13px]"
              value={r.kind}
              disabled={saving}
              aria-label="Type"
              onChange={(e) =>
                void patchResource(r.id, {
                  kind: e.target.value as ResourceKind,
                })
              }
            >
              {CATALOG_KINDS.map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </select>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div
      data-tour="booking-drawer"
      className="ch-book-dialog ch-desk-page-panel flex h-full min-h-0 w-full flex-col overflow-hidden"
      aria-labelledby="booking-page-title"
    >
      <div className="ch-book-dialog-head">
        <div className="ch-page-head-start min-w-0">
          <h2 id="booking-page-title" className="ch-headline ch-book-dialog-title">
            Bookings
          </h2>
          <p className="ch-book-dialog-sub">
            {pageName
              ? `Schedule for ${pageName}`
              : "Schedule for this Page"}
          </p>
        </div>
        <div className="ch-subnav-stack">
          <nav className="ch-subnav" aria-label="Bookings views">
            {(
              [
                ["schedule", "Schedule"],
                ["resources", "Resources"],
                ["setup", "Setup"],
              ] as const
            ).map(([id, label]) => {
              const active =
                id === "resources" ? isResourcesTab(tab) : tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    setTab(
                      id === "resources"
                        ? "team"
                        : (id as "schedule" | "setup"),
                    )
                  }
                  className={`ch-subnav-tab${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          {isResourcesTab(tab) ? (
              <nav className="ch-subnav" aria-label="Resources sections">
                <button
                  type="button"
                  className={`ch-subnav-tab${tab === "team" ? " is-active" : ""}`}
                  aria-current={tab === "team" ? "page" : undefined}
                  onClick={() => {
                    setTab("team");
                    setAddingResource(false);
                    setNewResourceName("");
                    setSelectedResourceId(null);
                    setEditingNameId(null);
                  }}
                >
                  Team
                </button>
                <button
                  type="button"
                  className={`ch-subnav-tab${tab === "catalog" ? " is-active" : ""}`}
                  aria-current={tab === "catalog" ? "page" : undefined}
                  onClick={() => {
                    setTab("catalog");
                    setAddingResource(false);
                    setNewResourceName("");
                    setSelectedResourceId(null);
                    setEditingNameId(null);
                  }}
                >
                  Services & rooms
                </button>
              </nav>
          ) : null}
        </div>
        <div className="ch-page-head-end">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="ch-btn ch-btn-ghost ch-desk-back h-8 shrink-0 gap-1.5 px-2"
              aria-label="Back to inbox"
            >
              <IconBack size={14} />
              <span className="text-[12px]">Inbox</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="ch-book-dialog-body">
          {loading && !settings ? (
            <p className="ch-book-loading">Loading schedule…</p>
          ) : tab === "setup" ? (
            <div key="setup" className="ch-subpage ch-book-setup ch-book-setup-split">
              <div className="ch-book-setup-left">
                <aside className="ch-booker-aside ch-book-setup-aside">
                  <div className="ch-booker-mark" aria-hidden>
                    <IconCalendar size={16} />
                  </div>
                  <div className="ch-booker-host">
                    {pageName || "Your Page"}
                  </div>
                  <h3 className="ch-headline ch-booker-title">How time works</h3>
                  <ul className="ch-booker-meta">
                    <li>
                      <IconClock size={14} />
                      <span>{bookingModeLabel(mode)}</span>
                    </li>
                    <li>
                      <IconGlobe size={14} />
                      <span>{s.timezone}</span>
                    </li>
                  </ul>

                  <label className="ch-book-setup-toggle">
                    <span>
                      <span className="ch-book-setup-toggle-title">Accept bookings</span>
                      <span className="ch-book-setup-toggle-hint">
                        Off = desk still stores, AI won’t offer slots
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      disabled={saving}
                      onChange={(e) => void saveSettings({ enabled: e.target.checked })}
                      className="h-4 w-4"
                      style={{ accentColor: "var(--chaster-accent)" }}
                    />
                  </label>
                </aside>

                <div className="ch-book-setup-modes">
                  <div className="ch-book-ledger-head">
                    <h3 className="ch-headline ch-book-ledger-title">Booking shape</h3>
                  </div>
                  <div className="ch-book-modes">
                    {MODES.map((m) => {
                      const active = s.booking_mode === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          disabled={saving}
                          onClick={() => void saveSettings({ booking_mode: m })}
                          className={`ch-book-mode${active ? " is-active" : ""}`}
                        >
                          <span className="ch-book-mode-title">{bookingModeLabel(m)}</span>
                          <span className="ch-book-mode-hint">{bookingModeHint(m)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <aside className="ch-book-setup-right" aria-label="Hours and rules">
                <div className="ch-book-ledger-wrap">
                  <div className="ch-book-ledger-head">
                    <h3 className="ch-headline ch-book-ledger-title">Hours & rules</h3>
                    <span className="text-[11px]" style={{ color: "var(--chaster-muted)" }}>
                      {s.open_time}–{s.close_time}
                    </span>
                  </div>

                  <div className="ch-book-setup-fields">
                    {s.booking_mode === "hourly" && (
                      <label className="block">
                        <span className="ch-book-label mb-1.5">Slot length</span>
                        <select
                          className="ch-input w-full px-3 py-2 text-[13px]"
                          value={s.slot_minutes}
                          disabled={saving}
                          onChange={(e) =>
                            void saveSettings({ slot_minutes: Number(e.target.value) })
                          }
                        >
                          {[15, 30, 45, 60, 90, 120].map((n) => (
                            <option key={n} value={n}>
                              {n} minutes
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <div className="ch-book-setup-grid">
                      <label className="block">
                        <span className="ch-book-label mb-1.5">Opens</span>
                        <input
                          type="time"
                          className="ch-input w-full px-3 py-2 text-[13px]"
                          value={s.open_time}
                          disabled={saving}
                          onChange={(e) => void saveSettings({ open_time: e.target.value })}
                        />
                      </label>
                      <label className="block">
                        <span className="ch-book-label mb-1.5">Closes</span>
                        <input
                          type="time"
                          className="ch-input w-full px-3 py-2 text-[13px]"
                          value={s.close_time}
                          disabled={saving}
                          onChange={(e) => void saveSettings({ close_time: e.target.value })}
                        />
                      </label>

                      <div className="block" style={{ gridColumn: "1 / -1" }}>
                        <span className="ch-book-label mb-1.5">Open days</span>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {WEEKDAY_ORDER.map((day) => {
                            const on = s.open_days.includes(day);
                            return (
                              <button
                                key={day}
                                type="button"
                                disabled={saving}
                                className={`ch-book-buffer-unit${on ? " is-active" : ""}`}
                                aria-pressed={on}
                                onClick={() => {
                                  const next = on
                                    ? s.open_days.filter((d) => d !== day)
                                    : [...s.open_days, day];
                                  if (next.length === 0) return;
                                  void saveSettings({ open_days: next });
                                }}
                              >
                                {weekdayLabel(day)}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="relative block">
                        <span className="ch-book-label mb-1.5">Buffer between bookings</span>
                        <select
                          className="ch-input mt-1 w-full px-3 py-2 text-[13px]"
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
                              {n === 0 ? "None" : `${n} min`}
                            </option>
                          ))}
                          <option value="custom">Custom…</option>
                        </select>

                        {bufferCustom && (
                          <div className="ch-book-buffer-pop" role="group" aria-label="Custom buffer">
                            <input
                              type="number"
                              min={1}
                              max={bufferUnit === "days" ? 14 : bufferUnit === "hours" ? 336 : 20160}
                              className="ch-input ch-book-buffer-amount px-2.5 py-1.5 text-[13px]"
                              value={bufferAmount}
                              disabled={saving}
                              onChange={(e) => setBufferAmount(Number(e.target.value) || 0)}
                            />
                            <div className="ch-book-buffer-units" role="radiogroup" aria-label="Buffer unit">
                              {(
                                [
                                  ["minutes", "min"],
                                  ["hours", "hrs"],
                                  ["days", "days"],
                                ] as const
                              ).map(([unit, label]) => (
                                <button
                                  key={unit}
                                  type="button"
                                  disabled={saving}
                                  className={`ch-book-buffer-unit${bufferUnit === unit ? " is-active" : ""}`}
                                  aria-pressed={bufferUnit === unit}
                                  onClick={() => setBufferUnit(unit)}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              className="ch-btn ch-btn-primary h-8 px-2.5 text-[12px]"
                              disabled={saving || bufferAmount < 1}
                              onClick={() =>
                                void saveSettings({
                                  buffer_minutes: customToMinutes(bufferAmount, bufferUnit),
                                })
                              }
                            >
                              Apply
                            </button>
                          </div>
                        )}
                      </div>
                      <label className="block">
                        <span className="ch-book-label mb-1.5">Book ahead (days)</span>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          className="ch-input w-full px-3 py-2 text-[13px]"
                          value={s.max_advance_days}
                          disabled={saving}
                          onChange={(e) =>
                            void saveSettings({
                              max_advance_days: Number(e.target.value) || 60,
                            })
                          }
                        />
                      </label>
                    </div>

                    <label className="block">
                      <span className="ch-book-label mb-1.5">Timezone</span>
                      <input
                        className="ch-input w-full px-3 py-2 text-[12px]"
                        value={s.timezone}
                        disabled={saving}
                        onChange={(e) => void saveSettings({ timezone: e.target.value })}
                        placeholder="Asia/Tbilisi"
                      />
                    </label>
                  </div>
                </div>
              </aside>
            </div>
          ) : isResourcesTab(tab) ? (
            <div
              key={tab}
              className={`ch-subpage ch-book-resources ch-book-resources-split${selectedResource ? " has-selection" : ""}`}
            >
              <div className="ch-res-pane ch-res-pane-list" aria-label="Catalog list">
                <header className="ch-res-section-head">
                  <div>
                    <p className="ch-res-eyebrow">
                      {tab === "team" ? "People" : "What customers book"}
                    </p>
                    <h3 className="ch-headline ch-book-ledger-title">
                      {tab === "team" ? "Team members" : "Services & rooms"}
                    </h3>
                    <p className="ch-res-lead">
                      {tab === "team"
                        ? "Add the people who take appointments. Connect them to services under Services & rooms."
                        : "Add services, rooms, or equipment. Open a service to choose who can provide it."}
                    </p>
                  </div>
                  <div className="ch-res-add-row" role="group" aria-label="Add">
                    {tab === "team" ? (
                      <button
                        type="button"
                        className="ch-res-add-chip"
                        disabled={saving}
                        onClick={() => beginAdd("staff")}
                      >
                        <IconUser size={13} />
                        Add team member
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="ch-res-add-chip"
                          disabled={saving}
                          onClick={() => beginAdd("service")}
                        >
                          <IconLayers size={13} />
                          Add service
                        </button>
                        <button
                          type="button"
                          className="ch-res-add-chip"
                          disabled={saving}
                          onClick={() => beginAdd("room")}
                        >
                          <IconLink size={13} />
                          Add room
                        </button>
                        <button
                          type="button"
                          className="ch-res-add-chip"
                          disabled={saving}
                          onClick={() => beginAdd("equipment")}
                        >
                          <IconLink size={13} />
                          Add equipment
                        </button>
                      </>
                    )}
                  </div>

                  {addingResource ? (
                    <div className="ch-res-compose-inline">
                      <span className="ch-res-compose-kind">
                        {kindLabel(newResourceKind)}
                      </span>
                      <input
                        className="ch-input flex-1 px-2.5 py-1.5 text-[13px]"
                        autoFocus
                        value={newResourceName}
                        disabled={saving}
                        placeholder={
                          newResourceKind === "staff"
                            ? "e.g. Nika"
                            : newResourceKind === "service"
                              ? "e.g. Haircut"
                              : newResourceKind === "equipment"
                                ? "e.g. Chair 1"
                                : "e.g. Room 2"
                        }
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
                        className="ch-btn ch-btn-primary h-8 px-3 text-[12px]"
                        disabled={saving || !newResourceName.trim()}
                        onClick={() => void addResource()}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        className="ch-btn ch-btn-text h-8 px-2 text-[12px]"
                        disabled={saving}
                        onClick={() => {
                          setAddingResource(false);
                          setNewResourceName("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                </header>

                {sectionResources.length === 0 ? (
                  <div className="ch-res-empty">
                    {tab === "team" ? (
                      <>
                        <ol className="ch-res-steps">
                          <li>
                            <strong>1.</strong> Add each person who takes bookings
                          </li>
                          <li>
                            <strong>2.</strong> Switch to Services & rooms and
                            connect them to what they offer
                          </li>
                        </ol>
                        <p className="ch-res-empty-hint">
                          No team yet — or leave empty if one shared calendar is enough.
                        </p>
                      </>
                    ) : (
                      <>
                        <ol className="ch-res-steps">
                          <li>
                            <strong>1.</strong> Add a service (what customers book)
                          </li>
                          <li>
                            <strong>2.</strong> Open it and check who can provide it
                          </li>
                        </ol>
                        <p className="ch-res-empty-hint">
                          Rooms and equipment are optional — use them when capacity matters.
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <ul className="ch-res-roster">
                    {sectionResources.map((r) => {
                      const summary = linkSummary(r, resources);
                      const selected = selectedResourceId === r.id;
                      const renaming = editingNameId === r.id;
                      return (
                        <li
                          key={r.id}
                          className={`ch-res-roster-item${selected ? " is-open" : ""}`}
                        >
                          <div
                            className={`ch-res-mail-row${selected ? " is-selected" : ""}${r.active ? "" : " is-inactive"}`}
                            role="button"
                            tabIndex={0}
                            aria-expanded={selected}
                            aria-current={selected ? "true" : undefined}
                            onClick={() => {
                              setSelectedResourceId((prev) =>
                                prev === r.id ? null : r.id,
                              );
                              setAddingResource(false);
                              if (editingNameId && editingNameId !== r.id) {
                                setEditingNameId(null);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedResourceId((prev) =>
                                  prev === r.id ? null : r.id,
                                );
                              }
                            }}
                          >
                            <span className="ch-res-kind-mark" aria-hidden>
                              <KindMark kind={r.kind} />
                            </span>
                            <span className="ch-res-row-body">
                              {renaming ? (
                                <input
                                  className="ch-input ch-res-rename-input"
                                  autoFocus
                                  value={editNameDraft}
                                  disabled={saving}
                                  aria-label="Edit name"
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    setEditNameDraft(e.target.value)
                                  }
                                  onBlur={() => void commitRename(r.id)}
                                  onKeyDown={(e) => {
                                    e.stopPropagation();
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void commitRename(r.id);
                                    }
                                    if (e.key === "Escape") {
                                      e.preventDefault();
                                      setEditingNameId(null);
                                    }
                                  }}
                                />
                              ) : (
                                <span className="ch-res-row-top">
                                  <span className="ch-res-row-name">{r.name}</span>
                                  <span className="ch-res-row-type">
                                    {kindLabel(r.kind)}
                                  </span>
                                </span>
                              )}
                              {!renaming ? (
                                <span
                                  className={`ch-res-row-sum is-${summary.tone}`}
                                >
                                  {summary.line}
                                </span>
                              ) : null}
                            </span>
                            <span className="ch-res-row-actions">
                              <button
                                type="button"
                                className="ch-res-quick-btn"
                                disabled={saving}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedResourceId(r.id);
                                  setEditingNameId(r.id);
                                  setEditNameDraft(r.name);
                                }}
                              >
                                Edit name
                              </button>
                              <button
                                type="button"
                                className="ch-res-quick-btn is-danger"
                                disabled={saving}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void removeResource(r.id);
                                }}
                              >
                                Delete
                              </button>
                            </span>
                          </div>
                          {selected ? (
                            <div className="ch-res-mobile-expand">
                              {renderResourceEditor(r, {
                                showIdentity: false,
                              })}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <aside
                className="ch-res-pane ch-res-pane-detail ch-res-desktop-detail"
                aria-label="Selected details"
              >
                {!selectedResource ? (
                  <div className="ch-res-detail-empty">
                    <div className="ch-booker-mark" aria-hidden>
                      <IconLayers size={16} />
                    </div>
                    <h3 className="ch-headline ch-book-ledger-title">
                      Pick one to edit
                    </h3>
                    <p className="ch-res-lead">
                      Choose a name on the left to see hours, connections, and
                      other settings.
                    </p>
                  </div>
                ) : (
                  renderResourceEditor(selectedResource)
                )}
              </aside>
            </div>
          ) : (
            <div key="schedule" className="ch-subpage ch-book-schedule ch-book-schedule-split">
              <div className="ch-book-schedule-left">
                <div className="ch-booker">
                  <aside className="ch-booker-aside">
                    <div className="ch-booker-mark" aria-hidden>
                      <IconCalendar size={16} />
                    </div>
                    <div className="ch-booker-host">
                      {pageName || "Your Page"}
                    </div>
                    <h3 className="ch-headline ch-booker-title">
                      {serviceLabel.trim() || bookingModeLabel(mode)}
                    </h3>
                    <ul className="ch-booker-meta">
                      <li>
                        <IconClock size={14} />
                        <span>{durationLabel}</span>
                      </li>
                      <li>
                        <IconCalendar size={14} />
                        <span>{bookingModeLabel(mode)}</span>
                      </li>
                      <li>
                        <IconGlobe size={14} />
                        <span>{s.timezone}</span>
                      </li>
                    </ul>

                    <div className="ch-booker-fields">
                      <label className="block">
                        <span className="ch-book-label">Customer</span>
                        <input
                          className="ch-input mt-1 w-full px-2.5 py-1.5 text-[13px]"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Who is this for?"
                        />
                      </label>
                      <label className="block">
                        <span className="ch-book-label">Service</span>
                        <input
                          className="ch-input mt-1 w-full px-2.5 py-1.5 text-[13px]"
                          value={serviceLabel}
                          onChange={(e) => setServiceLabel(e.target.value)}
                          placeholder="Haircut, room, table…"
                        />
                      </label>
                      {activeResources.length > 0 && (
                        <label className="block">
                          <span className="ch-book-label">Resource</span>
                          <select
                            className="ch-input mt-1 w-full px-2.5 py-1.5 text-[13px]"
                            value={resourcePick}
                            onChange={(e) => {
                              setResourcePick(e.target.value);
                              setSelectedSlot(null);
                            }}
                          >
                            <option value="any">Any available</option>
                            {activeResources.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} ({kindLabel(r.kind)})
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label className="block">
                        <span className="ch-book-label">Notes</span>
                        <textarea
                          className="ch-input mt-1 w-full resize-y px-2.5 py-1.5 text-[13px]"
                          rows={2}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Optional"
                        />
                      </label>
                      {focusPeerId && (
                        <label className="flex items-center gap-2 text-[12px]">
                          <input
                            type="checkbox"
                            checked={linkPeer}
                            onChange={(e) => setLinkPeer(e.target.checked)}
                            style={{ accentColor: "var(--chaster-accent)" }}
                          />
                          <span style={{ color: "var(--chaster-muted)" }}>
                            Link to this chat
                            {focusPeerName ? ` (${focusPeerName})` : ""}
                          </span>
                        </label>
                      )}
                    </div>
                  </aside>

                  <div className="ch-booker-pick">
                    <section className="ch-booker-cal" aria-label="Calendar">
                      <div className="ch-booker-cal-head">
                        <h3 className="ch-headline ch-booker-cal-month">
                          {formatMonthTitle(viewYear, viewMonth)}
                        </h3>
                        <div className="ch-booker-cal-nav">
                          <button
                            type="button"
                            className="ch-booker-nav-btn"
                            aria-label="Previous month"
                            onClick={() => shiftMonth(-1)}
                          >
                            <IconChevron dir="left" size={16} />
                          </button>
                          <button
                            type="button"
                            className="ch-booker-nav-btn"
                            aria-label="Next month"
                            onClick={() => shiftMonth(1)}
                          >
                            <IconChevron dir="right" size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="ch-booker-weekdays">
                        {WEEKDAYS.map((d) => (
                          <span key={d}>{d}</span>
                        ))}
                      </div>

                      <div className="ch-booker-grid">
                        {cells.map((day, i) => {
                          if (day == null) {
                            return <span key={`e-${i}`} className="ch-booker-cell is-empty" />;
                          }
                          const ymd = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                          const past = isPastOrBeyond(ymd);
                          const selectable = isDaySelectable(ymd);
                          const selected = ymd === selectedYmd;
                          const rangeEnd = ymd === rangeEndYmd;
                          const ranged = inRange(ymd);
                          const available = !past && (mode === "multi_day" || selectable);

                          return (
                            <button
                              key={ymd}
                              type="button"
                              disabled={past || (mode !== "multi_day" && !selectable)}
                              onClick={() => pickDay(day)}
                              className={[
                                "ch-booker-cell",
                                available ? "is-available" : "",
                                selected || rangeEnd ? "is-selected" : "",
                                ranged && !selected && !rangeEnd ? "is-range" : "",
                                past ? "is-past" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>

                      {mode === "multi_day" && (
                        <p className="ch-booker-hint">
                          {rangeEndYmd
                            ? `${selectedYmd} → ${rangeEndYmd}`
                            : "Select check-in, then check-out"}
                        </p>
                      )}
                    </section>

                    <section className="ch-booker-slots" aria-label="Selection">
                      <div className="ch-booker-slots-head">
                        <span className="ch-headline ch-booker-slots-day">
                          {formatDayHeader(selectedYmd)}
                        </span>
                        {mode === "hourly" && (
                          <div className="ch-booker-hour-toggle" role="group" aria-label="Time format">
                            <button
                              type="button"
                              className={!hour12 ? "is-active" : ""}
                              onClick={() => setHour12(false)}
                            >
                              24h
                            </button>
                            <button
                              type="button"
                              className={hour12 ? "is-active" : ""}
                              onClick={() => setHour12(true)}
                            >
                              12h
                            </button>
                          </div>
                        )}
                      </div>

                      {mode === "hourly" ? (
                        <div className="ch-booker-slot-list">
                          {slots.length === 0 ? (
                            <p className="ch-booker-hint">No slots this day</p>
                          ) : (
                            slots.map(({ local, taken }) => (
                              <button
                                key={local}
                                type="button"
                                disabled={taken}
                                onClick={() => setSelectedSlot(local)}
                                className={`ch-booker-slot${selectedSlot === local ? " is-selected" : ""}${taken ? " is-taken" : ""}`}
                              >
                                {formatSlotLabel(local, hour12)}
                              </button>
                            ))
                          )}
                        </div>
                      ) : (
                        <p className="ch-booker-hint">
                          {mode === "day"
                            ? isDaySelectable(selectedYmd)
                              ? `Book the full day · ${s.open_time}–${s.close_time}`
                              : "This day isn’t available"
                            : rangeEndYmd
                              ? "Range ready — confirm below"
                              : "Tap a second date for check-out"}
                        </p>
                      )}

                      <div className="ch-booker-confirm">
                        <button
                          type="button"
                          disabled={saving || !canConfirm}
                          className="ch-btn ch-btn-primary h-9 w-full justify-center"
                          onClick={() => void createBooking()}
                        >
                          {saving
                            ? "Saving…"
                            : mode === "hourly"
                              ? selectedSlot
                                ? "Add to ledger"
                                : "Pick a time"
                              : mode === "day"
                                ? canConfirm
                                  ? "Confirm day"
                                  : "Pick a day"
                                : rangeEndYmd
                                  ? "Confirm stay"
                                  : "Pick check-out"}
                        </button>
                      </div>
                    </section>
                  </div>
                </div>
              </div>

              <aside className="ch-book-schedule-right" aria-label="On the book">
                <div className="ch-book-ledger-wrap">
                  <div className="ch-book-ledger-head">
                    <h3 className="ch-headline ch-book-ledger-title">On the book</h3>
                    <div className="flex items-center gap-3">
                      {focusPeerId && (
                        <label className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--chaster-muted)" }}>
                          <input
                            type="checkbox"
                            checked={peerOnly}
                            onChange={(e) => setPeerOnly(e.target.checked)}
                            style={{ accentColor: "var(--chaster-accent)" }}
                          />
                          This chat only
                        </label>
                      )}
                      <span className="text-[11px]" style={{ color: "var(--chaster-muted)" }}>
                        {String(upcoming.length).padStart(2, "0")}
                      </span>
                    </div>
                  </div>

                  {upcoming.length === 0 ? (
                    <p className="ch-book-empty">
                      No upcoming appointments. Pick a date and time, or wait for AI bookings.
                    </p>
                  ) : (
                    <ul className="ch-book-ledger">
                      {upcoming.map((b) => (
                        <li key={b.id} className="ch-book-row">
                          <div className="ch-book-row-main">
                            <div className="ch-book-row-top">
                              <span className="ch-book-when">
                                {formatBookingWhen(b.starts_at, b.ends_at, mode)}
                              </span>
                              <span className={`ch-book-status is-${b.status}`}>
                                {statusLabel(b.status)}
                              </span>
                            </div>
                            <div className="ch-book-who">
                              {b.customer_name || "Unnamed"}
                              {b.service_label ? ` · ${b.service_label}` : ""}
                              {b.resource_id && resourceNameById.get(b.resource_id)
                                ? ` · ${resourceNameById.get(b.resource_id)}`
                                : ""}
                              {b.assigned_resource_id &&
                              resourceNameById.get(b.assigned_resource_id)
                                ? ` → ${resourceNameById.get(b.assigned_resource_id)}`
                                : ""}
                            </div>
                            <div className="ch-book-meta">
                              {b.source === "ai" ? "Booked by AI" : "Logged on desk"}
                              {b.peer_id ? " · linked chat" : ""}
                            </div>
                          </div>
                          <div className="ch-book-row-actions">
                            {b.status === "confirmed" || b.status === "pending" ? (
                              <>
                                <button
                                  type="button"
                                  className="ch-btn ch-btn-text h-8 px-2 text-[11px]"
                                  disabled={saving}
                                  onClick={() => void setStatus(b.id, "completed")}
                                >
                                  Done
                                </button>
                                <button
                                  type="button"
                                  className="ch-btn ch-btn-text h-8 px-2 text-[11px]"
                                  style={{ color: "var(--chaster-danger-text)" }}
                                  disabled={saving}
                                  onClick={() => void setStatus(b.id, "cancelled")}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="ch-btn ch-btn-text h-8 px-2 text-[11px]"
                                disabled={saving}
                                onClick={() => void setStatus(b.id, "confirmed")}
                              >
                                Restore
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>
    </div>
  );
}
