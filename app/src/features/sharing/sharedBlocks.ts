// What the server sent of another person's day, turned into what the screens draw: their repeats expanded on THEIR clock (the
// zone the server names), now / next for the card, the lane's blocks. Pure, so it is tested. A block with no title is a Busy
// block - the server took the title away (Busy only, or Private); nothing here can put it back.
import { expandSeries, type SeriesRow } from '../../../../supabase/functions/_shared/series.ts'
import { ruleBetween } from '../calendar/series'
import { zoneDateKey } from '../../lib/dateShortcuts'
import type { SharedBlock, SharedDay } from './api'

export interface Occurrence {
  id: string
  startsAt: string
  endsAt: string
  start: number
  end: number
  allDay: boolean
  /** null = Busy (masked by the server). */
  title: string | null
}

type Row = SharedBlock & SeriesRow

/** Every block that touches [from, to), repeats expanded on `zone` (the owner's), sorted by start. */
export function occurrences(day: Pick<SharedDay, 'blocks' | 'zone'>, from: Date, to: Date): Occurrence[] {
  const rows = (day.blocks ?? []) as Row[]
  const out: Occurrence[] = []
  for (const r of expandSeries(rows, from, to, day.zone ?? 'UTC', ruleBetween)) {
    const start = Date.parse(r.starts_at), end = Date.parse(r.ends_at)
    if (!(start < to.getTime() && end > from.getTime())) continue
    out.push({ id: r.id, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), start, end, allDay: r.all_day, title: r.title ?? null })
  }
  return out.sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1))
}

/** The card's now and what comes next on `zone`'s today: the block running now, then the timed blocks still to come, at most `max`. */
export function nowNext(occs: readonly Occurrence[], now: Date, zone: string, max = 2): { now: Occurrence | null; next: Occurrence[] } {
  const t = now.getTime()
  const today = zoneDateKey(now, zone)
  const timed = occs.filter((o) => !o.allDay)
  const running = timed.find((o) => o.start <= t && o.end > t) ?? null
  const next = timed.filter((o) => o.start > t && zoneDateKey(new Date(o.start), zone) === today).slice(0, max)
  return { now: running, next }
}

/** "56" - how far through the running block it is, in percent. */
export const progress = (o: Pick<Occurrence, 'start' | 'end'>, now: Date): number =>
  Math.max(0, Math.min(100, Math.round(((now.getTime() - o.start) / Math.max(1, o.end - o.start)) * 100)))

/** "1h 20m left" / "until 12:00" for the running block. */
export function leftText(o: Pick<Occurrence, 'end'>, now: Date): string {
  const m = Math.max(0, Math.round((o.end - now.getTime()) / 60_000))
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''} left` : `${m}m left`
}
