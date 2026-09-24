"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

/** Extract the first emoji / emoji sequence from free text. */
function firstEmoji(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(
    /(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*)/u,
  );
  return match?.[0] ?? null;
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
  const customRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setMoreOpen(false);
      setQuery("");
      setCustom("");
    }
  }, [open]);

  useEffect(() => {
    if (moreOpen) {
      const id = window.setTimeout(() => customRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
  }, [moreOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return EMOJI_PICKER_SET;
    // Filter by including the typed character(s) — emoji search without a library
    return EMOJI_PICKER_SET.filter((e) => e.includes(q) || q.includes(e));
  }, [query]);

  if (!open) return null;

  function submitCustom() {
    const emoji = firstEmoji(custom);
    if (!emoji || busy) return;
    onPick(emoji);
  }

  return (
    <div
      className={`absolute top-8 z-30 ${align === "right" ? "right-0" : "left-0"}`}
      data-react-menu
      style={{ minWidth: moreOpen ? 280 : undefined }}
    >
      <div
        className="rounded-md px-1.5 py-1.5"
        style={{
          background: "var(--chaster-panel)",
          boxShadow: "inset 0 0 0 1px var(--chaster-border), 0 8px 24px rgba(0,0,0,0.08)",
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
                  ? { background: "var(--chaster-bg-soft, var(--chaster-bg))" }
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
            onClick={() => setMoreOpen((v) => !v)}
            aria-label={moreOpen ? "Hide more emojis" : "Choose more emojis"}
            title={moreOpen ? "Hide more emojis" : "Choose more emojis"}
            style={{
              background: moreOpen
                ? "var(--chaster-ink)"
                : "var(--chaster-bg-soft, var(--chaster-bg))",
              color: moreOpen ? "var(--chaster-panel)" : "var(--chaster-ink)",
              boxShadow: "inset 0 0 0 1px var(--chaster-border)",
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
                placeholder="Paste any emoji…"
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
              placeholder="Filter…"
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
                      ? { background: "var(--chaster-bg-soft, var(--chaster-bg))" }
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
                  No matches — paste your emoji above.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
