import { createContext } from "react";
import { DEFAULT_LANGUAGE, type Language } from "./i18n-core";

export type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
};

export const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
});
