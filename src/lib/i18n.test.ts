import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE, LANGUAGES, formatDate, formatPrice, resolveLanguage, translate } from "./i18n";
import { translations } from "./translations";

describe("Marée internationalisation", () => {
  it("expose uniquement les trois langues annoncées", () => {
    expect(LANGUAGES).toEqual(["fr", "en", "ro"]);
    expect(DEFAULT_LANGUAGE).toBe("en");
    expect(resolveLanguage("fr")).toBe("fr");
    expect(resolveLanguage("en")).toBe("en");
    expect(resolveLanguage("ro")).toBe("ro");
    expect(resolveLanguage("pt")).toBe("en");
    expect(resolveLanguage(null)).toBe("en");
  });

  it("garde le français comme langue source et traduit en anglais et roumain", () => {
    expect(translate("Pêche du jour", "fr")).toBe("Pêche du jour");
    expect(translate("Pêche du jour", "en")).toBe("Today's catch");
    expect(translate("Pêche du jour", "ro")).toBe("Captura zilei");
  });

  it("remplace les variables dans les trois langues sans laisser de placeholder", () => {
    const source = "Quantité entre 0,5 et {max} kg.";
    for (const language of LANGUAGES) {
      expect(translate(source, language, { max: 12 })).not.toContain("{max}");
      expect(translate(source, language, { max: 12 })).toContain("12");
    }
  });

  it("ne laisse aucune entrée de dictionnaire incomplète", () => {
    for (const [key, values] of Object.entries(translations)) {
      expect(key.trim()).not.toBe("");
      expect(values).toHaveLength(3);
      expect(values.every((value) => value.trim().length > 0)).toBe(true);
    }
  });

  it("formate les prix et dates avec le locale choisi", () => {
    expect(formatPrice(12.5, "en")).toContain("12.50");
    expect(formatPrice(12.5, "ro")).toContain("12,50");
    expect(formatDate("2026-11-02T12:00:00.000Z", "fr")).toContain("nov.");
  });
});
