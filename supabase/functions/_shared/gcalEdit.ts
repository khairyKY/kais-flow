// Editing a Google event from the app (gcal-events, Kai 2026-11-03): rename, move or resize, delete — written back
// to Google through the Calendar API. The pure half of google-sync's `edit` / `undo` actions: no Deno APIs, so the
// app's vitest (features/settings/gcalEdit.test.ts) and supabase/tests/gcal-edit.test.ts run it.
//
// A synced row is ONE occurrence (google-sync reads with singleEvents=true), so the person's three answers —
// This event · This and following · All events — become Calendar API calls on the instance or on its master:
//   this       PATCH / DELETE the instance (Google makes the exception, or cancels that occurrence);
//   all        PATCH / DELETE the master — a move shifts it by the same days, to the same time of day;
//   following  the master ends just before the occurrence (UNTIL) and, for an edit, a new series starts on it
//              (_shared/series.ts splitSeries, the app's own split). From the first occurrence it is "all".
// Every call carries sendUpdates=none (google.ts gCall): a drag never mails the guests.
//
// Undo: planning says what to do; running it (runOps) answers the ops that put every event back as it was.
import { gCall, GoogleError, type GEvent, type GEventTime } from './google.ts'
import { shiftByDay, splitSeries, type RuleBetween } from './series.ts'
import { addDays, dateKey, wallTime, wallToInstant } from './zone.ts'

export type GcalScope = 'this' | 'following' | 'all'
export const GCAL_SCOPES: readonly GcalScope[] = ['this', 'following', 'all']

/** What the person changed on the occurrence. Times are ISO instants; an all-day event's are its dates at T00:00Z
 * (the app's all-day convention, end exclusive). */
export interface GcalChange {
  title?: string
  starts_at?: string
  ends_at?: string
  /** With the times: the block moved onto / off the all-day line. */
  all_day?: boolean
  delete?: true
}

export type GcalOp =
  | { op: 'patch'; id: string; body: Record<string, unknown> }
  | { op: 'delete'; id: string }
  | { op: 'insert'; body: Record<string, unknown> }

/** The fields a patch may carry — nothing else is ever sent, whoever asks (an undo's ops come from the client). */
const PATCH_KEYS = ['summary', 'start', 'end', 'recurrence', 'status'] as const

const DAY = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()
const dayGap = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY)

// ── reading what the client sent ────────────────────────────────────────────────────────────────

const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v))

/** A client's change, or null when it isn't one: a rename, new times, both, or a delete. */
export function readChange(raw: unknown): GcalChange | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  const out: GcalChange = {}
  if (c.title !== undefined) {
    if (typeof c.title !== 'string' || !c.title.trim() || c.title.length > 1000) return null
    out.title = c.title.trim()
  }
  if (c.starts_at !== undefined || c.ends_at !== undefined) {
    if (!isIso(c.starts_at) || !isIso(c.ends_at) || Date.parse(c.ends_at) < Date.parse(c.starts_at)) return null
    out.starts_at = new Date(c.starts_at).toISOString()
    out.ends_at = new Date(c.ends_at).toISOString()
    if (c.all_day !== undefined) {
      if (typeof c.all_day !== 'boolean') return null
      out.all_day = c.all_day
    }
  }
  if (c.delete === true) out.delete = true
  const kinds = [out.title !== undefined, out.starts_at !== undefined, !!out.delete].filter(Boolean).length
  return kinds === 1 || (kinds === 2 && out.title !== undefined && out.starts_at !== undefined) ? out : null
}

