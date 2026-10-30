import { useSyncExternalStore } from "react";
import { validateCatch, validateOrder } from "./validation";

export type Status = "disponible" | "réservé" | "épuisé";
export type OrderStatus = "envoyée" | "confirmée" | "prête" | "livrée";

export interface Fisher {
  id: string; name: string; boat: string; port: string; method: string;
  phone: string; email: string; bio: string; since: number;
}
export interface Catch {
  id: string; species: string; emoji: string; fisherId: string; zone: string;
  caughtAt: string; landedAt: string; qtyKg: number; priceKg: number;
  grade: string; method: string; storage: string; status: Status;
}
export interface Order {
  id: string; catchId: string; restaurant: string; contact: string; qtyKg: number;
  slot: string; mode: "livraison" | "retrait"; note: string; status: OrderStatus; createdAt: string;
}
interface State { fishers: Fisher[]; catches: Catch[]; orders: Order[] }

const h = (hoursAgo: number) => {
  const d = new Date(); d.setMinutes(0, 0, 0);
  return new Date(d.getTime() - hoursAgo * 3600e3).toISOString();
};

export const fishers: Fisher[] = [
  { id: "f1", name: "Tom Le Brocq", boat: "Sea Lark", port: "Gorey", method: "Casiers", phone: "+44 1534 000 101", email: "tom@exemple-demo.je", bio: "Troisième génération de pêcheurs à Gorey, spécialiste du homard et du tourteau sur la côte est.", since: 1998 },
  { id: "f2", name: "Marie Renouf", boat: "Belle Étoile", port: "St Helier", method: "Ligne", phone: "+44 1534 000 202", email: "marie@exemple-demo.je", bio: "Pêche à la ligne du bar et du lieu jaune, sorties courtes pour une fraîcheur maximale.", since: 2009 },
  { id: "f3", name: "James Falle", boat: "Écréhous Spirit", port: "St Aubin", method: "Plongée", phone: "+44 1534 000 303", email: "james@exemple-demo.je", bio: "Plongeur professionnel, récolte à la main des coquilles Saint-Jacques autour des Minquiers.", since: 2014 },
  { id: "f4", name: "Sophie Vibert", boat: "Rozel Dawn", port: "Rozel", method: "Filet maillant", phone: "+44 1534 000 404", email: "sophie@exemple-demo.je", bio: "Petite unité côtière, filets calés sélectifs pour sole, plie et raie.", since: 2011 },
];

const seed = (): State => ({
  fishers,
  catches: [
    { id: "c1", species: "Homard bleu", emoji: "🦞", fisherId: "f1", zone: "Côte est – Gorey", caughtAt: h(6), landedAt: h(4), qtyKg: 18, priceKg: 38, grade: "500–800 g", method: "Casiers", storage: "Vivant, 4–8 °C, humide, ne pas immerger en eau douce", status: "disponible" },
    { id: "c2", species: "Tourteau", emoji: "🦀", fisherId: "f1", zone: "Côte est – Gorey", caughtAt: h(7), landedAt: h(4), qtyKg: 35, priceKg: 9.5, grade: "Calibre 1", method: "Casiers", storage: "Vivant, 4–8 °C sous linge humide", status: "disponible" },
    { id: "c3", species: "Bar de ligne", emoji: "🐟", fisherId: "f2", zone: "Baie de St Aubin", caughtAt: h(5), landedAt: h(3), qtyKg: 12, priceKg: 26, grade: "Extra – 1,5–2 kg", method: "Ligne", storage: "Sur glace pilée 0–2 °C, vidé sous 24 h", status: "disponible" },
    { id: "c4", species: "Lieu jaune", emoji: "🐟", fisherId: "f2", zone: "Banc de la Frouquie", caughtAt: h(9), landedAt: h(6), qtyKg: 8, priceKg: 16, grade: "Extra", method: "Ligne", storage: "Sur glace pilée 0–2 °C", status: "réservé" },
    { id: "c5", species: "Coquille Saint-Jacques", emoji: "🐚", fisherId: "f3", zone: "Plateau des Minquiers", caughtAt: h(10), landedAt: h(7), qtyKg: 22, priceKg: 21, grade: "Plongée – > 11 cm", method: "Plongée", storage: "Vivantes, 2–6 °C, à plat, sous 48 h", status: "disponible" },
    { id: "c6", species: "Sole", emoji: "🐠", fisherId: "f4", zone: "Côte nord – Rozel", caughtAt: h(14), landedAt: h(11), qtyKg: 6, priceKg: 29, grade: "300–500 g", method: "Filet maillant", storage: "Sur glace 0–2 °C, entière", status: "disponible" },
    { id: "c7", species: "Raie bouclée", emoji: "🐟", fisherId: "f4", zone: "Côte nord – Rozel", caughtAt: h(26), landedAt: h(23), qtyKg: 0, priceKg: 12, grade: "Ailes", method: "Filet maillant", storage: "Sur glace 0–2 °C", status: "épuisé" },
  ],
  orders: [
    { id: "o1", catchId: "c4", restaurant: "Le Bistrot du Port (démo)", contact: "chef@bistrot-demo.je", qtyKg: 8, slot: h(-20), mode: "livraison", note: "Livrer en cuisine par l'arrière", status: "confirmée", createdAt: h(2) },
  ],
});

const KEY = "maree-jersey-v1";
let state: State = seed();
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { const raw = localStorage.getItem(KEY); if (raw) state = { ...JSON.parse(raw), fishers }; } catch { /* ignore */ }
}
function set(fn: (s: State) => State) {
  state = fn(state);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
const serverState = seed();
export function useStore() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => { load(); return state; },
    () => serverState,
  );
}

export const actions = {
  addCatch: (c: Omit<Catch, "id">) => {
    const error = validateCatch(c);
    if (error) throw new Error(error);
    set((s) => ({ ...s, catches: [{ ...c, id: "c" + Date.now() }, ...s.catches] }));
  },
  updateCatch: (id: string, p: Partial<Catch>) => set((s) => ({ ...s, catches: s.catches.map((c) => (c.id === id ? { ...c, ...p } : c)) })),
  addOrder: (o: Omit<Order, "id" | "status" | "createdAt">) => {
    let createdId = "";
    set((s) => {
      const selected = s.catches.find((c) => c.id === o.catchId);
      if (!selected || selected.status !== "disponible") throw new Error("Ce lot n'est plus disponible.");
      const reservedKg = s.orders
        .filter((order) => order.catchId === selected.id && order.status !== "livrée")
        .reduce((total, order) => total + order.qtyKg, 0);
      const availableKg = Math.max(0, selected.qtyKg - reservedKg);
      const error = validateOrder(o, availableKg);
      if (error) throw new Error(error);
      createdId = "o" + Date.now();
      return { ...s, orders: [{ ...o, id: createdId, status: "envoyée", createdAt: new Date().toISOString() }, ...s.orders] };
    });
    return createdId;
  },
  setOrderStatus: (id: string, status: OrderStatus) => set((s) => ({ ...s, orders: s.orders.map((o) => (o.id === id ? { ...o, status } : o)) })),
  reset: () => set(() => seed()),
};

export const gbp = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "GBP" }).format(n);
export const dt = (iso: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Jersey", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
export const ORDER_STEPS: OrderStatus[] = ["envoyée", "confirmée", "prête", "livrée"];