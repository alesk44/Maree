import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Catch, Fisher } from "@/lib/store";

type FisherRow = { id:string; display_name:string; boat_name:string|null; home_port:string|null; fishing_method:string|null; bio:string|null; since_year:number|null };
type CatchRow = { id:string; fisher_id:string; species:string; zone:string; caught_at:string; landed_at:string; remaining_kg:number|string; price_per_kg:number|string; grade:string|null; method:string; storage_instructions:string; status:"available"|"reserved"|"sold_out" };
const emoji = (method:string) => ({ Casiers:"🦀", Ligne:"🐟", Plongée:"🐚", "Filet maillant":"🐠" } as Record<string,string>)[method] ?? "🐟";

export type MarketData = { catches:Catch[]; fishers:Fisher[]; loading:boolean; error:string|null; refresh:()=>Promise<void> };

export function useSharedMarket():MarketData {
  const [catches,setCatches]=useState<Catch[]>([]);
  const [fishers,setFishers]=useState<Fisher[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const refresh=useCallback(async()=>{
    setLoading(true);
    try {
      const [{data:lots,error:lotsError},{data:people,error:peopleError}]=await Promise.all([
        supabase.from("catches").select("id,fisher_id,species,zone,caught_at,landed_at,remaining_kg,price_per_kg,grade,method,storage_instructions,status").order("landed_at",{ascending:false}),
        supabase.from("public_fisher_directory").select("id,display_name,boat_name,home_port,fishing_method,bio,since_year")
      ]);
      if(lotsError) throw lotsError;
      if(peopleError) throw peopleError;
      const fisherRows=(people??[]) as FisherRow[];
      setFishers(fisherRows.map(p=>({id:p.id,name:p.display_name,boat:p.boat_name??"",port:p.home_port??"",method:p.fishing_method??"",phone:"",email:"",bio:p.bio??"",since:p.since_year??new Date().getFullYear()})));
      setCatches(((lots??[]) as CatchRow[]).map(c=>({id:c.id,species:c.species,emoji:emoji(c.method),fisherId:c.fisher_id,zone:c.zone,caughtAt:c.caught_at,landedAt:c.landed_at,qtyKg:Number(c.remaining_kg),priceKg:Number(c.price_per_kg),grade:c.grade??"",method:c.method,storage:c.storage_instructions,status:c.status==="available"?"disponible":c.status==="reserved"?"réservé":"épuisé"})));
      setError(null);
    } catch(e) { setError(e instanceof Error?e.message:"Impossible de charger le catalogue partagé."); }
    finally { setLoading(false); }
  },[]);
  useEffect(()=>{
    void refresh();
    const channel=supabase.channel("maree-public-market")
      .on("postgres_changes",{event:"*",schema:"public",table:"catches"},()=>void refresh())
      .subscribe();
    return ()=>{void supabase.removeChannel(channel);};
  },[refresh]);
  return {catches,fishers,loading,error,refresh};
}

export async function createSharedCatch(input:Omit<Catch,"id">):Promise<string>{
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError) throw authError;
  if(!user) throw new Error("Connectez-vous pour publier une prise.");
  const {data:profile,error:profileError}=await supabase.from("profiles").select("role").eq("id",user.id).single();
  if(profileError) throw profileError;
  if(profile.role!=="fisher") throw new Error("Votre compte n'est pas encore vérifié comme pêcheur.");
  const {data,error}=await supabase.from("catches").insert({
    fisher_id:user.id,species:input.species.trim(),zone:input.zone.trim(),caught_at:input.caughtAt,landed_at:input.landedAt,
    quantity_kg:input.qtyKg,remaining_kg:input.qtyKg,price_per_kg:input.priceKg,grade:input.grade||null,
    method:input.method,storage_instructions:input.storage,status:"available"
  }).select("id").single();
  if(error) throw error;
  return data.id;
}

export async function reserveSharedCatch(input:{catchId:string;qtyKg:number;slot:string;mode:"livraison"|"retrait";note:string}):Promise<string>{
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError) throw authError;
  if(!user) throw new Error("Connectez-vous avec votre compte restaurant pour réserver.");
  const {data:profile,error:profileError}=await supabase.from("profiles").select("role").eq("id",user.id).single();
  if(profileError) throw profileError;
  if(profile.role!=="restaurant") throw new Error("Seuls les comptes restaurant peuvent réserver.");
  const {data,error}=await supabase.rpc("reserve_catch",{p_catch_id:input.catchId,p_quantity_kg:input.qtyKg,p_requested_slot:input.slot,p_fulfilment:input.mode==="livraison"?"delivery":"collection",p_note:input.note||null});
  if(error) throw error;
  return data as string;
}

