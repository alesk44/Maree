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

export async function reserveSharedCatch(input:{catchId:string;qtyKg:number;slot:string;mode:"livraison"|"retrait";note:string;tipAmount?:number}):Promise<string>{
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError) throw authError;
  if(!user) throw new Error("Connectez-vous avec votre compte restaurant pour réserver.");
  const {data:profile,error:profileError}=await supabase.from("profiles").select("role").eq("id",user.id).single();
  if(profileError) throw profileError;
  if(profile.role!=="restaurant") throw new Error("Seuls les comptes restaurant peuvent réserver.");
  const {data,error}=await supabase.rpc("reserve_catch",{p_catch_id:input.catchId,p_quantity_kg:input.qtyKg,p_requested_slot:input.slot,p_fulfilment:input.mode==="livraison"?"delivery":"collection",p_note:input.note||null,p_tip_amount:input.tipAmount??0});
  if(error) throw error;
  return data as string;
}

export type SharedOrderRow = {
  id:string; catch_id:string; restaurant_id:string; quantity_kg:number|string;
  requested_slot:string; fulfilment:"delivery"|"collection"; note:string|null;
  status:"submitted"|"confirmed"|"ready"|"delivered"|"cancelled"; created_at:string;
  fisher_id_snapshot:string|null; unit_price_snapshot:number|string|null; product_subtotal:number|string|null;
  maree_fee_rate:number|string; maree_fee:number|string;
  delivery_fee_rate:number|string; delivery_fee:number|string; delivery_fee_payer_snapshot:'buyer'|'fisher'; total_amount:number|string|null;
  billing_mode:"immediate"|"monthly"; delivered_at:string|null; tip_amount:number|string;
  fisher_payment_status:"unpaid"|"paid"|"waived"; fisher_paid_at:string|null;
  fisher_payment_method:string|null; fisher_payment_reference:string|null;
  cancellation_request_status:"none"|"pending"|"offered"|"approved"|"rejected"; cancellation_requested_at:string|null; cancellation_penalty:number|string|null;
};

export async function fetchMyOrders():Promise<SharedOrderRow[]> {
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError) throw authError;
  if(!user) return [];
  const {data,error}=await supabase.from("orders")
    .select("id,catch_id,restaurant_id,quantity_kg,requested_slot,fulfilment,note,status,created_at,fisher_id_snapshot,unit_price_snapshot,product_subtotal,maree_fee_rate,maree_fee,delivery_fee_rate,delivery_fee,delivery_fee_payer_snapshot,total_amount,billing_mode,delivered_at,tip_amount,fisher_payment_status,fisher_paid_at,fisher_payment_method,fisher_payment_reference,cancellation_request_status,cancellation_requested_at,cancellation_penalty")
    .order("created_at",{ascending:false});
  if(error) throw new Error("Impossible de charger les comptes financiers : schéma Supabase incomplet ou non synchronisé. "+error.message);
  return (data??[]) as SharedOrderRow[];
}

export type SharedMonthlyInvoiceItemRow = { order_id:string; product_subtotal:number|string; quantity_kg:number|string; unit_price:number|string; tip_amount:number|string; delivery_deduction:number|string };
export type SharedCancellationIndemnityRow = { id:string; order_id:string; amount:number|string; status:"unpaid"|"paid"; accepted_at:string; paid_at:string|null };
export type SharedMonthlyInvoiceRow = {
  id:string; restaurant_id:string; fisher_id:string; period_start:string; period_end:string;
  due_date:string; subtotal:number|string; tip_total:number|string; delivery_deduction_total:number|string;
  cancellation_indemnity_total:number|string; status:"open"|"paid"|"void";
  paid_at:string|null; payment_method:string|null; payment_reference:string|null;
  items?:SharedMonthlyInvoiceItemRow[]; cancellation_indemnities?:SharedCancellationIndemnityRow[];
};

export async function fetchMyMonthlyInvoices():Promise<SharedMonthlyInvoiceRow[]> {
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError) throw authError;
  if(!user) return [];
  const {data,error}=await supabase.from("fisher_monthly_invoices")
    .select("id,restaurant_id,fisher_id,period_start,period_end,due_date,subtotal,tip_total,delivery_deduction_total,cancellation_indemnity_total,status,paid_at,payment_method,payment_reference,items:fisher_monthly_invoice_items(order_id,product_subtotal,quantity_kg,unit_price,tip_amount,delivery_deduction),cancellation_indemnities:fisher_cancellation_indemnities(id,order_id,amount,status,accepted_at,paid_at)")
    .order("period_start",{ascending:false});
  if(error) throw new Error("Impossible de charger les relevés pêcheurs : schéma Supabase incomplet ou non synchronisé. "+error.message);
  return (data??[]) as SharedMonthlyInvoiceRow[];
}

