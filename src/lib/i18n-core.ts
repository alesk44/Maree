import { translations } from "./translations";

export const LANGUAGES = ["fr", "en", "ro"] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "en";
export const LANGUAGE_KEY = "maree-jersey-language";
export const locales: Record<Language, string> = { fr: "fr-FR", en: "en-GB", ro: "ro-RO" };

export function resolveLanguage(value: string | null): Language {
  return LANGUAGES.find((language) => language === value) ?? DEFAULT_LANGUAGE;
}

export function translate(text: string, language: Language = DEFAULT_LANGUAGE, values?: Record<string, string | number>): string {
  const index = language === "en" ? 0 : 1;
  const result = language === "fr" ? text : translations[text]?.[index] ?? text;
  return result.replace(/\{(\w+)\}/g, (match, key: string) => String(values?.[key] ?? match));
}

export function formatPrice(value: number, language: Language = DEFAULT_LANGUAGE) {
  return new Intl.NumberFormat(locales[language], { style: "currency", currency: "GBP" }).format(value);
}

export function formatDate(iso: string, language: Language = DEFAULT_LANGUAGE) {
  return new Intl.DateTimeFormat(locales[language], { timeZone: "Europe/Jersey", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
