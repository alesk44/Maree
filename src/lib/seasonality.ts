export type JerseySeason = "winter" | "spring" | "summer" | "autumn";
export type SeasonalSeafood = {
  name: string;
  nameFr: string;
  nameRo: string;
  status: "best_now" | "in_season" | "watch_daily_landing" | "restricted";
  months: string;
  note: string;
  noteFr: string;
  noteRo: string;
  source: string;
};

export function getJerseySeason(date = new Date()): { season: JerseySeason; month: number; monthLabel: string } {
  const month = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Jersey", month: "numeric" }).format(date));
  const monthLabel = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Jersey", month: "long" }).format(date);
  const season: JerseySeason = month === 12 || month <= 2 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : "autumn";
  return { season, month, monthLabel };
}

export function getSeasonalSeafood(month: number): SeasonalSeafood[] {
  return [
    {
      name: "Chancre crab", nameFr: "Crabe chancre", nameRo: "Crab chancre",
      status: month >= 11 || month <= 3 ? "best_now" : "watch_daily_landing",
      months: "November–March",
      note: "Best quality window around Jersey; check the fishermen’s fresh landings.",
      noteFr: "Période de meilleure qualité autour de Jersey ; vérifiez les débarquements frais des pêcheurs.",
      noteRo: "Perioadă de calitate optimă în jurul Jersey; verificați capturile proaspete ale pescarilor.",
      source: "Visit Jersey",
    },
    {
      name: "Jersey lobster", nameFr: "Homard de Jersey", nameRo: "Homar de Jersey",
      status: month >= 4 && month <= 12 ? "in_season" : "watch_daily_landing",
      months: "April–December; peak May–September",
      note: month >= 4 && month <= 12 ? "Still within the local season; the main peak has passed after September." : "Outside the usual local season; only list if a verified supplier confirms provenance and availability.",
      noteFr: month >= 4 && month <= 12 ? "Encore dans la saison locale ; le pic principal est passé après septembre." : "Hors saison locale habituelle ; ne proposer qu’avec confirmation de provenance et de disponibilité par un fournisseur vérifié.",
      noteRo: month >= 4 && month <= 12 ? "Încă în sezonul local; vârful principal a trecut după septembrie." : "În afara sezonului local obișnuit; listați doar dacă un furnizor verificat confirmă proveniența și disponibilitatea.",
      source: "Visit Jersey",
    },
    {
      name: "Bass, bream, mackerel and skate", nameFr: "Bar, dorade, maquereau et raie", nameRo: "Biban de mare, doradă, macrou și pisică de mare",
      status: "watch_daily_landing",
      months: "Daily landing dependent",
      note: "Recognised local fish-market species; promote only when a Jersey fisher has published a fresh, traceable lot.",
      noteFr: "Espèces proposées sur le marché local ; à mettre en avant uniquement lorsqu’un pêcheur de Jersey publie un lot frais et traçable.",
      noteRo: "Specii prezente pe piața locală; promovați-le doar când un pescar din Jersey publică un lot proaspăt și trasabil.",
      source: "Jersey Markets",
    },
    {
      name: "Ormers", nameFr: "Ormeaux de Jersey", nameRo: "Abalone (ormers)",
      status: "restricted",
      months: "1 October–30 April; authorised lunar opening days only",
      note: "Strictly regulated: collection is allowed only on specific new-moon or full-moon opening days and subject to licence conditions. Never imply general daily availability.",
      noteFr: "Pêche strictement réglementée : uniquement certains jours d’ouverture liés à la nouvelle lune ou à la pleine lune, sous réserve des conditions de licence. Ne jamais présenter comme disponible tous les jours.",
      noteRo: "Recoltarea este strict reglementată: doar în anumite zile autorizate la lună nouă sau plină și cu respectarea licenței. Nu prezentați produsul ca disponibil zilnic.",
      source: "Government of Jersey",
    },
  ];
}
