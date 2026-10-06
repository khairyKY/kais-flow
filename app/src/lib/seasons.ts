import { useQuery } from '@tanstack/react-query'

// Shared season/weather logic — Seasons.dc.html. Season is real (derived from the clock);
// weather is a live, no-key fetch (Open-Meteo, $0, no secrets) for Cairo's fixed coordinates —
// shown only to users whose zone is Africa/Cairo (a zone has no coordinates; TopbarEcho).

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

// Same meteorological-season convention as features/herbarium/HerbariumPage.tsx's getSeasonAndYear.
export function getSeason(date: Date): Season {
  const month = date.getMonth()
  if (month >= 2 && month <= 4) return 'spring'
  if (month >= 5 && month <= 7) return 'summer'
  if (month >= 8 && month <= 10) return 'autumn'
  return 'winter'
}

export const SEASON_META: Record<
  Season,
  { label: string; bg: string; radial: string; asset: string; assetFilter?: string }
> = {
  spring: {
    label: 'Spring · blossom density',
    bg: 'var(--sky-panel, #F0EBD8)',
    radial: 'radial-gradient(ellipse 90% 50% at 50% 0%, rgba(216,229,205,0.55), rgba(216,229,205,0) 70%)',
    asset: '/ds/assets/cherry/bloom.png',
  },
  summer: {
    label: 'Summer · high warm light',
    bg: 'var(--sky-panel, #F3EBD2)',
    radial: 'radial-gradient(ellipse 100% 60% at 50% 0%, rgba(232,217,160,0.6), rgba(232,217,160,0) 72%)',
    asset: '/ds/assets/daisy/midday.png',
  },
  autumn: {
    label: 'Autumn · leaf tint',
    bg: 'var(--sky-panel, #EDE2CC)',
    radial: 'radial-gradient(ellipse 90% 50% at 50% 0%, color-mix(in srgb, var(--acc-gold-warm) 28%, transparent), transparent 70%)',
    asset: '/ds/assets/vine/lush.png',
    assetFilter: 'sepia(0.3) saturate(0.85)',
  },
  winter: {
    label: 'Winter · damp light, dew',
    bg: 'var(--sky-panel, #EAE8E0)',
    radial: 'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(190,200,205,0.4), rgba(190,200,205,0) 70%)',
    asset: '/ds/assets/clover/dewdrop.png',
    assetFilter: 'saturate(0.8)',
  },
}

const CAIRO = { latitude: 30.0444, longitude: 31.2357 }

// WMO weather codes → the short label style Seasons.dc.html 1c shows ("34° clear").
const WEATHER_LABELS: Record<number, string> = {
  0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'cloudy',
  45: 'fog', 48: 'fog',
  51: 'drizzle', 53: 'drizzle', 55: 'drizzle', 56: 'drizzle', 57: 'drizzle',
  61: 'rain', 63: 'rain', 65: 'rain', 66: 'rain', 67: 'rain',
  71: 'snow', 73: 'snow', 75: 'snow', 77: 'snow',
  80: 'showers', 81: 'showers', 82: 'showers',
  85: 'snow showers', 86: 'snow showers',
  95: 'storm', 96: 'storm', 99: 'storm',
}

export interface CairoWeather {
  tempC: number
  condition: string
}

// ponytail: no weather provider exists elsewhere in the app — Open-Meteo needs no key/secret,
// so this stays a plain client fetch (not a new edge-function integration). Fails soft: the
// topbar echo just omits the weather half and shows the season on its own.
export function useCairoWeather(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['cairo-weather'],
    queryFn: async (): Promise<CairoWeather> => {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${CAIRO.latitude}&longitude=${CAIRO.longitude}&current_weather=true`,
      )
      if (!res.ok) throw new Error('weather fetch failed')
      const json = await res.json()
      const cw = json.current_weather as { temperature: number; weathercode: number }
      return { tempC: Math.round(cw.temperature), condition: WEATHER_LABELS[cw.weathercode] ?? 'mild' }
    },
    staleTime: 30 * 60_000,
    retry: false,
  })
}
