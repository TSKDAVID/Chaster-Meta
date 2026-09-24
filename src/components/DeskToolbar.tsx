"use client";

import type { ReactNode } from "react";
import { IconBack, IconCheck } from "@/components/icons";
import { useI18n } from "@/components/I18nProvider";
import { formatAgo } from "@/lib/format-time";

type Props = {
  title: string;
  titleId?: string;
  /** Segmented switch rendered right after the title. */
  nav?: ReactNode;
  /** Right-aligned controls. */
  end?: ReactNode;
  /** Mobile-only back to inbox. */
  onBack?: () => void;
};

/** One 44px row: title · switch · controls. No subtitles. */
export default function DeskToolbar({ title, titleId, nav, end, onBack }: Props) {
  const { t } = useI18n();
  return (
    <div className="ch-toolbar">
      <h2 id={titleId} className="ch-toolbar-title">
        {title}
      </h2>
      {nav ? <div className="ch-toolbar-nav">{nav}</div> : null}
      <div className="ch-toolbar-end">
        {end}
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="ch-btn ch-btn-ghost ch-desk-back h-8 px-2"
            aria-label={t("common.backToInbox")}
          >
            <IconBack size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

type SegmentedProps<T extends string> = {
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (next: T) => void;
  ariaLabel: string;
  tourIds?: Partial<Record<T, string>>;
};

/** Flat segmented switch: text + accent underline, no pill. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  tourIds,
}: SegmentedProps<T>) {
  return (
    <nav className="ch-seg" aria-label={ariaLabel}>
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          data-tour={tourIds?.[id]}
          onClick={() => onChange(id)}
          className={`ch-seg-tab${value === id ? " is-active" : ""}`}
          aria-current={value === id ? "page" : undefined}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

type SaveStatusProps = {
  dirty: boolean;
  saving: boolean;
  savedAt: number | null;
  onSave: () => void;
  disabled?: boolean;
  label?: string;
};

/** Primary Save when dirty; otherwise muted "Saved · just now". Never a disabled button. */
export function SaveStatus({
  dirty,
  saving,
  savedAt,
  onSave,
  disabled,
  label,
}: SaveStatusProps) {
  const { t } = useI18n();
  const saveLabel = label ?? t("common.save");
  if (dirty || saving) {
    return (
      <button
        type="button"
        onClick={onSave}
        disabled={saving || disabled}
        className="ch-btn ch-btn-primary h-8 px-3"
      >
        {saving ? t("common.saving") : saveLabel}
      </button>
    );
  }
  if (savedAt) {
    return (
      <span className="ch-saved" role="status">
        <IconCheck size={12} />
        {t("common.saved", {
          when: formatAgo(savedAt, {
            justNow: t("common.justNow"),
            minAgo: (n) => t("common.minAgo", { n }),
          }),
        })}
      </span>
    );
  }
  return null;
}
