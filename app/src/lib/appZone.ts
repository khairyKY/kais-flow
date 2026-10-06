// User time zones (2026-10-04): the one place the app's clock zone lives. Every "what day is it",
// "09:00 tomorrow" and rendered time reads `appZone()` — each user's own app_settings.timezone,
// set by <AppZoneSync> once settings load. Africa/Cairo stays the default (the column default, and
// every account before this). This is the user's zone, not the device's: a phone abroad still
// keeps its owner's day until they change the setting.
import { useEffect, useSyncExternalStore } from 'react'

export const DEFAULT_ZONE = 'Africa/Cairo'

// The last zone this device used, so a reload paints the right day before settings arrive.
const STORE_KEY = 'kf-app-zone'

/** True for a zone name Intl knows ("Europe/London", "UTC"). */
export function isZone(z: unknown): z is string {
  if (typeof z !== 'string' || !z.trim()) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: z })
    return true
  } catch {
    return false
  }
}

function stored(): string | null {
  try {
    const z = localStorage.getItem(STORE_KEY)
    return isZone(z) ? z : null
  } catch {
    return null // no storage (tests, private window): the default until settings load
  }
}

let zone = stored() ?? DEFAULT_ZONE
const listeners = new Set<() => void>()

/** The user's zone right now. */
export function appZone(): string {
  return zone
}

/** Switches the app's zone (an unknown or empty name falls back to the default). */
export function setAppZone(next: string | null | undefined): void {
  const z = isZone(next) ? next : DEFAULT_ZONE
  if (z === zone) return
  zone = z
  try {
    localStorage.setItem(STORE_KEY, z)
  } catch {
    // storage blocked: the next load starts from the default until settings arrive
  }
  for (const l of listeners) l()
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The zone, re-rendering on change. */
export function useAppZone(): string {
  return useSyncExternalStore(subscribe, appZone, appZone)
}

/** Keeps `appZone()` on the signed-in user's setting (rendered once, by the shell). */
export function useSyncAppZone(timezone: string | null | undefined): void {
  useEffect(() => {
    if (timezone !== undefined) setAppZone(timezone)
  }, [timezone])
}

/** This device's own zone, per the OS. */
export function deviceZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

// Every zone Intl knows (Settings → Timezone's search), plus UTC, which some engines leave out.
const ALL_ZONES: readonly string[] = (() => {
  try {
    return [...new Set([...Intl.supportedValuesOf('timeZone'), 'UTC'])]
  } catch {
    return ['UTC']
  }
})()

/** Zones matching a search ("new york", "London", "asia/tok"), at most `max`. */
export function searchZones(q: string, max = 8, zones: readonly string[] = ALL_ZONES): string[] {
  const needle = q.trim().toLowerCase().replace(/\s+/g, '_')
  return needle ? zones.filter((z) => z.toLowerCase().includes(needle)).slice(0, max) : []
}

/** "Europe/London" → "London", "America/Argentina/Buenos_Aires" → "Buenos Aires". */
export function zoneCity(z: string): string {
  return z.split('/').pop()!.replace(/_/g, ' ')
}

/** `make(zone)` built once per zone, called with the current one unless told otherwise — Intl
 * formatters are slow to create, and grouping formats thousands of dates a render. */
export function perZone<T>(make: (zone: string) => T): (z?: string) => T {
  const cache = new Map<string, T>()
  return (z = zone) => {
    let v = cache.get(z)
    if (v === undefined) cache.set(z, (v = make(z)))
    return v
  }
}
