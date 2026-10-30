import { useLanguage, LanguageProvider, resolveLanguage } from "@/lib/i18n";
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
    <html lang="fr">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

const NAV = [
  { to: "/catalogue", label: "Pêche du jour" },
  { to: "/pecheurs", label: "Pêcheurs" },
  { to: "/restaurant", label: "Restaurant" },
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
  return (
    <QueryClientProvider client={queryClient}>
      <a href="#main" className="sr-only focus:not-sr-only">{t("Aller au contenu")}</a>
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="font-display text-xl font-semibold text-primary">Marée <span className="text-accent">Jersey</span></Link>
          <nav className="hidden gap-1 lg:flex" aria-label={t("Navigation principale")}>
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:text-primary" activeProps={{ className: "text-primary bg-secondary" }}>{t(n.label)}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-2"><select aria-label="Language" className="field w-auto max-w-32 text-sm" value={language} onChange={(e) => setLanguage(resolveLanguage(e.target.value))}><option value="fr">Français</option><option value="en">English</option><option value="ro">Română</option></select><button className="btn btn-ghost lg:hidden" aria-expanded={open} aria-label={t("Menu")} onClick={() => setOpen(!open)}>☰</button></div>
        </div>
        {open && (
          <nav className="grid border-t px-4 py-2 lg:hidden" aria-label={t("Navigation mobile")}>
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="rounded-md px-3 py-3 font-medium" activeProps={{ className: "bg-secondary text-primary" }}>{t(n.label)}</Link>
            ))}
          </nav>
        )}
      </header>
      <main id="main" className="min-h-[70vh]"><Outlet /></main>
      <footer className="mt-16 border-t bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm opacity-90">
          <p className="font-display text-lg">Marée Jersey</p>
          <p className="mt-1">{t("Prototype — toutes les disponibilités, pêcheurs et commandes sont des données de démonstration enregistrées uniquement dans votre navigateur. Aucun paiement, aucune notification réelle. Prix en £ · heure de Jersey.")}</p>
        </div>
      </footer>
      <Toaster />
    </QueryClientProvider>
  );
}