/** An undo's ops, as an earlier answer handed them out; null when anything in them is off the list. */
export function readOps(raw: unknown): GcalOp[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 4) return null
  const ops: GcalOp[] = []
  for (const o of raw as Record<string, unknown>[]) {
    if (!o || typeof o !== 'object') return null
    const id = o.id
    const body = o.body
    if (o.op === 'delete' && typeof id === 'string' && id.length <= 1024) ops.push({ op: 'delete', id })
    else if ((o.op === 'patch' || o.op === 'insert') && body && typeof body === 'object' && !Array.isArray(body)) {
      if (o.op === 'patch' && (typeof id !== 'string' || id.length > 1024)) return null
      const safe: Record<string, unknown> = {}
      for (const k of PATCH_KEYS) if (k in body) safe[k] = (body as Record<string, unknown>)[k]
      if (Object.keys(safe).length === 0) return null
      ops.push(o.op === 'patch' ? { op: 'patch', id: id as string, body: safe } : { op: 'insert', body: safe })
    } else return null
  }
  return ops
}

// ── planning ────────────────────────────────────────────────────────────────────────────────────

interface Times {
  start: string
  end: string
  allDay: boolean
}

/** An event's span as ISO instants (an all-day event's dates at T00:00Z, end exclusive). */
export function timesOf(ev: GEvent): Times | null {
  const allDay = !!ev.start?.date && !ev.start.dateTime
  const s = allDay ? `${ev.start!.date}T00:00:00.000Z` : ev.start?.dateTime
  const e = allDay ? `${ev.end?.date ?? addDays(ev.start!.date!, 1)}T00:00:00.000Z` : ev.end?.dateTime ?? s
  if (!s || Number.isNaN(Date.parse(s)) || !e || Number.isNaN(Date.parse(e))) return null
  return { start: new Date(s).toISOString(), end: new Date(e).toISOString(), allDay }
}

/** start / end as Google takes them. The unused half is nulled: a patch merges objects, and an event that held a
 * `date` must not keep it beside a `dateTime`. */
export function timeBody(t: Times, tz: string): { start: GEventTime; end: GEventTime } {
  return t.allDay
    ? { start: { date: t.start.slice(0, 10), dateTime: null, timeZone: null } as unknown as GEventTime, end: { date: t.end.slice(0, 10), dateTime: null, timeZone: null } as unknown as GEventTime }
    : { start: { dateTime: t.start, timeZone: tz, date: null } as unknown as GEventTime, end: { dateTime: t.end, timeZone: tz, date: null } as unknown as GEventTime }
}

const tzOf = (ev: GEvent, zone: string) => ev.start?.timeZone ?? zone

/** The RRULE body of a master ('RRULE:FREQ=…' → 'FREQ=…'), and the lines that aren't it (EXDATE, RDATE). */
function ruleOf(master: GEvent): { rule: string | null; other: string[] } {
  const lines = master.recurrence ?? []
  const rule = lines.find((l) => /^RRULE:/i.test(l))
  return { rule: rule ? rule.slice(6) : null, other: lines.filter((l) => !/^RRULE:/i.test(l)) }
}
const withRule = (master: GEvent, rule: string): string[] => [`RRULE:${rule}`, ...ruleOf(master).other]

/** The change on the instance, as a patch body (a rename, new times, or both). */
function bodyOf(c: GcalChange, inst: GEvent, zone: string): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (c.title !== undefined) body.summary = c.title
  if (c.starts_at && c.ends_at) {
    const allDay = c.all_day ?? timesOf(inst)?.allDay ?? false
    Object.assign(body, timeBody({ start: c.starts_at, end: c.ends_at, allDay }, tzOf(inst, zone)))
  }
  return body
}

/** The master moved the way the occurrence moved (`from` → `to`): by the same whole days, to the same time of day
 * and length, BYDAY with the days. Null when the series carries lines (EXDATE / RDATE) a move would corrupt. */
