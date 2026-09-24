"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ChannelIcon from "@/components/ChannelIcon";
import ChatBookingStrip from "@/components/ChatBookingStrip";
import { useI18n } from "@/components/I18nProvider";
import MessageText from "@/components/MessageText";
import {
  IconBack,
  IconClose,
  IconCopy,
  IconDown,
  IconMore,
  IconReply,
  IconSend,
} from "@/components/icons";
import ReactionPicker from "@/components/ReactionPicker";
import { formatMessageTime } from "@/lib/format-time";
import type { TranslateFn } from "@/lib/i18n";
import {
  getCustomerReaction,
  getMessageImageUrl,
  getOutgoingAuthor,
  getPageReaction,
  getReplyToMid,
} from "@/lib/message-actions";
import { stripAttachmentUrls, toPlainText } from "@/lib/message-text";
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

function statusCopy(status: ConversationStatus, t: TranslateFn) {
  if (status === "human") {
    return { label: t("chat.youAnswering"), kind: "human" as const };
  }
  if (status === "ended") {
    return { label: t("chat.closed"), kind: "ended" as const };
  }
  return { label: t("chat.aiAnswering"), kind: "ai" as const };
}

function channelLabel(platform: MessagePlatform, t: TranslateFn) {
  return platform === "instagram" ? t("inbox.instagram") : t("inbox.messenger");
}

