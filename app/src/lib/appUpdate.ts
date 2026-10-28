import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { openExternal } from './platform'

// Settings → App → "Check for updates" (Kai 2026-10-03). One button, three platforms, $0:
//   · web / PWA: /version.json (the live deploy, stamped by vite.config's buildStamp) against the
//     commit in this page's own kf-build meta tag. Newer → refresh the service worker and reload.
//   · Android (Capacitor) and Windows (Tauri): GitHub's latest release against the installed
//     version (versionName / tauri.conf.json, both stamped from the release tag). Newer → open
//     that release's own installer for this platform; the Windows app installs it in place
//     (installUpdate: Tauri's updater, so no SmartScreen screen).
//   · Mac (the same Tauri shell, 2026-10-29): as Windows — latest.json's darwin entries, then the app
//     restarts itself (the updater swaps the .app but doesn't reopen it); the fallback is the .dmg.
//   · Windows from the Microsoft Store (an MSIX, docs/MICROSOFT-STORE.md): the Store updates it, so
//     nothing is fetched or offered (Kai 2026-10-14: a Store install must not nag about the .exe).
// One request per click, nothing in the background.

export type AppPlatform = 'web' | 'android' | 'windows' | 'mac'
/** The two desktop apps (the Tauri shell). */
export type DesktopPlatform = 'windows' | 'mac'
/** Where releases live (2026-10-29): a public repo of release files only, so the source repo can go
 * private and downloads + updates keep working (release.yml publishes there). */
export const RELEASES_REPO = 'khairyKY/kais-flow-releases'
export const RELEASES_LATEST = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`

export type UpdateResult =
  | { kind: 'reload'; version?: string } // web: a newer deploy is live (its release, when version.json says)
  | { kind: 'download'; version: string; url: string; body?: string | null } // native: a newer release, its installer (+ its notes)
  | { kind: 'pending'; version: string; body?: string | null } // native: a newer release without this platform's file (yet)
  | { kind: 'current'; version: string | null }
  | { kind: 'store'; version: string | null } // the Microsoft Store install: the Store updates it
  | { kind: 'dev' } // a dev server: nothing was deployed from it
  | { kind: 'offline' }

/** -1 / 0 / 1 for two version strings ('v1.0.14', '1.0.15', '0.0.0-dev.abc1234'). Missing parts
 * count as 0; a pre-release ('-…') sorts before the same release. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const s = v.trim().replace(/^v/i, '')
    const dash = s.indexOf('-')
    const core = (dash < 0 ? s : s.slice(0, dash)).split('+')[0]
    return { nums: core.split('.').map((n) => parseInt(n, 10) || 0), pre: dash >= 0 }
  }
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
    if (d) return Math.sign(d)
  }
  return x.pre === y.pre ? 0 : x.pre ? -1 : 1
}

/** The release file a platform installs from (android.yml / desktop.yml name them from the tag). */
export function releaseAssetName(tag: string, platform: 'android' | DesktopPlatform): string {
  return platform === 'android' ? `kais-flow-${tag}.apk` : platform === 'mac' ? `kais-flow-${tag}-mac.dmg` : `kais-flow-${tag}-windows-setup.exe`
}

/** The newest release's installers under fixed names: android.yml / desktop.yml upload a version-less
 * copy beside the versioned file, so these links never go stale (the download bar, Settings → App). */
export const LATEST_DOWNLOADS = {
  android: `https://github.com/${RELEASES_REPO}/releases/latest/download/kais-flow.apk`,
  windows: `https://github.com/${RELEASES_REPO}/releases/latest/download/kais-flow-windows-setup.exe`,
  mac: `https://github.com/${RELEASES_REPO}/releases/latest/download/kais-flow-mac.dmg`,
} as const
export type DownloadPlatform = keyof typeof LATEST_DOWNLOADS

/** A Mac (not an iPhone; an iPad asking for the desktop site says Macintosh too, ponytail: it gets the .dmg first). */
export const isMacUA = (ua: string) => /Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPod/i.test(ua)

/** The device's own app first: Windows on a Windows computer, the Mac app on a Mac, Android everywhere else (phones). */
export function downloadOrder(ua: string = navigator.userAgent): DownloadPlatform[] {
  if (/Windows/i.test(ua) && !/Android/i.test(ua)) return ['windows', 'mac', 'android']
  if (isMacUA(ua)) return ['mac', 'windows', 'android']
  return ['android', 'windows', 'mac']
}

/** A plain browser tab: not a native shell, not the installed PWA (display-mode standalone; iOS's own flag). */
export function inPlainBrowser(w: Window = window): boolean {
  return appPlatform(w) === 'web' && !w.matchMedia?.('(display-mode: standalone)').matches && !(w.navigator as { standalone?: boolean }).standalone
}

interface Release {
  tag_name: string
  /** The release's notes (release.yml writes them from site/src/releases.json; lib/whatsNew reads them). */
  body?: string | null
  assets?: { name: string; browser_download_url: string }[]
}

/** What GitHub's latest release means for an installed `version` on `platform`. */
export function nativeVerdict(release: Release, version: string, platform: 'android' | DesktopPlatform): UpdateResult {
  const tag = release.tag_name
  if (compareVersions(tag, version) <= 0) return { kind: 'current', version: `v${version.replace(/^v/i, '')}` }
  const asset = release.assets?.find((a) => a.name === releaseAssetName(tag, platform))
  return asset ? { kind: 'download', version: tag, url: asset.browser_download_url, body: release.body } : { kind: 'pending', version: tag, body: release.body }
}

