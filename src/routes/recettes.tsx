import { createFileRoute } from "@tanstack/react-router";
import { useLanguage } from "@/lib/i18n";
import { getJerseySeason, getSeasonalSeafood } from "@/lib/seasonality";

export const Route = createFileRoute("/recettes")({
  head: () => ({
    meta: [
      { title: "Recettes de saison — Marée Jersey" },
      { name: "description", content: "Trois idées pour cuisiner les espèces de saison débarquées à Jersey, avec des recettes de chefs et des idées Marée." },
    ],
  }),
  component: RecipesPage,
});

type RecipeIdea = { title: string; description: string; source?: string; sourceUrl?: string; author?: string; imageUrl: string; imageCredit: string; imageSourceUrl: string };

const recipeIdeas: Record<string, RecipeIdea[]> = {
  "crabe-chancre": [
    { imageUrl: "https://images1.speedybooker.com/photos/fit.ashx?file=11032024_29235.jpg&w=1200", imageCredit: "Dartmouth River Restaurant", imageSourceUrl: "https://www.britainsfinest.co.uk/restaurants/dartmouth-river-restaurant", title: "Crab linguine", description: "Chair de crabe, linguine, citron, persil et une pointe de piment.", source: "Genuine Jersey · recettes de coquillages", sourceUrl: "https://www.genuinejersey.je/shellfish/jersey-shellfish-recipes/", author: "Recette référencée par Genuine Jersey" },
    { imageUrl: "https://images1.speedybooker.com/photos/fit.ashx?file=11032024_29235.jpg&w=1200", imageCredit: "Dartmouth River Restaurant", imageSourceUrl: "https://www.britainsfinest.co.uk/restaurants/dartmouth-river-restaurant", title: "Crabe et Jersey Royals", description: "Crabe effiloché, pommes de terre Jersey Royals, herbes fraîches et mayonnaise citronnée.", source: "Mark Jordan · collection de recettes", sourceUrl: "https://www.greatbritishchefs.com/collections/mark-jordan-recipes", author: "Inspiration d'un chef de Jersey" },
    { imageUrl: "https://images1.speedybooker.com/photos/fit.ashx?file=11032024_29235.jpg&w=1200", imageCredit: "Dartmouth River Restaurant", imageSourceUrl: "https://www.britainsfinest.co.uk/restaurants/dartmouth-river-restaurant", title: "Ravioles de crabe, bisque légère", description: "Ravioles fines garnies de chair de crabe, servies avec un jus de carapaces réduit.", author: "Idée de recette Marée Jersey" },
  ],
  homard: [
    { title: "Grilled lobster", description: "Homard grillé, beurre citronné et herbes fraîches.", source: "Genuine Jersey · recettes de homard", sourceUrl: "https://www.genuinejersey.je/shellfish/jersey-shellfish-recipes/", author: "Bryan Webb · recette référencée par Genuine Jersey" },
    { title: "Lobster Thermidor", description: "Homard, sauce crémeuse à la moutarde, gratin léger au four.", source: "Genuine Jersey · recettes de homard", sourceUrl: "https://www.genuinejersey.je/shellfish/jersey-shellfish-recipes/", author: "James Martin · recette référencée par Genuine Jersey" },
    { title: "Homard rôti, beurre de Jersey et pommes grenailles", description: "Une assiette simple qui met en avant le homard local et le beurre de Jersey.", author: "Idée de recette Marée Jersey" },
  ],
  bar: [
    { title: "Bar rôti, Saint-Jacques et petits pois", description: "Une assiette de poisson de saison avec coquilles Saint-Jacques et petits pois.", source: "Mark Jordan · Great British Chefs", sourceUrl: "https://www.greatbritishchefs.com/collections/mark-jordan-recipes", author: "Mark Jordan · chef installé à Jersey" },
    { title: "Bar en croûte de sel, beurre citronné", description: "Cuisson douce du bar entier, pommes de terre nouvelles et beurre citronné.", author: "Idée de recette Marée Jersey" },
    { title: "Filet de bar snacké, fondue de poireaux", description: "Peau croustillante, poireaux fondants et sauce au cidre.", author: "Idée de recette Marée Jersey" },
  ],
  dorade: [
    { title: "Dorade entière au four, citron et fenouil", description: "Dorade rôtie entière, fenouil, citron et huile d'olive.", author: "Idée de recette Marée Jersey" },
    { title: "Filet de dorade, beurre blanc", description: "Filet poêlé, beurre blanc et légumes de saison de Jersey.", author: "Idée de recette Marée Jersey" },
    { title: "Dorade grillée, pommes de terre écrasées", description: "Cuisson au grill, pommes de terre écrasées au beurre de Jersey et herbes.", author: "Idée de recette Marée Jersey" },
  ],
  maquereau: [
    { title: "Smoked mackerel Niçoise salad", description: "Maquereau fumé, pommes de terre, œuf, haricots verts et vinaigrette moutardée.", source: "An Island Chef · recettes de saison", sourceUrl: "https://anislandchef.com/an-island-chef-my-summer-recipes/", author: "Christian Gott · chef des îles Anglo-Normandes" },
    { title: "Maquereau grillé, moutarde et herbes", description: "Filets grillés, moutarde douce, citron et herbes fraîches.", author: "Idée de recette Marée Jersey" },
    { title: "Rillettes de maquereau, citron et poivre", description: "Maquereau cuit, fromage frais, citron et poivre, à servir sur pain grillé.", author: "Idée de recette Marée Jersey" },
  ],
  raie: [
    { title: "Aile de raie, beurre noisette et câpres", description: "Pochage doux, beurre noisette, câpres et pommes de terre vapeur.", author: "Idée de recette Marée Jersey" },
    { title: "Raie rôtie, purée de Jersey Royals", description: "Aile de raie rôtie et purée de pommes de terre au beurre local.", author: "Idée de recette Marée Jersey" },
    { title: "Raie, sauce vierge et légumes croquants", description: "Cuisson délicate, tomates, citron, huile d'olive et herbes.", author: "Idée de recette Marée Jersey" },
  ],
};

