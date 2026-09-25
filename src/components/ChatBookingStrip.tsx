"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { formatBookingWhen } from "@/lib/bookings";
import { IconCalendar } from "@/components/icons";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { Booking, BookingMode, BookingStatus } from "@/lib/types";

const BOOKING_POLL_MS = 10_000;

type Props = {
  pageId: string;
  peerId: string;
  displayName?: string | null;
  refreshKey?: number;
  onOpenLedger: () => void;
  onError: (message: string | null) => void;
};

function bookingStatusLabel(
  status: string,
  t: (key: string) => string,
): string {
  if (status === "pending") return t("bookings.statusPending");
  if (status === "cancelled") return t("bookings.statusCancelled");
  if (status === "completed") return t("bookings.statusDone");
  return t("bookings.statusBooked");
}

export default function ChatBookingStrip({
  pageId,
  peerId,
  displayName,
  refreshKey = 0,
  onOpenLedger,
  onError,
}: Props) {
  const { t } = useI18n();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [mode, setMode] = useState<BookingMode>("hourly");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!pageId || !peerId) return;
      const silent = Boolean(opts?.silent) && hasLoadedRef.current;
      if (!silent) setLoading(true);
      try {
        const [bRes, sRes] = await Promise.all([
          fetch(
            `/api/bookings?page_id=${encodeURIComponent(pageId)}&peer_id=${encodeURIComponent(peerId)}`,
          ),
          fetch(`/api/bookings/settings?page_id=${encodeURIComponent(pageId)}`),
        ]);
        const bData = await bRes.json();
        const sData = await sRes.json();
        if (!bRes.ok) throw new Error(bData.error ?? "Failed to load bookings");
        if (sRes.ok && sData.settings?.booking_mode) {
          setMode(sData.settings.booking_mode);
        }
        setBookings(bData.bookings ?? []);
        hasLoadedRef.current = true;
      } catch (err) {
        if (!silent) {
          onErrorRef.current(
            err instanceof Error ? err.message : "Booking load failed",
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [pageId, peerId],
  );

  useEffect(() => {
    hasLoadedRef.current = false;
    void load();
  }, [load, refreshKey]);

  // Instant updates when AI/desk creates, edits, or cancels a booking for this chat
  useEffect(() => {
    if (!pageId || !peerId) return;

    let active = true;
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel(`bookings:${pageId}:${peerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messenger_bookings",
          filter: `peer_id=eq.${peerId}`,
        },
        (payload) => {
          if (!active) return;
          const row = (payload.new ?? payload.old) as { page_id?: string } | null;
          if (row?.page_id && row.page_id !== pageId) return;
          void load({ silent: true });
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [pageId, peerId, load]);

  // Realtime can be blocked by RLS for the browser client; poll so AI edits still show up.
  useEffect(() => {
    if (!pageId || !peerId) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void load({ silent: true });
    };
    const timer = window.setInterval(refresh, BOOKING_POLL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [pageId, peerId, load]);

  const activeBooking = bookings.find(
    (b) =>
      (b.status === "confirmed" || b.status === "pending") &&
      +new Date(b.ends_at) >= Date.now() - 3600000,
  );
  const latestPast = [...bookings]
    .filter((b) => b.status !== "cancelled")
    .sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at))[0];

  async function setStatus(id: string, status: BookingStatus) {
    setBusy(true);
    onError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update booking");
      await load({ silent: true });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update booking");
    } finally {
      setBusy(false);
    }
  }

  const shown = activeBooking ?? latestPast ?? null;
  const canComplete =
    Boolean(activeBooking) && +new Date(activeBooking!.starts_at) <= Date.now();

  return (
    <div className="ch-book-strip" data-tour="chat-booking">
      <div className="ch-book-strip-mark" aria-hidden>
        <IconCalendar size={13} />
      </div>
      <div className="ch-book-strip-body">
        {loading ? (
          <span className="ch-book-strip-muted">{t("bookingStrip.checking")}</span>
        ) : activeBooking ? (
          <>
            <span className="ch-book-strip-label">{t("bookingStrip.onTheBook")}</span>
            <span className="ch-book-strip-when">
              {formatBookingWhen(
                activeBooking.starts_at,
                activeBooking.ends_at,
                mode,
              )}
            </span>
            {activeBooking.service_label ? (
              <span className="ch-book-strip-svc">
                · {activeBooking.service_label}
              </span>
            ) : null}
            <span className={`ch-book-strip-status is-${activeBooking.status}`}>
              {bookingStatusLabel(activeBooking.status, t)}
            </span>
          </>
        ) : shown ? (
          <>
            <span className="ch-book-strip-muted">
              {t("bookingStrip.last", {
                when: formatBookingWhen(shown.starts_at, shown.ends_at, mode),
              })}
              {" · "}
              {bookingStatusLabel(shown.status, t)}
            </span>
          </>
        ) : (
          <span className="ch-book-strip-muted">
            {displayName?.trim()
              ? t("bookingStrip.noBookingNamed", { name: displayName.trim() })
              : t("bookingStrip.noBooking")}
          </span>
        )}
      </div>
      <div className="ch-book-strip-actions">
        {activeBooking && (
          <>
            {canComplete ? (
              <button
                type="button"
                className="ch-btn ch-btn-text h-7 px-1.5 text-[11px]"
                disabled={busy}
                onClick={() => void setStatus(activeBooking.id, "completed")}
              >
                {t("common.done")}
              </button>
            ) : null}
            <button
              type="button"
              className="ch-btn ch-btn-text ch-btn-danger h-7 px-1.5 text-[11px]"
              disabled={busy}
              onClick={() => void setStatus(activeBooking.id, "cancelled")}
            >
              {t("common.cancel")}
            </button>
          </>
        )}
        <button
          type="button"
          className="ch-btn ch-btn-ghost h-7 px-2 text-[11px]"
          onClick={onOpenLedger}
        >
          {activeBooking ? t("bookingStrip.manage") : t("bookingStrip.book")}
        </button>
      </div>
    </div>
  );
}
