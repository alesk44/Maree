export type CatchInput = {
  species: string;
  zone: string;
  qtyKg: number;
  priceKg: number;
  caughtAt: string;
  landedAt: string;
};

export type OrderInput = {
  catchId: string;
  qtyKg: number;
  slot: string;
};

export function isValidDate(value: string): boolean {
  return Number.isFinite(new Date(value).getTime());
}

export function validateCatch(input: CatchInput, now = Date.now()): string | null {
  if (!input.species.trim() || !input.zone.trim()) return "L'espèce et la zone sont obligatoires.";
  if (!Number.isFinite(input.qtyKg) || input.qtyKg <= 0) return "La quantité doit être supérieure à 0 kg.";
  if (!Number.isFinite(input.priceKg) || input.priceKg < 0) return "Le prix doit être un nombre positif ou nul.";
  if (!isValidDate(input.caughtAt) || !isValidDate(input.landedAt)) return "Les dates de capture et de débarquement sont invalides.";
  const caught = new Date(input.caughtAt).getTime();
  const landed = new Date(input.landedAt).getTime();
  if (caught > landed) return "La capture ne peut pas avoir lieu après le débarquement.";
  if (landed > now) return "Le débarquement ne peut pas être dans le futur.";
  return null;
}

export function validateOrder(input: OrderInput, availableKg: number, now = Date.now()): string | null {
  if (!input.catchId.trim()) return "Choisissez un lot disponible.";
  if (!Number.isFinite(input.qtyKg) || input.qtyKg < 0.5 || Math.round(input.qtyKg * 2) !== input.qtyKg * 2) {
    return "La quantité doit être au minimum de 0,5 kg, par pas de 0,5 kg.";
  }
  if (!Number.isFinite(availableKg) || availableKg < 0 || input.qtyKg > availableKg) return "La quantité demandée dépasse le stock disponible.";
  if (!isValidDate(input.slot)) return "Le créneau choisi est invalide.";
  if (new Date(input.slot).getTime() <= now) return "Le créneau doit être dans le futur.";
  return null;
}
