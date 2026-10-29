import { Browser } from '@capacitor/browser'
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

/** iOS PWA (2026-10-29): the status bar (and an installed app's title bar) wears the page's own background
 * through index.html's theme-color metas, so it follows the app's Day/Night, not only the system's. */
export function syncThemeColor(w: Window | undefined = typeof window === 'undefined' ? undefined : window): void {
  if (!w?.document.body) return
  const hex = rgbToHex(w.getComputedStyle(w.document.body).backgroundColor)
  if (hex) w.document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', hex))
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

type TauriBridge = { invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> }

/** Opens another site in the system browser. Neither shell's web view opens a window.open or a
 * target="_blank" (Kai 2026-10-14: Settings → Google → Connect did nothing), so: the Windows app
 * asks Tauri's opener plugin (src-tauri, the same bridge as features/tray/native.ts), the Android
 * app opens a Custom Tab (where Google allows its sign-in, unlike a web view), a browser a new tab. */
export async function openExternal(url: string, w: Window | undefined = typeof window === 'undefined' ? undefined : window): Promise<void> {
  if (isCapacitorShell()) return Browser.open({ url })
  const tauri = (w as unknown as { __TAURI_INTERNALS__?: TauriBridge } | undefined)?.__TAURI_INTERNALS__
  if (tauri) return void (await tauri.invoke('plugin:opener|open_url', { url }))
  w?.open(url, '_blank', 'noopener,noreferrer')
}

/** Hands a file the app made (Settings → Export your data) to the person. A browser tab, the PWA and
 * the Windows app: a Blob download (WebView2 saves it to Downloads and shows its download flyout, as
 * it did the installer before the updater). The Android app's WebView has no downloads, so the file
 * goes to the app's cache and the share sheet opens on it — Files, Drive, mail, wherever they pick
 * (@capacitor/filesystem + share, imported only there). 'cancelled' = they closed the sheet. */
export async function saveFile(name: string, type: string, text: string): Promise<'saved' | 'shared' | 'cancelled'> {
  if (isCapacitorShell()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 })
    try {
      await Share.share({ title: name, files: [uri] })
      return 'shared'
    } catch (e) {
      if (/cancel/i.test(String((e as Error)?.message ?? e))) return 'cancelled'
      throw e
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'saved'
}

/** The address a link leaves the app for: an http(s) page on another origin than `here` (this
 * page). Null for the app's own routes, #anchors, mailto: and the like. */
export function externalHref(href: string, here: string): string | null {
  try {
    const u = new URL(href, here)
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.origin !== new URL(here).origin ? u.href : null
  } catch {
    return null
  }
}

/** Once, at boot (main.tsx), in the shells only: a click on a link to another site goes through
 * openExternal, so every <a href> to GitHub, a captured page or a download works without each one
 * knowing about the shells. The app's own links stay in the app. */
export function installExternalLinks(w: Window = window): void {
  if (!isNativeShell(w)) return
  w.document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented) return
      const a = (e.target as Element | null)?.closest?.('a[href]')
      const url = a && externalHref(a.getAttribute('href') ?? '', w.location.href)
      if (!url) return
      e.preventDefault()
      void openExternal(url, w)
    },
    true,
  )
}
