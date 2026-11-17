// Partner sharing P2 (migration 0103): the words and rules the status and notice screens use, pure so they are tested.
// The server owns every rule that protects data (who may see a status, the 24-hour cap, the masking of a notice); this file
// only says things: what each clear time is called, which kinds exist, how long a status line has left.
import { zoneDateKey } from '../../lib/dateShortcuts'

// ── status ──

/** What Reem sees next to Kai's name: {words, source, until} from the server, or null. */
export interface Status { words: string; source: 'words' | 'auto'; until: string }
/** My own status: the "From the Now card" switch, my own words if alive, and what each person with status on sees right now. */
export interface MyStatus { auto: boolean; words: string | null; words_until: string | null; now: Status | null }

export type ClearKind = 'hour' | 'tonight' | 'manual'
export const CLEAR_KINDS: readonly ClearKind[] = ['hour', 'tonight', 'manual']
export const CLEAR_NAME: Record<ClearKind, string> = { hour: 'In an hour', tonight: 'Tonight', manual: 'When I clear it' }
/** Own words in a tap. The longest the server takes is 40 characters. */
export const STATUS_WORDS: readonly string[] = ['Commuting', 'At the gym', 'In class', 'Sleeping', 'Free, text me']
export const STATUS_MAX = 40
export const STATUS_RULE = 'No location, ever. Only these words.'

/** A status that has run out on this clock is simply gone: the server answers a minute at a time, the clock is sharper. */
export const alive = (s: Status | null | undefined, now: Date): s is Status => !!s && new Date(s.until).getTime() > now.getTime()

/** "Clears in 40 min", "Clears today 10:30 PM", "Clears tomorrow 7:00 AM": when the words go, on the person's own clock. */
export function clearsLine(until: string, now: Date, zone: string): string {
  const t = new Date(until)
  const min = Math.round((t.getTime() - now.getTime()) / 60_000)
  if (min < 60) return `Clears in ${Math.max(1, min)} min`
  const time = t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone })
  const day = zoneDateKey(t, zone), today = zoneDateKey(now, zone)
  if (day === today) return `Clears today ${time}`
  return day === zoneDateKey(new Date(now.getTime() + 86_400_000), zone) ? `Clears tomorrow ${time}` : `Clears ${time}`
}

// ── a repeating block the app is in ──

/** The occurrence of a repeating block (a weekly class, the gym) that is running now: the series row and when this one starts and ends.
 * The app already expands repeats (features/calendar/series); it tells the server only this, and the server makes the words
 * ("In class"), finds the area and checks Private itself (migration 0103, share_status_block). */
export interface RepeatBlock { seriesId: string; starts: string; ends: string }
interface Occurrence { seriesId?: string; source?: string; all_day: boolean; busy?: boolean | null; starts_at: string; ends_at: string }

/** The newest-started repeating occurrence under way at `now` (a one-off block needs no help: the server reads those). Null when none. */
export function currentRepeating(events: readonly Occurrence[], now: Date): RepeatBlock | null {
  const t = now.getTime()
  let best: Occurrence | null = null
  for (const e of events) {
    if (!e.seriesId || e.all_day || e.busy === false || (e.source && e.source !== 'native')) continue
    if (Date.parse(e.starts_at) > t || Date.parse(e.ends_at) <= t) continue
    if (!best || Date.parse(e.starts_at) > Date.parse(best.starts_at)) best = e
  }
  return best ? { seriesId: best.seriesId!, starts: best.starts_at, ends: best.ends_at } : null
}

// ── notices ──

export type NoticeMode = 'off' | 'in_app' | 'push'
export const NOTICE_MODES: readonly NoticeMode[] = ['off', 'in_app', 'push']
export const NOTICE_MODE_NAME: Record<NoticeMode, string> = { off: 'Off', in_app: 'In-app', push: 'Push' }

/** The kinds of notice a person can switch on, one row each in "Notices from Reem". Every kind starts Off. A later builder's kind
 * (shared events, shared lists) is one more row here and one more `share_notice_emit` call on the server. */
export interface NoticeKindInfo { kind: string; title: (name: string) => string; sub: (name: string) => string }
export const NOTICE_KINDS: readonly NoticeKindInfo[] = [
  { kind: 'added', title: (n) => `${n} adds something to the calendar`, sub: (n) => `“${n} added Dinner, Fri 8 PM.” At Busy only it says “something”.` },
]

/** One connection's own settings (`share_notice_settings`): "Show my status to Reem" and the per-kind switches. */
export interface NoticeSetting { circle_id: string; status_on: boolean; notice_prefs: Record<string, NoticeMode> }
export const modeOf = (s: Pick<NoticeSetting, 'notice_prefs'> | undefined, kind: string): NoticeMode => s?.notice_prefs?.[kind] ?? 'off'

/** A notice waiting on Today (a row of `share_notices`, already masked to my level by the server). */
export interface PartnerNotice {
  id: string
  circle_id: string
  actor_id: string
  kind: string
  payload: { verb?: string | null; what?: string | null; at?: string | null }
  n: number
  release_at: string
}
