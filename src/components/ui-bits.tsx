import { useLanguage } from "@/lib/i18n";
import type { ReactNode } from "react";
import type { Status, OrderStatus } from "@/lib/store";
import { ORDER_STEPS } from "@/lib/store";

export function DemoBadge({ className = "" }: { className?: string }) {
  const { t, gbp, dt } = useLanguage();
  return <span className={`inline-flex items-center rounded-full bg-sand px-2.5 py-0.5 text-xs font-semibold text-sand-foreground ${className}`}>{t("Données de démonstration")}</span>;
}

export function StatusPill({ s }: { s: Status }) {
  const { t, gbp, dt } = useLanguage();
  const cls = s === "disponible" ? "bg-success/15 text-success" : s === "réservé" ? "bg-warning/20 text-sand-foreground" : "bg-destructive/15 text-destructive";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${cls}`}>{t(s)}</span>;
}

export function OrderSteps({ s }: { s: OrderStatus }) {
  const { t, gbp, dt } = useLanguage();
  const idx = ORDER_STEPS.indexOf(s);
  return (
    <ol className="flex gap-1" aria-label={t("Statut : {status}", { status: t(s) })}>
      {ORDER_STEPS.map((st, i) => (
        <li key={t(st)} className="flex-1">
          <div className={`h-1.5 rounded-full ${i <= idx ? "bg-accent" : "bg-muted"}`} />
          <span className={`mt-1 block text-[11px] capitalize ${i <= idx ? "text-foreground font-semibold" : "text-muted-foreground"}`}>{t(st)}</span>
        </li>
      ))}
    </ol>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  const { t, gbp, dt } = useLanguage();
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold md:text-4xl">{t(title)}</h1>
        {sub && <p className="mt-1 text-muted-foreground">{t(sub)}</p>}
      </div>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  const { t, gbp, dt } = useLanguage();
  return <div className="card p-8 text-center text-muted-foreground">{children}</div>;
}