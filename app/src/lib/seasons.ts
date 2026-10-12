// Seasons.dc.html: the season is real, read from the clock (the Android Season widget shows it).
// Kai 2026-10-12 ("fix or cut"): the weather was cut — it was Cairo's for everyone (a time zone has
// no coordinates), and he doesn't live in Cairo. Bring it back only with a real place setting.

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

// Same meteorological-season convention as features/herbarium/HerbariumPage.tsx's getSeasonAndYear.
export function getSeason(date: Date): Season {
  const month = date.getMonth()
  if (month >= 2 && month <= 4) return 'spring'
  if (month >= 5 && month <= 7) return 'summer'
  if (month >= 8 && month <= 10) return 'autumn'
  return 'winter'
}
