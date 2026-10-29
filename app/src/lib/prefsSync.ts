import { useEffect } from 'react'
import { queryClient } from './queryClient'
import { settingSynced, updateAppSetting, useAppSettings } from './settings'
import { TOUCH_UI_SCALE, defaultUiScale, readUiScaleEnv } from './uiScale'
import { SEED_AT, SYNCED_PREFS, decide, onPrefWritten, prefApplied, remoteKey, type DeviceClass, type Prefs } from './prefs'
import type { AppSettings } from './types'

// The sync for lib/prefs' keys: a local change goes up with its time; the server's map, each time the
// settings row arrives (a fetch, or realtime after another device's change), comes down key by key where
// it's newer. Running in RequireAuth, so the whole signed-in app follows.

const STAMPS = 'kf.prefsAt' // this device: when each local value was last changed here or taken from the server
const SYNCED: ReadonlySet<string> = new Set(SYNCED_PREFS)

/** The interface size's class: the same rule that picks a device's default size (lib/uiScale). */
const deviceClass = (): DeviceClass => (defaultUiScale(readUiScaleEnv()) === TOUCH_UI_SCALE ? 'phone' : 'computer')

function readStamps(): Record<string, string> {
  try {
    return (JSON.parse(localStorage.getItem(STAMPS) ?? '{}') as Record<string, string> | null) ?? {}
  } catch {
    return {}
  }
}
function writeStamps(stamps: Record<string, string>): void {
  try {
    localStorage.setItem(STAMPS, JSON.stringify(stamps))
  } catch {
    /* no storage: nothing persists here anyway */
  }
}

function local(key: string): string | null {
  try {
    const v = localStorage.getItem(key)
    // The theme picker came after Day/Night: a device that only ever had Night says so through its mode.
    if (v === null && key === 'kf_theme_mode') return localStorage.getItem('kf_theme') === 'night' ? 'dark' : null
    return v
  } catch {
    return null
  }
}

function send(entries: Prefs): void {
  // Until 0087 is on the server the row has no `prefs`, and a column it doesn't know would dead-letter
  // every later settings write (the 0058 pattern). The stamps stay, so the first pass after it lands sends.
  if (!settingSynced('prefs')) return
  const row = queryClient.getQueryData<AppSettings>(['app_settings'])
  updateAppSetting('prefs', { ...((row?.prefs as Prefs | undefined) ?? {}), ...entries })
}

function written(key: string): void {
  const v = SYNCED.has(key) ? local(key) : null
  if (v === null) return
  const at = new Date().toISOString()
  writeStamps({ ...readStamps(), [key]: at })
  send({ [remoteKey(key, deviceClass())]: { v, at } })
}

/** The server's map against this device: newer values land in localStorage (and their stores re-read
 * them), newer or never-sent local ones go up. */
export function reconcile(remote: Prefs): void {
  const stamps = readStamps()
  const cls = deviceClass()
  const up: Prefs = {}
  const taken: string[] = []
  for (const key of SYNCED_PREFS) {
    const rk = remoteKey(key, cls)
    const r = remote[rk]
    const v = local(key)
    const d = decide(v, stamps[key], r)
    if (d === 'take' && r) {
      try {
        localStorage.setItem(key, r.v)
      } catch {
        continue
      }
      stamps[key] = r.at
      taken.push(key)
    } else if (d === 'send' && v !== null) {
      stamps[key] ??= SEED_AT
      up[rk] = { v, at: stamps[key] }
    }
  }
  writeStamps(stamps)
  if (Object.keys(up).length) send(up)
  for (const key of taken) prefApplied(key)
}

export function usePrefsSync(): void {
  const { data } = useAppSettings()
  useEffect(() => onPrefWritten(written), [])
  useEffect(() => {
    if (data && 'prefs' in data) reconcile((data.prefs as Prefs | null) ?? {})
  }, [data])
}
