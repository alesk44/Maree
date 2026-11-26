export function buildProductInvoiceMailto(recipientEmail: string, subject: string, body: string): string {
  const email = recipientEmail.trim();
  if (!email || email.length > 254 || /[\r\n\0]/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Aucune adresse e-mail de facturation valide n'est renseignée pour l'autre compte.");
  }
  if (!subject.trim() || subject.length > 200 || /[\r\n\0]/.test(subject)) {
    throw new Error("Le sujet de la facture est invalide.");
  }
  if (body.length > 4000 || body.includes("\0")) {
    throw new Error("Le message de la facture est trop long.");
  }

  const query = new URLSearchParams({ subject: subject.trim(), body });
  const encodedEmail = encodeURIComponent(email).replace(/%40/gi, "@");
  return "mailto:" + encodedEmail + "?" + query.toString();
}