function shiftedMaster(master: GEvent, from: Times, to: Times, zone: string): Record<string, unknown> | null {
  const { rule, other } = ruleOf(master)
  if (!rule || other.length) return null
  const m = timesOf(master)
  if (!m || m.allDay !== from.allDay) return null
  const tz = tzOf(master, zone)
  const key = (t: string) => (m.allDay ? t.slice(0, 10) : dateKey(new Date(t), tz))
  const days = dayGap(key(from.start), key(to.start))
  const length = Date.parse(to.end) - Date.parse(to.start)
  let next: Times
  if (m.allDay) {
    const start = addDays(m.start.slice(0, 10), days)
    next = { start: `${start}T00:00:00.000Z`, end: `${addDays(start, Math.max(1, Math.round(length / DAY)))}T00:00:00.000Z`, allDay: true }
  } else {
    const [h, mi] = wallTime(to.start, tz).slice(11).split(':').map(Number)
    const start = wallToInstant(addDays(dateKey(new Date(m.start), tz), days), h, mi, tz).getTime()
    next = { start: iso(start), end: iso(start + length), allDay: false }
  }
  return { ...timeBody(next, tz), recurrence: withRule(master, shiftByDay(rule, days)) }
}

export interface PlanInput {
  change: GcalChange
  scope: GcalScope
  /** The occurrence, as Google has it now. */
  inst: GEvent
  /** Its series' master, for a repeating one. */
  master: GEvent | null
  zone: string
  between: RuleBetween
  now: string
}

/** The Calendar API calls a change takes; `unsupported` when the scope can't be done safely (the client then
 * offers "This event"). Pure. */
export function planGcalChange(i: PlanInput): GcalOp[] | { error: 'unsupported' | 'bad_request' } {
  const { change, inst, master, zone } = i
  const scope: GcalScope = master ? i.scope : 'this'
  const to: Times | null = change.starts_at && change.ends_at ? { start: change.starts_at, end: change.ends_at, allDay: change.all_day ?? timesOf(inst)?.allDay ?? false } : null
  const from = timesOf(inst)
  if (!from) return { error: 'bad_request' }

  if (scope === 'this' || !master) {
    if (change.delete) return [{ op: 'delete', id: inst.id! }]
    return [{ op: 'patch', id: inst.id!, body: bodyOf(change, inst, zone) }]
  }

  // The series row the app's own split reads: the master, with the rule as floating text.
  const { rule, other } = ruleOf(master)
  const mt = timesOf(master)
  if (!rule || !mt) return { error: 'unsupported' }
  const all = (): GcalOp[] | { error: 'unsupported' } => {
    if (change.delete) return [{ op: 'delete', id: master.id! }]
    const body: Record<string, unknown> = {}
    if (change.title !== undefined) body.summary = change.title
    if (to) {
      if (to.allDay !== from.allDay) return { error: 'unsupported' } // a flip across the all-day line is "This event"
      const moved = shiftedMaster(master, from, to, zone)
      if (!moved) return { error: 'unsupported' }
      Object.assign(body, moved)
    }
    return [{ op: 'patch', id: master.id!, body }]
  }
  if (scope === 'all') return all()

  // following
  if (other.length) return { error: 'unsupported' }
  const original = timesOf({ start: inst.originalStartTime ?? inst.start }) ?? from
  const occ = { starts_at: original.start, ends_at: iso(Date.parse(original.start) + (Date.parse(from.end) - Date.parse(from.start))) }
  const tz = tzOf(master, zone)
  const split = splitSeries({ id: master.id!, starts_at: mt.start, ends_at: mt.end, all_day: mt.allDay, recurrence_rule: rule, recurrence_exdates: [] }, occ, 'tail', i.now, tz, i.between)
  if (!split) return all() // the first occurrence: nothing before it to keep
  // An all-day series' UNTIL is a date, not a UTC stamp.
  const headRule = mt.allDay ? split.head.recurrence_rule!.replace(/UNTIL=(\d{8})T\d{6}Z/i, 'UNTIL=$1') : split.head.recurrence_rule!
  const head: GcalOp = { op: 'patch', id: master.id!, body: { recurrence: withRule(master, headRule) } }
  if (change.delete) return [head]
  // The tail: the master's own details from this occurrence on, with the change.
  const days = to ? dayGap(mt.allDay ? from.start.slice(0, 10) : dateKey(new Date(from.start), tz), mt.allDay ? to.start.slice(0, 10) : dateKey(new Date(to.start), tz)) : 0
  const tailRule = days ? shiftByDay(split.tail.recurrence_rule!, days) : split.tail.recurrence_rule!
  const tail: Record<string, unknown> = {}
  for (const k of ['description', 'location', 'colorId', 'transparency', 'visibility', 'reminders'] as const) {
    const v = (master as Record<string, unknown>)[k]
    if (v !== undefined) tail[k] = v
  }
  const att = (master as { attendees?: { email?: string }[] }).attendees
  if (att?.length) tail.attendees = att.flatMap((a) => (a.email ? [{ email: a.email }] : []))
  tail.summary = change.title ?? inst.summary ?? master.summary ?? ''
  const span = to ?? from
  Object.assign(tail, timeBody(span, tz), { recurrence: [`RRULE:${tailRule}`] })
  return [head, { op: 'insert', body: tail }]
}