export function appPlatform(w: Window = window): AppPlatform {
  if (Capacitor.isNativePlatform()) return 'android'
  if (!('__TAURI_INTERNALS__' in w)) return 'web'
  return isMacUA(w.navigator?.userAgent ?? '') ? 'mac' : 'windows'
}

/** This page's own build stamp (vite.config buildStamp: `<meta name="kf-build" content="sha iso">`);
 * null on a dev server, which has none. */
export function buildStamp(doc: Document = document): { commit: string; builtAt: string } | null {
  const [commit, builtAt] = (doc.querySelector('meta[name="kf-build"]')?.getAttribute('content') ?? '').split(' ')
  return commit && builtAt ? { commit, builtAt } : null
}

const tauri = () => (window as unknown as { __TAURI_INTERNALS__?: { invoke(cmd: string): Promise<unknown> } }).__TAURI_INTERNALS__

/** The installed app's version on a native shell (Android versionName / Tauri's version); null on
 * the web or when the shell won't say. */
export async function installedVersion(platform: AppPlatform = appPlatform()): Promise<string | null> {
  try {
    if (platform === 'android') return (await App.getInfo()).version
    if (platform === 'windows' || platform === 'mac') {
      const v = await tauri()?.invoke('plugin:app|version')
      return typeof v === 'string' ? v : null
    }
  } catch {
    /* an older shell without the call: shown as "version unknown" */
  }
  return null
}

/** The Windows app installed from the Microsoft Store (src-tauri tray.rs `store_install`: it has a
 * package identity). False everywhere else, and on a shell too old to say. */
export async function storeInstall(platform: AppPlatform = appPlatform()): Promise<boolean> {
  try {
    return platform === 'windows' && (await tauri()?.invoke('store_install')) === true
  } catch {
    return false
  }
}

export async function checkForUpdate(platform: AppPlatform = appPlatform()): Promise<UpdateResult> {
  try {
    if (platform === 'web') {
      const mine = buildStamp()
      if (!mine) return { kind: 'dev' }
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) return { kind: 'offline' }
      const live = (await res.json()) as { commit?: string; version?: string }
      return live.commit && live.commit !== 'unknown' && live.commit !== mine.commit ? { kind: 'reload', version: live.version } : { kind: 'current', version: null }
    }
    const version = await installedVersion(platform)
    if (await storeInstall(platform)) return { kind: 'store', version: version && `v${version.replace(/^v/i, '')}` }
    const res = await fetch(RELEASES_LATEST, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' })
    if (!res.ok) return { kind: 'offline' }
    const release = (await res.json()) as Release
    if (!version) return { kind: 'pending', version: release.tag_name, body: release.body }
    return nativeVerdict(release, version, platform)
  } catch {
    return { kind: 'offline' }
  }
}

let swRegistration: ServiceWorkerRegistration | undefined
/** main.tsx hands over the PWA's registration so "Reload" can fetch the new worker first. */
export function setSwRegistration(r: ServiceWorkerRegistration | undefined): void {
  swRegistration = r
}

/** Web: look for the new service worker (registerType autoUpdate swaps it in and reloads on its
 * own once it takes over); reload anyway if that hasn't happened in a few seconds. */
export async function reloadToUpdate(): Promise<void> {
  try {
    await swRegistration?.update()
  } catch {
    /* offline between the check and the click: the reload below still runs */
  }
  window.setTimeout(() => window.location.reload(), swRegistration ? 4000 : 0)
}

/** Native: hand the installer to the system. Android's shell opens any off-app address in the
 * browser, which downloads the APK; on Windows the WebView turns the file response into a
 * download and the app stays where it is. The Mac app's WKWebView has no downloads (it would
 * navigate away from the app), so the .dmg opens in the system browser. */
export function openDownload(url: string, platform: AppPlatform = appPlatform()): void {
  if (platform === 'mac') return void openExternal(url)
  window.location.assign(url)
}

/** The update's progress line: a percent when the size is known, else the megabytes so far. */
export function progressLine(done: number, total: number): string {
  return total > 0 ? `Downloading… ${Math.min(100, Math.round((done / total) * 100))}%` : `Downloading… ${(done / 1e6).toFixed(1)} MB`
}

/** Update to the newer release whose installer is `url`. The Windows app (the .exe install — a Store
 * install never gets here, its check says 'store') updates in place (Kai 2026-10-16): Tauri's updater
 * fetches the release's signed installer itself (latest.json, desktop.yml) and runs it with a small
 * progress window, then the app quits and the installer reopens it. No browser download means no
 * Mark-of-the-Web, so no SmartScreen screen. A release without latest.json (v1.2.0 and older), a bad
 * signature, offline: the browser download, as before. Everywhere else: the browser download. */
export async function installUpdate(url: string, onProgress: (line: string) => void = () => {}, platform: AppPlatform = appPlatform()): Promise<void> {
  if (platform === 'windows' || platform === 'mac') {
    try {
      onProgress('Downloading…')
      // Imported here so the web and Android bundles never carry it.
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()
      if (update) {
        let done = 0
        let total = 0
        await update.downloadAndInstall((e) => {
          if (e.event === 'Started') total = e.data.contentLength ?? 0
          else if (e.event === 'Progress') onProgress(progressLine((done += e.data.chunkLength), total))
          else onProgress('Installing… Kai’s Flow reopens in a moment')
        })
        if (platform === 'mac') await tauri()?.invoke('app_restart') // tray.rs: the Windows installer reopens the app itself
        return
      }
    } catch (e) {
      console.warn('In-app update failed, downloading the installer instead', e)
    }
  }
  openDownload(url, platform)
}
