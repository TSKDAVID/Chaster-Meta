"use client";

import { useEffect, useRef, useState } from "react";
import ThemePicker from "@/components/ThemePicker";
import HelpTip from "@/components/HelpTip";
import { useI18n } from "@/components/I18nProvider";
import {
  IconCaret,
  IconCheck,
  IconDisconnect,
  IconLink,
  IconRefresh,
} from "@/components/icons";
import {
  LOCALES,
  LOCALE_LABELS,
  LOCALE_SHORT,
  type Locale,
} from "@/lib/i18n/locales";
import type { OperatorPrefs } from "@/lib/prefs";
import type { ThemeId } from "@/lib/themes";

type PageRow = {
  id: string;
  page_id: string;
  page_name: string;
  facebook_user_id?: string | null;
  connected_at: string;
};

export type DeskView = "inbox" | "bookings" | "knowledge" | "hours" | "catalog";

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
  const { t, locale, setLocale } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !langOpen) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuOpen && menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
      if (langOpen && langRef.current && !langRef.current.contains(target)) {
        setLangOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setLangOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, langOpen]);

  const selected = pages.find((p) => p.page_id === selectedPageId);

  const tabs: ReadonlyArray<{
    id: DeskView;
    label: string;
    tour: string;
    needsPage: boolean;
  }> = [
    { id: "inbox", label: t("nav.inbox"), tour: "inbox-toggle", needsPage: false },
    { id: "bookings", label: t("nav.bookings"), tour: "bookings-toggle", needsPage: true },
    { id: "knowledge", label: t("nav.faqs"), tour: "knowledge-toggle", needsPage: false },
    { id: "hours", label: t("nav.hours"), tour: "hours-toggle", needsPage: true },
    { id: "catalog", label: t("nav.catalog"), tour: "catalog-toggle", needsPage: true },
  ];

  function setTheme(theme: ThemeId) {
    onPrefsChange({ ...prefs, theme });
  }

  function setCustomColors(customColors: typeof prefs.customColors) {
    onPrefsChange({ ...prefs, theme: "custom", customColors });
  }

  function pickLocale(next: Locale) {
    setLocale(next);
    onPrefsChange({ ...prefs, locale: next });
    setLangOpen(false);
  }

  return (
    <header className="ch-nav">
      <div className="ch-nav-left" data-tour="brand">
        <div className="ch-brand" aria-label={t("brand")}>
          <img
            className="ch-brand-logo ch-brand-logo-light"
            src="/brand/chaster-lockup-light.svg"
            alt=""
            aria-hidden="true"
          />
          <img
            className="ch-brand-logo ch-brand-logo-dark"
            src="/brand/chaster-lockup-dark.svg"
            alt=""
            aria-hidden="true"
          />
        </div>
      </div>

      <nav className="ch-nav-tabs" aria-label={t("nav.deskPages")}>
        {tabs.map((tab) => {
          const active = deskView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-tour={tab.tour}
              onClick={() => onDeskViewChange(tab.id)}
              className={`ch-nav-tab${active ? " is-active" : ""}`}
              disabled={tab.needsPage && !selectedPageId}
              aria-current={active ? "page" : undefined}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <div className="ch-nav-right">
        {!selected ? (
          <a
            href="/api/auth/facebook"
            data-tour="connect-fb"
            className="ch-btn ch-btn-primary h-8 px-3"
          >
            <IconLink size={13} />
            {t("nav.connectPage")}
          </a>
        ) : null}

        <div className="ch-menu-anchor" ref={langRef}>
          <button
            type="button"
            className="ch-lang-switch"
            aria-label={t("language")}
            aria-haspopup="menu"
            aria-expanded={langOpen}
            onClick={(e) => {
              e.stopPropagation();
              setLangOpen((v) => !v);
              setMenuOpen(false);
            }}
          >
            <span className="ch-lang-switch-code">{LOCALE_SHORT[locale]}</span>
            <IconCaret size={11} />
          </button>
          {langOpen ? (
            <div className="ch-menu ch-menu-sm ch-lang-menu" role="menu">
              <div className="ch-menu-section">
                <div className="ch-menu-label">{t("language")}</div>
                {LOCALES.map((id) => {
                  const active = id === locale;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      className={`ch-menu-item${active ? " is-active" : ""}`}
                      onClick={() => pickLocale(id)}
                    >
                      <span className="ch-menu-item-text">{LOCALE_LABELS[id]}</span>
                      {active ? <IconCheck size={13} /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="relative" ref={menuRef} data-tour="profile">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
              setLangOpen(false);
            }}
            className="ch-page-switch"
            aria-label={t("nav.pageAndSettings")}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <span className="ch-page-switch-mark" aria-hidden>
              {(selected?.page_name || "C").trim().charAt(0).toUpperCase()}
            </span>
            <span className="ch-page-switch-name">
              {selected ? selected.page_name : t("nav.noPage")}
            </span>
            <IconCaret size={12} className="ch-page-switch-caret" />
          </button>

          {menuOpen ? (
            <div className="ch-menu" role="menu">
              <div className="ch-menu-section">
                <div className="ch-menu-label">{t("nav.pages")}</div>
                {pages.length === 0 ? (
                  <p className="ch-menu-empty">{t("nav.noneConnected")}</p>
                ) : (
                  pages.map((page) => {
                    const active = page.page_id === selectedPageId;
                    return (
                      <button
                        key={page.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        className={`ch-menu-item${active ? " is-active" : ""}`}
                        onClick={() => {
                          onSelectPage(page.page_id);
                          setMenuOpen(false);
                        }}
                      >
                        <span className="ch-menu-item-text">{page.page_name}</span>
                        {active ? <IconCheck size={13} /> : null}
                      </button>
                    );
                  })
                )}
                <a
                  href="/api/auth/facebook"
                  role="menuitem"
                  className="ch-menu-item"
                  onClick={() => setMenuOpen(false)}
                >
                  <IconLink size={13} />
                  <span className="ch-menu-item-text">{t("nav.connectAnother")}</span>
                </a>
              </div>

              <div className="ch-menu-section">
                <ThemePicker
                  value={prefs.theme}
                  customColors={prefs.customColors}
                  onChange={setTheme}
                  onCustomColorsChange={setCustomColors}
                />
              </div>

              <div className="ch-menu-section">
                <HelpTip tip="hints.defaultAi" side="bottom">
                  <label className="ch-menu-item ch-menu-toggle">
                    <span className="ch-menu-item-text">{t("nav.defaultAiReplies")}</span>
                    <input
                      type="checkbox"
                      checked={prefs.defaultAiReplies}
                      onChange={(e) =>
                        onPrefsChange({
                          ...prefs,
                          defaultAiReplies: e.target.checked,
                        })
                      }
                      className="ch-check"
                    />
                  </label>
                </HelpTip>
                <HelpTip tip="hints.showHints" side="bottom">
                  <label className="ch-menu-item ch-menu-toggle">
                    <span className="ch-menu-item-text">{t("nav.showHints")}</span>
                    <input
                      type="checkbox"
                      checked={prefs.showHints !== false}
                      onChange={(e) =>
                        onPrefsChange({
                          ...prefs,
                          showHints: e.target.checked,
                        })
                      }
                      className="ch-check"
                    />
                  </label>
                </HelpTip>
                <button
                  type="button"
                  role="menuitem"
                  className="ch-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    onRestartTour();
                  }}
                >
                  <IconRefresh size={13} />
                  <span className="ch-menu-item-text">{t("nav.restartTour")}</span>
                </button>
              </div>

              {selected ? (
                <div className="ch-menu-section">
                  <button
                    type="button"
                    role="menuitem"
                    className="ch-menu-item is-danger"
                    onClick={() => {
                      setMenuOpen(false);
                      onDisconnect(selected.page_id);
                    }}
                  >
                    <IconDisconnect size={13} />
                    <span className="ch-menu-item-text">
                      {t("nav.disconnect", { name: selected.page_name })}
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