function RecipesPage() {
  const { language } = useLanguage();
  const isEnglish = language === "en";
  const season = getJerseySeason();
  const species = getSeasonalSeafood(season.month);
  const recommended = species.filter((item) => item.status === "best_now" || item.status === "in_season");
  const daily = species.filter((item) => item.status === "watch_daily_landing");
  const restricted = species.filter((item) => item.status === "restricted");
  const nameOf = (item: (typeof species)[number]) => language === "fr" ? item.nameFr : language === "ro" ? item.nameRo : item.name;
  const label = (fr: string, en: string) => isEnglish ? en : fr;

  return (
    <main id="recettes" className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Marée Jersey · Jersey</p>
        <h1 className="mt-2 text-3xl font-semibold">{label("3 idées de recettes", "3 recipe ideas")}</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">{label("Des idées pour cuisiner les espèces recommandées cette saison. Les lots réellement disponibles restent ceux publiés par les pêcheurs vérifiés.", "Ideas for cooking the species recommended this season. Actual availability is shown only in verified fishers' published landings.")}</p>
      </div>

      {recommended.length > 0 && <section className="mb-8 rounded-2xl border border-accent/30 bg-secondary/40 p-5">
        <h2 className="text-lg font-semibold">{label("À privilégier maintenant", "Best to look for now")}</h2>
        <div className="mt-3 flex flex-wrap gap-2">{recommended.map((item) => <a key={item.slug} href={`#${item.slug}`} className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-background">{nameOf(item)}</a>)}</div>
      </section>}

      {recommended.map((item) => <RecipeSpecies key={item.slug} slug={item.slug} name={nameOf(item)} note={language === "fr" ? item.noteFr : item.note} ideas={recipeIdeas[item.slug] ?? []} label={label} />)}

      {daily.length > 0 && <section className="mt-10">
        <h2 className="text-xl font-semibold">{label("Selon les débarquements du jour", "Depending on today's landings")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{label("Ces espèces ne sont pas annoncées comme étant en pleine saison : consultez les lots frais et traçables publiés par les pêcheurs avant de les mettre au menu.", "These species are not marked as being in peak season: check fresh, traceable fisher listings before adding them to a menu.")}</p>
        <div className="mt-5 space-y-6">{daily.map((item) => <RecipeSpecies key={item.slug} slug={item.slug} name={nameOf(item)} note={language === "fr" ? item.noteFr : item.note} ideas={recipeIdeas[item.slug] ?? []} label={label} />)}</div>
      </section>}

      {restricted.map((item) => <section key={item.slug} id={item.slug} className="mt-10 rounded-2xl border border-destructive/30 p-5">
        <h2 className="text-xl font-semibold">{nameOf(item)} · {label("espèce réglementée", "regulated species")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{language === "fr" ? item.noteFr : item.note}</p>
        <p className="mt-2 text-sm">{label("Aucune recette promotionnelle n'est affichée ici tant que les jours d'ouverture et les conditions de licence ne sont pas vérifiés. Ne pas récolter ni acheter hors cadre légal.", "No promotional recipe ideas are shown until authorised opening days and licence conditions are verified. Do not harvest or buy outside the legal framework.")}</p>
        <a className="mt-3 inline-block text-sm underline" href={item.imageSourceUrl} target="_blank" rel="noreferrer">{label("Consulter la réglementation officielle", "Read official regulations")}</a>
      </section>)}

      <p className="mt-10 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">{label("Crédits : les liens « recette publiée » renvoient vers la source originale. Les autres propositions sont des idées éditoriales Marée Jersey, non attribuées à un chef tiers. Vérifier origine, fraîcheur, tailles minimales, licences et disponibilité du lot avant toute utilisation commerciale.", "Credits: links marked as published recipes point to the original source. Other suggestions are Marée Jersey editorial ideas and are not attributed to third-party chefs. Verify provenance, freshness, minimum sizes, licences and lot availability before commercial use.")}</p>
    </main>
  );
}

function RecipeSpecies({ slug, name, note, ideas, label }: { slug: string; name: string; note: string; ideas: RecipeIdea[]; label: (fr: string, en: string) => string }) {
  return (
    <section id={slug} className="scroll-mt-24 border-b border-border py-7">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-2xl font-semibold">{name}</h2><p className="mt-1 text-sm text-muted-foreground">{note}</p></div>
        <a href="/#weather-season-title" className="text-sm underline">{label("Retour aux saisons", "Back to season guide")}</a>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {ideas.map((idea) => <article key={idea.title} className="card flex flex-col overflow-hidden">\n          <img src={idea.imageUrl} alt={`${idea.title} — photo illustrative du plat`} loading="lazy" className="h-48 w-full object-cover" />\n          <div className="flex flex-1 flex-col p-5">
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">{idea.source ? label("Recette publiée", "Published recipe") : label("Idée Marée", "Marée idea")}</span>
          <h3 className="mt-2 text-lg font-semibold">{idea.title}</h3>
          <p className="mt-2 flex-1 text-sm text-muted-foreground">{idea.description}</p>
          <p className="mt-4 text-xs">{idea.author}</p>
          {idea.sourceUrl && <a href={idea.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 text-sm font-semibold underline">{label("Voir la publication originale", "View original publication")} ↗</a>}
        </article>)}
      </div>
    </section>
  );
}
