// Where the app is running (M1, docs/phases/M1-android.md). The same dist/ ships as the web app
// and inside the Tauri native shells (Android APK, later Windows/macOS); the shell injects
// `window.__TAURI_INTERNALS__` before any app code runs, so this is settled at import time.

/** True inside a Tauri shell (the APK / desktop app), false in a browser tab or installed PWA. */
export function isNativeShell(w: object | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  return !!w && '__TAURI_INTERNALS__' in w
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

/** Android shell only (android/MainActivity.kt): tell it the page colour and whether its icons
 * should be dark, so the status/navigation-bar strips it keeps clear read as part of the page in
 * Day and Night. A no-op everywhere else. */
export function syncShellChrome(theme: 'day' | 'night', w: Window | undefined = typeof window === 'undefined' ? undefined : window): void {
  const bridge = (w as unknown as { KaisFlowShell?: ShellBridge } | undefined)?.KaisFlowShell
  if (!w || !bridge || !w.document.body) return
  const hex = rgbToHex(w.getComputedStyle(w.document.body).backgroundColor)
  if (hex) bridge.setChrome(hex, theme === 'day')
}

/** Where emailed auth links (password reset, sign-up confirmation) should land. In a browser: this
 * page's origin. Inside the native shell the origin is `https://tauri.localhost`, which no email
 * link can open, so they go to the public web app instead (`VITE_PUBLIC_APP_URL`, set by the
 * native builds); the person then signs in inside the app as usual. */
export function authLinkOrigin(
  env: Record<string, unknown> = import.meta.env,
  w: Window | undefined = typeof window === 'undefined' ? undefined : window,
): string {
  const publicUrl = typeof env.VITE_PUBLIC_APP_URL === 'string' ? env.VITE_PUBLIC_APP_URL.replace(/\/+$/, '') : ''
  if (isNativeShell(w) && publicUrl) return publicUrl
  return w?.location.origin ?? publicUrl
}
