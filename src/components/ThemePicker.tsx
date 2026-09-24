"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { IconCaret, IconCheck, IconPalette } from "@/components/icons";
import {
  THEMES,
  customSwatch,
  getTheme,
  normalizeHex,
  type CustomThemeColors,
  type ThemeId,
} from "@/lib/themes";

type Props = {
  value: ThemeId;
  customColors: CustomThemeColors;
  onChange: (theme: ThemeId) => void;
  onCustomColorsChange: (colors: CustomThemeColors) => void;
};

function ThemeSwatch({ colors }: { colors: readonly string[] }) {
  return (
    <span
      className="inline-flex h-5 w-12 shrink-0 items-stretch gap-0.5 overflow-hidden p-[3px]"
      style={{
        // Mid checker so pale theme chips never melt into the plate
        background:
          "repeating-conic-gradient(#a1a1aa 0% 25%, #d4d4d8 0% 50%) 50% / 6px 6px",
        border: "1px solid rgba(24, 24, 27, 0.55)",
        borderRadius: "4px",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.35)",
      }}
      aria-hidden
    >
      {colors.map((color, index) => (
        <span
          key={`${color}-${index}`}
          className="h-full min-w-0 flex-1"
          style={{
            background: color,
            borderRadius: 2,
            boxShadow:
              "inset 0 0 0 1px rgba(24, 24, 27, 0.4), 0 0 0 1px rgba(255,255,255,0.25)",
          }}
        />
      ))}
    </span>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="ch-label">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          type="color"
          value={normalizeHex(value, "#18181b")}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
          aria-label={label}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(normalizeHex(e.target.value, value))}
          className="ch-input min-w-0 flex-1 px-2 py-1.5 font-mono text-[11px]"
          spellCheck={false}
        />
      </span>
    </label>
  );
}

export default function ThemePicker({
  value,
  customColors,
  onChange,
  onCustomColorsChange,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = getTheme(value);
  const swatch =
    value === "custom" ? customSwatch(customColors) : current.swatch;

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={rootRef} data-tour="theme" className="relative">
      <button
        type="button"
        data-tour-theme-trigger
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className="ch-menu-item"
        style={{ minHeight: 36 }}
      >
        <IconPalette size={13} />
        <span className="ch-menu-item-text">{t("theme.theme")}</span>
        <ThemeSwatch colors={swatch} />
        <span className="text-[12px]" style={{ color: "var(--chaster-muted)" }}>
          {current.label}
        </span>
        <span className={open ? "rotate-180" : ""} style={{ color: "var(--chaster-muted)" }}>
          <IconCaret size={12} />
        </span>
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label={t("theme.themes")}
          className="ch-theme-list mx-1 mt-1 overflow-y-auto overscroll-contain py-1"
          style={{
            maxHeight: "min(18rem, 42vh)",
            background: "var(--chaster-field)",
            border: "1px solid var(--chaster-border)",
            borderRadius: "var(--r-1)",
          }}
        >
          {THEMES.map((theme) => {
            const active = theme.id === value;
            const rowSwatch =
              theme.id === "custom"
                ? customSwatch(customColors)
                : theme.swatch;
            return (
              <button
                key={theme.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onChange(theme.id)}
                className={`ch-menu-item${active ? " is-active" : ""}`}
                style={{
                  background: active ? "var(--chaster-accent-soft)" : undefined,
                }}
              >
                <ThemeSwatch colors={rowSwatch} />
                <span className="ch-menu-item-text">{theme.label}</span>
                <span className="text-[11px]" style={{ color: "var(--chaster-muted)" }}>
                  {theme.description}
                </span>
                {active ? (
                  <span style={{ color: "var(--chaster-accent)" }}>
                    <IconCheck size={13} />
                  </span>
                ) : null}
              </button>
            );
          })}

          {value === "custom" ? (
            <div
              className="mx-2 mb-1 mt-1 flex flex-col gap-2 pt-2"
              style={{ borderTop: "1px solid var(--chaster-border)" }}
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <ColorField
                  label={t("theme.base")}
                  value={customColors.base}
                  onChange={(base) =>
                    onCustomColorsChange({ ...customColors, base })
                  }
                />
                <ColorField
                  label={t("theme.panel")}
                  value={customColors.panel}
                  onChange={(panel) =>
                    onCustomColorsChange({ ...customColors, panel })
                  }
                />
                <ColorField
                  label={t("theme.accent")}
                  value={customColors.accent}
                  onChange={(accent) =>
                    onCustomColorsChange({ ...customColors, accent })
                  }
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
