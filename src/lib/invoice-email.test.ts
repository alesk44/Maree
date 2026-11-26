import { describe, expect, it } from "vitest";
import { buildProductInvoiceMailto } from "@/lib/invoice-email";

describe("buildProductInvoiceMailto", () => {
  it("creates an encoded draft for the account email", () => {
    const href = buildProductInvoiceMailto(" billing+orders@example.test ", "Facture — commande A1B2", "Bonjour\nVoici la commande.");
    const queryStart = href.indexOf("?");
    const address = href.slice("mailto:".length, queryStart);
    const params = new URLSearchParams(href.slice(queryStart + 1));

    expect(decodeURIComponent(address)).toBe("billing+orders@example.test");
    expect(params.get("subject")).toBe("Facture — commande A1B2");
    expect(params.get("body")).toBe("Bonjour\nVoici la commande.");
  });

  it("rejects invalid recipient addresses and header injection", () => {
    expect(() => buildProductInvoiceMailto("not-an-email", "Facture", "Bonjour")).toThrow(/adresse e-mail/);
    expect(() => buildProductInvoiceMailto("billing@example.test", "Facture\nBcc:other@example.test", "Bonjour")).toThrow(/sujet/);
  });
});
