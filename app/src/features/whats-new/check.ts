import { appPlatform, checkForUpdate, compareVersions, installedVersion, RELEASES_LATEST, type AppPlatform, type UpdateResult } from '../../lib/appUpdate'
import { appZone } from '../../lib/appZone'
import { queryClient } from '../../lib/queryClient'
import { useToastStore } from '../../lib/toastStore'
import { BUNDLED_VERSION, highlightsFromBody, nativeNudgeAllowed, noteFor, openWhatsNew, readMemory, remember, shouldNudge, useWhatsNew, type ReleaseNote } from '../../lib/whatsNew'
import { lookingHere } from '../notifications/local'
import { native } from '../tray/native'
import type { NoticePrefs } from '../../../../supabase/functions/notify/copy.ts'

// The update check behind What's new (Kai 2026-10-07): lib/appUpdate's Check for updates, unchanged in
// what it asks, plus the newer version's notes and the one toast per new version. The rules are
// lib/whatsNew.ts; the toasts' sheet and Settings → App's lists are ./WhatsNew.tsx.

/** The version running here: the native shell's own number, else this bundle's newest notes. */
export async function runningVersion(platform: AppPlatform): Promise<string> {
  const v = platform === 'web' ? null : await installedVersion(platform)
  return v ? `v${v.replace(/^v/i, '')}` : BUNDLED_VERSION
}

/** The GitHub Release body for `v` (web: version.json names the version, not its notes). */
async function releaseBody(v: string): Promise<string | null> {
  try {
    const res = await fetch(RELEASES_LATEST, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' })
    const r = res.ok ? ((await res.json()) as { tag_name?: string; body?: string | null }) : null
    return r?.tag_name && compareVersions(r.tag_name, v) === 0 ? (r.body ?? null) : null
  } catch {
    return null
  }
}

/** A newer version than `current` in the check's answer, with its notes (bundled, else its release body). */
async function availableFrom(r: UpdateResult, current: string): Promise<ReleaseNote | null> {
  const v = r.kind === 'download' || r.kind === 'pending' || r.kind === 'reload' ? r.version : undefined
  if (!v || compareVersions(v, current) <= 0) return null
  const known = noteFor(v)
  if (known) return known
  const body = r.kind === 'download' || r.kind === 'pending' ? r.body : await releaseBody(v)
  return { v, highlights: highlightsFromBody(body) }
}

let inflight: Promise<void> | null = null

/** Check for updates — Settings → App's button, Settings opening, and once a day on start. A newer
 * version than this one is toasted once (and on Windows, unless someone is looking, quiet hours or a
 * pause, a system toast too). One check at a time. */
export function checkForUpdates(uid: string | undefined): Promise<void> {
  return (inflight ??= runCheck(uid).finally(() => (inflight = null)))
}

async function runCheck(uid: string | undefined): Promise<void> {
  useWhatsNew.setState({ checking: true })
  const platform = appPlatform()
  const result = await checkForUpdate(platform)
  const current = await runningVersion(platform)
  const available = await availableFrom(result, current)
  useWhatsNew.setState({ checking: false, result, available })
  const mem = uid ? readMemory(uid) : null
  if (!uid || !mem || result.kind === 'offline') return // offline: try again next time
  // Only a version you can update to now: a release whose installer is still building waits.
  const nudge = !!available && result.kind !== 'pending' && shouldNudge(available.v, current, mem.notified ?? null)
  remember(uid, { checkedAt: Date.now(), ...(nudge && available ? { notified: available.v } : null) })
  if (!nudge || !available) return
  const v = available.v
  useToastStore.getState().push({ message: `${v} is out`, action: { label: 'See what’s new', run: () => openWhatsNew(v) } })
  const prefs = queryClient.getQueryData<NoticePrefs>(['app_settings'])
  if (platform === 'windows' && nativeNudgeAllowed(prefs, new Date(), appZone(), lookingHere())) {
    // tray.rs notify_local: the button runs window.__kfNotifyAction('whats-new', payload) (notifications/actions.ts).
    void native('notify_local', { title: `${v} is out`, body: 'See what’s new', actions: [['whats-new', 'See what’s new']], silent: false, payload: JSON.stringify({ kind: 'whats_new', version: v }) })
  }
}
