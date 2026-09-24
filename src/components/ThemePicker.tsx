"use client";

import { useEffect, useRef, useState } from "react";
import { IconCaret, IconCheck, IconPalette } from "@/components/icons";
import { THEMES, getTheme, type ThemeId } from "@/lib/themes";

type Props = {
  value: ThemeId;
  onChange: (theme: ThemeId) => void;
};

function ThemeSwatch({ colors }: { colors: readonly string[] }) {
  return (
    <span
      className="inline-flex h-4 w-11 shrink-0 items-stretch gap-px overflow-hidden p-[2px]"
      style={{
        // Fixed light plate so dark theme colors stay visible on dark menus
        background: "#f4f4f5",
        border: "1px solid rgba(20, 23, 28, 0.28)",
        borderRadius: "2px",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.65)",
      }}
      aria-hidden
    >
      {colors.map((color) => (
        <span
          key={color}
          className="h-full min-w-0 flex-1"
          style={{
            background: color,
            boxShadow: "inset 0 0 0 1px rgba(20, 23, 28, 0.18)",
          }}
        />
      ))}
    </span>
  );
}

export default function ThemePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = getTheme(value);

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
    <div ref={rootRef} data-tour="theme" className="relative px-3 py-2">
      <button
        type="button"
        data-tour-theme-trigger
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className="ch-btn ch-btn-ghost h-auto w-full justify-start gap-2.5 px-2 py-2"
        style={{ background: open ? "var(--chaster-panel-soft)" : "transparent" }}
      >
        <IconPalette size={14} />
        <ThemeSwatch colors={current.swatch} />
        <span className="min-w-0 flex-1 text-left">
          <span
            className="block text-[11px]"
            style={{
              color: "var(--chaster-muted)",
              fontFamily: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
            }}
          >
            Theme
          </span>
          <span
            className="block truncate text-[13px] font-semibold tracking-[-0.02em]"
            style={{ color: "var(--chaster-ink)" }}
          >
            {current.label}
          </span>
        </span>
        <span className={open ? "rotate-180" : ""}>
          <IconCaret size={13} />
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Themes"
          className="absolute left-2 right-2 z-50 mt-1 max-h-60 overflow-y-auto py-1"
          style={{
            background: "var(--chaster-panel)",
            border: "1px solid var(--chaster-border-strong)",
            borderRadius: "var(--chaster-radius)",
          }}
        >
          {THEMES.map((theme) => {
            const active = theme.id === value;
            return (
              <button
                key={theme.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(theme.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left"
                style={{
                  background: active ? "var(--chaster-panel-soft)" : "transparent",
                }}
              >
                <ThemeSwatch colors={theme.swatch} />
                <span
                  className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.02em]"
                  style={{ color: "var(--chaster-ink)" }}
                >
                  {theme.label}
                </span>
                {active && (
                  <span style={{ color: "var(--chaster-accent)" }}>
                    <IconCheck size={13} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
