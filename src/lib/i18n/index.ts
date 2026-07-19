export type Locale = "ru" | "en";

export const LOCALE_COOKIE = "look_locale";
export const DEFAULT_LOCALE: Locale = "ru";

type DeepString<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepString<T[K]>;
};

export type TranslationDict = DeepString<typeof import("./locales/ru").ru>;

export function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}
