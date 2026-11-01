import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { loadSharedStore, type SharedStore } from "@/lib/maree-api";

const emptyStore: SharedStore = { fishers: [], catches: [], orders: [], user: null, role: null };

export function useSharedStore() {
  const [store, setStore] = useState<SharedStore>(emptyStore);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loadSharedStore();
      setStore(next);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de charger les données partagées.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    const channel = supabase
      .channel("maree-shared-data")
      .on("postgres_changes", { event: "*", schema: "public", table: "catches" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => void refresh())
      .subscribe();

    return () => {
      authListener.subscription.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { ...store, loading, error, refresh };
}
