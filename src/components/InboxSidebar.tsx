"use client";

import ChannelIcon from "@/components/ChannelIcon";
import { IconSearch } from "@/components/icons";
import type { ConversationStatus, ConversationSummary, MessagePlatform } from "@/lib/types";

type Props = {
  conversations: ConversationSummary[];
  selectedPeerId: string;
  onSelect: (peerId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  platformFilter: "all" | MessagePlatform;
  onPlatformFilterChange: (value: "all" | MessagePlatform) => void;
  pageName?: string;
};

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function statusNote(status: ConversationStatus): { label: string; kind: "ai" | "human" | "ended" } {
  if (status === "human") return { label: "You’re replying", kind: "human" };
  if (status === "ended") return { label: "Closed", kind: "ended" };
  return { label: "AI handling", kind: "ai" };
}

function channelLabel(platform: MessagePlatform) {
  return platform === "instagram" ? "Instagram" : "Messenger";
}

export default function InboxSidebar({
  conversations,
  selectedPeerId,
  onSelect,
  search,
  onSearchChange,
  platformFilter,
  onPlatformFilterChange,
  pageName,
}: Props) {
  const filtered = conversations.filter((c) => {
    if (platformFilter !== "all" && c.platform !== platformFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      c.peer_id.toLowerCase().includes(q) ||
      (c.display_name ?? "").toLowerCase().includes(q) ||
      (c.last_message_text ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <aside className="ch-inbox flex h-full min-h-0 w-full flex-col" data-tour="inbox">
      <div className="ch-inbox-head">
        <div className="ch-inbox-title-row">
          <h2 className="ch-inbox-title">Inbox</h2>
          <span className="ch-inbox-count">
            {filtered.length} {filtered.length === 1 ? "chat" : "chats"}
          </span>
        </div>
        {pageName ? <p className="ch-inbox-page">{pageName}</p> : null}

        <label className="ch-inbox-search">
          <IconSearch size={14} />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name…"
            data-tour="inbox-search"
            aria-label="Search conversations"
          />
        </label>

        <div className="ch-inbox-channels" data-tour="channel-filter" role="group" aria-label="Show chats from">
          <button
            type="button"
            className={`ch-inbox-channel${platformFilter === "all" ? " is-active" : ""}`}
            onClick={() => onPlatformFilterChange("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`ch-inbox-channel${platformFilter === "messenger" ? " is-active" : ""}`}
            onClick={() => onPlatformFilterChange("messenger")}
          >
            <ChannelIcon platform="messenger" size={13} />
            Messenger
          </button>
          <button
            type="button"
            className={`ch-inbox-channel${platformFilter === "instagram" ? " is-active" : ""}`}
            onClick={() => onPlatformFilterChange("instagram")}
          >
            <ChannelIcon platform="instagram" size={13} />
            Instagram
          </button>
        </div>
      </div>

      <div className="ch-inbox-list min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="ch-inbox-empty">
            <p className="ch-inbox-empty-title">No conversations yet</p>
            <p className="ch-inbox-empty-copy">
              When a customer messages your Page, their chat appears here.
            </p>
          </div>
        ) : (
          <ul className="ch-inbox-ul">
            {filtered.map((c) => {
              const selected = selectedPeerId === c.peer_id;
              const note = statusNote(c.status);
              return (
                <li key={c.peer_id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.peer_id)}
                    className={`ch-inbox-row${selected ? " is-selected" : ""}`}
                  >
                    <span className="ch-inbox-top">
                      <span className="ch-inbox-name">{c.display_name || "Unknown customer"}</span>
                      <span className="ch-inbox-time">{formatTime(c.last_message_at)}</span>
                    </span>
                    <span className="ch-inbox-preview">
                      {c.last_direction === "outgoing" ? "You — " : ""}
                      {c.last_message_text?.trim()
                        ? c.last_message_text
                        : c.message_count > 0
                          ? "(media or non-text)"
                          : "No messages yet"}
                    </span>
                    <span className="ch-inbox-meta">
                      <ChannelIcon platform={c.platform} size={11} />
                      <span>{channelLabel(c.platform)}</span>
                      <span className="ch-inbox-dot" aria-hidden>
                        ·
                      </span>
                      <span className={`ch-inbox-handling is-${note.kind}`}>{note.label}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
