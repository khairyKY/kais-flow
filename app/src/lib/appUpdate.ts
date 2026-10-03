import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

// Settings → App → "Check for updates" (Kai 2026-10-03). One button, three platforms, $0:
//   · web / PWA: /version.json (the live deploy, stamped by vite.config's buildStamp) against the
//     commit in this page's own kf-build meta tag. Newer → refresh the service worker and reload.
//   · Android (Capacitor) and Windows (Tauri): GitHub's latest release against the installed
//     version (versionName / tauri.conf.json, both stamped from the release tag). Newer → open
//     that release's own installer for this platform.
// One request per click, nothing in the background.

export type AppPlatform = 'web' | 'android' | 'windows'
export const RELEASES_LATEST = 'https://api.github.com/repos/khairyKY/kais-flow/releases/latest'

export type UpdateResult =
  | { kind: 'reload' } // web: a newer deploy is live
  | { kind: 'download'; version: string; url: string } // native: a newer release, its installer
  | { kind: 'pending'; version: string } // native: a newer release without this platform's file (yet)
  | { kind: 'current'; version: string | null }
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
export function releaseAssetName(tag: string, platform: 'android' | 'windows'): string {
  return platform === 'android' ? `kais-flow-${tag}.apk` : `kais-flow-${tag}-windows-setup.exe`
}

interface Release {
  tag_name: string
  assets?: { name: string; browser_download_url: string }[]
}

/** What GitHub's latest release means for an installed `version` on `platform`. */
export function nativeVerdict(release: Release, version: string, platform: 'android' | 'windows'): UpdateResult {
  const tag = release.tag_name
  if (compareVersions(tag, version) <= 0) return { kind: 'current', version: `v${version.replace(/^v/i, '')}` }
  const asset = release.assets?.find((a) => a.name === releaseAssetName(tag, platform))
  return asset ? { kind: 'download', version: tag, url: asset.browser_download_url } : { kind: 'pending', version: tag }
}

export function appPlatform(w: Window = window): AppPlatform {
  if (Capacitor.isNativePlatform()) return 'android'
  return '__TAURI_INTERNALS__' in w ? 'windows' : 'web'
}

/** This page's own build stamp (vite.config buildStamp: `<meta name="kf-build" content="sha iso">`);
 * null on a dev server, which has none. */
export function buildStamp(doc: Document = document): { commit: string; builtAt: string } | null {
  const [commit, builtAt] = (doc.querySelector('meta[name="kf-build"]')?.getAttribute('content') ?? '').split(' ')
  return commit && builtAt ? { commit, builtAt } : null
}

/** The installed app's version on a native shell (Android versionName / Tauri's version); null on
 * the web or when the shell won't say. */
export async function installedVersion(platform: AppPlatform = appPlatform()): Promise<string | null> {
  try {
    if (platform === 'android') return (await App.getInfo()).version
    if (platform === 'windows') {
      const tauri = (window as unknown as { __TAURI_INTERNALS__?: { invoke(cmd: string): Promise<unknown> } }).__TAURI_INTERNALS__
      const v = await tauri?.invoke('plugin:app|version')
      return typeof v === 'string' ? v : null
    }
  } catch {
    /* an older shell without the call: shown as "version unknown" */
  }
  return null
}

export async function checkForUpdate(platform: AppPlatform = appPlatform()): Promise<UpdateResult> {
  try {
    if (platform === 'web') {
      const mine = buildStamp()
      if (!mine) return { kind: 'dev' }
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) return { kind: 'offline' }
      const live = (await res.json()) as { commit?: string }
      return live.commit && live.commit !== 'unknown' && live.commit !== mine.commit ? { kind: 'reload' } : { kind: 'current', version: null }
    }
    const version = await installedVersion(platform)
    const res = await fetch(RELEASES_LATEST, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' })
    if (!res.ok) return { kind: 'offline' }
    const release = (await res.json()) as Release
    if (!version) return { kind: 'pending', version: release.tag_name }
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
 * download and the app stays where it is. */
export function openDownload(url: string): void {
  window.location.assign(url)
}