export type SharedOrderRow = {
  id:string; catch_id:string; restaurant_id:string; quantity_kg:number|string;
  requested_slot:string; fulfilment:"delivery"|"collection"; note:string|null;
  status:"submitted"|"confirmed"|"ready"|"delivered"|"cancelled"; created_at:string;
  fisher_id_snapshot:string|null; unit_price_snapshot:number|string|null; product_subtotal:number|string|null;
  maree_fee_rate:number|string; maree_fee:number|string;
  delivery_fee_rate:number|string; delivery_fee:number|string; total_amount:number|string|null;
  billing_mode:"immediate"|"monthly"; delivered_at:string|null;
};

export async function fetchMyOrders():Promise<SharedOrderRow[]> {
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError) throw authError;
  if(!user) return [];
  const query = supabase.from("orders");
  const {data,error}=await query
    .select("id,catch_id,restaurant_id,quantity_kg,requested_slot,fulfilment,note,status,created_at,fisher_id_snapshot,unit_price_snapshot,product_subtotal,maree_fee_rate,maree_fee,delivery_fee_rate,delivery_fee,total_amount,billing_mode,delivered_at")
    .order("created_at",{ascending:false});
  if(error && (error.code==="42703" || error.code==="PGRST204" || error.code==="PGRST200")) {
    // Keep the current production-connected preview usable until the protected
    // commercial migration is approved and applied. Legacy orders show no fee snapshot.
    const legacy=await supabase.from("orders")
      .select("id,catch_id,restaurant_id,quantity_kg,requested_slot,fulfilment,note,status,created_at,fisher_id_snapshot,unit_price_snapshot,product_subtotal,delivery_fee_rate,delivery_fee,total_amount,billing_mode,delivered_at")
      .order("created_at",{ascending:false});
    if(legacy.error) throw legacy.error;
    return (legacy.data??[]).map(row=>({...row,maree_fee_rate:0,maree_fee:0})) as SharedOrderRow[];
  }
  if(error) throw error;
  return (data??[]) as SharedOrderRow[];
}

export type SharedMonthlyInvoiceRow = {
  id:string; restaurant_id:string; fisher_id:string; period_start:string; period_end:string;
  due_date:string; subtotal:number|string; status:"open"|"paid"|"void";
  paid_at:string|null; payment_method:string|null; payment_reference:string|null;
};

export async function fetchMyMonthlyInvoices():Promise<SharedMonthlyInvoiceRow[]> {
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError) throw authError;
  if(!user) return [];
  const {data,error}=await supabase.from("fisher_monthly_invoices")
    .select("id,restaurant_id,fisher_id,period_start,period_end,due_date,subtotal,status,paid_at,payment_method,payment_reference")
    .order("period_start",{ascending:false});
  if(error && (error.code==="42P01" || error.code==="PGRST205")) return [];
  if(error) throw error;
  return (data??[]) as SharedMonthlyInvoiceRow[];
}

export async function confirmFisherInvoicePaid(invoiceId:string,paymentMethod:string|null,paymentReference:string|null):Promise<void> {
  const {error}=await supabase.rpc("mark_fisher_invoice_paid",{
    p_invoice_id:invoiceId,p_payment_method:paymentMethod,p_payment_reference:paymentReference
  });
  if(error) throw error;
}

export async function setRestaurantFisherBillingMode(fisherId:string,mode:"immediate"|"monthly"):Promise<void>{
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError) throw authError;
  if(!user) throw new Error("Connectez-vous avec votre compte restaurant.");
  const {error}=await supabase.from("restaurant_fisher_billing_settings").upsert({restaurant_id:user.id,fisher_id:fisherId,billing_mode:mode,updated_at:new Date().toISOString()},{onConflict:"restaurant_id,fisher_id"});
  if(error) throw error;
}

export async function updateMyCatch(id:string,patch:{remainingKg?:number;priceKg?:number;status?:"available"|"reserved"|"sold_out"}):Promise<void>{
  if(patch.status==="reserved") throw new Error("Le statut réservé est géré automatiquement par les commandes.");
  const {error}=await supabase.rpc("update_catch_inventory",{
    p_catch_id:id,
    p_remaining_kg:patch.remainingKg ?? null,
    p_price_per_kg:patch.priceKg ?? null
  });
  if(error) throw error;
}

export async function updateMyOrderStatus(id:string,status:"confirmed"|"ready"|"delivered"):Promise<void>{
  const {error}=await supabase.rpc("update_order_status",{p_order_id:id,p_status:status});
  if(error) throw error;
}
