"use client";

import { useCallback, useEffect, useState } from "react";

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
  onError: (message: string | null) => void;
  onApproved?: () => void;
  refreshKey?: number;
};

export default function FaqSuggestionsPanel({
  onError,
  onApproved,
  refreshKey = 0,
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/faq-suggestions?status=pending");
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
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

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
        onError("Add content before approving.");
        return;
      }
      if (draft.entry_type === "qa" && !draft.question.trim()) {
        onError("Add a question before approving this Q&A.");
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
    <section
      className="border p-4"
      style={{
        background: "var(--chaster-panel)",
        borderColor: "var(--chaster-border)",
        borderRadius: "var(--chaster-radius)",
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-[-0.02em]">
            FAQ suggestions
          </h2>
          <p
            className="text-xs"
            style={{
              color: "var(--chaster-muted)",
              fontFamily: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
            }}
          >
            Edit the draft, then approve into your library — or reject it.
          </p>
        </div>
        {loading && (
          <span className="text-xs" style={{ color: "var(--chaster-muted)" }}>
            Loading…
          </span>
        )}
      </div>

      {suggestions.length === 0 ? (
        <p
          className="text-sm"
          style={{
            color: "var(--chaster-muted)",
            fontFamily: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
          }}
        >
          No pending suggestions. End a chat to generate some.
        </p>
      ) : (
        <ul className="max-h-[28rem] space-y-3 overflow-y-auto">
          {suggestions.map((s) => {
            const draft = drafts[s.id] ?? {
              question: s.question ?? "",
              content: s.content ?? "",
              entry_type: s.entry_type,
            };
            return (
              <li
                key={s.id}
                className="border px-3 py-3"
                style={{
                  borderColor: "var(--chaster-border)",
                  borderRadius: "var(--chaster-radius)",
                }}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className="px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase"
                    style={{ color: "var(--chaster-warn-text)" }}
                  >
                    Pending
                  </span>
                  <span className="font-mono text-[11px]" style={{ color: "var(--chaster-muted)" }}>
                    peer {s.peer_id}
                  </span>
                </div>

                <p
                  className="mb-3 text-xs leading-relaxed"
                  style={{
                    color: "var(--chaster-muted)",
                    fontFamily: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
                  }}
                >
                  <span className="font-medium" style={{ color: "var(--chaster-ink)" }}>
                    Chat summary ·{" "}
                  </span>
                  {s.chat_summary}
                </p>

                <div className="mb-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateDraft(s.id, { entry_type: "qa" })}
                    className="ch-btn h-7 px-2.5 text-[11px]"
                    style={
                      draft.entry_type === "qa"
                        ? {
                            background: "var(--chaster-accent)",
                            color: "var(--chaster-on-accent)",
                            border: "1px solid transparent",
                          }
                        : {
                            background: "transparent",
                            color: "var(--chaster-muted)",
                            border: "1px solid var(--chaster-border)",
                          }
                    }
                  >
                    Q&A
                  </button>
                  <button
                    type="button"
                    onClick={() => updateDraft(s.id, { entry_type: "info" })}
                    className="ch-btn h-7 px-2.5 text-[11px]"
                    style={
                      draft.entry_type === "info"
                        ? {
                            background: "var(--chaster-accent)",
                            color: "var(--chaster-on-accent)",
                            border: "1px solid transparent",
                          }
                        : {
                            background: "transparent",
                            color: "var(--chaster-muted)",
                            border: "1px solid var(--chaster-border)",
                          }
                    }
                  >
                    Info
                  </button>
                </div>

                {draft.entry_type === "qa" && (
                  <label className="mb-2 block space-y-1">
                    <span className="text-[11px]" style={{ color: "var(--chaster-muted)" }}>
                      Question
                    </span>
                    <input
                      value={draft.question}
                      onChange={(e) => updateDraft(s.id, { question: e.target.value })}
                      className="ch-input w-full px-2.5 py-2 text-[13px]"
                      placeholder="Suggested question…"
                    />
                  </label>
                )}

                <label className="block space-y-1">
                  <span className="text-[11px]" style={{ color: "var(--chaster-muted)" }}>
                    {draft.entry_type === "qa" ? "Answer" : "Info"}
                  </span>
                  <textarea
                    value={draft.content}
                    onChange={(e) => updateDraft(s.id, { content: e.target.value })}
                    rows={4}
                    className="ch-input ch-msg-body w-full resize-y px-2.5 py-2 text-[13px] leading-relaxed"
                    placeholder="Suggested content…"
                  />
                </label>

                {s.overlap_note && (
                  <p
                    className="mt-1.5 text-xs"
                    style={{ color: "var(--chaster-success-text)" }}
                  >
                    Why new: {s.overlap_note}
                  </p>
                )}

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => void review(s.id, "approve")}
                    className="ch-btn ch-btn-primary h-8 px-3 text-[12px]"
                  >
                    {busyId === s.id ? "…" : "Approve edited → FAQ"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => void review(s.id, "reject")}
                    className="ch-btn ch-btn-ghost h-8 px-3 text-[12px]"
                  >
                    Reject
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
