"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/I18nProvider";

type FaqEntry = {
  id: string;
  entry_type: "qa" | "info";
  question: string | null;
  content: string;
  created_at: string;
};

export type FaqAddRequest = { mode: "qa" | "info"; token: number };

type Props = {
  pageId: string;
  onError: (message: string | null) => void;
  refreshKey?: number;
  search?: string;
  addRequest?: FaqAddRequest | null;
};

const NEW_ID = "__new__";

function firstLine(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export default function FaqPanel({
  pageId,
  onError,
  refreshKey = 0,
  search = "",
  addRequest,
}: Props) {
  const { t } = useI18n();
  const [faqs, setFaqs] = useState<FaqEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<"qa" | "info">("qa");
  const [question, setQuestion] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadFaqs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/faqs?page_id=${encodeURIComponent(pageId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load FAQs");
      setFaqs(data.faqs ?? []);
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load FAQs");
    } finally {
      setLoading(false);
    }
  }, [onError, pageId]);

  useEffect(() => {
    if (pageId) void loadFaqs();
  }, [loadFaqs, pageId, refreshKey]);

  // Toolbar "Add" is a one-shot request; react to a new token during render.
  const [seenAddToken, setSeenAddToken] = useState(0);
  if (addRequest && addRequest.token !== seenAddToken) {
    setSeenAddToken(addRequest.token);
    setOpenId(NEW_ID);
    setMode(addRequest.mode);
    setQuestion("");
    setContent("");
  }

  useEffect(() => {
    if (!openId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenId(null);
        setQuestion("");
        setContent("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return faqs;
    return faqs.filter(
      (f) =>
        (f.question ?? "").toLowerCase().includes(q) ||
        f.content.toLowerCase().includes(q),
    );
  }, [faqs, search]);

  function closeEditor() {
    setOpenId(null);
    setQuestion("");
    setContent("");
  }

  function openEdit(faq: FaqEntry) {
    setOpenId(faq.id);
    setMode(faq.entry_type);
    setQuestion(faq.question ?? "");
    setContent(faq.content);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    if (mode === "qa" && !question.trim()) return;
    const isNew = openId === NEW_ID;

    setSaving(true);
    onError(null);
    try {
      const res = await fetch("/api/faqs", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: isNew ? undefined : openId,
          page_id: pageId,
          entry_type: mode,
          question: mode === "qa" ? question.trim() : undefined,
          content: content.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save FAQ");
      closeEditor();
      await loadFaqs();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save FAQ");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("faq.deleteConfirm"))) return;
    setDeletingId(id);
    try {
      const res = await fetch(
        `/api/faqs?id=${encodeURIComponent(id)}&page_id=${encodeURIComponent(pageId)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      if (openId === id) closeEditor();
      await loadFaqs();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  function renderEditor(faq: FaqEntry | null) {
    const isNew = !faq;
    return (
      <form onSubmit={handleSave} className="ch-faq-editor">
        {isNew ? (
          <div
            className="ch-seg ch-seg-compact"
            role="radiogroup"
            aria-label={t("faq.entryType")}
          >
            <button
              type="button"
              className={`ch-seg-tab${mode === "qa" ? " is-active" : ""}`}
              onClick={() => setMode("qa")}
            >
              {t("faq.qa")}
            </button>
            <button
              type="button"
              className={`ch-seg-tab${mode === "info" ? " is-active" : ""}`}
              onClick={() => setMode("info")}
            >
              {t("faq.generalInfo")}
            </button>
          </div>
        ) : null}

        {mode === "qa" ? (
          <label className="ch-field">
            <span className="ch-label">{t("faq.question")}</span>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              autoFocus
              className="ch-input w-full px-2.5 py-2"
            />
          </label>
        ) : null}

        <label className="ch-field">
          <span className="ch-label">
            {mode === "qa" ? t("faq.answer") : t("faq.info")}
          </span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            autoFocus={mode === "info"}
            rows={4}
            className="ch-input w-full resize-y px-2.5 py-2"
          />
        </label>

        <div className="ch-faq-editor-actions">
          {faq ? (
            <button
              type="button"
              className="ch-btn ch-btn-text ch-btn-danger h-8 px-2"
              disabled={deletingId === faq.id}
              onClick={() => void handleDelete(faq.id)}
            >
              {t("common.delete")}
            </button>
          ) : null}
          <span className="flex-1" />
          <button
            type="button"
            onClick={closeEditor}
            className="ch-btn ch-btn-text h-8 px-2.5"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={
              saving ||
              !content.trim() ||
              (mode === "qa" && !question.trim())
            }
            className="ch-btn ch-btn-primary h-8 px-3"
          >
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="ch-faq">
      {openId === NEW_ID ? (
        <div className="ch-faq-row is-open">{renderEditor(null)}</div>
      ) : null}

      {loading && faqs.length === 0 ? (
        <div className="ch-empty-line">{t("common.loading")}</div>
      ) : filtered.length === 0 && openId !== NEW_ID ? (
        <div className="ch-empty-line">
          {search.trim() ? t("faq.noMatches") : t("faq.noEntries")}
        </div>
      ) : (
        <ul className="ch-faq-list">
          {filtered.map((faq) => {
            const open = openId === faq.id;
            const title =
              faq.entry_type === "qa" && faq.question
                ? faq.question
                : firstLine(faq.content);
            return (
              <li key={faq.id} className={`ch-faq-row${open ? " is-open" : ""}`}>
                {open ? (
                  renderEditor(faq)
                ) : (
                  <div className="ch-faq-line">
                    <button
                      type="button"
                      className="ch-faq-main"
                      onClick={() => openEdit(faq)}
                    >
                      <span
                        className={`ch-tag${faq.entry_type === "qa" ? " is-accent" : ""}`}
                      >
                        {faq.entry_type === "qa" ? t("faq.tagQa") : t("faq.tagInfo")}
                      </span>
                      <span className="ch-faq-q">{title}</span>
                      <span className="ch-faq-a">
                        {faq.entry_type === "qa" ? firstLine(faq.content) : ""}
                      </span>
                    </button>
                    <span className="ch-row-actions">
                      <button
                        type="button"
                        className="ch-btn ch-btn-text h-7 px-2"
                        onClick={() => openEdit(faq)}
                      >
                        {t("common.edit")}
                      </button>
                      <button
                        type="button"
                        className="ch-btn ch-btn-text ch-btn-danger h-7 px-2"
                        disabled={deletingId === faq.id}
                        onClick={() => void handleDelete(faq.id)}
                      >
                        {t("common.delete")}
                      </button>
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