function previewText(message: MessengerMessage | undefined, t: TranslateFn) {
  if (!message) return t("chat.originalMessage");
  const imageUrl = getMessageImageUrl(message);
  const text = toPlainText(message.message_text?.trim() ?? "", imageUrl);
  if (text) return text.length > 96 ? `${text.slice(0, 96)}…` : text;
  return imageUrl ? t("chat.photo") : t("chat.attachment");
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
  const { t } = useI18n();
  const meta = statusCopy(status, t);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const lastPeerRef = useRef(peerId);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const [showJumpBottom, setShowJumpBottom] = useState(false);
  const [reactMenuMid, setReactMenuMid] = useState<string | null>(null);
  const [headMenuOpen, setHeadMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const headMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!headMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (headMenuRef.current && !headMenuRef.current.contains(e.target as Node)) {
        setHeadMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDocClick);
    return () => document.removeEventListener("pointerdown", onDocClick);
  }, [headMenuOpen]);

  async function copyPeerId() {
    try {
      await navigator.clipboard.writeText(peerId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }

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
      <div className="ch-ruled ch-thread-empty" data-tour="thread">
        <p className="ch-thread-empty-title">{t("chat.pickConversation")}</p>
      </div>
    );
  }

  return (
    <section className="ch-thread" data-tour="thread">
      <div className="ch-thread-head">
        <div className="ch-thread-head-main">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="ch-btn ch-btn-ghost ch-desk-back h-8 w-8 shrink-0 px-0"
              aria-label={t("common.backToInbox")}
            >
              <IconBack size={15} />
            </button>
          ) : null}
          <div className="min-w-0">
            <div className="ch-thread-name">
              {displayName || t("inbox.unknownCustomer")}
            </div>
            <div className="ch-thread-sub">
              <ChannelIcon platform={platform} size={12} />
              <span>{channelLabel(platform, t)}</span>
              <span aria-hidden>·</span>
              <span data-tour="ai-status" className={`ch-thread-status is-${meta.kind}`}>
                {meta.label}
              </span>
            </div>
          </div>
        </div>

        <div className="ch-thread-actions" data-tour="ai-controls">
          {status === "open" ? (
            <button
              type="button"
              disabled={statusBusy}
              onClick={onHandover}
              className="ch-btn ch-btn-ghost h-8 px-2.5"
            >
              {t("chat.takeOver")}
            </button>
          ) : (
            <button
              type="button"
              disabled={statusBusy}
              onClick={onContinueAi}
              className="ch-btn ch-btn-ghost h-8 px-2.5"
            >
              {t("chat.resumeAi")}
            </button>
          )}
          {status !== "ended" ? (
            <button
              type="button"
              disabled={ending || messages.length === 0}
              onClick={onEndChat}
              className="ch-btn ch-btn-text h-8 px-2.5"
            >
              {ending ? t("chat.closing") : t("chat.closeChat")}
            </button>
          ) : null}
          <div className="relative" ref={headMenuRef}>
            <button
              type="button"
              className="ch-btn ch-btn-text h-8 w-8 px-0"
              aria-label={t("common.more")}
              aria-haspopup="menu"
              aria-expanded={headMenuOpen}
              onClick={() => setHeadMenuOpen((v) => !v)}
            >
              <IconMore size={15} />
            </button>
            {headMenuOpen ? (
              <div className="ch-menu ch-menu-sm" role="menu">
                <div className="ch-menu-section">
                  <button
                    type="button"
                    role="menuitem"
                    className="ch-menu-item"
                    onClick={() => void copyPeerId()}
                  >
                    <IconCopy size={13} />
                    <span className="ch-menu-item-text">
                      {copied ? t("chat.copied") : t("chat.copyCustomerId")}
                    </span>
                  </button>
                  <div className="ch-menu-meta tabular-nums">{peerId}</div>
                </div>
              </div>
            ) : null}
          </div>
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

      {status === "ended" && summary ? (
        <div className="ch-thread-note">
          <span className="ch-thread-note-label">{t("chat.summary")}</span>
          {summary}
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="ch-ruled absolute inset-0 space-y-5 overflow-y-auto px-5 py-5"
        >
          {messages.length === 0 ? (
            <p className="ch-empty-line" style={{ padding: 0, textAlign: "left" }}>
              {t("chat.noMessages")}
            </p>
          ) : (
            messages.map((m) => {
              const outgoing = m.direction === "outgoing";
              const replyMid = getReplyToMid(m);
              const parent = replyMid ? byMid.get(replyMid) : undefined;
              const pageReaction = getPageReaction(m);
              const customerReaction = getCustomerReaction(m);
              const imageUrl = getMessageImageUrl(m);
              const canAct = Boolean(m.mid);
              const menuOpen = reactMenuMid === m.mid;
              const author = outgoing ? getOutgoingAuthor(m) : null;
              const rawText = m.message_text?.trim() ?? "";
              const text = stripAttachmentUrls(rawText, imageUrl);
              const showText =
                Boolean(text) &&
                !(imageUrl && /^📷/.test(text) && text.length < 80);

              return (
                <div
                  key={m.id}
                  className={`message-enter group relative flex max-w-[88%] flex-col gap-1 sm:max-w-[68%] ${
                    outgoing ? "ml-auto items-end" : "items-start"
                  }`}
                >
                  <div
                    className="flex flex-wrap items-baseline gap-x-1.5 font-mono text-[10px] tabular-nums"
                    style={{ color: "var(--chaster-muted-soft)" }}
                  >
                    {outgoing ? (
                      <>
                        <span
                          className={`ch-msg-who is-${author}`}
                          title={
                            author === "ai"
                              ? t("chat.sentByAi")
                              : t("chat.sentByYou")
                          }
                        >
                          {author === "ai" ? t("chat.roleAi") : t("chat.roleYou")}
                        </span>
                        <span aria-hidden>·</span>
                      </>
                    ) : (
                      <>
                        <span>{t("chat.roleClient")}</span>
                        <span aria-hidden>·</span>
                      </>
                    )}
                    <span>{formatMessageTime(m.created_at)}</span>
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
                      title={previewText(parent, t)}
                    >
                      {t("chat.replyingTo").replace("…", previewText(parent, t))}
                    </div>
                  )}

                  <div className="relative flex flex-col gap-1.5">
                    <div
                      className={`ch-msg-body overflow-hidden text-[14px] leading-[1.55] ${
                        outgoing
                          ? "ch-msg-out rounded-2xl rounded-tr-sm"
                          : "ch-msg-in rounded-2xl rounded-tl-sm"
                      }`}
                    >
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={imageUrl}
                          alt=""
                          className="ch-msg-photo rounded-lg"
                        />
                      ) : null}
                      {showText ? (
                        <div className="px-3.5 py-2.5">
                          <MessageText text={text} attachedUrl={imageUrl} />
                        </div>
                      ) : !imageUrl ? (
                        <div className="px-3.5 py-2.5" style={{ color: "var(--chaster-muted)" }}>
                          {t("chat.attachment")}
                        </div>
                      ) : null}
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
                            title={t("chat.customerReaction")}
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
                            title={t("chat.pageReaction")}
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
                          title={t("chat.reply")}
                          aria-label={t("chat.reply")}
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
                            title={t("chat.react")}
                            aria-label={t("chat.react")}
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
            aria-label={t("chat.scrollLatest")}
          >
            <IconDown size={13} />
            {t("chat.latest")}
          </button>
        )}
      </div>

      <form
        onSubmit={onSend}
        className="px-4 py-3"
        style={{
          borderTop: "1px solid var(--chaster-border)",
          background: "transparent",
        }}
        data-tour="composer"
      >
        {replyTo && (
          <div
            className="mb-2 flex items-start gap-2 rounded-md px-2.5 py-2"
            style={{
              background: "var(--chaster-panel-soft)",
              boxShadow: "var(--chaster-inset-ring)",
            }}
          >
            <div
              className="mt-0.5 h-8 w-0.5 shrink-0"
              style={{ background: "var(--chaster-border-strong)" }}
            />
            <div className="min-w-0 flex-1">
              <div
                className="text-[11px] font-semibold tracking-[-0.02em]"
                style={{ color: "var(--chaster-ink)" }}
              >
                {replyTo.direction === "outgoing"
                  ? t("chat.replyingToDesk")
                  : t("chat.replyingToClient")}
              </div>
              <div
                className="truncate text-[12px]"
                style={{
                  color: "var(--chaster-muted)",
                  fontFamily: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
                }}
              >
                {previewText(replyTo, t)}
              </div>
            </div>
            <button
              type="button"
              className="ch-btn ch-btn-text h-7 w-7 shrink-0 px-0"
              aria-label={t("chat.cancelReply")}
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
          {replyTo ? t("chat.threadedReply") : t("chat.replyAsPage")}
        </div>
        <div className="ch-composer-well flex items-end gap-2">
          <textarea
            ref={draftRef}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            disabled={sending}
            placeholder={replyTo ? t("chat.writeReply") : t("chat.writeMessage")}
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
            {sending ? t("chat.sending") : t("chat.send")}
          </button>
        </div>
      </form>
    </section>
  );
}
