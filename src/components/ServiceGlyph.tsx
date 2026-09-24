"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconCaret } from "@/components/icons";
import {
  SERVICE_ICON_IDS,
  type ServiceIconId,
  getServiceIconComponent,
} from "@/lib/service-icons";

type Props = {
  id: string | null | undefined;
  size?: number;
  className?: string;
};

export default function ServiceGlyph({ id, size = 15, className }: Props) {
  const Icon = getServiceIconComponent(id);
  return <Icon size={size} strokeWidth={1.75} className={className} aria-hidden />;
}

const PAD = 8;
const PANEL_W = 280;
const PANEL_H = 320;

export function ServiceIconPicker({
  value,
  options = SERVICE_ICON_IDS,
  disabled,
  onChange,
  label,
  searchLabel = "Search",
}: {
  value: string | null | undefined;
  options?: readonly ServiceIconId[];
  disabled?: boolean;
  onChange: (id: ServiceIconId) => void;
  label: string;
  searchLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const current = (value && options.includes(value as ServiceIconId)
    ? value
    : options[0] ?? "sparkles") as ServiceIconId;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((id) => id.includes(q) || id.replace(/-/g, " ").includes(q));
  }, [options, query]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCoords(null);
      return;
    }

    function place() {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const spaceBelow = vh - r.bottom - PAD;
      const openDown = spaceBelow >= PANEL_H || spaceBelow >= r.top - PAD;
      let top = openDown ? r.bottom + 6 : Math.max(PAD, r.top - 6 - PANEL_H);
      top = Math.max(PAD, Math.min(top, vh - PAD - 120));
      let left = r.left;
      if (left + PANEL_W > vw - PAD) left = Math.max(PAD, vw - PAD - PANEL_W);
      setCoords({ top, left });
    }

    place();
    const id = window.requestAnimationFrame(place);
    const t = window.setTimeout(() => searchRef.current?.focus(), 30);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.cancelAnimationFrame(id);
      window.clearTimeout(t);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node | null;
      if (btnRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const panel =
    mounted && open && coords ? (
      <div
        ref={panelRef}
        className="fixed z-50"
        style={{
          top: coords.top,
          left: coords.left,
          width: PANEL_W,
          maxWidth: `calc(100vw - ${PAD * 2}px)`,
          maxHeight: `min(${PANEL_H}px, calc(100vh - ${PAD * 2}px))`,
        }}
        data-icon-menu
      >
        <div
          className="flex flex-col gap-1.5 p-2"
          style={{
            background: "var(--chaster-card)",
            borderRadius: "var(--r-2)",
            boxShadow: "inset 0 0 0 1px var(--chaster-border), var(--chaster-shadow)",
          }}
        >
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchLabel}
            className="ch-input h-8 w-full px-2 text-[12px]"
            aria-label={searchLabel}
          />
          <div
            className="ch-icon-grid overflow-y-auto pr-0.5"
            style={{ maxHeight: 240, scrollbarWidth: "thin" }}
            role="listbox"
            aria-label={label}
          >
            {filtered.map((id) => {
              const active = current === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={disabled}
                  className={`ch-icon-tile${active ? " is-active" : ""}`}
                  onClick={() => {
                    onChange(id);
                    setOpen(false);
                  }}
                  title={id}
                >
                  <ServiceGlyph id={id} size={16} />
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <p
                className="col-span-full px-1 py-2 text-[12px]"
                style={{ color: "var(--chaster-muted)" }}
              >
                —
              </p>
            ) : null}
          </div>
        </div>
      </div>
    ) : null;

  return (
    <div className="ch-field">
      <span className="ch-label">{label}</span>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        className="ch-btn ch-btn-ghost inline-flex h-9 items-center gap-2 px-2.5"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "var(--chaster-field)",
          border: "1px solid var(--chaster-border)",
          color: "var(--chaster-ink)",
          width: "fit-content",
        }}
      >
        <span
          className="inline-flex h-7 w-7 items-center justify-center"
          style={{
            borderRadius: "var(--r-1)",
            background: "var(--chaster-accent-soft)",
            color: "var(--chaster-accent)",
          }}
        >
          <ServiceGlyph id={current} size={15} />
        </span>
        <span className="text-[12px] font-medium capitalize tracking-[-0.01em]">
          {current.replace(/-/g, " ")}
        </span>
        <IconCaret size={12} className="opacity-55" />
      </button>
      {panel ? createPortal(panel, document.body) : null}
    </div>
  );
}

// re-export for callers that only need the map helper
export { getServiceIconComponent };
