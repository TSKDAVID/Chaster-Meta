"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ChannelIcon from "@/components/ChannelIcon";
import ChatBookingStrip from "@/components/ChatBookingStrip";
import { IconBack, IconClose, IconDown, IconReply, IconSend } from "@/components/icons";
import ReactionPicker from "@/components/ReactionPicker";
import {
  getCustomerReaction,
  getOutgoingAuthor,
  getPageReaction,
  getReplyToMid,
} from "@/lib/message-actions";
import type { ConversationStatus, MessagePlatform, MessengerMessage } from "@/lib/types";

type Props = {
  peerId: string;
  displayName?: string | null;
  platform: MessagePlatform;
  status: ConversationStatus;
  summary: string | null;
  messages: MessengerMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  replyTo: MessengerMessage | null;
  onReplyTo: (message: MessengerMessage | null) => void;
  sending: boolean;
  reactingMid: string | null;
  ending: boolean;
  statusBusy: boolean;
  onSend: (e: React.FormEvent) => void;
  onReact: (mid: string, reaction: string | null) => void;
  onHandover: () => void;
  onContinueAi: () => void;
  onEndChat: () => void;
  onBack?: () => void;
  pageId?: string;
  bookingRefreshKey?: number;
  onOpenBookings?: () => void;
  onBookingError?: (message: string | null) => void;
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusCopy(status: ConversationStatus) {
  if (status === "human") {
    return { label: "You’re on it", color: "var(--chaster-warn-text)" };
  }
  if (status === "ended") {
    return { label: "Closed", color: "var(--chaster-muted)" };
  }
  return { label: "AI answering", color: "var(--chaster-muted)" };
}

function previewText(message: MessengerMessage | undefined) {
  if (!message) return "Original message";
  const text = message.message_text?.trim();
  if (text) return text.length > 96 ? `${text.slice(0, 96)}…` : text;
  return "(non-text)";
}

export default function ChatThread({
  peerId,
  displayName,
  platform,
  status,
  summary,
  messages,
  draft,
  onDraftChange,
  replyTo,
  onReplyTo,
  sending,
  reactingMid,
  ending,
  statusBusy,
  onSend,
  onReact,
  onHandover,
  onContinueAi,
  onEndChat,
  onBack,
  pageId,
  bookingRefreshKey = 0,
  onOpenBookings,
  onBookingError,
}: Props) {
  const meta = statusCopy(status);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const lastPeerRef = useRef(peerId);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const [showJumpBottom, setShowJumpBottom] = useState(false);
  const [reactMenuMid, setReactMenuMid] = useState<string | null>(null);

  const byMid = useMemo(() => {
    const map = new Map<string, MessengerMessage>();
    for (const m of messages) {
      if (m.mid) map.set(m.mid, m);
    }
    return map;
  }, [messages]);

  function resizeDraftField() {
    const el = draftRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 148;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }

  useLayoutEffect(() => {
    resizeDraftField();
  }, [draft, replyTo?.id]);

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    stickToBottomRef.current = true;
    setShowJumpBottom(false);
  }

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 80;
    stickToBottomRef.current = nearBottom;
    setShowJumpBottom(!nearBottom && messages.length > 0);
  }

  useLayoutEffect(() => {
    if (!peerId) return;
    if (lastPeerRef.current !== peerId) {
      lastPeerRef.current = peerId;
      stickToBottomRef.current = true;
      setShowJumpBottom(false);
      setReactMenuMid(null);
    }
    if (stickToBottomRef.current) {
      scrollToBottom("auto");
    }
  }, [peerId, messages.length, messages[messages.length - 1]?.id]);

  useEffect(() => {
    if (!peerId || messages.length === 0) return;
    if (!stickToBottomRef.current) {
      setShowJumpBottom(true);
      return;
    }
    scrollToBottom("smooth");
  }, [peerId, messages.length, messages[messages.length - 1]?.id]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("[data-react-menu]")) {
        setReactMenuMid(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  if (!peerId) {
    return (
      <div
        className="ch-ruled flex flex-1 flex-col items-center justify-center px-10 py-12 text-center"
        data-tour="thread"
      >
        <p
          className="text-[22px] font-semibold tracking-[-0.05em]"
          style={{ color: "var(--chaster-ink)" }}
        >
          Pick a conversation
        </p>
        <p
          className="mt-2 max-w-sm text-[14px] leading-relaxed"
          style={{
            color: "var(--chaster-muted)",
            fontFamily: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
          }}
        >
          Choose a chat from the inbox to read messages and reply as your Page.
        </p>
      </div>
    );
  }

  return (
    <section
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      style={{ background: "transparent" }}
      data-tour="thread"
    >
      <div
        className="flex flex-wrap items-end justify-between gap-3 px-3 py-3 sm:px-5 sm:py-3.5"
        style={{ borderBottom: "1px solid var(--chaster-border)" }}
      >
        <div className="flex min-w-0 items-start gap-2 sm:gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="ch-btn ch-btn-ghost mt-0.5 h-9 w-9 shrink-0 px-0 md:hidden"
              aria-label="Back to inbox"
            >
              <IconBack size={16} />
            </button>
          ) : null}
          <ChannelIcon platform={platform} size={20} />
          <div className="min-w-0">
            <div
              className="truncate text-[16px] font-semibold tracking-[-0.045em] sm:text-[17px]"
              style={{ color: "var(--chaster-ink)" }}
            >
              {displayName || "Unknown customer"}
            </div>
            <div
              className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]"
              style={{
                color: "var(--chaster-muted)",
                fontFamily: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
              }}
            >
              <span data-tour="ai-status" style={{ color: meta.color }}>
                {meta.label}
              </span>
              <span aria-hidden className="hidden sm:inline">
                ·
              </span>
              <span className="hidden font-mono text-[10px] tracking-normal sm:inline">
                {peerId}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1" data-tour="ai-controls">
          {status === "open" ? (
            <button
              type="button"
              disabled={statusBusy}
              onClick={onHandover}
              className="ch-btn ch-btn-text h-9 px-2.5 sm:h-8"
            >
              Take over
            </button>
          ) : (
            <button
              type="button"
              disabled={statusBusy}
              onClick={onContinueAi}
              className="ch-btn ch-btn-text h-9 px-2.5 sm:h-8"
            >
              Resume AI
            </button>
          )}
          {status !== "ended" && (
            <button
              type="button"
              disabled={ending || messages.length === 0}
              onClick={onEndChat}
              className="ch-btn ch-btn-text h-9 px-2.5 sm:h-8"
              style={{ color: "var(--chaster-danger-text)" }}
            >
              {ending ? "Closing…" : "Close"}
            </button>
          )}
        </div>
      </div>

      {pageId && onOpenBookings && onBookingError ? (
        <ChatBookingStrip
          pageId={pageId}
          peerId={peerId}
          displayName={displayName}
          refreshKey={bookingRefreshKey}
          onOpenLedger={onOpenBookings}
          onError={onBookingError}
        />
      ) : null}

      {status === "human" && (
        <div
          className="px-5 py-2 text-[12.5px] leading-snug"
          style={{
            borderBottom: "1px solid var(--chaster-border)",
            color: "var(--chaster-warn-text)",
            fontFamily: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
          }}
        >
          You’re on desk — AI won’t auto-reply in this thread.
        </div>
      )}
      {status === "ended" && summary && (
        <div
          className="px-5 py-2 text-[12.5px]"
          style={{
            borderBottom: "1px solid var(--chaster-border)",
            color: "var(--chaster-muted)",
            fontFamily: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
          }}
        >
          <span className="font-semibold" style={{ color: "var(--chaster-ink)" }}>
            Summary ·{" "}
          </span>
          {summary}
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="ch-ruled absolute inset-0 space-y-5 overflow-y-auto px-5 py-5"
        >
          {messages.length === 0 ? (
            <p
              className="text-[13px]"
              style={{
                color: "var(--chaster-muted)",
                fontFamily: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
              }}
            >
              No messages yet.
            </p>
          ) : (
            messages.map((m) => {
              const outgoing = m.direction === "outgoing";
              const replyMid = getReplyToMid(m);
              const parent = replyMid ? byMid.get(replyMid) : undefined;
              const pageReaction = getPageReaction(m);
              const customerReaction = getCustomerReaction(m);
              const canAct = Boolean(m.mid);
              const menuOpen = reactMenuMid === m.mid;
              const author = outgoing ? getOutgoingAuthor(m) : null;

              return (
                <div
                  key={m.id}
                  className={`message-enter group relative flex max-w-[88%] flex-col gap-1 sm:max-w-[68%] ${
                    outgoing ? "ml-auto items-end" : "items-start"
                  }`}
                >
                  <div
                    className="flex flex-wrap items-baseline gap-x-1.5 font-mono text-[10px] tabular-nums"
                    style={{ color: "var(--chaster-muted)" }}
                  >
                    {outgoing ? (
                      <>
                        <span
                          className={`ch-msg-who is-${author}`}
                          title={
                            author === "ai"
                              ? "Sent by AI auto-reply"
                              : "Sent by you from this desk"
                          }
                        >
                          {author === "ai" ? "AI" : "You"}
                        </span>
                        <span aria-hidden>·</span>
                      </>
                    ) : (
                      <>
                        <span>Client</span>
                        <span aria-hidden>·</span>
                      </>
                    )}
                    <span>{formatTime(m.created_at)}</span>
                  </div>

                  {replyMid && (
                    <div
                      className="max-w-full truncate px-1 text-[11px] leading-snug"
                      style={{
                        color: "var(--chaster-muted)",
                        fontFamily: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
                        borderLeft: "2px solid var(--chaster-border-strong, var(--chaster-border))",
                        paddingLeft: 8,
                      }}
                      title={previewText(parent)}
                    >
                      Replying to {previewText(parent)}
                    </div>
                  )}

                  <div className="relative flex flex-col gap-1.5">
                    <div
                      className="ch-msg-body px-3.5 py-2.5 text-[14px] leading-[1.55]"
                      style={
                        outgoing
                          ? {
                              background: "var(--chaster-bubble-out)",
                              color: "var(--chaster-bubble-out-text)",
                              borderRadius: "var(--chaster-radius-msg-out)",
                            }
                          : {
                              background: "var(--chaster-bubble-in)",
                              color: "var(--chaster-ink)",
                              borderRadius: "var(--chaster-radius-msg)",
                              boxShadow: "inset 0 0 0 1px var(--chaster-bubble-in-ring)",
                            }
                      }
                    >
                      <div className="whitespace-pre-wrap">
                        {m.message_text || "(non-text)"}
                      </div>
                    </div>

                    {(pageReaction || customerReaction) && (
                      <div
                        className={`flex gap-1 ${outgoing ? "justify-end" : "justify-start"}`}
                      >
                        {customerReaction && (
                          <span
                            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[13px] leading-none"
                            style={{
                              background: "var(--chaster-panel)",
                              boxShadow: "inset 0 0 0 1px var(--chaster-border)",
                            }}
                            title="Customer reaction"
                          >
                            {customerReaction}
                          </span>
                        )}
                        {pageReaction && (
                          <span
                            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[13px] leading-none"
                            style={{
                              background: "var(--chaster-panel)",
                              boxShadow: "inset 0 0 0 1px var(--chaster-border)",
                            }}
                            title="Page reaction"
                          >
                            {pageReaction}
                          </span>
                        )}
                      </div>
                    )}

                    {canAct && (
                      <div
                        className={`absolute top-0 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 ${
                          outgoing ? "right-full mr-1" : "left-full ml-1"
                        }`}
                      >
                        <button
                          type="button"
                          className="ch-btn ch-btn-ghost h-7 w-7 px-0"
                          style={{ background: "var(--chaster-panel)" }}
                          title="Reply"
                          aria-label="Reply to message"
                          onClick={() => {
                            onReplyTo(m);
                            setReactMenuMid(null);
                            draftRef.current?.focus();
                          }}
                        >
                          <IconReply size={13} />
                        </button>
                        <div className="relative" data-react-menu>
                          <button
                            type="button"
                            className="ch-btn ch-btn-ghost h-7 w-7 px-0"
                            style={{ background: "var(--chaster-panel)" }}
                            title="React"
                            aria-label="React to message"
                            disabled={reactingMid === m.mid}
                            onClick={() =>
                              setReactMenuMid((cur) => (cur === m.mid ? null : m.mid ?? null))
                            }
                          >
                            <span className="text-[13px] leading-none">☺</span>
                          </button>
                          <ReactionPicker
                            open={menuOpen && Boolean(m.mid)}
                            align={outgoing ? "right" : "left"}
                            current={pageReaction}
                            busy={reactingMid === m.mid}
                            onPick={(emoji) => {
                              if (!m.mid) return;
                              onReact(m.mid, emoji);
                              setReactMenuMid(null);
                            }}
                            onClear={() => {
                              if (!m.mid) return;
                              onReact(m.mid, null);
                              setReactMenuMid(null);
                            }}
                            onClose={() => setReactMenuMid(null)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {showJumpBottom && (
          <button
            type="button"
            onClick={() => scrollToBottom("smooth")}
            className="ch-btn ch-btn-ghost absolute bottom-4 left-1/2 z-10 h-8 -translate-x-1/2 px-3"
            style={{ background: "var(--chaster-panel)" }}
            aria-label="Scroll to latest messages"
          >
            <IconDown size={13} />
            Latest
          </button>
        )}
      </div>

      <form
        onSubmit={onSend}
        className="px-4 py-3"
        style={{
          borderTop: "1px solid var(--chaster-border)",
          background: "var(--chaster-panel)",
        }}
        data-tour="composer"
      >
        {replyTo && (
          <div
            className="mb-2 flex items-start gap-2 rounded-md px-2.5 py-2"
            style={{
              background: "var(--chaster-bg-soft, var(--chaster-bg))",
              boxShadow: "inset 0 0 0 1px var(--chaster-border)",
            }}
          >
            <div
              className="mt-0.5 h-8 w-0.5 shrink-0"
              style={{ background: "var(--chaster-accent, var(--chaster-ink))" }}
            />
            <div className="min-w-0 flex-1">
              <div
                className="text-[11px] font-semibold tracking-[-0.02em]"
                style={{ color: "var(--chaster-ink)" }}
              >
                Replying to {replyTo.direction === "outgoing" ? "desk" : "client"}
              </div>
              <div
                className="truncate text-[12px]"
                style={{
                  color: "var(--chaster-muted)",
                  fontFamily: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
                }}
              >
                {previewText(replyTo)}
              </div>
            </div>
            <button
              type="button"
              className="ch-btn ch-btn-text h-7 w-7 shrink-0 px-0"
              aria-label="Cancel reply"
              onClick={() => onReplyTo(null)}
            >
              <IconClose size={13} />
            </button>
          </div>
        )}
        <div
          className="mb-1.5 text-[12px]"
          style={{
            color: "var(--chaster-muted)",
            fontFamily: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
          }}
        >
          {replyTo ? "Threaded reply as the Page" : "Reply as the Page"}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            ref={draftRef}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            disabled={sending}
            placeholder={replyTo ? "Write your reply…" : "Write the next message…"}
            rows={1}
            className="ch-input ch-msg-body min-h-[42px] flex-1 resize-none overflow-hidden px-3 py-2.5"
            onKeyDown={(e) => {
              if (e.key === "Escape" && replyTo) {
                e.preventDefault();
                onReplyTo(null);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (draft.trim() && !sending) {
                  onSend(e as unknown as React.FormEvent);
                }
              }
            }}
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="ch-btn ch-btn-primary min-h-[42px] self-end px-3.5"
          >
            <IconSend size={15} />
            {sending ? "…" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
