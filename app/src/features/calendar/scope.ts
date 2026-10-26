import { appZone } from '../../lib/appZone'
import { zoneDateKey } from '../../lib/dateShortcuts'
import type { CalendarEvent } from '../../lib/types'
import { occurrenceId, withRuleParts, type RuleBetween } from '../../../../supabase/functions/_shared/series.ts'
import { zoneTimeKey, zoneToIso } from './eventTime'
import { alignToRule, detachedCopy, ruleBetween, splitSeries, withExdate } from './series'

// ── cal-clicks (Kai 2026-10-26, Google Calendar): every change to a repeating event asks ONE question —
// "This event · This and following events · All events" — and this plans each answer, pure, on the series model
// that was already here (./series): "This" is the exception (an exdate, plus a detached copy for an edit), "This
// and following" the split (_shared splitSeries), "All" the series row itself. calendar/api writes the plan
// through the outbox with one Undo. ──

export type Scope = 'this' | 'following' | 'all'
export const SCOPES: readonly Scope[] = ['this', 'following', 'all']

/** What changed on the occurrence: fields (title, colour, project, kind, busy, remind), its time (a drag, a
 * resize, a typed time, the Date row — the new start and end of THIS occurrence), a delete, or a duplicate. */
export type SeriesChange =
  | { kind: 'patch'; patch: Partial<CalendarEvent> }
  | { kind: 'time'; starts_at: string; ends_at: string }
  | { kind: 'delete' }
  | { kind: 'duplicate' }

export interface ScopePlan {
  /** Rows to write (upserts), existing ones first. */
  write: CalendarEvent[]
  /** Rows to Trash (deleted_at set). */
  trash: CalendarEvent[]
  /** Ids of the rows this plan makes — Undo removes them outright (they never should have existed). */
  created: string[]
  /** Where the block the person acted on stands after (an occurrence id, or a row's), for a sheet that follows it. */
  ref: { id: string; start: string } | null
}

export interface ScopeContext {
  /** Fresh row ids (crypto.randomUUID in the app). */
  newId: () => string
  now: string
  zone?: string
  between?: RuleBetween
  /** The one-offs dragged out of this series earlier (series_id = its id) — "All" / "following" deletes take them. */
  detached?: readonly CalendarEvent[]
}

const DAY = 86_400_000
const addDays = (key: string, n: number) => new Date(Date.parse(`${key}T00:00:00.000Z`) + n * DAY).toISOString().slice(0, 10)
const dayGap = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY)
const iso = (s: string) => new Date(s).toISOString()
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/** BYDAY's weekdays moved `days` along (a weekly series dragged Mon → Tue becomes "every Tuesday", as Google's). */
export function shiftByDay(rule: string, days: number): string {
  const by = /(?:^|;)BYDAY=([^;]+)/i.exec(rule)?.[1]
  if (!by || days % 7 === 0) return rule
  const moved = by.split(',').map((d) => {
    const m = /^([+-]?\d*)([A-Z]{2})$/i.exec(d.trim())
    if (!m) return d
    const i = WEEKDAYS.indexOf(m[2].toUpperCase())
    return i < 0 ? d : `${m[1]}${WEEKDAYS[(((i + days) % 7) + 7) % 7]}`
  })
  return withRuleParts(rule, { BYDAY: moved.join(',') })
}

/**
 * The whole series moved the way one occurrence moved from `from` to `to` (both that occurrence's start/end): by
 * the same whole days, to the new time of day and length on `zone`'s wall clock — every skipped start with it, so
 * it still names the same occurrence, and BYDAY with the days. A timed series keeps its wall time across DST.
 */
export function shiftSeries(row: CalendarEvent, from: Pick<CalendarEvent, 'starts_at'>, to: Pick<CalendarEvent, 'starts_at' | 'ends_at'>, zone: string = appZone()): CalendarEvent {
  const minutes = (Date.parse(to.ends_at) - Date.parse(to.starts_at)) / 60_000
  const key = (s: string) => (row.all_day ? iso(s).slice(0, 10) : zoneDateKey(new Date(s), zone))
  const days = dayGap(key(from.starts_at), key(to.starts_at))
  const time = row.all_day ? '00:00' : zoneTimeKey(new Date(to.starts_at), zone)
  const at = (s: string) => (row.all_day ? `${addDays(key(s), days)}T00:00:00.000Z` : zoneToIso(addDays(key(s), days), time, zone))
  const starts = at(row.starts_at)
  return {
    ...row,
    starts_at: starts,
    ends_at: new Date(Date.parse(starts) + minutes * 60_000).toISOString(),
    recurrence_rule: row.recurrence_rule ? shiftByDay(row.recurrence_rule, days) : row.recurrence_rule,
    recurrence_exdates: (row.recurrence_exdates ?? []).map(at),
  }
}

const empty = (): ScopePlan => ({ write: [], trash: [], created: [], ref: null })
const occRef = (r: CalendarEvent, start: string = r.starts_at) => ({ id: r.recurrence_rule ? occurrenceId(r.id, iso(start)) : r.id, start })

