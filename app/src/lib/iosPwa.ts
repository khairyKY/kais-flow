import { create } from 'zustand'
import { appPlatform, inPlainBrowser } from './appUpdate'

// The iPhone Home Screen app (iOS PWA pass, 2026-10-29): what only an installed web app gets — the install
// guide that gets you there, storage the system won't evict, the badge on the icon. All no-ops elsewhere.

type Nav = Navigator & { standalone?: boolean; setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> }

/** An iPhone, iPod or iPad (iPadOS asks for the desktop site: a Mac with a touch screen). */
export function isIOS(ua: string = navigator.userAgent, maxTouchPoints: number = navigator.maxTouchPoints ?? 0): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)
}

/** Safari itself on iOS — the browser whose Share sheet has "Add to Home Screen" (not Chrome, Firefox, Edge
 * or an app's in-app browser, which say CriOS / FxiOS / EdgiOS or carry no "Safari/" token). */
export function isIOSSafari(ua: string = navigator.userAgent, maxTouchPoints: number = navigator.maxTouchPoints ?? 0): boolean {
  return isIOS(ua, maxTouchPoints) && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua)
}

export const INSTALL_GUIDE_KEY = 'kf-install-guide-dismissed'

/** The Add to Home Screen guide shows by itself only in iOS Safari, only in a plain tab (not the installed
 * app), and only until it's dismissed on this device. */
export function shouldOfferInstall(o: { iosSafari: boolean; plainTab: boolean; dismissed: boolean }): boolean {
  return o.iosSafari && o.plainTab && !o.dismissed
}

export function installGuideDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_GUIDE_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissInstallGuide(): void {
  try {
    localStorage.setItem(INSTALL_GUIDE_KEY, '1')
  } catch {
    /* private mode: it asks again next visit */
  }
}

/** Whether the guide (components/InstallGuide) is on screen: by itself on a first visit, or from Settings → App. */
export const useInstallGuide = create<{ open: boolean }>(() => ({ open: false }))
export const openInstallGuide = (): void => useInstallGuide.setState({ open: true })

/** Offered by itself on this page load? */
export function offerInstallNow(): boolean {
  return shouldOfferInstall({ iosSafari: isIOSSafari(), plainTab: inPlainBrowser(), dismissed: installGuideDismissed() })
}

/** The installed web app (Home Screen / an installed PWA), not a tab. */
export function isInstalledWebApp(w: Window = window): boolean {
  return appPlatform(w) === 'web' && !inPlainBrowser(w)
}

export type StorageState = 'persisted' | 'best-effort' | 'unsupported'

export async function storageState(): Promise<StorageState> {
  try {
    if (!navigator.storage?.persisted) return 'unsupported'
    return (await navigator.storage.persisted()) ? 'persisted' : 'best-effort'
  } catch {
    return 'unsupported'
  }
}

/** Ask once per launch for storage the system won't clear under pressure (the outbox of unsent changes and the
 * offline cache live in IndexedDB). WebKit grants it to Home Screen apps on its own heuristics, Chrome to installed
 * or engaged sites — neither prompts. Only on a phone/tablet or in the installed app: a computer's tab keeps
 * behaving as before (Firefox would ask with a prompt there). */
export async function persistStorage(): Promise<StorageState> {
  try {
    if (appPlatform() !== 'web' || !navigator.storage?.persist) return 'unsupported'
    if (await navigator.storage.persisted()) return 'persisted'
    if (!isInstalledWebApp() && !matchMedia('(pointer: coarse)').matches) return 'best-effort'
    return (await navigator.storage.persist()) ? 'persisted' : 'best-effort'
  } catch {
    return 'unsupported'
  }
}

/** The number on the Home Screen icon (iOS 16.4+ installed apps, installed Chrome apps): what's due — the Tasks
 * Today list, overdue included. Cleared at 0. The web app only: the Android and Windows apps have their own. */
export function setAppBadge(n: number): void {
  try {
    if (appPlatform() !== 'web') return
    const nav = navigator as Nav
    const p = n > 0 ? nav.setAppBadge?.(n) : nav.clearAppBadge?.()
    void p?.catch(() => {})
  } catch {
    /* not supported here */
  }
}
