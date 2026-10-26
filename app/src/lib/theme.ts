import { create } from 'zustand'
import { syncShellChrome } from './platform'
import { onPrefApplied } from './prefs'

// Day / Night — the two token themes (colors.css :root vs colors.dark.css
// [data-theme="night"]). Appearance is a device preference, so it lives in
// localStorage (instant, works pre-auth and offline); the choice behind it (Settings › Theme,
// `kf_theme_mode`) follows the person across devices through lib/prefsSync.
// index.html carries a tiny inline script that applies the saved value before
// first paint; this store keeps the DOM and any control in sync thereafter.

export type Theme = 'day' | 'night'
const KEY = 'kf_theme'

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === 'night' ? 'night' : 'day'
  } catch {
    return 'day'
  }
}

function apply(theme: Theme) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme
  syncShellChrome(theme) // M1: the Android shell's bar strips follow Day/Night
}

interface ThemeState {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

export const useTheme = create<ThemeState>((set, get) => {
  apply(read()) // reconcile the DOM in case the inline pre-paint script didn't run
  return {
    theme: read(),
    toggle: () => get().setTheme(get().theme === 'night' ? 'day' : 'night'),
    setTheme: (t) => {
      try {
        localStorage.setItem(KEY, t)
      } catch {
        /* private mode — session-only theme is fine */
      }
      apply(t)
      set({ theme: t })
    },
  }
})

/** Light / Dark / Auto (Settings › Theme). Synced; Auto follows each device's own system. */
export const THEME_MODE_KEY = 'kf_theme_mode'
export type ThemeMode = 'light' | 'dark' | 'auto'
export function readThemeMode(): ThemeMode {
  try {
    const m = localStorage.getItem(THEME_MODE_KEY)
    return m === 'dark' || m === 'auto' ? m : m === 'light' ? 'light' : read() === 'night' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}
export function themeOfMode(mode: ThemeMode): Theme {
  if (mode === 'auto') return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day'
  return mode === 'dark' ? 'night' : 'day'
}
// Another device picked a theme: wear it here.
onPrefApplied(THEME_MODE_KEY, () => useTheme.getState().setTheme(themeOfMode(readThemeMode())))

// ── Paper texture (punch 53, Settings › Paper texture): the grain's opacity on <html>, which the pages'
// grain (.kf-page::after, features/projects/xfx.css) reads. index.html applies it before first paint. ──
export const GRAIN_KEY = 'kf_grain'
export function readGrainPct(): number {
  try {
    const raw = localStorage.getItem(GRAIN_KEY)
    const n = Number(raw)
    if (raw !== null && Number.isFinite(n)) return Math.min(100, Math.max(0, Math.round(n)))
  } catch {
    /* private mode */
  }
  return 50 // matches the grain's shipped opacity 0.5
}
export function applyGrainPct(pct: number): void {
  if (typeof document !== 'undefined') document.documentElement.style.setProperty('--kf-grain-opacity', String(pct / 100))
}
onPrefApplied(GRAIN_KEY, () => applyGrainPct(readGrainPct()))
