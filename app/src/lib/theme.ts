import { create } from 'zustand'
import { syncShellChrome } from './platform'

// Day / Night — the two token themes (colors.css :root vs colors.dark.css
// [data-theme="night"]). Appearance is a device preference, so it lives in
// localStorage (instant, works pre-auth and offline), not the synced settings row.
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
