import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { translations } from "./translations";

export const LANGUAGES = ["en", "fr", "pt", "ro"] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "en";
export const LANGUAGE_KEY = "maree-jersey-language";
export const locales: Record<Language, string> = { en: "en-GB", fr: "fr-FR", pt: "pt-PT", ro: "ro-RO" };
export function resolveLanguage(value: string | null): Language {
  return LANGUAGES.find((language) => language === value) ?? DEFAULT_LANGUAGE;
}
export function translate(text: string, language: Language = DEFAULT_LANGUAGE, values?: Record<string, string | number>): string {
  const index = language === "en" ? 0 : language === "pt" ? 1 : 2;
  const result = language === "fr" ? text : translations[text]?.[index] ?? text;
  return result.replace(/\{(\w+)\}/g, (match, key: string) => String(values?.[key] ?? match));
}
export function formatPrice(value: number, language: Language = DEFAULT_LANGUAGE) {
  return new Intl.NumberFormat(locales[language], { style: "currency", currency: "GBP" }).format(value);
}
export function formatDate(iso: string, language: Language = DEFAULT_LANGUAGE) {
  return new Intl.DateTimeFormat(locales[language], { timeZone: "Europe/Jersey", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
const LanguageContext = createContext({ language: DEFAULT_LANGUAGE, setLanguage: (_language: Language) => {} });
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE);
  useEffect(() => {
    try { setLanguage(resolveLanguage(localStorage.getItem(LANGUAGE_KEY))); } catch { /* storage is optional */ }
  }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const changeLanguage = (next: Language) => {
    setLanguage(next);
    try { localStorage.setItem(LANGUAGE_KEY, next); } catch { /* storage is optional */ }
  };
  return <LanguageContext.Provider value={{ language, setLanguage: changeLanguage }}>{children}</LanguageContext.Provider>;
}
export function useLanguage() {
  const context = useContext(LanguageContext);
  return {
    ...context,
    t: (text: string, values?: Record<string, string | number>) => translate(text, context.language, values),
    gbp: (value: number) => formatPrice(value, context.language),
    dt: (iso: string) => formatDate(iso, context.language),
  };
}