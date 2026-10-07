// Kai 2026-10-07: "My weekend is Friday and Saturday; other people's is Saturday and Sunday, or Sunday
// alone. Don't force people to be someone they're not." The one place the user's weekend lives:
// app_settings.weekend_days (migration 0055), weekdays 0 = Sunday … 6 = Saturday, Sat + Sun by
// default. "This weekend" (the Plan menu, the date picker's quick picks) lands on its first day.
import { queryClient } from './queryClient'
import type { AppSettings } from './types'

export const DEFAULT_WEEKEND: readonly number[] = [0, 6]

export const WEEKEND_PRESETS = [
  { key: 'fri-sat', label: 'Fri + Sat', days: [5, 6] },
  { key: 'sat-sun', label: 'Sat + Sun', days: [0, 6] },
  { key: 'sun', label: 'Sun only', days: [0] },
] as const

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** A stored weekend_days, cleaned (0–6, once each, sorted). Not stored yet (null, or a build from
 * before 0055) → Sat + Sun. An empty list is a real choice: no weekend. */
export function parseWeekend(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...DEFAULT_WEEKEND]
  return [...new Set(raw.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
}

/** The signed-in user's weekend, from the settings row the app already holds. */
export function weekendDays(): number[] {
  return parseWeekend(queryClient.getQueryData<AppSettings>(['app_settings'])?.weekend_days)
}

/** Days from a day whose weekday is `weekday` to the first day of the coming weekend (0 = that day):
 * the next weekend day whose day before isn't one — so Sat + Sun starts on Saturday, Fri + Sat on
 * Friday, and on a Sunday "this weekend" is next Saturday. Null with no weekend, or all seven days. */
export function daysToWeekend(weekday: number, days: readonly number[]): number | null {
  const on = new Set(days)
  for (let i = 0; i < 7; i++) {
    const d = (weekday + i) % 7
    if (on.has(d) && !on.has((d + 6) % 7)) return i
  }
  return null
}

/** "Sat + Sun", "Fri + Sat", "Sun", "Mon, Thu" — in week order from the weekend's first day. */
export function weekendLabel(days: readonly number[]): string {
  if (days.length === 0) return 'No weekend'
  const start = days.find((d) => !days.includes((d + 6) % 7)) ?? days[0]
  const ordered = [...days].sort((a, b) => ((a - start + 7) % 7) - ((b - start + 7) % 7))
  const run = ordered.every((d, i) => i === 0 || d === (ordered[i - 1] + 1) % 7)
  return ordered.map((d) => SHORT[d]).join(run ? ' + ' : ', ')
}

/** Which preset `days` is, or 'custom'. */
export function weekendPreset(days: readonly number[]): (typeof WEEKEND_PRESETS)[number]['key'] | 'custom' {
  const key = [...days].sort((a, b) => a - b).join()
  return WEEKEND_PRESETS.find((p) => [...p.days].sort((a, b) => a - b).join() === key)?.key ?? 'custom'
}
