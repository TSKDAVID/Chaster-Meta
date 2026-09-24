"use client";

import { useEffect } from "react";
import FaqPanel from "@/components/FaqPanel";
import FaqSuggestionsPanel from "@/components/FaqSuggestionsPanel";
import { IconBack, IconBook, IconLamp } from "@/components/icons";
import type { KnowledgeDeskTab } from "@/lib/desk-routes";

type Props = {
  open: boolean;
  onClose?: () => void;
  onError: (message: string | null) => void;
  suggestionsKey: number;
  faqKey: number;
  onApproved: () => void;
  tab?: KnowledgeDeskTab;
  onTabChange?: (tab: KnowledgeDeskTab) => void;
  /** @deprecated use tab */
  initialTab?: KnowledgeDeskTab;
};

export default function KnowledgeDrawer({
  open,
  onClose,
  onError,
  suggestionsKey,
  faqKey,
  onApproved,
  tab: tabProp,
  onTabChange,
  initialTab = "faq",
}: Props) {
  const tab = tabProp ?? initialTab;

  useEffect(() => {
    if (!open || !onClose) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function go(next: KnowledgeDeskTab) {
    onTabChange?.(next);
  }

  return (
    <div
      data-tour="knowledge-drawer"
      className="ch-desk-page-panel flex h-full min-h-0 w-full flex-col overflow-hidden"
      aria-labelledby="knowledge-page-title"
    >
      <div className="ch-page-head">
        <div className="ch-page-head-start min-w-0">
          <h2
            id="knowledge-page-title"
            className="ch-headline text-[16px] font-semibold tracking-[-0.04em]"
            style={{ color: "var(--chaster-ink)" }}
          >
            FAQs & answers
          </h2>
          <p
            className="mt-0.5 text-[12px]"
            style={{
              color: "var(--chaster-muted)",
              fontFamily: "var(--font-body), ui-sans-serif, system-ui, sans-serif",
            }}
          >
            What the AI should know when it replies
          </p>
        </div>
        <nav className="ch-subnav" aria-label="FAQ views">
          <button
            type="button"
            data-tour="faq-tab"
            onClick={() => go("faq")}
            className={`ch-subnav-tab${tab === "faq" ? " is-active" : ""}`}
            aria-current={tab === "faq" ? "page" : undefined}
          >
            <IconBook size={13} />
            Library
          </button>
          <button
            type="button"
            data-tour="suggestions-tab"
            onClick={() => go("suggestions")}
            className={`ch-subnav-tab${tab === "suggestions" ? " is-active" : ""}`}
            aria-current={tab === "suggestions" ? "page" : undefined}
          >
            <IconLamp size={13} />
            Suggestions
          </button>
        </nav>
        <div className="ch-page-head-end">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="ch-btn ch-btn-ghost ch-desk-back h-8 shrink-0 gap-1.5 px-2"
              aria-label="Back to inbox"
            >
              <IconBack size={14} />
              <span className="text-[12px]">Inbox</span>
            </button>
          ) : null}
        </div>
      </div>

      <div
        key={tab}
        className="ch-subpage min-h-0 flex-1 overflow-y-auto p-4 sm:p-5"
        style={{ background: "var(--chaster-panel)" }}
      >
        {tab === "faq" ? (
          <FaqPanel onError={onError} refreshKey={faqKey} />
        ) : (
          <FaqSuggestionsPanel
            onError={onError}
            refreshKey={suggestionsKey}
            onApproved={onApproved}
          />
        )}
      </div>
    </div>
  );
}
