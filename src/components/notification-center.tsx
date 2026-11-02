import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/lib/i18n";

type NotificationRow = {
  id: string;
  event_type: string;
  title: string;
  body: string;
  href: string;
  created_at: string;
  read_at: string | null;
};

const allowedTargets = new Set(["/restaurant", "/espace-pecheur", "/admin"]);

export function NotificationCenter() {
  const { t, dt } = useLanguage();
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const unread = items.filter((item) => !item.read_at).length;

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const load = async (id: string) => {
      setLoading(true);
      const { data, error } = await supabase
        .from("notifications")
        .select("id,event_type,title,body,href,created_at,read_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (active && !error) setItems((data ?? []) as NotificationRow[]);
      if (active) setLoading(false);
    };

    const connect = async (id: string | null) => {
      if (channel) {
        await supabase.removeChannel(channel);
        channel = null;
      }
      if (!active) return;
      setUserId(id);
      if (!id) {
        setItems([]);
        return;
      }
      await load(id);
      if (!active) return;
      channel = supabase
        .channel("user-notifications-" + id)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: "user_id=eq." + id,
        }, () => { if (active) void load(id); })
        .subscribe();
    };

    void supabase.auth.getSession().then(({ data }) => {
      void connect(data.session?.user.id ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void connect(session?.user.id ?? null);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  const markRead = async (id: string) => {
    if (!userId) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .eq("id", id)
      .eq("user_id", userId)
      .is("read_at", null);
    if (!error) {
      setItems((current) => current.map((item) => item.id === id ? { ...item, read_at: readAt } : item));
    }
  };

  const markAllRead = async () => {
    if (!userId || unread === 0) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .eq("user_id", userId)
      .is("read_at", null);
    if (!error) {
      setItems((current) => current.map((item) => item.read_at ? item : { ...item, read_at: readAt }));
    }
  };

  if (!userId) return null;

  return (
    <div className="relative">
      <button
        type="button"
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-lg transition hover:border-accent"
        aria-label={t("Notifications") + (unread ? " (" + unread + ")" : "")}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">♧</span>
        {unread > 0 && <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <section className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl" aria-label={t("Centre de notifications")}>
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="font-semibold">{t("Notifications")}</h2>
              <p className="text-xs text-muted-foreground">{t("{count} non lues", { count: unread })}</p>
            </div>
            <button type="button" className="text-xs font-semibold text-accent disabled:opacity-40" disabled={unread === 0} onClick={() => void markAllRead()}>{t("Tout lire")}</button>
          </div>
          {loading ? <p className="p-4 text-sm text-muted-foreground">{t("Chargement…")}</p> : items.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{t("Aucune notification pour le moment.")}</p> : (
            <ul className="max-h-[min(65vh,28rem)] divide-y divide-border overflow-y-auto">
              {items.map((item) => {
                const target = allowedTargets.has(item.href) ? item.href : "/";
                return (
                  <li key={item.id} className={item.read_at ? "bg-card" : "bg-accent/5"}>
                    <Link
                      to={target as never}
                      onClick={() => { setOpen(false); if (!item.read_at) void markRead(item.id); }}
                      className="block px-4 py-3 transition hover:bg-secondary"
                    >
                      <div className="flex items-start gap-2">
                        {!item.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label={t("Non lue")} />}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{t(item.title)}</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t(item.body)}</p>
                          <p className="mt-2 text-[10px] text-muted-foreground">{dt(item.created_at)}</p>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
