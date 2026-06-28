import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  getNestedValue,
  type Locale,
} from "@/lib/i18n";
import { en } from "@/lib/i18n/locales/en";
import { ru } from "@/lib/i18n/locales/ru";

const dictionaries = { ru, en };

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const value = cookieStore.get(LOCALE_COOKIE)?.value;
  if (value === "en" || value === "ru") return value;
  return DEFAULT_LOCALE;
}

export async function getServerTranslation() {
  const locale = await getServerLocale();
  const dict = dictionaries[locale] as Record<string, unknown>;
  const fallback = dictionaries.ru as Record<string, unknown>;

  const t = (key: string, vars?: Record<string, string | number>) => {
    let value =
      getNestedValue(dict, key) ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return value;
  };

  return { t, locale };
}
