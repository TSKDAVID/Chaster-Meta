"use client";

import { useMemo } from "react";
import { useI18nOptional } from "@/components/I18nProvider";
import { formatHm } from "@/lib/format-time";

type Props = {
  /** "HH:MM" or "" when `allowEmpty`. */
  value: string;
  onChange: (next: string) => void;
  /** Minutes between options. Default 15. */
  step?: number;
  hour12?: boolean;
  disabled?: boolean;
  /** Adds a leading option whose value is "". */
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
  "aria-label"?: string;
  id?: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** 15-minute step wall-clock picker styled like every other field. */
export default function TimeSelect({
  value,
  onChange,
  step = 15,
  hour12 = false,
  disabled,
  allowEmpty,
  emptyLabel,
  className,
  id,
  ...rest
}: Props) {
  const i18n = useI18nOptional();
  const resolvedEmpty =
    emptyLabel ?? i18n?.t("time.storeHours") ?? "Store hours";

  const options = useMemo(() => {
    const out: string[] = [];
    for (let t = 0; t < 24 * 60; t += step) {
      out.push(`${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`);
    }
    return out;
  }, [step]);

  // Keep an off-grid stored value selectable instead of silently snapping it.
  const list =
    value && !options.includes(value)
      ? [...options, value].sort()
      : options;

  return (
    <select
      id={id}
      className={`ch-input ch-time-select tabular-nums${className ? ` ${className}` : ""}`}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label={rest["aria-label"]}
    >
      {allowEmpty ? <option value="">{resolvedEmpty}</option> : null}
      {list.map((hm) => (
        <option key={hm} value={hm}>
          {formatHm(hm, { hour12 })}
        </option>
      ))}
    </select>
  );
}
