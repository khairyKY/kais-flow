// J-15 — the two places the time grid meets the wall clock. Pure, so both are unit-tested in
// UTC and in Africa/Cairo (the zone the bug only showed up in).

/** A day column's header, read from the Date FullCalendar hands `dayHeaderContent`.
 *
 * That Date is a real local-midnight Date (`dateEnv.toDate(marker)`), NOT a UTC-encoded marker —
 * so its calendar fields come from the LOCAL getters. Reading them through getUTC* (as the header
 * did) moves every label one day back east of Greenwich: in Cairo (UTC+2/+3) local midnight is
 * still the previous day in UTC, so today's column read "Fri 25", "· Today" landed on tomorrow,
 * and the now-line sat under yesterday's name — Kai's "the bar is showing yesterday". */
export function headerDay(date: Date, now: Date): { delta: number; weekday: string; day: string } {
  const delta = Math.round(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000,
  )
  return {
    delta,
    weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
    day: String(date.getDate()).padStart(2, '0'),
  }
}

/** How far above the now-line the grid opens. A phone's day grid is short (Polish F2b, conductor
 * decision 2026-09-26: with a 2h lead the now-line landed behind the tab bar), so it gets 1h. */
export const SCROLL_LEAD_DESKTOP_MIN = 120
export const SCROLL_LEAD_PHONE_MIN = 60

/** Where the grid opens: `leadMinutes` (2h by default) above the now-line, floored to its 30-min
 * slot (so the top edge sits on a grid line), never before midnight. FullCalendar `scrollTime` /
 * `scrollToTime`. */
export function scrollTimeNear(now: Date, leadMinutes: number = SCROLL_LEAD_DESKTOP_MIN): string {
  const minutes = Math.max(0, now.getHours() * 60 + now.getMinutes() - leadMinutes)
  const slot = minutes - (minutes % 30)
  return `${String(Math.floor(slot / 60)).padStart(2, '0')}:${String(slot % 60).padStart(2, '0')}:00`
}
