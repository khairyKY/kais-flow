import { useSyncExternalStore } from 'react'

// Settings that follow the person (Kai 2026-10-26: "the settings should always be the same for both the
// phone version and desktop"). Each still lives in this device's localStorage under its own key — instant,
// read before first paint (index.html), works offline — and lib/prefsSync mirrors it into
// app_settings.prefs (migration 0087) as { <remote key>: { v: <the stored string>, at: <ISO time> } }.
// The newest change wins, per key: on the server (0087's merge trigger) and on each device (`decide`).
// This file is the leaf the stores import (no app imports, so no cycles): the key list, the rule, and two
// events — a store saying it wrote a key, and the sync saying another device's value just landed.

export const SYNCED_PREFS = [
  'kf_theme_mode', // Appearance › Theme (Auto follows each device's own system)
  'kf_ui_scale', // Appearance › Interface size — one for phones, one for computers (remoteKey)
  'kf_grain', // Appearance › Paper texture
  'kf_effects', // Appearance › Botanical animations
  'kf.calViewOptions', // Calendar & time › Time format, Week starts on, Fit days, Fit hours, Density, Second time zone, Now card (+ the View options' weekends and completed)
  'kf_sound_events', // Notifications & sound › the seven sounds
  'kf_sound_pack', // › Sound pack
  'kf_sound_volume', // › Sound
  'kf_sound_quiet', // › Silent after Shut down
  'kf.resurfaceCooldown.high', // Organize › "Not now" comes back after
  'kf.resurfaceCooldown.med',
  'kf.resurfaceCooldown.low',
  'kf_focus_settings', // Focus › round lengths, auto-starts, chime, garden view
  'kf.ritualPins', // Routines › the rituals pinned to Today
] as const

export type DeviceClass = 'phone' | 'computer'

/** The app_settings.prefs key a local key syncs under. The interface size is kept per device class — 100%
 * on a phone and 125% on a 1920 monitor are both right, so a phone follows phones and a computer
 * computers; every other key syncs as itself. */
export function remoteKey(key: string, cls: DeviceClass): string {
  return key === 'kf_ui_scale' ? `${key}.${cls}` : key
}

export interface PrefEntry {
  v: string
  at: string
}
export type Prefs = Record<string, PrefEntry>

/** Values a device had before sync carry no time. The first device to open a sync-aware version sends
 * its own at this time, so the others adopt them and any real change, anywhere, beats them. */
export const SEED_AT = '1970-01-01T00:00:00.000Z'

/** One key, this device against the server: take the server's value, send ours, or leave both. The most
 * recent change wins; an unstamped local value (from before sync) loses to whatever the server has. */
export function decide(local: string | null, localAt: string | undefined, remote: PrefEntry | undefined): 'take' | 'send' | null {
  if (!remote) return local === null ? null : 'send'
  if (local === remote.v) return null
  if (!localAt || remote.at > localAt) return 'take'
  return remote.at < localAt ? 'send' : null
}

const WRITTEN = 'kf-pref-written'
const APPLIED = 'kf-pref-applied'
const on = (type: string, fn: (key: string) => void): (() => void) => {
  if (typeof window === 'undefined') return () => {}
  const h = (e: Event) => fn((e as CustomEvent<string>).detail)
  window.addEventListener(type, h)
  return () => window.removeEventListener(type, h)
}
const emit = (type: string, key: string) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(type, { detail: key }))
}

/** A store saved a synced key on this device (after writing localStorage): the sync sends it up. */
export const prefWritten = (key: string): void => emit(WRITTEN, key)
export const onPrefWritten = (fn: (key: string) => void): (() => void) => on(WRITTEN, fn)

let version = 0
/** Another device's value is now in localStorage under `key` — stores re-read it. Never write back here. */
export function prefApplied(key: string): void {
  version++
  emit(APPLIED, key)
}
export const onPrefApplied = (key: string, fn: () => void): (() => void) => on(APPLIED, (k) => k === key && fn())

/** Bumps whenever another device's value lands — for a view that holds its own copies (Settings remounts
 * on it, so every row reads the new values while it's open). */
export function usePrefsVersion(): number {
  return useSyncExternalStore((cb) => on(APPLIED, cb), () => version)
}
