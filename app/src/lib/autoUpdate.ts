import { create } from 'zustand'
import { native } from '../features/tray/native'
import { appPlatform, compareVersions, progressLine, storeInstall, type DesktopPlatform } from './appUpdate'
import { dueForCheck } from './whatsNew'

// Silent desktop updates (Kai 2026-11-16: he ran an old version for days). The Windows and Mac apps look
// for a new version on launch and every few hours after (lib/whatsNew CHECK_EVERY_MS), download it in the
// background with no prompt, and hold it. It is installed only when the person leaves — Quit (the tray,
// Cmd+Q, closing the window with no tray icon: src-tauri update.rs holds the quit and calls __kfQuit
// here) — or taps "Restart to update" in Settings → App. Nothing here ever quits or restarts the app by
// itself, so nobody is cut off mid-typing. The next launch says "Updated to vX" (features/whats-new).
// An app that lives in the tray is almost never quit, so a downloaded update also installs once the main
// window has been hidden or minimised for IDLE_INSTALL_MS with no tray window open: the same path, and the
// app comes back hidden in the tray (src-tauri update.rs relaunch_hidden); the next time the window is
// shown it says "Updated to vX". (Installing on lock / suspend: skipped, Tauri has no cheap hook for it.)
// The outbox is flushed first (a few seconds at most); what is still unsent stays in storage and goes
// out after the restart, as after any quit.

export interface AutoState {
  phase: 'idle' | 'downloading' | 'ready' | 'installing'
  /** The version held (downloading, ready) or being installed. */
  version: string | null
  /** The status line while downloading or installing. */
  line: string | null
}
export const useAutoUpdate = create<AutoState>(() => ({ phase: 'idle', version: null, line: null }))

/** One update the updater found: held by the Rust side once downloaded. */
export interface Found {
  version: string
  download(onLine: (line: string) => void): Promise<void>
  /** Windows: runs the installer, which closes the app (`restart`: and reopens it). Mac: swaps the .app, then restarts or exits. */
  install(restart: boolean): Promise<void>
  discard(): void
}

export interface Deps {
  find(): Promise<Found | null>
  now(): number
  flush(): Promise<void>
  /** Tells the shell whether an update is waiting, so it holds a quit for it (update.rs). */
  setReady(ready: boolean): void
  /** Quit right now (update.rs app_exit). */
  exit(): void
  /** Is the app idle in the tray: main window hidden or minimised, no flyout / menu / capture window up (update.rs shell_idle). */
  shellIdle(): Promise<boolean>
  /** The next start is an update relaunch of an idle app: stay hidden (update.rs relaunch_hidden). */
  relaunchHidden(on: boolean): Promise<void>
}

/** How long the window must stay away before a ready update installs without a Quit. */
export const IDLE_INSTALL_MS = 10 * 60_000

/** One idle poll: `since` is when the app was first seen idle (null = in use); `fire` once that is IDLE_INSTALL_MS ago. */
export function idleStep(since: number | null, idleNow: boolean, now: number): { since: number | null; fire: boolean } {
  if (!idleNow) return { since: null, fire: false }
  const from = since === null || now < since ? now : since
  return { since: from, fire: now - from >= IDLE_INSTALL_MS }
}

/** The longest a quit or restart waits for the outbox before installing anyway. */
export const FLUSH_MS = 5000