/** A copy of a series row as a series of its own (Duplicate's "following" / "all"). */
function asNewSeries(r: CalendarEvent, id: string, now: string): CalendarEvent {
  const { seriesId: _occ, ...rest } = r
  return { ...rest, id, series_id: null, source: 'native', gcal_id: null, gcal_etag: null, external_ref: null, deleted_at: null, created_at: now, updated_at: now }
}

/**
 * The rows `scope` makes of `change` on the occurrence `occ` of series `row` (the stored row). `occ` may be the
 * row's own first occurrence. Pure: the caller writes the plan and keeps the Undo.
 */
export function planScope(row: CalendarEvent, occ: Pick<CalendarEvent, 'starts_at' | 'ends_at' | 'all_day'>, scope: Scope, change: SeriesChange, ctx: ScopeContext): ScopePlan {
  const zone = ctx.zone ?? appZone()
  const between = ctx.between ?? ruleBetween
  const plan = empty()
  const split = () => splitSeries(row, occ, ctx.newId(), ctx.now, zone, between)
  const later = (ctx.detached ?? []).filter((d) => !d.deleted_at && Date.parse(d.starts_at) >= Date.parse(occ.starts_at))

  switch (change.kind) {
    case 'patch': {
      const { starts_at: _s, ends_at: _e, ...patch } = change.patch
      if (scope === 'this') {
        // The exception: the series skips this start, a one-off copy (linked back) carries the change.
        const copy = { ...detachedCopy(row, occ.starts_at, occ.ends_at, occ.all_day, ctx.newId(), ctx.now), ...patch }
        plan.write.push(withExdate(row, occ.starts_at), copy)
        plan.created.push(copy.id)
        plan.ref = { id: copy.id, start: copy.starts_at }
        return plan
      }
      const s = scope === 'following' ? split() : null
      if (s) {
        const tail = { ...s.tail, ...patch }
        plan.write.push(s.head, tail)
        plan.created.push(tail.id)
        plan.ref = occRef(tail, occ.starts_at)
        return plan
      }
      // "All" — or "following" from the series' first occurrence, which is the same thing.
      const next = { ...row, ...patch, updated_at: ctx.now }
      plan.write.push(next)
      plan.ref = occRef(next, occ.starts_at)
      return plan
    }
    case 'time': {
      if (iso(change.starts_at) === iso(occ.starts_at) && iso(change.ends_at) === iso(occ.ends_at)) return plan
      if (scope === 'this') {
        const copy = detachedCopy(row, change.starts_at, change.ends_at, occ.all_day, ctx.newId(), ctx.now)
        plan.write.push(withExdate(row, occ.starts_at), copy)
        plan.created.push(copy.id)
        plan.ref = { id: copy.id, start: copy.starts_at }
        return plan
      }
      const s = scope === 'following' ? split() : null
      const base = s ? s.tail : row
      const moved = { ...shiftSeries(base, occ, change, zone), updated_at: ctx.now }
      // A move that leaves the anchor off the rule (a monthly "on the 15th" dragged to the 16th): the moved block
      // stays where it was put, as a one-off, and the series starts at the rule's next start (series.alignToRule).
      const aligned = alignToRule(moved, ctx.newId(), ctx.now, zone, between)
      if (s) plan.write.push(s.head)
      plan.write.push(aligned?.series ?? moved)
      if (s) plan.created.push(moved.id)
      if (aligned) {
        plan.write.push(aligned.keep)
        plan.created.push(aligned.keep.id)
      }
      plan.ref = aligned ? { id: aligned.keep.id, start: aligned.keep.starts_at } : occRef(moved, change.starts_at)
      return plan
    }
    case 'delete': {
      if (scope === 'this') {
        plan.write.push(withExdate(row, occ.starts_at))
        return plan
      }
      const s = scope === 'following' ? split() : null
      if (s) {
        // The series ends before it; nothing starts there. The one-offs moved out of it from here on go too.
        plan.write.push(s.head)
        plan.trash.push(...later)
        return plan
      }
      plan.trash.push(row, ...(ctx.detached ?? []).filter((d) => !d.deleted_at))
      return plan
    }
    case 'duplicate': {
      if (scope === 'this') {
        // This one occurrence, on its own (the old Duplicate).
        const { seriesId: _occ, ...rest } = row
        const copy: CalendarEvent = { ...asNewSeries({ ...rest, ...occ }, ctx.newId(), ctx.now), recurrence_rule: null, recurrence_exdates: [] }
        plan.write.push(copy)
        plan.created.push(copy.id)
        plan.ref = { id: copy.id, start: copy.starts_at }
        return plan
      }
      // A second series: from this occurrence on, or the whole of it. The original is untouched.
      const s = scope === 'following' ? split() : null
      const copy = asNewSeries(s ? s.tail : row, ctx.newId(), ctx.now)
      plan.write.push(copy)
      plan.created.push(copy.id)
      plan.ref = occRef(copy, occ.starts_at)
      return plan
    }
  }
}
