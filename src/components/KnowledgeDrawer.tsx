"use client";

import { useEffect, useState } from "react";
import DeskToolbar, { Segmented } from "@/components/DeskToolbar";
import FaqPanel, { type FaqAddRequest } from "@/components/FaqPanel";
import FaqSuggestionsPanel from "@/components/FaqSuggestionsPanel";
import { useI18n } from "@/components/I18nProvider";
import { IconSearch } from "@/components/icons";
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
  const { t } = useI18n();
  const tab = tabProp ?? initialTab;
  const [search, setSearch] = useState("");
  const [addRequest, setAddRequest] = useState<FaqAddRequest | null>(null);

  const tabs = [
    ["faq", t("faq.library")],
    ["suggestions", t("faq.suggestions")],
  ] as const;

  useEffect(() => {
    if (!open || !onClose) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function requestAdd(mode: "qa" | "info") {
    setAddRequest({ mode, token: Date.now() });
  }

  return (
    <div
      data-tour="knowledge-drawer"
      className="ch-page"
      aria-labelledby="knowledge-page-title"
    >
      <DeskToolbar
        title={t("faq.title")}
        titleId="knowledge-page-title"
        onBack={onClose}
        nav={
          <Segmented
            value={tab}
            options={tabs}
            onChange={(next) => onTabChange?.(next)}
            ariaLabel={t("faq.views")}
            tourIds={{ faq: "faq-tab", suggestions: "suggestions-tab" }}
          />
        }
        end={
          tab === "faq" ? (
            <>
              <label className="ch-search">
                <IconSearch size={13} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("common.search")}
                  aria-label={t("common.search")}
                />
              </label>
              <button
                type="button"
                onClick={() => requestAdd("info")}
                className="ch-btn ch-btn-ghost h-8 px-3"
              >
                {t("faq.generalInfo")}
              </button>
              <button
                type="button"
                onClick={() => requestAdd("qa")}
                className="ch-btn ch-btn-primary h-8 px-3"
              >
                {t("common.add")} {t("faq.qa")}
              </button>
            </>
          ) : null
        }
      />

      <div key={tab} className="ch-page-body">
        {tab === "faq" ? (
          <FaqPanel
            onError={onError}
            refreshKey={faqKey}
            search={search}
            addRequest={addRequest}
          />
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
