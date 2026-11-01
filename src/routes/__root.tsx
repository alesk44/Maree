import { useLanguage, LanguageProvider } from "@/lib/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  const { t, gbp, dt } = useLanguage();
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 text-center">
      <div>
        <h1 className="text-6xl font-semibold">404</h1>
        <p className="mt-2 text-muted-foreground">{t("Cette page n'existe pas.")}</p>
        <Link to="/" className="btn mt-6">{t("Retour à l'accueil")}</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const { t, gbp, dt } = useLanguage();
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 text-center">
      <div>
        <h1 className="text-xl font-semibold">{t("La page n'a pas pu se charger")}</h1>
        <button className="btn mt-6" onClick={() => { router.invalidate(); reset(); }}>{t("Réessayer")}</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Marée Jersey" },
      { name: "description", content: "La pêche de Jersey, directement à votre cuisine." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Manrope:wght@400;500;600;700&display=swap" },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

const NAV = [
  { to: "/catalogue", label: "Pêche du jour" },
  { to: "/pecheurs", label: "Pêcheurs" },
  { to: "/restaurant", label: "Restaurant" },
  { to: "/connexion", label: "Connexion / Créer un compte" },
  { to: "/verification", label: "Vérification" },
  { to: "/espace-pecheur", label: "Espace pêcheur" },
  { to: "/admin", label: "Admin" },
  { to: "/guide", label: "Guide" },
] as const;

function RootComponent() {
  return <LanguageProvider><RootContent /></LanguageProvider>;
}

function RootContent() {
  const { t, language, setLanguage } = useLanguage();
  const { queryClient } = Route.useRouteContext();
  const [open, setOpen] = useState(false);
  const links = NAV.map((n, i) => ({ ...n, icon: ["◈", "♧", "▣", "↗", "✓", "⌂", "⚙", "i"][i] }));
  return (
    <QueryClientProvider client={queryClient}>
      <a href="#main" className="sr-only focus:not-sr-only">{t("Aller au contenu")}</a>
      <div className="min-h-screen bg-background lg:flex">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-card/95 px-4 py-5 backdrop-blur lg:flex">
          <Link to="/" className="mb-9 flex items-center gap-3 px-2 font-display text-xl font-semibold text-foreground">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-xl text-accent-foreground">≈</span>
            <span>Marée <span className="text-accent">Jersey</span></span>
          </Link>
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{t("Marché local")}</p>
          <nav className="grid gap-1" aria-label={t("Navigation principale")}>
            {links.map((n) => (
              <Link key={n.to} to={n.to} className="group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground" activeProps={{ className: "bg-secondary text-accent ring-1 ring-accent/20" }}>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-background text-base group-hover:text-accent" aria-hidden="true">{n.icon}</span>
                {t(n.label)}
              </Link>
            ))}
          </nav>
          <div className="mt-auto rounded-2xl border border-border bg-background p-3">
            <p className="text-xs font-semibold">{t("Pêche du jour, en direct")}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("Les disponibilités et commandes affichées proviennent du marché partagé. Les réservations sont des demandes : aucun paiement en ligne n’est activé dans cette version.")}</p>
          </div>
        </aside>
        <div className="min-w-0 flex-1 lg:ml-60">
          <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 lg:px-8">
              <div className="flex items-center gap-3">
                <button className="btn btn-ghost lg:hidden" aria-expanded={open} aria-label={t("Menu")} onClick={() => setOpen(!open)}>☰</button>
                <Link to="/" className="font-display text-lg font-semibold text-foreground lg:hidden">Marée <span className="text-accent">Jersey</span></Link>
                <p className="hidden text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground lg:block">{t("Marché de la mer · Jersey")}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden text-xs text-muted-foreground sm:inline">{t("Heure locale de Jersey")}</span>
                <div role="group" aria-label={t("Langue")} className="inline-flex shrink-0 items-center rounded-lg border border-border bg-card p-1">
                  {([{ code: "fr", label: "FR" }, { code: "en", label: "EN" }, { code: "ro", label: "RO" }] as const).map((item) => (
                    <button key={item.code} type="button" lang={item.code} aria-pressed={language === item.code} onClick={() => setLanguage(item.code)} className={"rounded-md px-2 py-1.5 text-xs font-semibold transition-colors " + (language === item.code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}>{item.label}</button>
                  ))}
                </div>
              </div>
            </div>
            {open && <nav className="grid border-t border-border px-4 py-2 lg:hidden" aria-label={t("Navigation mobile")}>
              {links.map((n) => <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-3 font-medium text-muted-foreground" activeProps={{ className: "bg-secondary text-accent" }}><span aria-hidden="true">{n.icon}</span>{t(n.label)}</Link>)}
            </nav>}
          </header>
      <main id="main" className="min-h-[70vh] pb-8"><Outlet /></main>
      <footer className="mt-12 border-t border-border bg-card text-card-foreground">
        <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-muted-foreground lg:px-8">
          <p className="font-display text-lg">Marée Jersey</p>
          <p className="mt-1">{t("Les disponibilités et commandes affichées proviennent du marché partagé. Les réservations sont des demandes : aucun paiement en ligne n’est activé dans cette version.")}</p>
        </div>
      </footer>
        </div>
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}