import { cairoDateKey, cairoWallTimeToIso } from '../../lib/dateShortcuts'

// T-4 (Polish F2b for the calendar's QuickCreate): a time typed into the form means that time in
// Cairo on any device, like the command bar's "10am" (Polish E). The form shows and reads Cairo
// wall-clock; these two are inverses, so a slot's instant survives the trip through the form.
// (Its date half is lib/dateShortcuts' cairoDateKey.)
const cairoClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** HH:MM on Cairo's clock, for <input type="time">. */
export function cairoTimeKey(d: Date): string {
  let hour = '00'
  let minute = '00'
  for (const p of cairoClock.formatToParts(d)) {
    if (p.type === 'hour') hour = p.value
    else if (p.type === 'minute') minute = p.value
  }
  return `${hour}:${minute}`
}

/** A Cairo wall-clock date ("YYYY-MM-DD") + time ("HH:MM") -> the UTC instant to store. DST-correct
 * (the tz database, via cairoWallTimeToIso). The one wall hour Cairo repeats when summer time
 * ends (23:00–24:00 on the last Thursday of October) reads as its second, winter-time pass. */
export function cairoToIso(dateStr: string, timeStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  return cairoWallTimeToIso(y, mo, d, h, mi)
}

/** The QuickCreate fields for a grid slot. A timed slot is an instant, shown on Cairo's clock
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