// ── running ─────────────────────────────────────────────────────────────────────────────────────

/** The Calendar API, as far as running a plan needs it (a test hands in a fake). */
export interface GcalIO {
  get(id: string): Promise<GEvent>
  patch(id: string, body: Record<string, unknown>): Promise<GEvent>
  insert(body: Record<string, unknown>): Promise<GEvent>
  remove(id: string): Promise<void>
}

/** The real API on one calendar. */
export function calendarIO(calendarId: string, token: string): GcalIO {
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`
  const one = (id: string) => `${base}/${encodeURIComponent(id)}`
  return {
    get: async (id) => (await gCall('GET', one(id), token))!,
    patch: async (id, body) => (await gCall('PATCH', one(id), token, body))!,
    insert: async (body) => (await gCall('POST', base, token, body))!,
    remove: async (id) => void (await gCall('DELETE', one(id), token)),
  }
}

/** What a patch's fields were before — the patch that puts them back. */
function priorOf(before: GEvent, body: Record<string, unknown>): Record<string, unknown> {
  const prior: Record<string, unknown> = {}
  for (const k of Object.keys(body)) {
    if (k === 'start' || k === 'end') {
      const t = before[k]
      prior[k] = t?.date ? { date: t.date, dateTime: null, timeZone: null } : { dateTime: t?.dateTime ?? null, timeZone: t?.timeZone ?? null, date: null }
    } else prior[k] = (before as Record<string, unknown>)[k] ?? (k === 'recurrence' ? [] : null)
  }
  return prior
}

/** Runs `ops` in order. `before` = the events they touch, as Google had them (for the inverse). Answers the ops that
 * undo it all, last first. A step that fails puts the earlier ones back and throws. */
export async function runOps(io: GcalIO, ops: readonly GcalOp[], before: ReadonlyMap<string, GEvent>): Promise<GcalOp[]> {
  const inverse: GcalOp[] = []
  try {
    for (const o of ops) {
      if (o.op === 'patch') {
        const prior = before.get(o.id) ?? (await io.get(o.id))
        await io.patch(o.id, o.body)
        inverse.unshift({ op: 'patch', id: o.id, body: priorOf(prior, o.body) })
      } else if (o.op === 'delete') {
        await io.remove(o.id)
        inverse.unshift({ op: 'patch', id: o.id, body: { status: 'confirmed' } }) // cancelled, not gone: confirm it again
      } else {
        const made = await io.insert(o.body)
        if (made.id) inverse.unshift({ op: 'delete', id: made.id })
      }
    }
  } catch (e) {
    for (const o of inverse) await runOps(io, [o], new Map()).catch(() => undefined)
    throw e
  }
  return inverse
}

/** A stable code for what Google refused with. */
export function editError(e: unknown): { status: number; error: string } {
  if (e instanceof GoogleError) {
    if (e.status === 401) return { status: 409, error: 'token_expired' }
    if (e.status === 403) return { status: 403, error: 'read_only' }
    if (e.status === 404 || e.status === 410) return { status: 404, error: 'gone' }
    if (e.status === 400) return { status: 400, error: 'bad_request' }
    return { status: 502, error: 'google_unavailable' }
  }
  return { status: 500, error: 'server_error' }
}
