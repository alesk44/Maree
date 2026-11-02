export type JerseySeason = "winter" | "spring" | "summer" | "autumn";
export type SeasonalSeafood = {
  name: string;
  nameFr: string;
  nameRo: string;
  slug: string;
  status: "best_now" | "in_season" | "watch_daily_landing" | "restricted";
  months: string;
  note: string;
  noteFr: string;
  noteRo: string;
  source: string;
  imageUrl: string;
  imageCredit: string;
  imageLicense: string;
  imageSourceUrl: string;
};

export function getJerseySeason(date = new Date()): { season: JerseySeason; month: number; monthLabel: string } {
  const month = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Jersey", month: "numeric" }).format(date));
  const monthLabel = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Jersey", month: "long" }).format(date);
  const season: JerseySeason = month === 12 || month <= 2 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : "autumn";
  return { season, month, monthLabel };
}

export function getSeasonalSeafood(month: number): SeasonalSeafood[] {
  const daily = {
    status: "watch_daily_landing" as const,
    months: "Selon les débarquements du jour",
    note: "Promote only when a Jersey fisher publishes a fresh, traceable lot.",
    noteFr: "À mettre en avant uniquement lorsqu’un pêcheur de Jersey publie un lot frais et traçable.",
    noteRo: "Promovați doar când un pescar din Jersey publică o captură proaspătă și trasabilă.",
    source: "Jersey Markets",
  };
  return [
    {
      name: "Chancre crab", nameFr: "Crabe chancre", nameRo: "Crab chancre", slug: "crabe-chancre",
      status: month >= 11 || month <= 3 ? "best_now" : "watch_daily_landing",
      months: "November–March",
      note: "Best quality window around Jersey; check the fishermen’s fresh landings.",
      noteFr: "Période de meilleure qualité autour de Jersey ; vérifiez les débarquements frais des pêcheurs.",
      noteRo: "Perioadă de calitate optimă în jurul Jersey; verificați capturile proaspete ale pescarilor.",
      source: "Visit Jersey",
      imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Cancer_pagurus.jpg",
      imageCredit: "Hans Hillewaert",
      imageLicense: "CC BY-SA 4.0",
      imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Cancer_pagurus.jpg",
    },
    {
      name: "Jersey lobster", nameFr: "Homard de Jersey", nameRo: "Homar de Jersey", slug: "homard",
      status: month >= 4 && month <= 12 ? "in_season" : "watch_daily_landing",
      months: "April–December; peak May–September",
      note: month >= 4 && month <= 12 ? "Within the usual local season; verify the fisher's landing and provenance." : "Outside the usual local season; list only with verified provenance and availability.",
      noteFr: month >= 4 && month <= 12 ? "Dans la saison locale habituelle ; vérifiez le débarquement et la provenance du pêcheur." : "Hors saison locale habituelle ; afficher uniquement avec provenance et disponibilité vérifiées.",
      noteRo: month >= 4 && month <= 12 ? "În sezonul local obișnuit; verificați captura și proveniența pescarului." : "În afara sezonului local; afișați doar cu proveniență și disponibilitate verificate.",
      source: "Visit Jersey",
      imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Homarus_gammarus_001.jpg",
      imageCredit: "JoJan",
      imageLicense: "CC BY 3.0",
      imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Homarus_gammarus_001.jpg",
    },
    {
      name: "Bass", nameFr: "Bar", nameRo: "Biban de mare", slug: "bar",
      ...daily,
      imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Dicentrarchus_labrax.jpeg",
      imageCredit: "Dezidor",
      imageLicense: "CC BY 3.0",
      imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Dicentrarchus_labrax.jpeg",
    },
    {
      name: "Gilthead sea bream", nameFr: "Dorade royale", nameRo: "Doradă regală", slug: "dorade",
      ...daily,
      imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Sparus_Aurata.jpg",
      imageCredit: "Davidpescanova",
      imageLicense: "CC0 1.0",
      imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Sparus_Aurata.jpg",
    },
    {
      name: "Atlantic mackerel", nameFr: "Maquereau", nameRo: "Macrou", slug: "maquereau",
      ...daily,
      imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Scomber_scombrus.jpg",
      imageCredit: "Hans Hillewaert",
      imageLicense: "CC BY-SA 4.0",
      imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Scomber_scombrus.jpg",
    },
    {
      name: "Common skate", nameFr: "Raie", nameRo: "Pisică de mare", slug: "raie",
      ...daily,
      imageUrl: "",
      imageCredit: "",
      imageLicense: "",
      imageSourceUrl: "https://commons.wikimedia.org/wiki/Category:Dipturus_batis",
    },
    {
      name: "Ormers", nameFr: "Ormeaux de Jersey", nameRo: "Abalone (ormers)", slug: "ormeaux",
      status: "restricted",
      months: "1 October–30 April; authorised lunar opening days only",
      note: "Strictly regulated: collection is allowed only on specific new-moon or full-moon opening days and subject to licence conditions. Never imply general daily availability.",
      noteFr: "Pêche strictement réglementée : uniquement certains jours d’ouverture autorisés et sous réserve des conditions de licence. Ne jamais présenter comme disponible tous les jours.",
      noteRo: "Recoltarea este strict reglementată: doar în anumite zile autorizate și cu respectarea licenței. Nu prezentați produsul ca disponibil zilnic.",
      source: "Government of Jersey",
      imageUrl: "",
      imageCredit: "",
      imageLicense: "",
      imageSourceUrl: "https://www.gov.je/Industry/FarmingFishing/Fishing/pages/fishingregulations.aspx",
    },
  ];
}
