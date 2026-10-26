// phone-today (Kai 2026-10-26, "phone B, widgets B"): the phone's Today home — design-export/Phone home
// options.html in the today-looks worktree, direction B "Now + next", with a switch to the Day view (Day strip
// options.html in the daystrip-looks worktree, direction 4 "Day bar").
// Pure: what the switch remembers, what the Now panel's "Then" lists, and the Day bar's lanes.
import { pickNowNext, type NowNextItem } from '../calendar/nowNext'
import { upNextEvents } from './upNext'

export type PhoneView = 'now' | 'day'
/** A view preference, per device (no migration): Now = B, Day = the Day bar. */
export const PHONE_VIEW_KEY = 'kf-phone-today-view'

export function readPhoneView(): PhoneView {
  try {
    return localStorage.getItem(PHONE_VIEW_KEY) === 'day' ? 'day' : 'now'
  } catch {
    return 'now' // storage off: B
  }
}

export function writePhoneView(v: PhoneView): void {
  try {
    localStorage.setItem(PHONE_VIEW_KEY, v)
  } catch {
    /* private mode: this visit only */
  }
}

const ms = (iso: string) => Date.parse(iso)

/** "Then" under the calendar's Now card: the next `n` blocks still to start today that the card doesn't
 * already show (its main one, and the Next strip it hangs under a running one). */
export function thenBlocks<E extends NowNextItem>(events: readonly E[], now: Date, skip: (e: E) => boolean = () => false, n = 2): E[] {
  const pick = pickNowNext(events, now, skip)
  const shown = new Set<string>(
    pick.state === 'far' ? [pick.next.id] : pick.state === 'soon' ? [pick.main.id] : pick.state === 'on' ? [pick.main.id, ...pick.next.slice(0, 1).map((e) => e.id)] : [],
  )
  const t = now.getTime()
  return upNextEvents(events, now)
    .filter((e) => ms(e.starts_at) > t && ms(e.ends_at) > ms(e.starts_at) && !skip(e) && !shown.has(e.id))
    .slice(0, n)
}

/** The Day bar's lanes (Kai's pick 2026-10-26, Day view 4): a block that starts before the one on the main lane
 * ends drops to the thin second lane. ponytail: two lanes — a third overlap shares the second. */
export function barLanes<E extends { starts_at: string; ends_at: string }>(blocks: readonly E[]): { e: E; lane: 0 | 1 }[] {
  let end = -Infinity
  return [...blocks]
    .sort((a, b) => ms(a.starts_at) - ms(b.starts_at))
    .map((e) => {
      if (ms(e.starts_at) < end) return { e, lane: 1 as const }
      end = ms(e.ends_at)
      return { e, lane: 0 as const }
    })
}