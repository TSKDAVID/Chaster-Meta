export const LOCALES = ["en", "ka"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ka: "ქართული",
};

export const LOCALE_SHORT: Record<Locale, string> = {
  en: "EN",
  ka: "ქარ",
};

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ka";
}

export function normalizeLocale(value: unknown): Locale {
  return isLocale(value) ? value : "en";
}
