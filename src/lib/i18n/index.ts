import { en, type Messages } from "@/lib/i18n/en";
import { ka } from "@/lib/i18n/ka";
import { normalizeLocale, type Locale } from "@/lib/i18n/locales";

export type { Messages };
export type { Locale };
export { LOCALES, LOCALE_LABELS, LOCALE_SHORT, isLocale, normalizeLocale } from "@/lib/i18n/locales";

const catalogs: Record<Locale, Messages> = { en, ka };

export type MessageKey = string;

type Vars = Record<string, string | number | null | undefined>;

function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function getMessages(locale: Locale): Messages {
  return catalogs[normalizeLocale(locale)];
}

/** Interpolate `{name}` placeholders. */
export function formatMessage(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

export function translate(
  locale: Locale,
  key: string,
  vars?: Vars,
): string {
  const messages = getMessages(locale);
  const raw = getByPath(messages, key);
  if (typeof raw === "string") return formatMessage(raw, vars);
  const fallback = getByPath(en, key);
  if (typeof fallback === "string") return formatMessage(fallback, vars);
  return key;
}

export type TranslateFn = (key: string, vars?: Vars) => string;
