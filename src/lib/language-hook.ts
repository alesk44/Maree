import { useCallback, useContext } from "react";
import { formatDate, formatPrice, translate } from "./i18n-core";
import { LanguageContext } from "./language-context";

export function useLanguage() {
  const { language, setLanguage } = useContext(LanguageContext);
  const t = useCallback((text: string, values?: Record<string, string | number>) => translate(text, language, values), [language]);
  const gbp = useCallback((value: number) => formatPrice(value, language), [language]);
  const dt = useCallback((iso: string) => formatDate(iso, language), [language]);

  return { language, setLanguage, t, gbp, dt };
}
