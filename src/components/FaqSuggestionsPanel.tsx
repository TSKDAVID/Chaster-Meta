"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";

type Suggestion = {
  id: string;
  page_id: string;
  peer_id: string;
  chat_summary: string;
  entry_type: "qa" | "info";
  question: string | null;
  content: string;
  overlap_note: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

type Draft = {
  question: string;
  content: string;
  entry_type: "qa" | "info";
};

type Props = {
  pageId: string;
  onError: (message: string | null) => void;
  onApproved?: () => void;
  refreshKey?: number;
};

export default function FaqSuggestionsPanel({
  pageId,
  onError,
  onApproved,
  refreshKey = 0,
}: Props) {
  const { t } = useI18n();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/faq-suggestions?status=pending&page_id=${encodeURIComponent(pageId)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load suggestions");
      const list = (data.suggestions ?? []) as Suggestion[];
      setSuggestions(list);
      setDrafts((prev) => {
        const next: Record<string, Draft> = {};
        for (const s of list) {
          next[s.id] = prev[s.id] ?? {
            question: s.question ?? "",
            content: s.content ?? "",
            entry_type: s.entry_type,
          };
        }
        return next;
      });
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }, [onError, pageId]);

  useEffect(() => {
    if (pageId) void load();
  }, [load, pageId, refreshKey]);

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }

  async function review(id: string, action: "approve" | "reject") {
    const draft = drafts[id];
    if (action === "approve") {
      if (!draft?.content.trim()) {
        onError(t("faq.needContent"));
        return;
      }
      if (draft.entry_type === "qa" && !draft.question.trim()) {
        onError(t("faq.needQuestion"));
        return;
      }
    }

    setBusyId(id);
    onError(null);
    try {
      const res = await fetch("/api/faq-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          page_id: pageId,
          action,
          ...(action === "approve" && draft
            ? {
                question: draft.question,
                content: draft.content,
                entry_type: draft.entry_type,
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `${action} failed`);
      await load();
      if (action === "approve") onApproved?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : `${action} failed`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="ch-faq">
      {loading && suggestions.length === 0 ? (
        <div className="ch-empty-line">{t("common.loading")}</div>
      ) : suggestions.length === 0 ? (
        <div className="ch-empty-line">{t("faq.noPending")}</div>
      ) : (
        <ul className="ch-faq-list">
          {suggestions.map((s) => {
            const draft = drafts[s.id] ?? {
              question: s.question ?? "",
              content: s.content ?? "",
              entry_type: s.entry_type,
            };
            return (
              <li key={s.id} className="ch-faq-row is-open">
                <div className="ch-faq-editor">
                  <div className="ch-suggest-head">
                    <div
                      className="ch-seg ch-seg-compact"
                      role="radiogroup"
                      aria-label={t("faq.entryType")}
                    >
                      <button
                        type="button"
                        className={`ch-seg-tab${draft.entry_type === "qa" ? " is-active" : ""}`}
                        onClick={() => updateDraft(s.id, { entry_type: "qa" })}
                      >
                        {t("faq.qa")}
                      </button>
                      <button
                        type="button"
                        className={`ch-seg-tab${draft.entry_type === "info" ? " is-active" : ""}`}
                        onClick={() => updateDraft(s.id, { entry_type: "info" })}
                      >
                        {t("faq.info")}
                      </button>
                    </div>
                    <span className="ch-tag is-warn">{t("faq.pending")}</span>
                  </div>

                  <p className="ch-suggest-summary">
                    <span className="ch-suggest-summary-label">{t("faq.fromChat")}</span>
                    {s.chat_summary}
                  </p>

                  {draft.entry_type === "qa" ? (
                    <label className="ch-field">
                      <span className="ch-label">{t("faq.question")}</span>
                      <input
                        value={draft.question}
                        onChange={(e) =>
                          updateDraft(s.id, { question: e.target.value })
                        }
                        className="ch-input w-full px-2.5 py-2"
                      />
                    </label>
                  ) : null}

                  <label className="ch-field">
                    <span className="ch-label">
                      {draft.entry_type === "qa" ? t("faq.answer") : t("faq.info")}
                    </span>
                    <textarea
                      value={draft.content}
                      onChange={(e) =>
                        updateDraft(s.id, { content: e.target.value })
                      }
                      rows={4}
                      className="ch-input w-full resize-y px-2.5 py-2"
                    />
                  </label>

                  {s.overlap_note ? (
                    <p className="ch-suggest-note">{s.overlap_note}</p>
                  ) : null}

                  <div className="ch-faq-editor-actions">
                    <span className="flex-1" />
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => void review(s.id, "reject")}
                      className="ch-btn ch-btn-text h-8 px-2.5"
                    >
                      {t("faq.reject")}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => void review(s.id, "approve")}
                      className="ch-btn ch-btn-primary h-8 px-3"
                    >
                      {busyId === s.id ? t("common.saving") : t("faq.approve")}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
