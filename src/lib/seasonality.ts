export type JerseySeason = "winter" | "spring" | "summer" | "autumn";
export type SeasonalSeafood = {
  name: string;
  status: "best_now" | "in_season" | "watch_daily_landing";
  months: string;
  note: string;
  source: string;
};

export function getJerseySeason(date = new Date()): { season: JerseySeason; month: number; monthLabel: string } {
  const month = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Jersey", month: "numeric" }).format(date));
  const monthLabel = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Jersey", month: "long" }).format(date);
  const season: JerseySeason = month === 12 || month <= 2 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : "autumn";
  return { season, month, monthLabel };
}

export function getSeasonalSeafood(month: number): SeasonalSeafood[] {
  const items: SeasonalSeafood[] = [
    { name: "Chancre crab", status: month >= 11 || month <= 3 ? "best_now" : "watch_daily_landing", months: "November–March", note: "Best quality window around Jersey; check the fishermen’s fresh landings.", source: "Visit Jersey" },
    { name: "Jersey lobster", status: month >= 4 && month <= 12 ? "in_season" : "watch_daily_landing", months: "April–December; peak May–September", note: month >= 4 && month <= 12 ? "Still within the local season; the main peak has passed after September." : "Outside the usual local season; only list if a verified supplier confirms provenance and availability.", source: "Visit Jersey" },
    { name: "Bass, bream, mackerel and skate", status: "watch_daily_landing", months: "Daily landing dependent", note: "Recognised local fish-market species; promote only when a Jersey fisher has published a fresh, traceable lot.", source: "Jersey Markets" },
  ];
  return items;
}
