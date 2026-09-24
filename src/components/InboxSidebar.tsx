"use client";

import ChannelIcon from "@/components/ChannelIcon";
import { useI18n } from "@/components/I18nProvider";
import { IconSearch } from "@/components/icons";
import { formatRelativeShort } from "@/lib/format-time";
import { toPlainText } from "@/lib/message-text";
import type { ConversationStatus, ConversationSummary, MessagePlatform } from "@/lib/types";

type Props = {
  conversations: ConversationSummary[];
  selectedPeerId: string;
  onSelect: (peerId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  platformFilter: "all" | MessagePlatform;
  onPlatformFilterChange: (value: "all" | MessagePlatform) => void;
};

export default function InboxSidebar({
  conversations,
  selectedPeerId,
  onSelect,
  search,
  onSearchChange,
  platformFilter,
  onPlatformFilterChange,
}: Props) {
  const { t } = useI18n();

  function statusNote(status: ConversationStatus): {
    label: string;
    kind: "ai" | "human" | "ended";
  } {
    if (status === "human") return { label: t("inbox.you"), kind: "human" };
    if (status === "ended") return { label: t("inbox.closed"), kind: "ended" };
    return { label: t("inbox.ai"), kind: "ai" };
  }

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
    <aside className="ch-inbox" data-tour="inbox">
      <div className="ch-inbox-head">
        <div className="ch-inbox-title-row">
          <h2 className="ch-inbox-title">{t("inbox.title")}</h2>
          <span className="ch-inbox-count tabular-nums">{filtered.length}</span>
        </div>

        <div className="ch-inbox-tools">
          <label className="ch-inbox-search">
            <IconSearch size={14} />
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t("common.search")}
              data-tour="inbox-search"
              aria-label={t("inbox.searchConversations")}
            />
          </label>
          <div
            className="ch-channel-toggles"
            data-tour="channel-filter"
            role="group"
            aria-label={t("inbox.channel")}
          >
            <button
              type="button"
              className={`ch-channel-toggle${platformFilter === "all" ? " is-active" : ""}`}
              onClick={() => onPlatformFilterChange("all")}
              aria-pressed={platformFilter === "all"}
            >
              {t("inbox.all")}
            </button>
            <button
              type="button"
              className={`ch-channel-toggle is-messenger${platformFilter === "messenger" ? " is-active" : ""}`}
              onClick={() => onPlatformFilterChange("messenger")}
              aria-pressed={platformFilter === "messenger"}
            >
              <ChannelIcon platform="messenger" size={13} />
              <span>{t("inbox.messenger")}</span>
            </button>
            <button
              type="button"
              className={`ch-channel-toggle is-instagram${platformFilter === "instagram" ? " is-active" : ""}`}
              onClick={() => onPlatformFilterChange("instagram")}
              aria-pressed={platformFilter === "instagram"}
            >
              <ChannelIcon platform="instagram" size={13} />
              <span>{t("inbox.instagram")}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="ch-inbox-list">
        {filtered.length === 0 ? (
          <div className="ch-empty-line">{t("inbox.noConversations")}</div>
        ) : (
          <ul className="ch-inbox-ul">
            {filtered.map((c) => {
              const selected = selectedPeerId === c.peer_id;
              const note = statusNote(c.status);
              const preview = c.last_message_text?.trim()
                ? toPlainText(c.last_message_text)
                : c.message_count > 0
                  ? t("inbox.photoOrAttachment")
                  : t("inbox.noMessages");
              return (
                <li key={c.peer_id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.peer_id)}
                    className={`ch-inbox-row${selected ? " is-selected" : ""}`}
                  >
                    <span className="ch-inbox-top">
                      <span className="ch-inbox-name">
                        <ChannelIcon platform={c.platform} size={12} />
                        <span className="truncate">
                          {c.display_name || t("inbox.unknownCustomer")}
                        </span>
                      </span>
                      <span className="ch-inbox-time tabular-nums">
                        {formatRelativeShort(c.last_message_at)}
                      </span>
                    </span>
                    <span className="ch-inbox-bottom">
                      <span className="ch-inbox-preview">
                        {c.last_direction === "outgoing" ? t("inbox.youPrefix") : ""}
                        {preview}
                      </span>
                      <span className={`ch-inbox-handling is-${note.kind}`}>
                        <span className="ch-inbox-dot" aria-hidden />
                        {note.label}
                      </span>
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
