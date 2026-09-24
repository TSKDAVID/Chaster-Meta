"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "@/components/icons";
import { EMOJI_PICKER_SET, PAGE_REACTIONS } from "@/lib/message-actions";

type Props = {
  open: boolean;
  align?: "left" | "right";
  current?: string | null;
  busy?: boolean;
  onPick: (emoji: string) => void;
  onClear: () => void;
  onClose: () => void;
};

type CoordPlacement = {
  vertical: "up" | "down";
  horizontal: "left" | "right";
  top: number;
  left: number;
};

const COMPACT_H = 52;
const COMPACT_W = 220;
const MORE_H = 280;
const MORE_W = 280;
const GAP = 6;
const PAD = 8;

/** Extract the first emoji / emoji sequence from free text. */
function firstEmoji(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(
    /(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*)/u,
  );
  return match?.[0] ?? null;
}

function placePanel(
  anchor: DOMRect,
  panelH: number,
  panelW: number,
  preferredAlign: "left" | "right",
): CoordPlacement {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const spaceBelow = vh - anchor.bottom - PAD;
  const spaceAbove = anchor.top - PAD;

  let vertical: "up" | "down";
  if (spaceBelow >= panelH) vertical = "down";
  else if (spaceAbove >= panelH) vertical = "up";
  else vertical = spaceAbove > spaceBelow ? "up" : "down";

  let top =
    vertical === "down"
      ? anchor.bottom + GAP
      : anchor.top - GAP - panelH;
  top = Math.max(PAD, Math.min(top, vh - PAD - Math.min(panelH, vh - PAD * 2)));

  let horizontal: "left" | "right" = preferredAlign;
  if (preferredAlign === "left") {
    if (anchor.left + panelW > vw - PAD && anchor.right - panelW >= PAD) {
      horizontal = "right";
    }
  } else if (anchor.right - panelW < PAD && anchor.left + panelW <= vw - PAD) {
    horizontal = "left";
  }

  let left =
    horizontal === "left" ? anchor.left : anchor.right - panelW;
  left = Math.max(PAD, Math.min(left, vw - PAD - Math.min(panelW, vw - PAD * 2)));

  return { vertical, horizontal, top, left };
}

