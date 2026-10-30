import { describe, expect, it } from "vitest";
import { validateCatch, validateOrder } from "./validation";

const now = new Date("2026-10-30T12:00:00.000Z").getTime();
const sampleCatch = { species: "Bar", zone: "St Aubin", qtyKg: 4, priceKg: 12.5, caughtAt: "2026-10-30T06:00:00.000Z", landedAt: "2026-10-30T09:00:00.000Z" };

describe("validateCatch", () => {
  it("accepts a valid catch", () => expect(validateCatch(sampleCatch, now)).toBeNull());
  it("rejects zero or negative stock", () => {
    expect(validateCatch({ ...sampleCatch, qtyKg: 0 }, now)).toMatch(/quantité/i);
    expect(validateCatch({ ...sampleCatch, qtyKg: -2 }, now)).toMatch(/quantité/i);
  });
  it("rejects invalid prices", () => {
    expect(validateCatch({ ...sampleCatch, priceKg: -1 }, now)).toMatch(/prix/i);
    expect(validateCatch({ ...sampleCatch, priceKg: Number.NaN }, now)).toMatch(/prix/i);
  });
  it("rejects capture after landing and future landing", () => {
    expect(validateCatch({ ...sampleCatch, caughtAt: "2026-10-30T10:00:00.000Z" }, now)).toMatch(/capture/i);
    expect(validateCatch({ ...sampleCatch, landedAt: "2026-10-30T13:00:00.000Z" }, now)).toMatch(/futur/i);
  });
});

describe("validateOrder", () => {
  const sampleOrder = { catchId: "c1", qtyKg: 1.5, slot: "2026-10-30T14:00:00.000Z" };
  it("accepts a future slot within stock", () => expect(validateOrder(sampleOrder, 2, now)).toBeNull());
  it("rejects quantities below minimum or outside half-kilo steps", () => {
    expect(validateOrder({ ...sampleOrder, qtyKg: 0.25 }, 2, now)).toMatch(/quantité/i);
    expect(validateOrder({ ...sampleOrder, qtyKg: 1.2 }, 2, now)).toMatch(/quantité/i);
  });
  it("rejects overselling", () => expect(validateOrder({ ...sampleOrder, qtyKg: 3 }, 2, now)).toMatch(/stock/i));
  it("rejects invalid or past slots", () => {
    expect(validateOrder({ ...sampleOrder, slot: "not-a-date" }, 2, now)).toMatch(/créneau/i);
    expect(validateOrder({ ...sampleOrder, slot: "2026-10-30T11:00:00.000Z" }, 2, now)).toMatch(/futur/i);
  });
});
