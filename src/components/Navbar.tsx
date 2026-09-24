"use client";

import { useEffect, useRef, useState } from "react";
import ThemePicker from "@/components/ThemePicker";
import {
  IconBook,
  IconCalendar,
  IconDisconnect,
  IconLink,
  IconRefresh,
  IconUser,
} from "@/components/icons";
import type { OperatorPrefs } from "@/lib/prefs";
import type { ThemeId } from "@/lib/themes";

type PageRow = {
  id: string;
  page_id: string;
  page_name: string;
  facebook_user_id?: string | null;
  connected_at: string;
};

export type DeskView = "inbox" | "bookings" | "knowledge";

type Props = {
  pages: PageRow[];
  selectedPageId: string;
  onSelectPage: (pageId: string) => void;
  onDisconnect: (pageId: string) => void;
  prefs: OperatorPrefs;
  onPrefsChange: (prefs: OperatorPrefs) => void;
  onRestartTour: () => void;
  deskView: DeskView;
  onDeskViewChange: (view: DeskView) => void;
};

export default function Navbar({
  pages,
  selectedPageId,
  onSelectPage,
  onDisconnect,
  prefs,
  onPrefsChange,
  onRestartTour,
  deskView,
  onDeskViewChange,
}: Props) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const selected = pages.find((p) => p.page_id === selectedPageId);

  function setTheme(theme: ThemeId) {
    onPrefsChange({ ...prefs, theme });
  }

  return (
    <header className="ch-nav-bubble">
      <div className="ch-nav-bar">
        <div className="ch-nav-left min-w-0" data-tour="brand">
          <div
            className="ch-brand truncate text-[23px] font-semibold sm:text-[26px]"
            style={{
              color: "var(--chaster-ink)",
              fontWeight: 600,
            }}
          >
            Chaster
          </div>
        </div>

        <nav className="ch-nav-center" aria-label="Desk pages">
          <button
            type="button"
            data-tour="inbox-toggle"
            onClick={() => onDeskViewChange("inbox")}
            className={`ch-nav-tab${deskView === "inbox" ? " is-active" : ""}`}
            aria-current={deskView === "inbox" ? "page" : undefined}
          >
            Inbox
          </button>
          <button
            type="button"
            data-tour="bookings-toggle"
            onClick={() => onDeskViewChange("bookings")}
            className={`ch-nav-tab${deskView === "bookings" ? " is-active" : ""}`}
            title="Appointment ledger"
            disabled={!selectedPageId}
            aria-current={deskView === "bookings" ? "page" : undefined}
          >
            <IconCalendar size={13} />
            <span className="ch-nav-tab-label">Bookings</span>
          </button>
          <button
            type="button"
            data-tour="knowledge-toggle"
            onClick={() => onDeskViewChange("knowledge")}
            className={`ch-nav-tab${deskView === "knowledge" ? " is-active" : ""}`}
            title="FAQs and answers for your Page"
            aria-current={deskView === "knowledge" ? "page" : undefined}
          >
            <IconBook size={13} />
            <span className="ch-nav-tab-label">FAQs</span>
          </button>
        </nav>

        <div className="ch-nav-right flex items-center justify-end">
          <div className="relative" ref={profileRef} data-tour="profile">
            <button
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
              className="ch-btn ch-btn-ghost ch-nav-profile-btn h-8 gap-1.5 px-2"
              aria-label="Page, profile and settings"
              aria-expanded={profileOpen}
            >
              <IconUser size={15} />
              {selected ? (
                <span className="ch-nav-profile-page truncate max-w-[7.5rem] sm:max-w-[11rem]">
                  {selected.page_name}
                </span>
              ) : null}
            </button>

            {profileOpen && (
              <div
                className="ch-nav-menu absolute right-0 z-50 mt-2 w-[min(20.5rem,calc(100vw-1.5rem))] overflow-hidden"
                style={{
                  background: "var(--chaster-panel)",
                  border: "1px solid var(--chaster-border-strong)",
                  borderRadius: "var(--chaster-radius)",
                }}
              >
                <div
                  className="px-3 py-2.5"
                  style={{ borderBottom: "1px solid var(--chaster-border)" }}
                >
                  <div
                    className="text-[14px] font-semibold tracking-[-0.03em]"
                    style={{ color: "var(--chaster-ink)" }}
                  >
                    Operator
                  </div>
                  <div
                    className="text-[12px]"
                    style={{
                      color: "var(--chaster-muted)",
                      fontFamily:
                        "var(--font-body), ui-sans-serif, system-ui, sans-serif",
                    }}
                  >
                    Prefs sync per Facebook account
                  </div>
                </div>

                <div
                  className="px-3 py-2 text-[12px]"
                  style={{
                    color: "var(--chaster-muted)",
                    borderBottom: "1px solid var(--chaster-border)",
                    fontFamily:
                      "var(--font-body), ui-sans-serif, system-ui, sans-serif",
                  }}
                >
                  Pages on this desk
                </div>

                {pages.length === 0 ? (
                  <p
                    className="px-3 py-3 text-[13px]"
                    style={{
                      color: "var(--chaster-muted)",
                      fontFamily:
                        "var(--font-body), ui-sans-serif, system-ui, sans-serif",
                    }}
                  >
                    Nothing connected yet.
                  </p>
                ) : (
                  <ul className="max-h-48 overflow-y-auto">
                    {pages.map((page) => {
                      const active = page.page_id === selectedPageId;
                      return (
                        <li
                          key={page.id}
                          className="flex items-center gap-1 px-2 py-1"
                          style={{
                            background: active
                              ? "var(--chaster-panel-soft)"
                              : "transparent",
                            borderBottom: "1px solid var(--chaster-border)",
                          }}
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 px-1 py-1.5 text-left"
                            onClick={() => {
                              onSelectPage(page.page_id);
                              setProfileOpen(false);
                            }}
                          >
                            <div
                              className="truncate text-[13px] font-semibold tracking-[-0.02em]"
                              style={{ color: "var(--chaster-ink)" }}
                            >
                              {page.page_name}
                            </div>
                            <div
                              className="truncate font-mono text-[10px]"
                              style={{ color: "var(--chaster-muted)" }}
                            >
                              {page.page_id}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDisconnect(page.page_id)}
                            className="ch-btn ch-btn-ghost h-8 shrink-0 gap-1 px-2"
                            style={{
                              color: "var(--chaster-danger-text)",
                              borderColor: "var(--chaster-danger-text)",
                            }}
                            title="Disconnect this Page"
                          >
                            <IconDisconnect size={13} />
                            <span className="text-[11px] ch-nav-disconnect-label">
                              Disconnect
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <a
                  href="/api/auth/facebook"
                  className="flex items-center gap-2 px-3 py-2.5 text-[13px] font-semibold tracking-[-0.02em]"
                  style={{
                    background: "var(--chaster-panel-soft)",
                    color: "var(--chaster-ink)",
                    borderBottom: "1px solid var(--chaster-border)",
                  }}
                  onClick={() => setProfileOpen(false)}
                >
                  <IconLink size={14} />
                  Connect Facebook page
                </a>

                <ThemePicker value={prefs.theme} onChange={setTheme} />

                <label
                  className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-[13px]"
                  style={{ borderTop: "1px solid var(--chaster-border)" }}
                >
                  <span>
                    <span
                      className="block font-semibold tracking-[-0.02em]"
                      style={{ color: "var(--chaster-ink)" }}
                    >
                      Default AI replies
                    </span>
                    <span
                      className="block text-[11px]"
                      style={{
                        color: "var(--chaster-muted)",
                        fontFamily:
                          "var(--font-body), ui-sans-serif, system-ui, sans-serif",
                      }}
                    >
                      Banner only · per-chat still wins
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={prefs.defaultAiReplies}
                    onChange={(e) =>
                      onPrefsChange({
                        ...prefs,
                        defaultAiReplies: e.target.checked,
                      })
                    }
                    className="h-3.5 w-3.5"
                    style={{ accentColor: "var(--chaster-accent)" }}
                  />
                </label>

                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-semibold tracking-[-0.02em]"
                  style={{
                    borderTop: "1px solid var(--chaster-border)",
                    color: "var(--chaster-ink)",
                  }}
                  onClick={() => {
                    setProfileOpen(false);
                    onDeskViewChange("knowledge");
                  }}
                >
                  <IconBook size={14} />
                  Open knowledge
                </button>

                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-semibold tracking-[-0.02em]"
                  style={{
                    borderTop: "1px solid var(--chaster-border)",
                    color: "var(--chaster-ink)",
                  }}
                  disabled={!selectedPageId}
                  onClick={() => {
                    setProfileOpen(false);
                    onDeskViewChange("bookings");
                  }}
                >
                  <IconCalendar size={14} />
                  Open bookings
                </button>

                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-semibold tracking-[-0.02em]"
                  style={{
                    borderTop: "1px solid var(--chaster-border)",
                    color: "var(--chaster-ink)",
                  }}
                  onClick={() => {
                    setProfileOpen(false);
                    onRestartTour();
                  }}
                >
                  <IconRefresh size={14} />
                  Restart tour
                </button>

                <div
                  className="px-3 py-2 text-[11px] leading-relaxed"
                  style={{
                    borderTop: "1px solid var(--chaster-border)",
                    background: "var(--chaster-panel-soft)",
                    color: "var(--chaster-muted)",
                    fontFamily:
                      "var(--font-body), ui-sans-serif, system-ui, sans-serif",
                  }}
                >
                  Localhost webhooks need a tunnel (cloudflared).
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