export function createAutoUpdater(d: Deps) {
  let held: Found | null = null
  let lastAt: number | null = null
  let busy = false
  let idleSince: number | null = null
  const set = (p: Partial<AutoState>) => useAutoUpdate.setState(p)
  const settle = () => (held ? set({ phase: 'ready', version: held.version, line: null }) : set({ phase: 'idle', version: null, line: null }))

  /** Look for an update (when one is due, or `force`) and download it. Quiet: any failure waits for the next tick. */
  async function tick(force = false): Promise<void> {
    if (busy || useAutoUpdate.getState().phase === 'installing') return
    if (!force && !dueForCheck(lastAt, d.now())) return
    busy = true
    try {
      const found = await d.find()
      lastAt = d.now()
      if (!found) return
      if (held && compareVersions(found.version, held.version) <= 0) return found.discard() // already holding this one
      set({ phase: 'downloading', version: found.version, line: 'Downloading…' })
      try {
        await found.download((line) => set({ line }))
      } catch {
        found.discard()
        lastAt = null // offline half way: look again at the next tick, not in hours
        return settle()
      }
      held?.discard()
      held = found
      settle()
      d.setReady(true)
    } catch {
      /* offline, or the update endpoint is down: the next tick */
    } finally {
      busy = false
    }
  }

  /** Install the held update: flush the outbox first. True = it went in (on Windows the app is already gone). */
  async function install(restart: boolean, stillIdle?: () => Promise<boolean>): Promise<boolean> {
    const u = held
    if (!u || useAutoUpdate.getState().phase === 'installing') return false
    set({ phase: 'installing', line: restart ? 'Installing… Kai’s Flow reopens in a moment' : 'Installing…' })
    let giveUp: ReturnType<typeof setTimeout> | undefined
    await Promise.race([d.flush().catch(() => {}), new Promise<void>((r) => (giveUp = setTimeout(r, FLUSH_MS)))])
    clearTimeout(giveUp)
    if (stillIdle && !(await stillIdle().catch(() => false))) {
      settle() // the window came back while the outbox flushed
      return false
    }
    try {
      await u.install(restart)
      return true
    } catch (e) {
      console.warn('Installing the update failed', e)
      settle()
      return false
    }
  }

  /** The shell holds a quit while an update waits and calls this (window.__kfQuit): install, then leave. */
  async function quit(): Promise<void> {
    if (useAutoUpdate.getState().phase === 'installing') return // a Restart is already installing; update.rs's grace covers a stuck one
    if (!(await install(false))) d.exit()
  }

  /** Every minute while an update is ready: install it once the app has sat idle in the tray long enough. */
  async function idleTick(): Promise<void> {
    if (useAutoUpdate.getState().phase !== 'ready') {
      idleSince = null
      return
    }
    const step = idleStep(idleSince, await d.shellIdle().catch(() => false), d.now())
    idleSince = step.fire ? null : step.since // a try that does not go through waits a fresh 10 minutes
    if (!step.fire) return
    await d.relaunchHidden(true)
    if (!(await install(true, d.shellIdle))) await d.relaunchHidden(false)
  }

  /** The window was shown or focused: the idle clock starts over (a visit shorter than one poll would otherwise be missed). */
  const active = () => void (idleSince = null)

  return { tick, install, quit, idleTick, active }
}

// ── the real thing, desktop only ──

async function find(platform: DesktopPlatform): Promise<Found | null> {
  const { check } = await import('@tauri-apps/plugin-updater') // imported here so the web and Android bundles never carry it
  const u = await check()
  if (!u) return null
  return {
    version: u.version,
    download: (onLine) => {
      let done = 0
      let total = 0
      let last = ''
      return u.download((e) => {
        if (e.event === 'Started') total = e.data.contentLength ?? 0
        else if (e.event === 'Progress') {
          const line = progressLine((done += e.data.chunkLength), total)
          if (line !== last) onLine((last = line))
        }
      })
    },
    install: async (restart) => {
      await u.install({ restartAfterInstall: restart })
      if (platform === 'mac') await native(restart ? 'app_restart' : 'app_exit') // the updater swaps the .app but neither reopens nor closes it
    },
    discard: () => void u.close().catch(() => {}),
  }
}

let active: ReturnType<typeof createAutoUpdater> | null = null

/** Silent updates are on in this app (a desktop install, not the Store's, not a dev server). */
export const autoUpdateActive = () => active !== null

/** Look now, whatever the schedule says — Settings → App's Check for updates. No-op when silent updates are off. */
export const downloadUpdateNow = () => active?.tick(true) ?? Promise.resolve()

/** Settings → App's "Restart to update". */
export async function restartToUpdate(): Promise<boolean> {
  return (await active?.install(true)) ?? false
}

const POLL_MS = 30 * 60_000
const LAUNCH_DELAY_MS = 20_000
const IDLE_POLL_MS = 60_000

let started = false

/** Start silent updates, once per page load (AppLayout); they run for the life of the app — a held update
 * and the quit hook must outlive any one screen. */
export function startAutoUpdate(): void {
  const platform = appPlatform()
  if (started || (platform !== 'windows' && platform !== 'mac') || import.meta.env.DEV) return
  started = true
  void storeInstall(platform).then((store) => {
    if (store) return // the Microsoft Store updates its own install
    const u = (active = createAutoUpdater({
      find: () => find(platform),
      now: Date.now,
      flush: async () => (await import('./outbox')).flushOutbox(),
      setReady: (ready) => void native('update_ready', { ready }),
      exit: () => void native('app_exit'),
      shellIdle: async () => (await native<boolean>('shell_idle')) === true,
      relaunchHidden: async (on) => void (await native('relaunch_hidden', { on })),
    }))
    void native('update_ready', { ready: false })
    ;(window as unknown as { __kfQuit?: () => void }).__kfQuit = () => void u.quit()
    window.setTimeout(() => void u.tick(), LAUNCH_DELAY_MS)
    window.setInterval(() => void u.tick(), POLL_MS)
    window.setInterval(() => void u.idleTick(), IDLE_POLL_MS)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && (u.active(), void u.tick()))
    window.addEventListener('focus', u.active)
  })
}
