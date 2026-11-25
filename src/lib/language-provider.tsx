import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LANGUAGE, LANGUAGE_KEY, resolveLanguage } from "./i18n-core";
import { LanguageContext } from "./language-context";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);

  useEffect(() => {
    try {
      setLanguage(resolveLanguage(localStorage.getItem(LANGUAGE_KEY)));
    } catch {
      /* storage is optional */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const changeLanguage = useCallback((next: typeof language) => {
    setLanguage(next);
    try {
      localStorage.setItem(LANGUAGE_KEY, next);
    } catch {
      /* storage is optional */
    }
  }, []);

  const value = useMemo(() => ({ language, setLanguage: changeLanguage }), [language, changeLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
