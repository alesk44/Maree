import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Catch, Fisher, Order, OrderStatus, Status } from "@/lib/store";

type ProfileRow = {
  id: string;
  role: "restaurant" | "fisher" | "admin";
  display_name: string;
  boat_name: string | null;
  home_port: string | null;
  fishing_method: string | null;
  bio: string | null;
  since_year: number | null;
};

type CatchRow = {
  id: string;
  fisher_id: string;
  species: string;
  zone: string;
  caught_at: string;
  landed_at: string;
  quantity_kg: number | string;
  remaining_kg: number | string;
  price_per_kg: number | string;
  grade: string | null;
  method: string;
  storage_instructions: string;
  status: "available" | "reserved" | "sold_out";
};

type OrderRow = {
  id: string;
  catch_id: string;
  restaurant_id: string;
  quantity_kg: number | string;
  requested_slot: string;
  fulfilment: "delivery" | "collection";
  note: string | null;
  status: "submitted" | "confirmed" | "ready" | "delivered" | "cancelled";
  created_at: string;
};

const emojiFor = (method: string) =>
  ({ Casiers: "🦀", Ligne: "🐟", Plongée: "🐚", "Filet maillant": "🐠" })[method] ?? "🐟";

const statusFromDb: Record<CatchRow["status"], Status> = {
  available: "disponible",
  reserved: "réservé",
  sold_out: "épuisé",
};
const orderStatusFromDb: Record<OrderRow["status"], OrderStatus> = {
  submitted: "envoyée",
  confirmed: "confirmée",
  ready: "prête",
  delivered: "livrée",
  cancelled: "envoyée",
};

function mapFisher(row: ProfileRow): Fisher {
  return {
    id: row.id,
    name: row.display_name,
    boat: row.boat_name ?? "",
    port: row.home_port ?? "",
    method: row.fishing_method ?? "",
    phone: "",
    email: "",
    bio: row.bio ?? "",
    since: row.since_year ?? new Date().getFullYear(),
  };
}

function mapCatch(row: CatchRow): Catch {
  return {
    id: row.id,
    species: row.species,
    emoji: emojiFor(row.method),
    fisherId: row.fisher_id,
    zone: row.zone,
    caughtAt: row.caught_at,
    landedAt: row.landed_at,
    qtyKg: Number(row.remaining_kg),
    priceKg: Number(row.price_per_kg),
    grade: row.grade ?? "",
    method: row.method,
    storage: row.storage_instructions,
    status: statusFromDb[row.status],
  };
}

function mapOrder(row: OrderRow, restaurantName: string): Order {
  return {
    id: row.id,
    catchId: row.catch_id,
    restaurant: restaurantName,
    contact: "",
    qtyKg: Number(row.quantity_kg),
    slot: row.requested_slot,
    mode: row.fulfilment === "delivery" ? "livraison" : "retrait",
    note: row.note ?? "",
    status: orderStatusFromDb[row.status],
    createdAt: row.created_at,
  };
}

export type SharedStore = {
  fishers: Fisher[];
  catches: Catch[];
  orders: Order[];
  user: User | null;
  role: ProfileRow["role"] | null;
};

