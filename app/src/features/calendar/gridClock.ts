// J-15 — the two places the time grid meets the wall clock. Pure, so both are unit-tested in
// UTC and in Africa/Cairo (the zone the bug only showed up in).
import { appZone } from '../../lib/appZone'
import { cairoDateKey, cairoWallTimeToIso, zoneDateKey } from '../../lib/dateShortcuts'
import { zoneTimeKey } from './eventTime'

/** A day column's header, read from the Date FullCalendar hands `dayHeaderContent`.
 *
 * That Date is a real instant (`dateEnv.toDate(marker)`) — the column's midnight on the grid's
 * clock, which is the user's zone (CalendarGrid's `timeZone`, ./zonePlugin) — NOT a UTC-encoded
 * marker. So its day is read on that zone. (Reading it through getUTC* once moved every label a day
 * back east of Greenwich — Kai's "the bar is showing yesterday"; reading it on the device's clock
 * did the same for a device away from the user's zone.) */
export function headerDay(date: Date, now: Date, zone: string = appZone()): { delta: number; weekday: string; day: string } {
  const key = zoneDateKey(date, zone)
  const delta = Math.round((Date.parse(key) - Date.parse(zoneDateKey(now, zone))) / 86_400_000)
  return {
    delta,
    weekday: new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    day: key.slice(8),
  }
}

/** How far above the now-line the grid opens (the phone's own grid centres the now line instead). */
export const SCROLL_LEAD_DESKTOP_MIN = 120

/** Where the grid opens: `leadMinutes` (2h by default) above the now-line, floored to its 30-min
 * slot (so the top edge sits on a grid line), never before midnight. FullCalendar `scrollTime` /
 * `scrollToTime` — on the grid's clock, the user's zone. */
export function scrollTimeNear(now: Date, leadMinutes: number = SCROLL_LEAD_DESKTOP_MIN, zone: string = appZone()): string {
  const [h, m] = zoneTimeKey(now, zone).split(':').map(Number)
  const minutes = Math.max(0, h * 60 + m - leadMinutes)
  const slot = minutes - (minutes % 30)
  return `${String(Math.floor(slot / 60)).padStart(2, '0')}:${String(slot % 60).padStart(2, '0')}:00`
}

// Polish F2b (conductor decision 2026-09-26: "roll 'today' over at Cairo midnight
// automatically"). A calendar tab left open overnight kept yesterday as "today".

/** Which day "today" is: Cairo's calendar day (the app's one day boundary, B2) and the device's
 * own. The grid itself is laid out in device time, so on a device outside Cairo either one
 * turning over re-syncs it; on a device in Cairo the two are the same day. */
export function dayStamp(now: Date): string {
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return `${cairoDateKey(now)}|${local}`
}

/** ms from `now` to the next Cairo midnight — or to the next device midnight when that comes
 * first (only off-Cairo devices). Cairo's midnight is read from the tz database, so the night
 * summer time ends (the last Thursday of October) is right too. */
export function msUntilNextDay(now: Date): number {
  const [y, m, d] = cairoDateKey(now).split('-').map(Number)
  const nextCairo = new Date(cairoWallTimeToIso(y, m, d + 1)).getTime() // day 32 rolls over via Date.UTC
  const nextLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
  return Math.max(0, Math.min(nextCairo, nextLocal) - now.getTime())
}
