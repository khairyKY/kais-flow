import { appZone, perZone } from '../../lib/appZone'
import { cairoDateKey, zoneWallTimeToIso } from '../../lib/dateShortcuts'

// T-4 (Polish F2b for the calendar's QuickCreate): a time typed into the form means that time on
// the user's clock (their app_settings.timezone, lib/appZone.ts) on any device, like the command
// bar's "10am" (Polish E). The form shows and reads that wall-clock; these two are inverses, so a
// slot's instant survives the trip through the form. (Its date half is dateShortcuts' cairoDateKey;
// the `cairo*` names are historical and read the user's zone.)
const clockFmt = perZone((timeZone) => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))

/** HH:MM on `zone`'s clock (the user's, by default), for <input type="time">. */
export function zoneTimeKey(d: Date, zone: string = appZone()): string {
  let hour = '00'
  let minute = '00'
  for (const p of clockFmt(zone).formatToParts(d)) {
    if (p.type === 'hour') hour = p.value
    else if (p.type === 'minute') minute = p.value
  }
  return `${hour}:${minute}`
}

/** HH:MM on the user's clock. */
export function cairoTimeKey(d: Date): string {
  return zoneTimeKey(d)
}

/** A wall-clock date ("YYYY-MM-DD") + time ("HH:MM") in `zone` -> the UTC instant to store.
 * DST-correct (the tz database). The one wall hour a zone repeats when summer time ends (Cairo:
 * 23:00–24:00 on the last Thursday of October) reads as its second, winter-time pass. */
export function zoneToIso(dateStr: string, timeStr: string, zone: string = appZone()): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  return zoneWallTimeToIso(zone, y, mo, d, h, mi)
}

/** `zoneToIso` on the user's clock. */
export function cairoToIso(dateStr: string, timeStr: string): string {
  return zoneToIso(dateStr, timeStr)
}

/** The QuickCreate fields for a grid slot. A timed slot is an instant, shown on the user's clock
 * (cairoToIso gives the same instant back). An all-day slot is a calendar date the grid drew:
 * FullCalendar hands it over as "YYYY-MM-DD" (select) or as that day's local midnight (the
 * right-click resolver), and either way it is that date, in no zone. */
export function slotFields(start: string, end: string, allDay: boolean): { date: string; start: string; end: string; allDay: boolean } {
  if (allDay) {
    const d = new Date(start)
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { date: /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : local, start: '', end: '', allDay: true }
  }
  const s = new Date(start)
  return { date: cairoDateKey(s), start: cairoTimeKey(s), end: cairoTimeKey(new Date(end)), allDay: false }
}

/** HH:MM in local time, for <input type="time">. */
export function localTimeKey(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

/** Local wall-clock date ("YYYY-MM-DD") + time ("HH:MM") -> the UTC instant to store. */
export function localToIso(dateStr: string, timeStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  return new Date(y, mo - 1, d, h, mi, 0, 0).toISOString()
}