export default function ReactionPicker({
  open,
  align = "left",
  current,
  busy,
  onPick,
  onClear,
  onClose,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const [coords, setCoords] = useState<CoordPlacement | null>(null);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const customRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setMoreOpen(false);
      setQuery("");
      setCustom("");
      setCoords(null);
    }
  }, [open]);

  useEffect(() => {
    if (moreOpen) {
      const id = window.setTimeout(() => customRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
  }, [moreOpen]);

  useLayoutEffect(() => {
    if (!open) return;

    function measure() {
      const anchorEl = anchorRef.current?.parentElement;
      if (!anchorEl) return;
      const anchor = anchorEl.getBoundingClientRect();
      const estimatedH = moreOpen ? MORE_H : COMPACT_H;
      const estimatedW = moreOpen ? MORE_W : COMPACT_W;
      const panel = rootRef.current?.getBoundingClientRect();
      const h = Math.max(panel?.height ?? 0, estimatedH);
      const w = Math.max(panel?.width ?? 0, estimatedW);
      setCoords(placePanel(anchor, h, w, align));
    }

    measure();
    const id = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, moreOpen, align]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return EMOJI_PICKER_SET;
    return EMOJI_PICKER_SET.filter((e) => e.includes(q) || q.includes(e));
  }, [query]);

  function submitCustom() {
    const emoji = firstEmoji(custom);
    if (!emoji || busy) return;
    onPick(emoji);
  }

  function openMore() {
    const next = !moreOpen;
    if (next) {
      const anchorEl = anchorRef.current?.parentElement;
      if (anchorEl) {
        setCoords(placePanel(anchorEl.getBoundingClientRect(), MORE_H, MORE_W, align));
      }
    }
    setMoreOpen(next);
  }

  // Invisible anchor stays in-flow so we can measure the trigger button's parent.
  const anchorMarker = <span ref={anchorRef} className="pointer-events-none absolute inset-0" aria-hidden />;

  if (!open) return anchorMarker;

  const panel =
    mounted && coords ? (
      <div
        ref={rootRef}
        data-react-menu
        className="fixed z-50"
        style={{
          top: coords.top,
          left: coords.left,
          minWidth: moreOpen ? MORE_W : undefined,
          maxWidth: `min(${MORE_W}px, calc(100vw - ${PAD * 2}px))`,
          maxHeight: `calc(100vh - ${PAD * 2}px)`,
        }}
      >
        <div
          className="px-1.5 py-1.5"
          style={{
            background: "var(--chaster-card)",
            borderRadius: "var(--r-2)",
            boxShadow: "inset 0 0 0 1px var(--chaster-border), var(--chaster-shadow)",
          }}
        >
          <div className="flex items-center gap-0.5">
            {PAGE_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="ch-btn ch-btn-text h-8 w-8 px-0 text-[16px]"
                style={
                  current === emoji
                    ? { background: "var(--chaster-accent-soft)" }
                    : undefined
                }
                disabled={busy}
                onClick={() => onPick(emoji)}
                aria-label={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}
            <span
              aria-hidden
              className="mx-0.5 h-5 w-px shrink-0"
              style={{ background: "var(--chaster-border)" }}
            />
            <button
              type="button"
              className="ch-btn h-8 shrink-0 gap-1 px-2.5 text-[11px] font-semibold tracking-[-0.02em]"
              disabled={busy}
              onClick={openMore}
              aria-label={moreOpen ? "Hide more emojis" : "Choose more emojis"}
              title={moreOpen ? "Hide more emojis" : "Choose more emojis"}
              style={{
                background: moreOpen
                  ? "var(--chaster-accent)"
                  : "color-mix(in srgb, var(--chaster-ink) 6%, transparent)",
                color: moreOpen ? "var(--chaster-on-accent)" : "var(--chaster-ink)",
              }}
            >
              <span className="text-[14px] font-bold leading-none" aria-hidden>
                +
              </span>
              {moreOpen ? "Less" : "More"}
            </button>
            {current && (
              <button
                type="button"
                className="ch-btn ch-btn-text h-8 px-2 text-[10px]"
                disabled={busy}
                onClick={onClear}
              >
                Clear
              </button>
            )}
          </div>

          {moreOpen && (
            <div
              className="mt-1.5 border-t pt-1.5"
              style={{ borderColor: "var(--chaster-border)" }}
            >
              <div className="mb-1.5 flex items-center gap-1.5 px-0.5">
                <input
                  ref={customRef}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitCustom();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      if (custom) setCustom("");
                      else onClose();
                    }
                  }}
                  placeholder="Paste an emoji"
                  disabled={busy}
                  className="ch-input h-8 flex-1 px-2 text-[13px]"
                  aria-label="Custom emoji"
                />
                <button
                  type="button"
                  className="ch-btn ch-btn-primary h-8 px-2.5 text-[11px]"
                  disabled={busy || !firstEmoji(custom)}
                  onClick={submitCustom}
                >
                  Use
                </button>
                <button
                  type="button"
                  className="ch-btn ch-btn-text h-8 w-8 px-0"
                  aria-label="Close picker"
                  onClick={onClose}
                >
                  <IconClose size={12} />
                </button>
              </div>

              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter"
                disabled={busy}
                className="ch-input mb-1.5 h-7 w-full px-2 text-[12px]"
                aria-label="Filter emojis"
              />

              <div
                className="grid max-h-44 grid-cols-8 gap-0.5 overflow-y-auto pr-0.5"
                style={{ scrollbarWidth: "thin" }}
              >
                {filtered.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="ch-btn ch-btn-text h-8 w-full px-0 text-[16px]"
                    style={
                      current === emoji
                        ? { background: "var(--chaster-accent-soft)" }
                        : undefined
                    }
                    disabled={busy}
                    onClick={() => onPick(emoji)}
                    aria-label={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p
                    className="col-span-8 px-1 py-2 text-[12px]"
                    style={{
                      color: "var(--chaster-muted)",
                      fontFamily: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
                    }}
                  >
                    No matches
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    ) : null;

  return (
    <>
      {anchorMarker}
      {panel ? createPortal(panel, document.body) : null}
    </>
  );
}