export async function markFisherOrderPaid(orderId:string,paymentMethod:string|null,paymentReference:string|null):Promise<void> {
  const {error}=await supabase.rpc("mark_order_paid",{
    p_order_id:orderId,p_payment_method:paymentMethod,p_payment_reference:paymentReference
  });
  if(error) throw error;
}

export async function confirmFisherInvoicePaid(invoiceId:string,paymentMethod:string|null,paymentReference:string|null):Promise<void> {
  const {error}=await supabase.rpc("mark_fisher_invoice_paid",{
    p_invoice_id:invoiceId,p_payment_method:paymentMethod,p_payment_reference:paymentReference
  });
  if(error) throw error;
}

export type SharedMareeCommissionInvoiceItemRow = { order_id:string; commission_amount:number|string; delivery_amount:number|string; delivery_fee_payer_snapshot:'buyer'|'fisher'; product_subtotal:number|string; fulfilment:"delivery"|"collection"; delivered_at:string };
export type SharedMareeCommissionInvoiceRow = {
  id:string; restaurant_id:string; period_start:string; period_end:string; due_date:string;
  commission_total:number|string; delivery_total:number|string; status:"open"|"declared_paid"|"paid"|"void";
  declared_at:string|null; verified_at:string|null; payment_method:string|null; payment_reference:string|null;
  items?:SharedMareeCommissionInvoiceItemRow[];
};

export async function fetchMyMareeCommissionInvoices():Promise<SharedMareeCommissionInvoiceRow[]> {
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError) throw authError;
  if(!user) return [];
  const {data,error}=await supabase.from("maree_monthly_commission_invoices")
    .select("id,restaurant_id,period_start,period_end,due_date,commission_total,delivery_total,status,declared_at,verified_at,payment_method,payment_reference,items:maree_monthly_commission_invoice_items(order_id,commission_amount,delivery_amount,delivery_fee_payer_snapshot,product_subtotal,fulfilment,delivered_at)")
    .order("period_start",{ascending:false});
  if(error) throw new Error("Impossible de charger les relevés Marée : schéma Supabase incomplet ou non synchronisé. "+error.message);
  return (data??[]) as SharedMareeCommissionInvoiceRow[];
}

export async function declareMareeCommissionInvoicePaid(invoiceId:string,paymentMethod:string|null,paymentReference:string|null):Promise<void> {
  const {error}=await supabase.rpc("declare_maree_commission_invoice_paid",{
    p_invoice_id:invoiceId,p_payment_method:paymentMethod,p_payment_reference:paymentReference
  });
  if(error) throw error;
}

export async function setRestaurantFisherBillingMode(fisherId:string,mode:"immediate"|"monthly"):Promise<void>{
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError) throw authError;
  if(!user) throw new Error("Connectez-vous avec votre compte restaurant.");
  const {error}=await supabase.from("restaurant_fisher_billing_settings").upsert({restaurant_id:user.id,fisher_id:fisherId,billing_mode:mode,updated_at:new Date().toISOString()},{onConflict:"restaurant_id,fisher_id"});
  if(error) throw new Error("Impossible d'enregistrer le mode de facturation : schéma Supabase incomplet ou non synchronisé. "+error.message);
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

export async function updateMyOrderStatus(id:string,status:"confirmed"|"ready"|"delivered"|"cancelled"):Promise<void>{
  const {error}=await supabase.rpc("update_order_status",{p_order_id:id,p_status:status});
  if(error) throw error;
}

export async function requestMyOrderCancellation(id:string):Promise<"cancelled"|"requested">{
  const {data,error}=await supabase.rpc("request_order_cancellation",{p_order_id:id});
  if(error) throw error;
  return data as "cancelled"|"requested";
}

export async function respondMyOrderCancellation(id:string,accept:boolean):Promise<void>{
  const {error}=await supabase.rpc("respond_order_cancellation",{p_order_id:id,p_accept:accept});
  if(error) throw error;
}
