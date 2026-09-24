"use client";

import { useCallback, useEffect, useState } from "react";
import DeskToolbar, { SaveStatus } from "@/components/DeskToolbar";
import { useI18n } from "@/components/I18nProvider";
import TimeSelect from "@/components/TimeSelect";
import { WEEKDAY_ORDER } from "@/lib/bookings";
import { DEFAULT_PAGE_PROFILE } from "@/lib/page-profile";
import type { PageProfile, WeekdayKey } from "@/lib/types";

type Props = {
  open: boolean;
  onClose?: () => void;
  pageId: string;
  onError: (message: string | null) => void;
};

const TIMEZONES = [
  "Asia/Tbilisi",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Istanbul",
  "America/New_York",
  "UTC",
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

export default function HoursPlaceDrawer({ open, onClose, pageId, onError }: Props) {
  const { t } = useI18n();
  const [profile, setProfile] = useState<PageProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!pageId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/profile?page_id=${encodeURIComponent(pageId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load profile");
      setProfile(data.profile);
      setDirty(false);
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load profile");
      setProfile({ page_id: pageId, ...DEFAULT_PAGE_PROFILE });
    } finally {
      setLoading(false);
    }
  }, [pageId, onError]);

  useEffect(() => {
    if (open && pageId) void load();
  }, [open, pageId, load]);

  useEffect(() => {
    if (!open || !onClose) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function patch(next: Partial<PageProfile>) {
    setProfile((prev) =>
      prev ? { ...prev, ...next } : { page_id: pageId, ...DEFAULT_PAGE_PROFILE, ...next },
    );
    setDirty(true);
  }

  function toggleDay(day: WeekdayKey) {
    if (!profile) return;
    const set = new Set(profile.open_days);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    patch({ open_days: WEEKDAY_ORDER.filter((d) => set.has(d)) });
  }

  async function save() {
    if (!profile || !pageId) return;
    setSaving(true);
    onError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...profile, page_id: pageId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setProfile(data.profile);
      setDirty(false);
      setSavedAt(Date.now());
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div data-tour="hours-drawer" className="ch-page" aria-labelledby="hours-page-title">
      <DeskToolbar
        title={t("hours.title")}
        titleId="hours-page-title"
        onBack={onClose}
        end={
          <SaveStatus
            dirty={dirty}
            saving={saving}
            savedAt={savedAt}
            onSave={() => void save()}
            disabled={loading}
          />
        }
      />

      <div className="ch-page-body">
        {loading || !profile ? (
          <div className="ch-empty-line">{t("common.loading")}</div>
        ) : (
          <div className="ch-form-2col">
            <section className="ch-section" aria-labelledby="hours-place-heading">
              <h3 id="hours-place-heading" className="ch-section-title">
                {t("hours.place")}
              </h3>

              <label className="ch-field">
                <span className="ch-label">{t("hours.street")}</span>
                <input
                  className="ch-input w-full px-2.5 py-2"
                  value={profile.address_line ?? ""}
                  onChange={(e) => patch({ address_line: e.target.value })}
                />
              </label>

              <div className="ch-grid-2">
                <label className="ch-field">
                  <span className="ch-label">{t("hours.city")}</span>
                  <input
                    className="ch-input w-full px-2.5 py-2"
                    value={profile.city ?? ""}
                    onChange={(e) => patch({ city: e.target.value })}
                  />
                </label>
                <label className="ch-field">
                  <span className="ch-label">{t("hours.region")}</span>
                  <input
                    className="ch-input w-full px-2.5 py-2"
                    value={profile.region ?? ""}
                    onChange={(e) => patch({ region: e.target.value })}
                  />
                </label>
              </div>

              <div className="ch-grid-2">
                <label className="ch-field">
                  <span className="ch-label">{t("hours.postal")}</span>
                  <input
                    className="ch-input w-full px-2.5 py-2"
                    value={profile.postal_code ?? ""}
                    onChange={(e) => patch({ postal_code: e.target.value })}
                  />
                </label>
                <label className="ch-field">
                  <span className="ch-label">{t("hours.country")}</span>
                  <input
                    className="ch-input w-full px-2.5 py-2"
                    value={profile.country ?? ""}
                    onChange={(e) => patch({ country: e.target.value })}
                  />
                </label>
              </div>

              <label className="ch-field">
                <span className="ch-label">{t("hours.mapsLink")}</span>
                <input
                  className="ch-input w-full px-2.5 py-2"
                  value={profile.maps_url ?? ""}
                  onChange={(e) => patch({ maps_url: e.target.value })}
                  inputMode="url"
                />
              </label>

              <div className="ch-grid-2">
                <label className="ch-field">
                  <span className="ch-label">{t("hours.phone")}</span>
                  <input
                    className="ch-input w-full px-2.5 py-2"
                    value={profile.phone ?? ""}
                    onChange={(e) => patch({ phone: e.target.value })}
                    inputMode="tel"
                  />
                </label>
                <label className="ch-field">
                  <span className="ch-label">{t("hours.email")}</span>
                  <input
                    className="ch-input w-full px-2.5 py-2"
                    value={profile.email ?? ""}
                    onChange={(e) => patch({ email: e.target.value })}
                    inputMode="email"
                  />
                </label>
              </div>
            </section>

            <section className="ch-section" aria-labelledby="hours-open-heading">
              <h3 id="hours-open-heading" className="ch-section-title">
                {t("hours.hours")}
              </h3>

              <label className="ch-field">
                <span className="ch-label">{t("hours.timezone")}</span>
                <select
                  className="ch-input w-full px-2.5 py-2"
                  value={profile.timezone}
                  onChange={(e) => patch({ timezone: e.target.value })}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </label>

              <div className="ch-grid-2">
                <label className="ch-field">
                  <span className="ch-label">{t("hours.opens")}</span>
                  <TimeSelect
                    value={profile.open_time}
                    onChange={(v) => patch({ open_time: v })}
                    className="w-full px-2.5 py-2"
                  />
                </label>
                <label className="ch-field">
                  <span className="ch-label">{t("hours.closes")}</span>
                  <TimeSelect
                    value={profile.close_time}
                    onChange={(v) => patch({ close_time: v })}
                    className="w-full px-2.5 py-2"
                  />
                </label>
              </div>

              <div className="ch-field">
                <span className="ch-label">{t("hours.openDays")}</span>
                <div className="ch-days" role="group" aria-label={t("hours.openDays")}>
                  {WEEKDAY_ORDER.map((day) => {
                    const on = profile.open_days.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        className={`ch-day${on ? " is-on" : ""}`}
                        aria-pressed={on}
                        onClick={() => toggleDay(day)}
                      >
                        {t(WEEK_KEYS[day])}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="ch-field">
                <span className="ch-label">{t("hours.note")}</span>
                <textarea
                  className="ch-input w-full px-2.5 py-2"
                  rows={3}
                  value={profile.hours_note ?? ""}
                  onChange={(e) => patch({ hours_note: e.target.value })}
                />
              </label>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
