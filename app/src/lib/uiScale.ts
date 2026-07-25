import { create } from 'zustand'

// R4 (Kai, 2026-07-20): "all of this audit was done while a 125 and 150% zoom was applied,
// things look most natural [at] 110% but everything feels small."
//
// The tokens aren't wrong — they transcribe the export's absolute px values faithfully. The
// whole interface just needs to render larger than 1:1 on his display, which is a *rendering*
// concern, not a design-token one. So this scales the document rather than rewriting every
// size (there are hundreds of hardcoded px values in inline styles; scaling tokens alone would
// leave the two drifting apart).
//
// Mechanism: `zoom` on the root element. Verified in-browser before adopting it:
//   · zoom 1.15 -> a fixed element at left:400 reports left:460 and still hit-tests to itself,
//     so getBoundingClientRect and pointer coords stay in ONE space and every popover that
//     positions from clientX/clientY (QuickCreate, ContextMenu, SnoozeMenu) keeps working.
//   · `transform: scale()` was rejected: it skewed the same element to left:365 and creates a
//     containing block for fixed descendants — the exact bug class that cost this repo a day
//     on 2026-07-19.
//   · media queries do NOT shift with root zoom, so scaling up can never flip the desktop
//     layout into the mobile one.
//
// Like the theme, this is a per-device preference: localStorage, not the synced settings row,
// so it works pre-auth and offline. index.html applies it before first paint.

export const UI_SCALES = [1, 1.1, 1.25, 1.5, 1.75] as const
export type UiScale = (typeof UI_SCALES)[number]

export const UI_SCALE_KEY = 'kf_ui_scale'
/** 125%. 110% was still "kinda zoomed out / small" (2026-07-21), and 125 is also a cleaner
 * ratio than 110 — fewer fractional device pixels, so hairlines and text land crisper. */
export const DEFAULT_UI_SCALE: UiScale = 1.25

export function readUiScale(): UiScale {
  try {
    const raw = Number(localStorage.getItem(UI_SCALE_KEY))
    return (UI_SCALES as readonly number[]).includes(raw) ? (raw as UiScale) : DEFAULT_UI_SCALE
  } catch {
    return DEFAULT_UI_SCALE
  }
}

export function applyUiScale(scale: UiScale): void {
  if (typeof document === 'undefined') return
  // Leave the property off entirely at 1:1 rather than setting `zoom: 1`.
  document.documentElement.style.zoom = scale === 1 ? '' : String(scale)
}

interface UiScaleState {
  scale: UiScale
  setScale: (s: UiScale) => void
}

export const useUiScale = create<UiScaleState>((set) => {
  applyUiScale(readUiScale()) // reconcile in case the pre-paint script didn't run
  return {
    scale: readUiScale(),
    setScale: (s) => {
      try {
        localStorage.setItem(UI_SCALE_KEY, String(s))
      } catch {
        /* private mode — session-only scale is fine */
      }
      applyUiScale(s)
      set({ scale: s })
    },
  }
})
