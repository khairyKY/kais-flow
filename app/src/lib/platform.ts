import { Capacitor } from '@capacitor/core'

// Where the app is running (M1, docs/phases/M1-android.md). The same dist/ ships as the web app,
// inside the Capacitor shell (Android APK, later iOS) and inside the Tauri shell (Windows
// installer). Both shells inject their bridge (`window.androidBridge` / `__TAURI_INTERNALS__`)
// before any app code runs, so this is settled at import time.

/** True inside the Capacitor shell (the Android APK). */
export function isCapacitorShell(): boolean {
  return Capacitor.isNativePlatform()
}

/** True inside a native shell (Capacitor or Tauri), false in a browser tab or installed PWA. */
export function isNativeShell(w: object | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  return isCapacitorShell() || (!!w && '__TAURI_INTERNALS__' in w)
}

interface ShellBridge {
  setChrome(color: string, light: boolean): void
}

/** `rgb(239, 233, 219)` / `rgba(…)` → `#efe9db`; null for anything else. */
export function rgbToHex(rgb: string): string | null {
  const m = rgb.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/)
  if (!m) return null
  return '#' + m.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('')
}

/** Android shell only (native/android/MainActivity.java): tell it the page colour and whether its
 * icons should be dark, so the status/navigation-bar strips it keeps clear read as part of the page
 * in Day and Night. A no-op everywhere else. */
export function syncShellChrome(theme: 'day' | 'night', w: Window | undefined = typeof window === 'undefined' ? undefined : window): void {
  const bridge = (w as unknown as { KaisFlowShell?: ShellBridge } | undefined)?.KaisFlowShell
  if (!w || !bridge || !w.document.body) return
  const hex = rgbToHex(w.getComputedStyle(w.document.body).backgroundColor)
  if (hex) bridge.setChrome(hex, theme === 'day')
}

let sheetsUp = 0
/** Android shell: while a bottom sheet is up, the strips take the sheet's colour, so the sheet runs
 * on into the gesture-bar strip under the page instead of stopping a page-coloured band short of the
 * screen's edge (Kai's 2026-10-07 phone review; the keyboard covers that strip, so the band only
 * showed with it down). Returns the release; the last sheet down hands the strips back to the page. */
export function holdShellChrome(el: Element, w: Window | undefined = typeof window === 'undefined' ? undefined : window): () => void {
  const bridge = (w as unknown as { KaisFlowShell?: ShellBridge } | undefined)?.KaisFlowShell
  if (!w || !bridge) return () => {}
  const night = () => w.document.documentElement.dataset.theme === 'night'
  const hex = rgbToHex(w.getComputedStyle(el).backgroundColor)
  if (hex) bridge.setChrome(hex, !night())
  sheetsUp += 1
  return () => {
    sheetsUp -= 1
    if (sheetsUp === 0) syncShellChrome(night() ? 'night' : 'day', w)
  }
}

/** Where emailed auth links (password reset, sign-up confirmation) should land. In a browser: this
 * page's origin. Inside a native shell the origin is `https://localhost` (Capacitor) or
 * `https://tauri.localhost`, which no email link can open, so they go to the public web app instead
 * (`VITE_PUBLIC_APP_URL`, set by the native builds); the person then signs in inside the app. */
export function authLinkOrigin(
  env: Record<string, unknown> = import.meta.env,
  w: Window | undefined = typeof window === 'undefined' ? undefined : window,
): string {
  const publicUrl = typeof env.VITE_PUBLIC_APP_URL === 'string' ? env.VITE_PUBLIC_APP_URL.replace(/\/+$/, '') : ''
  if (isNativeShell(w) && publicUrl) return publicUrl
  return w?.location.origin ?? publicUrl
}
