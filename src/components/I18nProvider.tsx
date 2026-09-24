"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  getMessages,
  translate,
  type Messages,
  type TranslateFn,
} from "@/lib/i18n";
import { normalizeLocale, type Locale } from "@/lib/i18n/locales";

type I18nContextValue = {
  locale: Locale;
  messages: Messages;
  t: TranslateFn;
  setLocale: (locale: Locale) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

type Props = {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  children: ReactNode;
};

export function I18nProvider({ locale, onLocaleChange, children }: Props) {
  const resolved = normalizeLocale(locale);
  const messages = useMemo(() => getMessages(resolved), [resolved]);

  const t = useCallback<TranslateFn>(
    (key, vars) => translate(resolved, key, vars),
    [resolved],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = resolved === "ka" ? "ka" : "en";
  }, [resolved]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale: resolved,
      messages,
      t,
      setLocale: onLocaleChange,
    }),
    [resolved, messages, t, onLocaleChange],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}

/** Safe for components that may render outside the provider during SSR. */
export function useI18nOptional(): I18nContextValue | null {
  return useContext(I18nContext);
}
