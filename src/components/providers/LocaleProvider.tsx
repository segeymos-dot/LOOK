"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  getNestedValue,
  type Locale,
} from "@/lib/i18n";
import { ru } from "@/lib/i18n/locales/ru";
import { en } from "@/lib/i18n/locales/en";

const dictionaries = { ru, en };

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const fromStorage = window.localStorage.getItem(LOCALE_COOKIE);
  if (fromStorage === "ru" || fromStorage === "en") return fromStorage;
  const match = document.cookie.match(new RegExp(`${LOCALE_COOKIE}=([^;]+)`));
  if (match?.[1] === "en" || match?.[1] === "ru") return match[1];
  return DEFAULT_LOCALE;
}

function persistLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000;SameSite=Lax`;
  window.localStorage.setItem(LOCALE_COOKIE, locale);
  document.documentElement.lang = locale;
}

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStoredLocale();
    setLocaleState(stored);
    document.documentElement.lang = stored;
    setReady(true);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = dictionaries[locale] as Record<string, unknown>;
      let value = getNestedValue(dict, key) ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return value;
    },
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  if (!ready) {
    return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
  }

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useTranslation must be used within LocaleProvider");
  }
  return ctx;
}
