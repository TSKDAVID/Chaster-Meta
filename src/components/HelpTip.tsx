"use client";

import type { ReactNode } from "react";
import { useI18nOptional } from "@/components/I18nProvider";
import { useHintsEnabled } from "@/components/HintsProvider";

type Props = {
  /** i18n key (e.g. hints.bookable) or literal tip text */
  tip: string;
  children: ReactNode;
  className?: string;
  side?: "top" | "bottom";
};

/** Hover/focus explanation. Hidden when hints are off in profile settings. */
export default function HelpTip({
  tip,
  children,
  className = "",
  side = "top",
}: Props) {
  const i18n = useI18nOptional();
  const enabled = useHintsEnabled();

  if (!enabled) return <>{children}</>;

  const text = tip.includes(".") ? (i18n?.t(tip) ?? tip) : tip;
  if (!text || text === tip && tip.startsWith("hints.")) {
    return <>{children}</>;
  }

  return (
    <span className={`ch-helptip ${className}`.trim()} data-side={side}>
      {children}
      <span className="ch-helptip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}