export async function loadSharedStore(): Promise<SharedStore> {
  const [{ data: authData, error: authError }, { data: profileRows, error: profilesError }, { data: catchRows, error: catchesError }] =
    await Promise.all([
      supabase.auth.getUser(),
      supabase.from("profiles").select("id,role,display_name,boat_name,home_port,fishing_method,bio,since_year").eq("role", "fisher"),
      supabase.from("catches").select("id,fisher_id,species,zone,caught_at,landed_at,quantity_kg,remaining_kg,price_per_kg,grade,method,storage_instructions,status").order("landed_at", { ascending: false }),
    ]);

  if (authError) throw authError;
  if (profilesError) throw profilesError;
  if (catchesError) throw catchesError;

  const user = authData.user;
  const profile = user
    ? (await supabase.from("profiles").select("id,role,display_name,boat_name,home_port,fishing_method,bio,since_year").eq("id", user.id).maybeSingle()).data as ProfileRow | null
    : null;

  const fisherIds = [...new Set((catchRows ?? []).map((row) => row.fisher_id))];
  const fisherProfiles = (profileRows ?? []) as ProfileRow[];
  const fisherById = new Map(fisherProfiles.map((row) => [row.id, mapFisher(row)]));
  const catches = ((catchRows ?? []) as CatchRow[]).map(mapCatch);

  let orderRows: OrderRow[] = [];
  let restaurantNames = new Map<string, string>();
  if (user) {
    const { data, error } = await supabase
      .from("orders")
      .select("id,catch_id,restaurant_id,quantity_kg,requested_slot,fulfilment,note,status,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    orderRows = (data ?? []) as OrderRow[];
    const restaurantIds = [...new Set(orderRows.map((row) => row.restaurant_id))];
    if (restaurantIds.length) {
      const { data: restaurants, error: restaurantError } = await supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", restaurantIds);
      if (restaurantError) throw restaurantError;
      restaurantNames = new Map((restaurants ?? []).map((row) => [row.id, row.display_name]));
    }
  }

  return {
    fishers: fisherIds.map((id) => fisherById.get(id)).filter((row): row is Fisher => Boolean(row)),
    catches,
    orders: orderRows.map((row) => mapOrder(row, restaurantNames.get(row.restaurant_id) ?? "Restaurant")),
    user,
    role: profile?.role ?? null,
  };
}

export async function publishCatch(input: Omit<Catch, "id">): Promise<string> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const user = authData.user;
  if (!user) throw new Error("Connectez-vous pour publier une prise.");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profileError) throw profileError;
  if (profile.role !== "fisher") throw new Error("Votre compte doit être vérifié comme pêcheur.");

  const { data, error } = await supabase.from("catches").insert({
    fisher_id: user.id,
    species: input.species.trim(),
    zone: input.zone.trim(),
    caught_at: input.caughtAt,
    landed_at: input.landedAt,
    quantity_kg: input.qtyKg,
    remaining_kg: input.qtyKg,
    price_per_kg: input.priceKg,
    grade: input.grade || null,
    method: input.method,
    storage_instructions: input.storage,
    status: "available",
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function updateCatch(id: string, patch: Partial<Pick<Catch, "qtyKg" | "priceKg" | "status">>): Promise<void> {
  const values: Record<string, unknown> = {};
  if (patch.qtyKg !== undefined) {
    values.quantity_kg = patch.qtyKg;
    values.remaining_kg = patch.qtyKg;
    values.status = patch.qtyKg === 0 ? "sold_out" : "available";
  }
  if (patch.priceKg !== undefined) values.price_per_kg = patch.priceKg;
  if (patch.status !== undefined) {
    values.status = ({ disponible: "available", réservé: "reserved", épuisé: "sold_out" } as const)[patch.status];
    if (patch.status === "épuisé") values.remaining_kg = 0;
  }
  const { error } = await supabase.from("catches").update(values).eq("id", id);
  if (error) throw error;
}

export async function reserveCatch(input: {
  catchId: string;
  qtyKg: number;
  slot: string;
  mode: "livraison" | "retrait";
  note: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("reserve_catch", {
    p_catch_id: input.catchId,
    p_quantity_kg: input.qtyKg,
    p_requested_slot: input.slot,
    p_fulfilment: input.mode === "livraison" ? "delivery" : "collection",
    p_note: input.note || null,
  });
  if (error) throw error;
  return data as string;
}

export async function advanceOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const dbStatus = ({ confirmée: "confirmed", prête: "ready", livrée: "delivered" } as const)[status as "confirmée" | "prête" | "livrée"];
  if (!dbStatus) throw new Error("Statut de commande non autorisé.");
  const { error } = await supabase.rpc("update_order_status", { p_order_id: id, p_status: dbStatus });
  if (error) throw error;
}
