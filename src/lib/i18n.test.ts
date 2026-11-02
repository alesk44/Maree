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
      expect(values).toHaveLength(2);
      expect(values.every((value) => value.trim().length > 0)).toBe(true);
    }
  });

  it("traduit les parcours d’annulation dans les trois langues sans repli en français", () => {
    const cancellationKeys = [
      "Demander l’annulation",
      "Annulation gratuite possible jusqu’à 24 h avant le créneau.",
      "Demande d’annulation tardive",
      "Accepter et fixer la pénalité",
      "Accepter la pénalité et annuler",
      "Refuser, garder la commande",
      "Pénalité acceptée",
      "Annulation tardive refusée. La commande reste active.",
    ];
    for (const key of cancellationKeys) {
      expect(translations[key], key).toBeDefined();
      expect(translate(key, "en"), key).not.toBe(key);
      expect(translate(key, "ro"), key).not.toBe(key);
    }
  });

  it("traduit les principales rubriques de la page légale en anglais et en roumain", () => {
    const legalKeys = [
      "Informations légales",
      "1. Éditeur et responsable du projet",
      "2. Rôle de la plateforme",
      "3. Tarifs, livraison et facturation",
      "4. GST — Jersey",
      "5. Sécurité alimentaire et traçabilité",
      "6. Données personnelles et confidentialité",
      "7. Conditions contractuelles et réclamations",
      "8. Cookies et technologies",
      "9. Documents à finaliser avant ouverture",
      "Références :",
      "Contacter le responsable",
    ];
    for (const key of legalKeys) {
      expect(translations[key], key).toBeDefined();
      expect(translate(key, "en"), key).not.toBe(key);
      expect(translate(key, "ro"), key).not.toBe(key);
    }
  });

  it("formate les prix et dates avec le locale choisi", () => {
    expect(formatPrice(12.5, "en")).toContain("12.50");
    expect(formatPrice(12.5, "ro")).toContain("12,50");
    expect(formatDate("2026-11-02T12:00:00.000Z", "fr")).toContain("nov.");
  });
});
