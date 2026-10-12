import { appZone } from '../../lib/appZone'
import { zoneDateKey } from '../../lib/dateShortcuts'
import { zoneTimeKey } from '../calendar/eventTime'

// Perennials' row text (PerennialsPage). Days are the user's (app_settings.timezone), not the device's.

export function getCadenceType(rule: string): 'daily' | 'weekly' | 'monthly' | 'custom' {
  if (!rule) return 'custom'
  const upper = rule.toUpperCase()
  if (upper.includes('INTERVAL=') && !upper.includes('INTERVAL=1;')) return 'custom'
  if (upper.includes('FREQ=DAILY')) return 'daily'
  if (upper.includes('FREQ=WEEKLY')) return 'weekly'
  if (upper.includes('FREQ=MONTHLY')) return 'monthly'
  return 'custom'
}

export function formatRecurrenceRule(rule: string): string {
  if (!rule) return ''
  const upper = rule.toUpperCase()

  const intervalMatch = upper.match(/INTERVAL=(\d+)/)
  const interval = intervalMatch ? parseInt(intervalMatch[1]) : 1

  if (upper.includes('FREQ=DAILY')) {
    return interval > 1 ? `Every ${interval} days` : 'Every day'
  }

  if (upper.includes('FREQ=WEEKLY')) {
    const bydayMatch = upper.match(/BYDAY=([A-Z,]+)/)
    if (bydayMatch) {
      const days = bydayMatch[1].split(',')
      const dayMap: Record<string, string> = {
        SU: 'Sun',
        MO: 'Mon',
        TU: 'Tue',
        WE: 'Wed',
        TH: 'Thu',
        FR: 'Fri',
        SA: 'Sat',
      }
      const formattedDays = days.map((d) => dayMap[d] || d).join(', ')
      return interval > 1 ? `Every ${interval} weeks on ${formattedDays}` : `Every ${formattedDays}`
    }
    return interval > 1 ? `Every ${interval} weeks` : 'Every week'
  }

  if (upper.includes('FREQ=MONTHLY')) {
    const bymonthdayMatch = upper.match(/BYMONTHDAY=(\d+)/)
    if (bymonthdayMatch) {
      const day = parseInt(bymonthdayMatch[1])
      const suffix =
        day === 1 || day === 21 || day === 31 ? 'st' :
        day === 2 || day === 22 ? 'nd' :
        day === 3 || day === 23 ? 'rd' : 'th'
      return interval > 1 ? `Every ${interval} months on the ${day}${suffix}` : `Monthly on the ${day}${suffix}`
    }
    return interval > 1 ? `Every ${interval} months` : 'Monthly'
  }

  return 'Custom repeat'
}

/** Calendar days from `now`'s day to `iso`'s day in `zone`: 0 today, 1 tomorrow, -1 yesterday. */
export function daysFromToday(iso: string, now: Date = new Date(), zone: string = appZone()): number {
  const utcDay = (d: Date) => {
    const [y, m, day] = zoneDateKey(d, zone).split('-').map(Number)
    return Date.UTC(y, m - 1, day)
  }
  return Math.round((utcDay(new Date(iso)) - utcDay(now)) / 86400000)
}

/** "Tue 06 Oct" on `zone`'s calendar. */
function dayLabel(d: Date, zone: string): string {
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-US', { ...o, timeZone: zone })
  return `${part({ weekday: 'short' })} ${part({ day: '2-digit' })} ${part({ month: 'short' })}`
}

export function formatLastCompleted(completedAt: string | null, now: Date = new Date(), zone: string = appZone()): string {
  if (!completedAt) return 'never done'
  const days = daysFromToday(completedAt, now, zone)
  if (days === 0) return `last done today ${zoneTimeKey(new Date(completedAt), zone)}`
  if (days === -1) return 'last done yesterday'
  return `last done ${dayLabel(new Date(completedAt), zone)}`
}

export function formatNextDue(dueAt: string | null, now: Date = new Date(), zone: string = appZone()): { text: string; urgent: boolean } {
  if (!dueAt) return { text: 'no date', urgent: false }
  const days = daysFromToday(dueAt, now, zone)
  if (days === 0) return { text: 'Next: today', urgent: true }
  if (days === 1) return { text: 'Next: tomorrow', urgent: false }
  return { text: `Next: ${dayLabel(new Date(dueAt), zone)}`, urgent: false }
}
