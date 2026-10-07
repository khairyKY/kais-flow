import { create } from 'zustand'
import NOTES_JSON from '../../../site/src/releases.json'
import { compareVersions, type UpdateResult } from './appUpdate'
import { inQuietHours, isPaused, type NoticePrefs } from '../../../supabase/functions/notify/copy.ts'

// What's new (Kai 2026-10-07): the release notes inside the app. One source — the site's own
// site/src/releases.json, bundled at build time — so the app, the site's What's new / Field notes
// and the GitHub Release body (release.yml writes it from the same entry) never disagree. A version
// newer than this bundle is read from its GitHub Release body instead. The rules for when to say
// something are the small pure functions below; features/whats-new runs them.

export interface ReleaseNote {
  v: string
  date?: string
  title?: string
  highlights: string[]
}

/** Every release's notes, newest first. */
export const NOTES: readonly ReleaseNote[] = NOTES_JSON
/** The newest version these notes know = the version this build is (the web app has no other number). */
export const BUNDLED_VERSION = NOTES[0].v
/** "All release notes →": the site's What's new page (the address site/build.mjs defaults SITE_URL to). */
export const RELEASE_NOTES_URL = 'https://kais-flow-site.pages.dev/whats-new/'

export function noteFor(v: string): ReleaseNote | null {
  return NOTES.find((n) => compareVersions(n.v, v) === 0) ?? null
}

/** The highlights in a GitHub Release body: the "- " lines release.yml writes from releases.json.
 * GitHub's generated notes (a release without an entry) have their list under "## What's Changed"
 * — commit titles, not highlights — so reading stops at the first heading. */
export function highlightsFromBody(body: string | null | undefined): string[] {
  const out: string[] = []
  for (const line of (body ?? '').split(/\r?\n/)) {
    if (line.startsWith('#')) break
    const m = /^\s*[-*]\s+(.+)$/.exec(line)
    if (m) out.push(m[1].trim())
  }
  return out
}

/** "Updated to vX · What's new" on this launch? Once per version: `current` is newer than what this
 * device last saw. Nothing seen yet = the first launch here: a brand-new account didn't update, so
 * nothing; an older one hears about it once (this feature's first version, or a fresh install). */
export function shouldShowUpdated(lastSeen: string | null, current: string, newAccount: boolean): boolean {
  return lastSeen ? compareVersions(current, lastSeen) > 0 : !newAccount
}

/** Signed up within the last day. */
export function isNewAccount(createdAt: string | null | undefined, now: number): boolean {
  const t = createdAt ? Date.parse(createdAt) : NaN
  return Number.isFinite(t) && now - t < 86_400_000
}

/** "vX is out · See what's new"? For a version newer than the running one and newer than the last
 * one we told this person about — one toast per new version, never a nag. */
export function shouldNudge(latest: string, current: string, lastNotified: string | null): boolean {
  return compareVersions(latest, current) > 0 && (!lastNotified || compareVersions(latest, lastNotified) > 0)
}

/** The quiet check on start runs at most once a day (a clock set back counts as due). */
export function dueForCheck(lastChecked: number | null | undefined, now: number): boolean {
  return lastChecked == null || now - lastChecked >= 86_400_000 || now < lastChecked
}

/** The Windows toast as well? Not while someone is looking at the app (the in-app toast is the news
 * then), in quiet hours, or while notifications are paused (Settings → Notifications, the tray). */
export function nativeNudgeAllowed(p: NoticePrefs | null | undefined, now: Date, zone: string, looking: boolean): boolean {
  return !looking && !isPaused(p, now) && !inQuietHours(p, now, zone)
}

// ── what this device remembers, per user: the last version seen, the last one toasted, the last check ──
export interface WhatsNewMemory {
  seen?: string
  notified?: string
  checkedAt?: number
}
const memoryKey = (uid: string) => `kf-whats-new:${uid}`

/** null when storage can't be read — then "once" can't be kept, so nothing is shown at all. */
export function readMemory(uid: string): WhatsNewMemory | null {
  try {
    return (JSON.parse(localStorage.getItem(memoryKey(uid)) ?? '{}') as WhatsNewMemory | null) ?? {}
  } catch {
    return null
  }
}

export function remember(uid: string, patch: WhatsNewMemory): void {
  try {
    localStorage.setItem(memoryKey(uid), JSON.stringify({ ...readMemory(uid), ...patch }))
  } catch {
    /* this session only */
  }
}

// ── shared state: the sheet, and the last update check (Settings → App and the sheet both read it) ──
interface WhatsNewState {
  /** The version the What's new sheet shows; null = closed. */
  sheet: string | null
  checking: boolean
  /** The last check's answer (lib/appUpdate) — what the Update button does. */
  result: UpdateResult | null
  /** A version newer than the running one, with its notes, from that check. */
  available: ReleaseNote | null
}
export const useWhatsNew = create<WhatsNewState>(() => ({ sheet: null, checking: false, result: null, available: null }))
export const openWhatsNew = (v: string) => useWhatsNew.setState({ sheet: v })
