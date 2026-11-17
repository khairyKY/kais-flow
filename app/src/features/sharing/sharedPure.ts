// Shared events and Free together: the pure part (states, words, windows, the proposal's time, the clock hint). No network, so it is tested
// (sharedEvents.test.ts) and the calendar's menu spec can import it. The server-facing part is ./sharedEvents.
import { zoneDateKey, zoneOffsetMinutes, zoneWallTimeToIso } from '../../lib/dateShortcuts'
import type { CalendarEvent } from '../../lib/types'

// ── states ──

/** invited: a proposal I haven't answered (drawn dashed) · waiting: mine, they haven't answered (dashed too) · on: both said yes ·
 * declined: they can't go. null: an ordinary event. */
export type SharedState = 'invited' | 'waiting' | 'on' | 'declined'

export function sharedState(e: Pick<CalendarEvent, 'shared_id' | 'share_status' | 'share_peer_status'>): SharedState | null {
  if (!e.shared_id) return null
  if (e.share_status === 'invited') return 'invited'
  if (e.share_peer_status === 'declined') return 'declined'
  if (e.share_peer_status === 'invited') return 'waiting'
  return 'on'
}

/** Dashed on both calendars until it is answered. */
export const isPending = (s: SharedState | null): boolean => s === 'invited' || s === 'waiting'

/** The line under the title: who is on it and where it stands. */
export function sharedLine(s: SharedState, name: string): string {
  return s === 'invited' ? `${name} invited you` : s === 'waiting' ? `Waiting for ${name} to answer` : s === 'declined' ? `${name} can’t go` : `With ${name}`
}

/** A proposal nobody answered drops when it starts (the server's sweep runs every 5 minutes; until then the app already hides it). */
export function dropped(e: Pick<CalendarEvent, 'shared_id' | 'share_status' | 'share_peer_status' | 'starts_at' | 'ends_at' | 'all_day'>, now: Date): boolean {
  const s = sharedState(e)
  if (!isPending(s)) return false
  return (e.all_day ? Date.parse(e.ends_at) : Date.parse(e.starts_at)) <= now.getTime()
}

// ── Free together ──

export interface FreeWindow { starts_at: string; ends_at: string }
export interface FreeTogether {
  ok: boolean
  error?: 'none' | 'paused'
  paused_until?: string
  zone?: string
  partner_zone?: string
  windows?: FreeWindow[]
}

export type FreeRange = 'today' | 'tomorrow' | 'week'
export const RANGE_NAME: Record<FreeRange, string> = { today: 'Today', tomorrow: 'Tomorrow', week: 'This week' }

const DAY = 86_400_000
const midnight = (key: string, zone: string, plus = 0): Date => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(zoneWallTimeToIso(zone, y, m, d + plus))
}

/** The window the chip asks for, on my clock: today from now, tomorrow, or the next seven days from now. */
export function rangeBounds(range: FreeRange, now: Date, zone: string): { from: Date; to: Date } {
  const key = zoneDateKey(now, zone)
  if (range === 'today') return { from: now, to: midnight(key, zone, 1) }
  if (range === 'tomorrow') return { from: midnight(key, zone, 1), to: midnight(key, zone, 2) }
  return { from: now, to: new Date(now.getTime() + 7 * DAY) }
}

const clockIn = (iso: string, zone: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone })

/** "5:30 – 9:00 PM" (the second time carries the PM unless both are the same half of the day). */
export function windowText(w: FreeWindow, zone: string): string {
  const a = clockIn(w.starts_at, zone), b = clockIn(w.ends_at, zone)
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`
}

/** Today / Tomorrow / "Sat 22 Nov", on my clock. */
export function dayLabel(key: string, now: Date, zone: string): string {
  const today = zoneDateKey(now, zone)
  if (key === today) return 'Today'
  if (key === zoneDateKey(new Date(midnight(today, zone, 1).getTime() + 3_600_000), zone)) return 'Tomorrow'
  return new Date(midnight(key, zone).getTime() + 12 * 3_600_000).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone })
}

/** The windows grouped by the day they start on (my clock), soonest first. */
export function windowsByDay(windows: readonly FreeWindow[], zone: string): { key: string; windows: FreeWindow[] }[] {
  const out: { key: string; windows: FreeWindow[] }[] = []
  for (const w of [...windows].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))) {
    const key = zoneDateKey(new Date(w.starts_at), zone)
    const last = out[out.length - 1]
    if (last?.key === key) last.windows.push(w)
    else out.push({ key, windows: [w] })
  }
  return out
}

const QUARTER = 15 * 60_000
/** What Propose fills in from a window: it starts at the window's start (a quarter hour on, if now is inside it) and runs 2 hours, or to the window's end. */
export function proposalFrom(w: FreeWindow, now: Date = new Date()): { startsAt: string; endsAt: string } {
  const from = Math.max(Date.parse(w.starts_at), now.getTime())
  const start = Math.ceil(from / QUARTER) * QUARTER
  const end = Math.min(Date.parse(w.ends_at), start + 2 * 3_600_000)
  return { startsAt: new Date(start).toISOString(), endsAt: new Date(Math.max(end, start + QUARTER)).toISOString() }
}

/** "(Reem 10:00 PM)" when her clock is an hour or more from mine at that moment, else nothing. */
export function zoneHint(iso: string, myZone: string, theirZone: string | undefined, name: string): string | null {
  if (!theirZone || theirZone === myZone) return null
  const at = new Date(iso)
  if (Math.abs(zoneOffsetMinutes(at, theirZone) - zoneOffsetMinutes(at, myZone)) < 60) return null
  return `(${name} ${clockIn(iso, theirZone)})`
}

