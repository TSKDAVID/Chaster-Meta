"use client";

import { useCallback, useEffect, useState } from "react";

type FaqEntry = {
  id: string;
  entry_type: "qa" | "info";
  question: string | null;
  content: string;
  created_at: string;
};

type Props = {
  onError: (message: string | null) => void;
  refreshKey?: number;
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function FaqPanel({ onError, refreshKey = 0 }: Props) {
  const [faqs, setFaqs] = useState<FaqEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mode, setMode] = useState<"qa" | "info">("qa");
  const [question, setQuestion] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(editingId);

  const loadFaqs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/faqs");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load FAQs");
      setFaqs(data.faqs ?? []);
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to load FAQs");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void loadFaqs();
  }, [loadFaqs, refreshKey]);

  useEffect(() => {
    if (!editorOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeEditor();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editorOpen]);

  function closeEditor() {
    setEditorOpen(false);
    setEditingId(null);
    setQuestion("");
    setContent("");
  }

  function openAdd(nextMode: "qa" | "info" = "qa") {
    setEditingId(null);
    setMode(nextMode);
    setQuestion("");
    setContent("");
    setEditorOpen(true);
  }

  function openEdit(faq: FaqEntry) {
    setEditingId(faq.id);
    setMode(faq.entry_type);
    setQuestion(faq.question ?? "");
    setContent(faq.content);
    setEditorOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    if (mode === "qa" && !question.trim()) return;

    setSaving(true);
    onError(null);
    try {
      const res = await fetch("/api/faqs", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId ?? undefined,
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
    if (!confirm("Delete this knowledge entry?")) return;
    try {
      const res = await fetch(`/api/faqs?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      await loadFaqs();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--chaster-ink)]">Knowledge library</h3>
          <p className="mt-0.5 text-xs text-[var(--chaster-muted)]">
            These entries are injected into AI replies. Keep them clear and factual.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {loading && <span className="self-center text-xs text-[var(--chaster-muted)]">Loading…</span>}
          <button
            type="button"
            onClick={() => openAdd("info")}
            className="rounded-lg border border-[var(--chaster-border)] bg-[var(--chaster-panel)] px-3 py-2 text-xs font-medium text-[var(--chaster-ink)] hover:bg-[var(--chaster-panel-soft)]"
          >
            + General info
          </button>
          <button
            type="button"
            onClick={() => openAdd("qa")}
            className="rounded-lg bg-[var(--chaster-accent)] px-3 py-2 text-xs font-medium text-[var(--chaster-on-accent)] hover:bg-[var(--chaster-accent-hover)]"
          >
            + Add Q&A
          </button>
        </div>
      </div>

      {faqs.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-[var(--chaster-border-strong)] bg-[var(--chaster-panel)] px-6 py-12 text-center">
          <p className="text-sm font-medium text-[var(--chaster-ink)]">No knowledge yet</p>
          <p className="mt-1 text-sm text-[var(--chaster-muted)]">
            Add a Q&A or general info note so the AI has something solid to use.
          </p>
          <button
            type="button"
            onClick={() => openAdd("qa")}
            className="mt-4 rounded-lg bg-[var(--chaster-accent)] px-4 py-2 text-sm font-medium text-[var(--chaster-on-accent)]"
          >
            Add first entry
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {faqs.map((faq) => (
            <li
              key={faq.id}
              className="rounded-2xl border border-[var(--chaster-border)] bg-[var(--chaster-panel)] p-4 shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
                      faq.entry_type === "qa"
                        ? "bg-[var(--chaster-panel-soft)] text-[var(--chaster-accent)]"
                        : "bg-[var(--chaster-panel-soft)] text-[var(--chaster-muted)]"
                    }`}
                  >
                    {faq.entry_type === "qa" ? "Q&A" : "Info"}
                  </span>
                  <span className="text-[11px] text-[var(--chaster-muted)]">
                    {formatDate(faq.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(faq)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-[var(--chaster-ink)] hover:bg-[var(--chaster-panel-soft)]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(faq.id)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-[var(--chaster-danger-text)] hover:bg-[var(--chaster-danger-bg)]"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {faq.entry_type === "qa" && faq.question ? (
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 text-[10px] font-semibold tracking-wide text-[var(--chaster-muted)] uppercase">
                      Question
                    </div>
                    <p className="text-[15px] leading-snug font-semibold text-[var(--chaster-ink)]">
                      {faq.question}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[var(--chaster-panel-soft)] px-3.5 py-3">
                    <div className="mb-1 text-[10px] font-semibold tracking-wide text-[var(--chaster-muted)] uppercase">
                      Answer
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--chaster-ink)]">
                      {faq.content}
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-1 text-[10px] font-semibold tracking-wide text-[var(--chaster-muted)] uppercase">
                    General info
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--chaster-ink)]">
                    {faq.content}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0"
            style={{ background: "rgba(20, 23, 28, 0.28)" }}
            aria-label="Close knowledge editor"
            onClick={closeEditor}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-knowledge-title"
            className="relative z-10 w-full max-w-lg overflow-hidden border bg-[var(--chaster-panel)] shadow-lg"
            style={{
              borderColor: "var(--chaster-border-strong)",
              borderRadius: "6px",
            }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--chaster-border)] px-5 py-4">
              <div>
                <h3 id="edit-knowledge-title" className="text-sm font-semibold text-[var(--chaster-ink)]">
                  {isEditing ? "Edit knowledge" : "Add knowledge"}
                </h3>
                <p className="text-xs text-[var(--chaster-muted)]">
                  Changes apply to AI auto-replies right away.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-lg border border-[var(--chaster-border)] px-2 py-1 text-xs text-[var(--chaster-muted)] hover:bg-[var(--chaster-panel-soft)]"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 p-5">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("qa")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    mode === "qa"
                      ? "bg-[var(--chaster-accent)] text-[var(--chaster-on-accent)]"
                      : "border border-[var(--chaster-border)] text-[var(--chaster-muted)] hover:bg-[var(--chaster-panel-soft)]"
                  }`}
                >
                  Question & answer
                </button>
                <button
                  type="button"
                  onClick={() => setMode("info")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    mode === "info"
                      ? "bg-[var(--chaster-accent)] text-[var(--chaster-on-accent)]"
                      : "border border-[var(--chaster-border)] text-[var(--chaster-muted)] hover:bg-[var(--chaster-panel-soft)]"
                  }`}
                >
                  General info
                </button>
              </div>

              {mode === "qa" && (
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-[var(--chaster-muted)]">Question</span>
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    autoFocus
                    placeholder="e.g. What happens if I break an item?"
                    className="w-full rounded-xl border border-[var(--chaster-border)] bg-[var(--chaster-panel-soft)] px-3 py-2.5 text-sm text-[var(--chaster-ink)] outline-none focus:border-[var(--chaster-accent)]"
                  />
                </label>
              )}

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[var(--chaster-muted)]">
                  {mode === "qa" ? "Answer" : "Info"}
                </span>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  autoFocus={mode === "info"}
                  rows={5}
                  placeholder={
                    mode === "qa"
                      ? "Write a clear answer the AI can reuse…"
                      : "Policies, tone notes, facts the AI should know…"
                  }
                  className="w-full resize-y rounded-xl border border-[var(--chaster-border)] bg-[var(--chaster-panel-soft)] px-3 py-2.5 text-sm leading-relaxed text-[var(--chaster-ink)] outline-none focus:border-[var(--chaster-accent)]"
                />
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="rounded-lg border border-[var(--chaster-border)] px-3 py-2 text-sm text-[var(--chaster-muted)] hover:bg-[var(--chaster-panel-soft)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    saving ||
                    !content.trim() ||
                    (mode === "qa" && !question.trim())
                  }
                  className="rounded-lg bg-[var(--chaster-accent)] px-4 py-2 text-sm font-medium text-[var(--chaster-on-accent)] disabled:opacity-40"
                >
                  {saving ? "Saving…" : isEditing ? "Save changes" : "Save entry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
