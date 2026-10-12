import { createPlugin } from '@fullcalendar/core'
import { NamedTimeZoneImpl } from '@fullcalendar/core/internal'
import { fromFloating, toFloating } from '../../../../supabase/functions/_shared/series.ts'

// Conductor review 2026-10-12: the desktop grid laid out on the DEVICE clock while QuickCreate, the
// phone grid and every other surface use the user's zone (lib/appZone) — a click on the 10:00 slot
// could open a form saying 12:00 for a user away from home. FullCalendar takes a named zone only
// through a plugin (@fullcalendar/luxon or moment-timezone: a new dependency each). This is that
// plugin on Intl, the same tz-database arithmetic the series expansion uses — no dependency.
// FullCalendar's contract: a "marker" array is a wall-clock time in the zone ([y, m0, d, h, mi, s, ms]).

export class IntlZone extends NamedTimeZoneImpl {
  /** The zone's UTC offset in minutes at that wall-clock time. */
  offsetForArray(a: number[]): number {
    const wall = Date.UTC(a[0], a[1], a[2] ?? 1, a[3] ?? 0, a[4] ?? 0, a[5] ?? 0, a[6] ?? 0)
    return Math.round((wall - fromFloating(wall, this.timeZoneName)) / 60_000)
  }

  /** The wall-clock time of instant `ms` in the zone. */
  timestampToArray(ms: number): number[] {
    const d = new Date(toFloating(ms, this.timeZoneName))
    return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()]
  }
}

export const intlZonePlugin = createPlugin({ name: 'kf-intl-zone', namedTimeZonedImpl: IntlZone })
