// The MCP server's tools: what an AI assistant can read and do in one user's Kai's Flow (docs/MCP.md).
// Pure — no Deno APIs, no npm: imports — so the app's vitest runs it
// (app/src/features/settings/mcp.test.ts), the notify/ritual.ts pattern. index.ts hands in a Store
// whose SQL runs as that user (role `authenticated` + their uid → RLS), never as the service role.
//
// The app's rules, restated on the user's own clock (app_settings.timezone; Cairo when unset or not
// a zone Intl knows):
//   Today        features/tasks/grouping.ts filterByList('today'), split into Top 3 / today / overdue
//   Top 3        features/tasks/top3Rule.ts (_shared/today.ts): a pick counts while undated or dated
//                today or earlier, never someday; goal (top3_rank 1) first
//   "Tomorrow"  tomorrow 09:00 (lib/dateShortcuts scheduleTomorrow)
//   a bare date  09:00 that day (scheduleToday)
//   a date-time  puts a task on the calendar at that time; a date alone doesn't (calendar/replan.ts)
//   completing   a repeat spawns its next occurrence — never a paused one (features/tasks/completion.ts planCompletion)
//   paused       a paused series (Perennials ‖) rests until it's resumed: no list, no pick (grouping.ts)
//   task writes  carry a reminder's lead and let a moved pick go, as lib/outbox writeRow does (settle)
//   repeats      an RRULE body on the user's wall clock (_shared/repeat.ts for tasks, _shared/series.ts
//                for events — one row per series, never materialised)
//   every write  logs the same activity_log event the app's helper logs, so Slipping, streaks and the
//                digests see it (+ `source: 'mcp'` in the payload)
//   deletes      soft (Trash) wherever the app has a Trash; the few tables without one (Library,
//                people) delete outright, as the app does, and answer with the row so it can be put back
//   personal     journal and people tools exist only for a key granted that scope (mcp_keys.scopes,
//                0080) — server.ts toolsFor; index.ts refuses those tables to any other key too
//
// This file: the user's clock, the Store, the argument checks and the task / calendar / inbox tools.
// ./organize.ts (projects, areas, domains, labels, Trash, settings, the Inbox's triage), ./life.ts
// (routines, focus, rituals, Library, insights) and ./personal.ts (journal, people) add the rest;
// server.ts lists them all.

import { addDays, dateKey, dayWindow, loopDay, wallTime, wallToInstant } from '../_shared/zone.ts'
import { isTop3Today, todaysTop3 } from '../_shared/today.ts'

// The user's clock is _shared/zone.ts (notify and chat read the same one); re-exported for the tests.
export { DEFAULT_ZONE, userZone } from '../_shared/zone.ts'
export { addDays, dateKey, dayWindow, wallTime, wallToInstant }
import { expandSeries, type RuleBetween } from '../_shared/series.ts'
import { rollAfter, ruleAfterThis, stepOf } from '../_shared/repeat.ts'
import { occurrenceOn } from '../_shared/slots.ts'

// ── the user's clock ─────────────────────────────────────────────────────────────────────────

/** The app's one "Tomorrow": tomorrow 09:00 on the user's clock (ISO). */
export function tomorrowAt9(now: Date, zone: string): string {
  return wallToInstant(addDays(dateKey(now, zone), 1), 9, 0, zone).toISOString()
}

/** A date argument: a whole day, or an instant. */
export type When = { day: string } | { at: Date }

const DAY = /^\d{4}-\d{2}-\d{2}$/
const LOCAL = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/
const ABSOLUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/

/** 'YYYY-MM-DD' (a day), 'YYYY-MM-DDTHH:mm' (that time on the user's clock) or an ISO instant with
 * Z/offset. Null for anything else, including impossible dates (2026-02-30). */
export function readWhen(s: string, zone: string): When | null {
  const v = s.trim()
  const realDay = (k: string) => addDays(k, 0) === k
  if (DAY.test(v)) return realDay(v) ? { day: v } : null
  const l = LOCAL.exec(v)
  if (l) {
    const [h, mi] = [Number(l[2]), Number(l[3])]
    return realDay(l[1]) && h < 24 && mi < 60 ? { at: wallToInstant(l[1], h, mi, zone) } : null
  }
  if (ABSOLUTE.test(v)) {
    const t = new Date(v)
    return Number.isNaN(t.getTime()) ? null : { at: t }
  }
  return null
}

/** A `When` as a range bound: a day's start (`from`) or the start of the day after (`to`, inclusive day). */
export function bound(w: When, edge: 'from' | 'to', zone: string): Date {
  if ('at' in w) return w.at
  return wallToInstant(edge === 'from' ? w.day : addDays(w.day, 1), 0, 0, zone)
}

const DAY_MS = 86_400_000
const HALF_DAY = DAY_MS / 2

/** An all-day event's first and last day. It is a date in no zone, stored as that date's UTC midnight
 * (older rows: the device's midnight), so it's read at its noon — replan.ts blockDay. */
const firstDay = (e: Pick<EventRow, 'starts_at'>) => new Date(Date.parse(e.starts_at) + HALF_DAY).toISOString().slice(0, 10)
const lastDay = (e: Pick<EventRow, 'ends_at'>) => new Date(Date.parse(e.ends_at) - HALF_DAY).toISOString().slice(0, 10)

// ── what the Store hands back (index.ts: SQL as the user) ─────────────────────────────────────

export interface TaskRow {
  id: string
  title: string
  notes: string | null
  status: 'todo' | 'done' | 'cancelled'
  due_at: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  top3: boolean
  /** Place in today's Top 3, 1 = the goal (0055). Read back on reads; a new task has none. */
  top3_rank?: number | null
  someday: boolean
  paused: boolean
  labels: string[]
  priority: number | null
  duration_min: number | null
  project_id: string | null
  domain_id: string | null
  area_id: string | null
  milestone_id: string | null
  parent_task_id: string | null
  recurrence_rule: string | null
  reminder_at: string | null
  reminder_sent: boolean
  snoozed_until: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  /** Joined from projects (reads only). */
  project_name?: string | null
  /** Time Slots (0073): the Time block holding it (a repeating one's row) and that occurrence's day. */
  slot_id?: string | null
  slot_date?: string | null
  /** Manual order (0076): its place in a list, on its date's scale (epoch ms); null = by its date. */
  sort_order?: number | null
  /** Where it came from (0027): a captured link rides here as {source:'link', id, url} — writes only. */
  external_ref?: Record<string, unknown> | null
  /** Its captured link (external_ref.url) — reads only. */
  link?: string | null
}

/** The task columns a write sends (reads add project_name and link). */
const TASK_COLUMNS = [
  'id', 'title', 'notes', 'status', 'due_at', 'scheduled_start', 'scheduled_end', 'top3', 'top3_rank', 'someday', 'paused', 'labels', 'priority',
  'duration_min', 'project_id', 'domain_id', 'area_id', 'milestone_id', 'parent_task_id', 'recurrence_rule', 'reminder_at', 'reminder_sent',
  'snoozed_until', 'completed_at', 'created_at', 'updated_at', 'slot_id', 'slot_date', 'sort_order', 'external_ref',
] as const
/** What updateTask writes: every column a tool may change, as the row has it (the app's whole-row write). */
export const TASK_EDITABLE = TASK_COLUMNS.filter((c) => !['id', 'status', 'completed_at', 'created_at', 'updated_at', 'external_ref'].includes(c))
/** A task row as a write sends it: its columns only, an absent one as null. */
export const taskRecord = (t: TaskRow, cols: readonly string[] = TASK_COLUMNS): Row =>
  Object.fromEntries(cols.map((c) => [c, (t as unknown as Row)[c] ?? (c === 'labels' ? [] : c === 'top3' || c === 'someday' || c === 'paused' || c === 'reminder_sent' ? false : null)]))

export interface ProjectRow {
  id: string
  name: string
  status: string
  type: string
  domain_id: string | null
  target_date: string | null
}

/** calendar_events.type: a task's block ('task', task_id set), or the calendar's own. */
export type EventKind = 'event' | 'time_block' | 'task'

export interface EventRow {
  id: string
  title: string
  starts_at: string
  ends_at: string
  all_day: boolean
  task_id: string | null
  type?: EventKind
  /** A repeating event (migration 0061): one row, expanded by the tools (_shared/series.ts). */
  recurrence_rule?: string | null
  recurrence_exdates?: string[] | null
  /** A one-off moved out of a series: that series' row. */
  series_id?: string | null
  /** Event reminders (0077): minutes before each start; null = none. */
  remind_min?: number | null
  /** Set on an occurrence expandSeries made: the row's id. */
  seriesId?: string
}

/** One of a task's live calendar blocks, as the replan reads it. */
export type BlockRow = Pick<EventRow, 'id' | 'starts_at' | 'ends_at' | 'all_day'>

export interface SearchHit {
  entity_type: string
  entity_id: string
  title: string
  snippet: string | null
  score: number
}

export interface TaskFilter {
  status: 'open' | 'done' | 'all'
  projectId: string | null
  label: string | null
  dueFrom: string | null
  dueTo: string | null
  limit: number
  /** Only tasks in this area. */
  areaId?: string | null
  /** Only Someday tasks (true), or none of them (false). */
  someday?: boolean | null
}

/** A personal area a key reaches only when its owner switched it on (mcp_keys.scopes, 0080). */
export type Scope = 'journal' | 'people'
export const SCOPES: readonly Scope[] = ['journal', 'people']

/** The tables the generic Store methods reach (index.ts refuses any other, and the personal ones to
 * a key without their scope). */
export type Table =
  | 'tasks' | 'inbox_items' | 'calendar_events' | 'projects' | 'areas' | 'domains' | 'routines' | 'routine_completions' | 'time_entries'
  | 'books' | 'notes' | 'quotes' | 'app_settings' | 'slipping' | 'journal_entries' | 'people' | 'interactions'
export type Row = Record<string, unknown>

export interface FindOptions {
  order?: string
  desc?: boolean
  limit?: number
}

/** A row in Trash, as the trash tool lists it. */
export interface TrashedRow {
  type: string
  id: string
  title: string | null
  deleted_at: string
}

/** One activity_log row, as the reads see it. */
export interface ActivityRow {
  event_type: string
  entity_type: string
  entity_id: string
  payload: Row | null
  created_at: string
}

export interface WeekStats {
  done: number
  done_titles: string[]
  added: number
  focus_min: number
  routine_checks: number
  captured: number
}

/** One method per statement; every one runs inside the call's transaction, as the user. */
export interface Store {
  /** Generic reads and writes for the smaller tables. `match` is JSON containment on the row
   * (`{deleted_at: null}` = live, `{labels: ["x"]}` = carries x); `{}` = every row of the user's. */
  find(table: Table, match?: Row, opts?: FindOptions): Promise<Row[]>
  /** Inserts one row; columns it leaves out take their defaults (user_id = the key's owner). */
  insert(table: Table, row: Row): Promise<void>
  /** Writes `values` onto the rows matching `match` (never an empty match, except app_settings' one
   * row); returns them as written. */
  patch(table: Table, match: Row, values: Row): Promise<Row[]>
  /** Deletes outright (tables without a Trash); returns the rows as they were. */
  remove(table: Table, match: Row): Promise<Row[]>
  /** Inbox items, newest first: `pending` = the triage queue (not snoozed), or by status. */
  inboxItems(show: 'pending' | 'snoozed' | 'dismissed' | 'filed' | 'all', limit: number): Promise<Row[]>
  /** In Trash, newest first: tasks, inbox items, own events, projects, areas, domains (+ journal entries for a journal key). */
  trashed(limit: number): Promise<TrashedRow[]>
  /** activity_log rows, newest first (or oldest first with `asc`). */
  activity(f: { types?: readonly string[]; prefix?: string; since?: string; limit: number; asc?: boolean }): Promise<ActivityRow[]>
  /** What a span of days held: tasks done (and their titles), added, focus minutes, routine check-ins, captures. */
  weekStats(fromIso: string, toIso: string, fromDay: string, toDay: string): Promise<WeekStats>
  timezone(): Promise<string | null>
  /** Open, not in Trash, not someday, not paused: dated before `end`, scheduled in [start, end), or an undated pick. */
  dayTasks(startIso: string, endIso: string): Promise<TaskRow[]>
  listTasks(f: TaskFilter): Promise<TaskRow[]>
  getTask(id: string): Promise<TaskRow | null>
  /** Not in Trash, by name. */
  projects(): Promise<ProjectRow[]>
  /** Not in Trash: overlapping [from, to), plus every repeating row starting before `to` (the tools
   * expand those — a series' row is its first occurrence). By start. */
  events(fromIso: string, toIso: string): Promise<EventRow[]>
  /** Not in Trash: the tasks these Time blocks' rows hold (0073 slot_id), any day. */
  slotTasks(slotIds: readonly string[]): Promise<TaskRow[]>
  search(query: string, limit: number): Promise<SearchHit[]>
  /** Today's open picks (top3Rule): starred, open, not in Trash, not someday or paused, undated or dated before `todayEndIso`. */
  top3Count(todayEndIso: string): Promise<number>
  /** An open copy of a repeat already sits at `dueIso` (completion.ts openOccurrence). */
  openOccurrence(title: string, rule: string, dueIso: string, exceptId: string): Promise<boolean>
  insertTask(t: TaskRow): Promise<void>
  /** Writes the task's editable fields (TASK_EDITABLE) as `t` has them — not in Trash. */
  updateTask(t: TaskRow): Promise<void>
  /** status todo → done; false when the task wasn't open any more. */
  markDone(id: string, atIso: string): Promise<boolean>
  /** The task's live calendar blocks. */
  taskBlocks(taskId: string): Promise<EventRow[]>
  /** A live event by its stored id — a series' row for a repeating one. */
  getEvent(id: string): Promise<EventRow | null>
  insertEvent(e: EventRow): Promise<void>
  /** Writes the event's title, times, all-day, kind and repeat (rule + skipped starts) as `e` has them. */
  updateEvent(e: EventRow): Promise<void>
  /** Soft-deletes these events and every one-off moved out of them (deleted_at, so Trash can bring
   * them back); returns the ids it deleted. */
  deleteEvents(ids: readonly string[]): Promise<string[]>
  insertInbox(row: { id: string; raw_text: string; payload: Record<string, unknown> }): Promise<void>
  log(eventType: string, entityType: string, entityId: string, payload: Record<string, unknown>): Promise<void>
}

export interface ToolContext {
  store: Store
  zone: string
  now: Date
  /** The rule's next occurrence strictly after `after`, for a series starting at `from`, on `zone`'s wall
   * clock — the app's features/tasks/recurrence.ts nextOccurrence (index.ts: npm:rrule). */
  nextOccurrence: (rule: string, from: Date, zone: string, after: Date) => Date | null
  /** rrule's between() for a repeating event (index.ts: npm:rrule; the test: the app's series.ts). */
  ruleBetween: RuleBetween
  /** The personal areas this key may reach (mcp_keys.scopes). */
  scopes: ReadonlySet<Scope>
}

/** The events in [start, end): one-off rows as the store found them, each repeating row as its
 * occurrences there — the app's own expansion (features/calendar/series.ts). */
export async function eventsIn(ctx: ToolContext, start: Date, end: Date): Promise<EventRow[]> {
  return expandSeries(await ctx.store.events(start.toISOString(), end.toISOString()), start, end, ctx.zone, ctx.ruleBetween)
}

// ── input checks: a bad argument is a tool error the model can read and fix ─────────────────────

export class ToolInputError extends Error {}
export const bad = (msg: string): never => {
  throw new ToolInputError(msg)
}

export type Args = Record<string, unknown>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function text(a: Args, k: string, max: number, required = false): string | undefined {
  const v = a[k]
  if (v === undefined || v === null) return required ? bad(`"${k}" is required.`) : undefined
  if (typeof v !== 'string') return bad(`"${k}" must be a string.`)
  const t = v.trim()
  if (!t) return required ? bad(`"${k}" can't be empty.`) : undefined
  if (t.length > max) return bad(`"${k}" is too long (at most ${max} characters).`)
  return t
}

/** An id, lower-cased (JSON containment compares it as text). */
export function uuid(a: Args, k: string, required = false): string | undefined {
  const v = text(a, k, 36, required)
  if (v !== undefined && !UUID.test(v)) return bad(`"${k}" must be an id (a UUID) as returned by another tool.`)
  return v?.toLowerCase()
}

export const isUuid = (s: string): boolean => UUID.test(s)

/** A list of ids: 1 to `max`, each a UUID, no repeats. */
export function idList(a: Args, k: string, max: number): string[] {
  const v = a[k]
  if (!Array.isArray(v) || v.length === 0 || v.length > max) return bad(`"${k}" must be a list of 1 to ${max} ids.`)
  const ids = v.map((x) => (typeof x === 'string' && UUID.test(x.trim()) ? x.trim().toLowerCase() : bad(`"${k}" must hold ids (UUIDs) as returned by another tool.`)))
  return new Set(ids).size === ids.length ? ids : bad(`"${k}" names an id twice.`)
}

export function flag(a: Args, k: string): boolean | undefined {
  const v = a[k]
  if (v === undefined || v === null) return undefined
  return typeof v === 'boolean' ? v : bad(`"${k}" must be true or false.`)
}

export function whole(a: Args, k: string, min: number, max: number, fallback: number): number {
  const v = a[k]
  if (v === undefined || v === null) return fallback
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) return bad(`"${k}" must be a whole number from ${min} to ${max}.`)
  return v
}

export function choice<T extends string>(a: Args, k: string, values: readonly T[], fallback: T): T {
  const v = a[k]
  if (v === undefined || v === null) return fallback
  return values.includes(v as T) ? (v as T) : bad(`"${k}" must be one of: ${values.join(', ')}.`)
}

export function when(a: Args, k: string, zone: string): When | undefined {
  const v = text(a, k, 40)
  if (v === undefined) return undefined
  return readWhen(v, zone) ?? bad(`"${k}" must be a date (YYYY-MM-DD), a local date-time (YYYY-MM-DDTHH:mm, on the user's clock) or an ISO time with a zone.`)
}

/** A date argument as an instant: a date alone is 09:00 that day (scheduleToday). */
export const instantOf = (w: When, zone: string): Date => ('at' in w ? w.at : wallToInstant(w.day, 9, 0, zone))

/** A task's length, in minutes: 1 minute to a day. */
export const minutes = (a: Args, k: string): number | null => (a[k] === undefined || a[k] === null ? null : whole(a, k, 1, 1440, 0))

/** A list of short strings (labels, tags): trimmed, empty ones dropped, no repeats, at most `max`. */
export function words(a: Args, k: string, max = 20, len = 60): string[] | undefined {
  const v = a[k]
  if (v === undefined) return undefined
  if (v === null) return []
  if (!Array.isArray(v) || v.length > max) return bad(`"${k}" must be a list of at most ${max} words.`)
  const out = v.map((x) => (typeof x === 'string' ? x.trim() : bad(`"${k}" must hold text.`))).filter(Boolean)
  if (out.some((x) => x.length > len)) return bad(`Each of "${k}" is at most ${len} characters.`)
  return [...new Set(out)]
}

/** A day on the user's calendar: YYYY-MM-DD only. */
export function dayArg(a: Args, k: string, zone: string): string | undefined {
  const w = when(a, k, zone)
  if (w === undefined) return undefined
  return 'day' in w ? w.day : bad(`"${k}" is a day: YYYY-MM-DD.`)
}

/** A clock time on the user's clock: HH:MM (24h). */
export function clockArg(a: Args, k: string): string | null | undefined {
  if (!(k in a)) return undefined
  const v = text(a, k, 5)
  if (v === undefined) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(v)
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : bad(`"${k}" must be a time, HH:MM (24h).`)
}

/** The app's swatches by name (Settings → Organize, a project's page: features/domains/organize.ts DOMAIN_COLORS). */
export const PLACE_COLORS: Record<string, string> = {
  terracotta: 'var(--acc-terra)', moss: 'var(--acc-moss)', lavender: 'var(--acc-lavender-deep)', gold: 'var(--acc-gold)',
  hydrangea: 'var(--acc-hydrangea)', sage: 'var(--acc-sage)', plum: '#7a4a52', stone: '#8b8471',
}
/** A colour argument: one of `palette`'s names (any case), null = none. Undefined when not given. */
export function colorArg(a: Args, k: string, palette: Record<string, string>): string | null | undefined {
  if (!(k in a)) return undefined
  const v = text(a, k, 20)
  if (v === undefined) return null
  return palette[v.toLowerCase()] ?? bad(`"${k}" must be one of: ${Object.keys(palette).join(', ')} (or null).`)
}
/** A stored colour by its name, else as stored. */
export const colorName = (v: unknown, palette: Record<string, string>): string | null =>
  typeof v === 'string' ? (Object.entries(palette).find(([, c]) => c === v)?.[0] ?? v) : null

/** `when` as a nullable argument: undefined when not given, null when null. */
export function whenOrNull(a: Args, k: string, zone: string): When | null | undefined {
  if (!(k in a)) return undefined
  return a[k] === null ? null : when(a, k, zone)
}

/** One activity row, with `source: 'mcp'` (lib/activity.ts logActivity). A key that isn't a uuid (a
 * ritual's day, a label's name) gets a fresh id and rides along as payload.entity_key, as activityRow does. */
export async function logIt(ctx: ToolContext, eventType: string, entityType: string, key: string, payload: Row = {}): Promise<void> {
  const keyed = UUID.test(key)
  await ctx.store.log(eventType, entityType, keyed ? key : crypto.randomUUID(), { ...payload, ...(keyed ? {} : { entity_key: key }), source: 'mcp' })
}

/** The most rows one bulk call takes (the app's bulk bar has no cap; this keeps a call short). */
export const MAX_BULK = 50

/** `id` or `ids`: `one` for each — the app's bulk bar. A refusal for one id is reported and the
 * rest go on; anything else (the database) fails the whole call, which then writes nothing. */
export async function eachId(a: Args, one: (id: string) => Promise<Row>): Promise<Row> {
  if (a.ids === undefined || a.ids === null) return one(uuid(a, 'id', true)!)
  if (a.id !== undefined && a.id !== null) return bad('Give "id" or "ids", not both.')
  const results: Row[] = []
  const failed: { id: string; error: string }[] = []
  for (const id of idList(a, 'ids', MAX_BULK)) {
    try {
      results.push(await one(id))
    } catch (e) {
      if (!(e instanceof ToolInputError)) throw e
      failed.push({ id, error: e.message })
    }
  }
  return { results, ...(failed.length ? { failed } : {}) }
}

// An RRULE body as the app stores it ("FREQ=WEEKLY;BYDAY=MO,WE"): the parts the Repeat editor and an
// import write, nothing finer than a day (no HOURLY / MINUTELY).
const WEEKDAY = '[+-]?[1-5]?(?:MO|TU|WE|TH|FR|SA|SU)'
const list = (x: string) => `${x}(?:,${x})*`
const RULE_PART = new RegExp(
  `^(?:FREQ=(?:DAILY|WEEKLY|MONTHLY|YEARLY)|INTERVAL=[1-9]\\d?|COUNT=[1-9]\\d{0,2}|UNTIL=\\d{8}(?:T\\d{6}Z)?|BYDAY=${list(WEEKDAY)}` +
    `|BYMONTHDAY=${list('-?(?:[1-9]|[12]\\d|3[01])')}|BYMONTH=${list('(?:[1-9]|1[0-2])')}|BYSETPOS=-?[1-5]|WKST=(?:MO|SU))$`,
)
const RULE_HELP = 'an RRULE body such as FREQ=DAILY, FREQ=WEEKLY;BYDAY=MO,WE,FR, FREQ=MONTHLY;BYMONTHDAY=1 or FREQ=WEEKLY;INTERVAL=2;UNTIL=20261231T235959Z'

/** `repeat`: undefined when not given; null to stop repeating (null or ""); else the rule, checked part
 * by part (one FREQ, no part twice, not both COUNT and UNTIL) and upper-cased, "RRULE:" dropped. */
export function repeatArg(a: Args, k: string): string | null | undefined {
  if (!(k in a)) return undefined
  const v = text(a, k, 200)
  if (v === undefined) return null
  const rule = v.replace(/^RRULE:/i, '').toUpperCase()
  const keys = rule.split(';').map((p) => p.split('=')[0])
  const ok = rule.split(';').every((p) => RULE_PART.test(p)) && new Set(keys).size === keys.length && keys.includes('FREQ') && !(keys.includes('COUNT') && keys.includes('UNTIL'))
  return ok ? rule : bad(`"${k}" must be ${RULE_HELP} — or null to stop repeating.`)
}

/** A task's repeat must be one the recurrence engine can roll (complete_task, the app's completion). */
function checkTaskRule(ctx: ToolContext, rule: string, dueIso: string): void {
  try {
    ctx.nextOccurrence(rule, new Date(dueIso), ctx.zone, new Date(dueIso))
  } catch {
    return bad(`"repeat" ${rule} can't be read. Use ${RULE_HELP}.`)
  }
}

// ── what the model sees: compact, wall-clock times, nulls left out ───────────────────────────

export function taskOut(t: TaskRow, zone: string, full = false): Record<string, unknown> {
  const o: Record<string, unknown> = { id: t.id, title: t.title }
  if (t.status !== 'todo') o.status = t.status
  if (t.due_at) o.due = wallTime(t.due_at, zone)
  if (t.scheduled_start) o.scheduled = wallTime(t.scheduled_start, zone) + (t.scheduled_end ? `–${wallTime(t.scheduled_end, zone).slice(11)}` : '')
  if (t.duration_min !== null && t.duration_min !== undefined) o.duration_min = t.duration_min
  if (t.project_name) o.project = t.project_name
  if (t.labels?.length) o.labels = t.labels
  if (t.top3) o.top3 = true
  if (t.top3 && t.top3_rank === 1) o.goal = true
  if (t.priority !== null && t.priority !== undefined) o.priority = t.priority
  if (t.someday) o.someday = true
  if (t.recurrence_rule) o.repeats = t.recurrence_rule
  if (t.paused) o.paused = true
  if (t.slot_id) o.in_slot = t.slot_id
  if (t.completed_at) o.completed = wallTime(t.completed_at, zone)
  if (full) {
    if (t.notes) o.notes = t.notes
    if (t.reminder_at) o.reminder = wallTime(t.reminder_at, zone)
    if (t.project_id) o.project_id = t.project_id
    if (t.area_id) o.area_id = t.area_id
    if (t.domain_id) o.domain_id = t.domain_id
    if (t.parent_task_id) o.parent_task_id = t.parent_task_id
    if (t.link) o.link = t.link
    o.created = wallTime(t.created_at, zone)
  }
  return o
}

/** "2026-10-08 18:00–19:30" (a timed span; the end's date only when it differs) or "2026-10-08" /
 * "2026-10-08 – 2026-10-10" (all-day, last day included). */
export function spanText(e: Pick<EventRow, 'starts_at' | 'ends_at' | 'all_day'>, zone: string): string {
  if (e.all_day) return firstDay(e) === lastDay(e) ? firstDay(e) : `${firstDay(e)} – ${lastDay(e)}`
  const [s, en] = [wallTime(e.starts_at, zone), wallTime(e.ends_at, zone)]
  return `${s}–${en.slice(0, 10) === s.slice(0, 10) ? en.slice(11) : en}`
}

export function eventOut(e: EventRow, zone: string): Record<string, unknown> {
  // An occurrence answers with its series' id — the one stored, the one search returns. An all-day
  // event is its days (the last one included), not a time on anyone's clock.
  const o: Record<string, unknown> = e.all_day
    ? { id: e.seriesId ?? e.id, title: e.title, start: firstDay(e), end: lastDay(e), all_day: true }
    : { id: e.seriesId ?? e.id, title: e.title, start: wallTime(e.starts_at, zone), end: wallTime(e.ends_at, zone) }
  if (e.type && e.type !== 'event') o.kind = e.type
  if (e.task_id) o.task_id = e.task_id
  if (e.recurrence_rule) o.repeats = e.recurrence_rule
  if (e.remind_min !== null && e.remind_min !== undefined) o.remind_min = e.remind_min
  return o
}

/** The events as the tools answer them; a Time block lists the tasks this occurrence holds (Time
 * Slots, 0073: its row and its day — the app's features/calendar/slots.ts). */
export async function eventsOut(ctx: ToolContext, events: readonly EventRow[]): Promise<Record<string, unknown>[]> {
  const row = (e: EventRow) => e.seriesId ?? e.id
  const ids = [...new Set(events.filter((e) => e.type === 'time_block').map(row))]
  const held = ids.length ? await ctx.store.slotTasks(ids) : []
  return events.map((e) => {
    const o = eventOut(e, ctx.zone)
    if (e.type !== 'time_block') return o
    const day = dateKey(new Date(e.starts_at), ctx.zone)
    const mine = held.filter((t) => t.slot_id === row(e) && t.slot_date === day)
    return mine.length ? { ...o, tasks: mine.map((t) => ({ id: t.id, title: t.title, done: t.status === 'done' })) } : o
  })
}

/** Today's open tasks, as the app sorts them (grouping.ts): Top 3 picks (top3Rule, goal first); due or
 * scheduled today; dated before today. Never someday or paused — a starred someday task isn't a pick. */
export function splitToday(rows: readonly TaskRow[], now: Date, zone: string): { top3: TaskRow[]; today: TaskRow[]; overdue: TaskRow[] } {
  const day = dateKey(now, zone)
  const out = { top3: todaysTop3(rows, now, zone), today: [] as TaskRow[], overdue: [] as TaskRow[] }
  for (const t of rows) {
    if (t.status !== 'todo' || t.someday || t.paused || isTop3Today(t, now, zone)) continue
    const scheduledToday = !!t.scheduled_start && dateKey(new Date(t.scheduled_start), zone) === day
    const dated = t.due_at ?? t.scheduled_start
    const on = dated ? dateKey(new Date(dated), zone) : null
    if (scheduledToday || on === day) out.today.push(t)
    else if (on !== null && on < day) out.overdue.push(t)
  }
  return out
}

// ── writing a task the way the app does ──────────────────────────────────────────────────────────

/** Every task write goes through here, as every app write goes through lib/outbox writeRow: a moved
 * task's reminder keeps its lead (lib/carryReminder.ts — it moves by however far the due date, else
 * the block, moved, and is armed again when it lands in the future), and a Top 3 pick taken off today
 * gives its place up (features/tasks/top3Rule.ts releaseTop3). */
export function settle(prev: TaskRow, next: TaskRow, now: Date, zone: string): TaskRow {
  let row = next
  const from = prev.due_at ?? prev.scheduled_start
  const to = next.due_at ?? next.scheduled_start
  if (prev.reminder_at && next.reminder_at === prev.reminder_at && from && to && Date.parse(from) !== Date.parse(to)) {
    const at = Date.parse(prev.reminder_at) + (Date.parse(to) - Date.parse(from))
    row = { ...row, reminder_at: new Date(at).toISOString(), reminder_sent: at > now.getTime() ? false : row.reminder_sent }
  }
  return row.top3 && !isTop3Today(row, now, zone) ? { ...row, top3: false, top3_rank: null } : row
}

/** A task's block when nothing says how long: its estimate, else 30 minutes (capture/api blockIfTimed). */
const BLOCK_MIN = 30

/** THE RULE for a task's blocks when its date changes (features/calendar/replan.ts replanMoves, Kai
 * 2026-10-07 — as in Akiflow, a task given a time is on the calendar; a date alone isn't):
 * - a time → one block there: its latest block moves (keeping its length), else a new one as long as
 *   its estimate; every other block comes off;
 * - a date only → the latest block already on that day stays, every other comes off.
 * An all-day block's day is read at its noon (replan.ts blockDay). */
export function replanMoves<B extends BlockRow>(
  blocks: readonly B[],
  due: string | null,
  timed: boolean,
  durationMin: number | null,
  zone: string,
): { place: { block: B | null; starts_at: string; ends_at: string } | null; keep: B | null; clear: B[] } {
  const latestFirst = [...blocks].sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))
  // No date: off the calendar altogether (replan.ts: "no date takes them all off").
  if (!due) return { place: null, keep: null, clear: latestFirst }
  if (timed) {
    const [block = null, ...rest] = latestFirst
    const len = block && !block.all_day ? Date.parse(block.ends_at) - Date.parse(block.starts_at) : (durationMin || BLOCK_MIN) * 60_000
    return { place: { block, starts_at: due, ends_at: new Date(Date.parse(due) + len).toISOString() }, keep: null, clear: rest }
  }
  const day = (b: B) => dateKey(new Date(Date.parse(b.starts_at) + (b.all_day ? HALF_DAY : 0)), zone)
  const keep = latestFirst.find((b) => day(b) === dateKey(new Date(due), zone)) ?? null
  return { place: null, keep, clear: latestFirst.filter((b) => b !== keep) }
}

/** A task to a new due date, as every replan in the app goes (tasks/api rescheduleDue → calendar/api
 * applyMoves): the date, Someday off, the blocks by replanMoves, the schedule following the block it
 * ends on (touchTaskSchedule) — cleared when every block came off — settled, and logged the same way. */
export async function replanTask(ctx: ToolContext, t: TaskRow, due: string | null, timed: boolean): Promise<{ task: TaskRow; placed: EventRow | null; removed: number }> {
  const m = replanMoves(await ctx.store.taskBlocks(t.id), due, timed, t.duration_min, ctx.zone)
  const on = m.place ?? m.keep
  // Replanned, a task leaves its Time slot (tasks/api rescheduleDue → OUT_OF_SLOT).
  const outOfSlot = t.slot_id ? OUT_OF_SLOT : {}
  const schedule = on ? { scheduled_start: on.starts_at, scheduled_end: on.ends_at } : m.clear.length ? { scheduled_start: null, scheduled_end: null } : {}
  const task = settle(t, { ...t, ...outOfSlot, due_at: due, someday: due ? false : t.someday, ...schedule }, ctx.now, ctx.zone)
  await ctx.store.updateTask(task)
  await ctx.store.log('task.rescheduled', 'task', t.id, { due_at: due, source: 'mcp' })
  const removed = m.clear.length ? await ctx.store.deleteEvents(m.clear.map((b) => b.id)) : []
  for (const blockId of removed) await ctx.store.log('calendar_event.deleted', 'calendar_event', blockId, { source: 'mcp' })
  let placed: EventRow | null = null
  if (m.place) {
    const { block, starts_at, ends_at } = m.place
    placed = block ? { ...block, starts_at, ends_at, all_day: false } : { id: crypto.randomUUID(), title: t.title, starts_at, ends_at, all_day: false, task_id: t.id, type: 'task' }
    await (block ? ctx.store.updateEvent(placed) : ctx.store.insertEvent(placed))
    await ctx.store.log('task.scheduled', 'task', t.id, { calendar_event_id: placed.id, source: 'mcp' })
  }
  return { task, placed, removed: removed.length }
}

/** Polish F2a: a repeat's next copy reminds as far before its new due time as the original did. */
function nextReminderAt(reminderAt: string | null, fromDue: string, toDue: Date): string | null {
  if (!reminderAt) return null
  return new Date(toDue.getTime() - (new Date(fromDue).getTime() - new Date(reminderAt).getTime())).toISOString()
}

// ── Time Slots (0073, features/calendar/slots.ts): a Time block HOLDS tasks ─────────────────────────

/** Out of a slot: back to the rail, unscheduled. */
export const OUT_OF_SLOT = { slot_id: null, slot_date: null, scheduled_start: null, scheduled_end: null } as const

/** A missed due date follows a block or slot placed today or later (calendar/replan.ts dueFollows). */
export function dueFollows(dueAt: string | null, startsAt: string, now: Date, zone: string): boolean {
  const today = dateKey(now, zone)
  return !!dueAt && dateKey(new Date(dueAt), zone) < today && dateKey(new Date(startsAt), zone) >= today
}

/** What a task takes on going into a slot occurrence (slots.ts intoSlot): the slot's row, its day, its times. */
export const intoSlot = (rowId: string, occ: Span, zone: string) => ({
  slot_id: rowId,
  slot_date: dateKey(new Date(occ.starts_at), zone),
  scheduled_start: new Date(occ.starts_at).toISOString(),
  scheduled_end: new Date(occ.ends_at).toISOString(),
})

/** The tasks slot `rowId` holds: in occurrence `occ` (slots.ts inSlot — its day, and a time inside it),
 * or on any day when `occ` is null. */
async function heldBy(ctx: ToolContext, rowId: string, occ: Span | null): Promise<TaskRow[]> {
  const held = await ctx.store.slotTasks([rowId])
  if (!occ) return held.filter((t) => t.slot_id === rowId)
  const day = dateKey(new Date(occ.starts_at), ctx.zone)
  return held.filter((t) => {
    if (t.slot_id !== rowId || t.slot_date !== day || !t.scheduled_start) return false
    const at = Date.parse(t.scheduled_start)
    return at >= Date.parse(occ.starts_at) && at < Date.parse(occ.ends_at)
  })
}

/** Writes `patch(t)` onto each task, settled like every task write (calendar/api restamp → writeRow). */
async function restamp(ctx: ToolContext, tasks: readonly TaskRow[], patch: (t: TaskRow) => Partial<TaskRow>): Promise<number> {
  for (const t of tasks) await ctx.store.updateTask(settle(t, { ...t, ...patch(t) }, ctx.now, ctx.zone))
  return tasks.length
}

type SlotFields = ReturnType<typeof intoSlot> | typeof OUT_OF_SLOT

/** A slot edit's held tasks to where `to` says — into an occurrence, or OUT_OF_SLOT (calendar/api
 * followSlot, reseat, releaseRow). Writes and logs only the ones that change; says what happened. */
async function rehome(ctx: ToolContext, tasks: readonly TaskRow[], to: (t: TaskRow) => SlotFields): Promise<string[]> {
  let [stayed, out] = [0, 0]
  for (const t of tasks) {
    const f = to(t)
    if (f.slot_id === (t.slot_id ?? null) && f.slot_date === (t.slot_date ?? null) && sameInstant(f.scheduled_start, t.scheduled_start) && sameInstant(f.scheduled_end, t.scheduled_end)) continue
    await ctx.store.updateTask(settle(t, { ...t, ...f }, ctx.now, ctx.zone))
    if (f.slot_id) {
      stayed++
      await logIt(ctx, 'task.scheduled', 'task', t.id, { slot_id: f.slot_id, slot_date: f.slot_date })
    } else {
      out++
      await logIt(ctx, 'task.unscheduled', 'task', t.id, { slot_id: t.slot_id ?? null })
    }
  }
  return [...(stayed ? [`${stayed} task${stayed === 1 ? '' : 's'} in it moved with it`] : []), ...released(out)]
}

// ── writing an event the way the app does ────────────────────────────────────────────────────────

export const KINDS = ['event', 'time_block'] as const
export type Span = Pick<EventRow, 'starts_at' | 'ends_at' | 'all_day'>
/** A new event's length when nothing says (QuickCreate's 09:00–09:30). */
const EVENT_MIN = 30
const MAX_EVENT_DAYS = 31

/** An event's [start, end) from `start` / `end` / `duration_min` on the user's clock. `base` is the
 * event being edited: what isn't given keeps its value (a moved event keeps its length). A date
 * `start` makes it all-day (`end` = its last day); a date-time makes it timed. Undefined when none
 * of the three is given. */
export function spanArgs(a: Args, zone: string, base?: Span): Span | undefined {
  const start = when(a, 'start', zone)
  const end = when(a, 'end', zone)
  const dur = a.duration_min === undefined || a.duration_min === null ? undefined : whole(a, 'duration_min', 1, 1440, EVENT_MIN)
  if (!base && !start) return bad('"start" is required.')
  if (!start && !end && dur === undefined) return undefined
  if (end && dur !== undefined) return bad('Give "end" or "duration_min", not both.')
  const allDay = start ? 'day' in start : base!.all_day
  if (allDay) {
    if (dur !== undefined) return bad('"duration_min" is for a timed event; an all-day one takes "end", its last day.')
    if (end && !('day' in end)) return bad('An all-day event ends on a day: "end" is its last day, YYYY-MM-DD.')
    const first = start && 'day' in start ? start.day : firstDay(base!)
    const keptDays = base?.all_day ? (Date.parse(lastDay(base)) - Date.parse(firstDay(base))) / DAY_MS : 0
    const last = end && 'day' in end ? end.day : addDays(first, keptDays)
    if (last < first) return bad('"end" must be on or after "start".')
    if (Date.parse(last) - Date.parse(first) >= MAX_EVENT_DAYS * DAY_MS) return bad(`An event lasts at most ${MAX_EVENT_DAYS} days.`)
    return { all_day: true, starts_at: `${first}T00:00:00.000Z`, ends_at: `${addDays(last, 1)}T00:00:00.000Z` }
  }
  if (end && !('at' in end)) return bad('A timed event ends at a time: "end" is YYYY-MM-DDTHH:mm.')
  const s = start && 'at' in start ? start.at.getTime() : Date.parse(base!.starts_at)
  const kept = base && !base.all_day ? Date.parse(base.ends_at) - Date.parse(base.starts_at) : EVENT_MIN * 60_000
  const e = end && 'at' in end ? end.at.getTime() : s + (dur !== undefined ? dur * 60_000 : kept)
  if (e <= s) return bad('"end" must be after "start".')
  if (e - s > MAX_EVENT_DAYS * DAY_MS) return bad(`An event lasts at most ${MAX_EVENT_DAYS} days.`)
  return { all_day: false, starts_at: new Date(s).toISOString(), ends_at: new Date(e).toISOString() }
}

/** A whole series' new time of day and length (calendar/series retimeSeries): only the times of
 * `start` / `end` are read — the series keeps its days, its first one included (`repeat` changes
 * the days). Undefined when none of start / end / duration_min is given. */
function seriesSpan(a: Args, zone: string, row: EventRow): Span | undefined {
  const start = when(a, 'start', zone)
  const end = when(a, 'end', zone)
  const dur = a.duration_min === undefined || a.duration_min === null ? undefined : whole(a, 'duration_min', 1, 1440, EVENT_MIN)
  if (!start && !end && dur === undefined) return undefined
  if (end && dur !== undefined) return bad('Give "end" or "duration_min", not both.')
  const at = (w: When | undefined): Date | null | undefined => (w === undefined ? undefined : 'at' in w ? w.at : null)
  const [s, e] = [at(start), at(end)]
  if (row.all_day || s === null || e === null) {
    return bad('A repeating event keeps its days: give a timed series its new time of day as YYYY-MM-DDTHH:mm (only the time is used). To change an all-day series, delete it and add a new one.')
  }
  const minuteOf = (iso: string) => {
    const [h, mi] = wallTime(iso, zone).slice(11).split(':').map(Number)
    return h * 60 + mi
  }
  const from = minuteOf((s ?? new Date(row.starts_at)).toISOString())
  const len = dur ?? (e ? (minuteOf(e.toISOString()) - from + 1440) % 1440 || 1440 : (Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60_000)
  const first = wallToInstant(dateKey(new Date(row.starts_at), zone), Math.floor(from / 60), from % 60, zone)
  return { all_day: false, starts_at: first.toISOString(), ends_at: new Date(first.getTime() + len * 60_000).toISOString() }
}

/** A repeating event starts on its rule: rrule never counts a start the rule skips (a Saturday under
 * "every weekday"), so that block would silently not exist. Its first occurrence is its start. */
function checkSeries(e: EventRow, ctx: ToolContext): void {
  if (!e.recurrence_rule) return
  const from = Date.parse(e.starts_at)
  const [first] = expandSeries([{ ...e, recurrence_exdates: [] }], new Date(from), new Date(from + 400 * DAY_MS), ctx.zone, ctx.ruleBetween)
  const at = (iso: string) => (e.all_day ? firstDay({ starts_at: iso }) : wallTime(iso, ctx.zone))
  if (!first?.seriesId) return bad(`"repeat" ${e.recurrence_rule} never happens from ${at(e.starts_at)}. Use ${RULE_HELP}.`)
  if (Date.parse(first.starts_at) !== from) {
    return bad(
      `"repeat" ${e.recurrence_rule} doesn't fall on the start (${at(e.starts_at)}); its first one would be ${at(first.starts_at)}. Start it then, or use a rule that includes that day. ` +
        'To give a series other days from now on, end it (add UNTIL=YYYYMMDDT235959Z to its rule) and add a new one.',
    )
  }
}

/** The occurrence of series `row` that `w` names: its start as the calendar tool lists it (for an
 * all-day series, its day; a day alone also finds a timed series' one that day). */
export function occurrenceOf(row: EventRow, w: When, ctx: ToolContext): EventRow {
  const at = 'at' in w ? w.at.getTime() : wallToInstant(w.day, 0, 0, ctx.zone).getTime()
  const near = expandSeries([row], new Date(at - 2 * DAY_MS), new Date(at + 2 * DAY_MS), ctx.zone, ctx.ruleBetween)
  const dayOf = (o: EventRow) => (o.all_day ? firstDay(o) : dateKey(new Date(o.starts_at), ctx.zone))
  const hit = near.find((o) => o.seriesId && ('at' in w ? Date.parse(o.starts_at) === at : dayOf(o) === w.day))
  return hit ?? bad(`"${row.title}" has no occurrence at ${'at' in w ? wallTime(w.at.toISOString(), ctx.zone) : w.day} (skipped, or not on its rule). The calendar tool lists each occurrence's start.`)
}

/** An event an assistant may change: live, and the calendar's own — a task's block follows its task. */
export async function liveEvent(ctx: ToolContext, eventId: string): Promise<EventRow> {
  const e = await ctx.store.getEvent(eventId)
  if (!e) return bad(`No event with id ${eventId} (it may have been deleted). Use calendar or search to find it.`)
  if (e.task_id || e.type === 'task') return bad(`"${e.title}" is a task's calendar block: reschedule_task moves the task and its block together.`)
  return e
}

const MAX_TOP3 = 3
const OVERDUE_SHOWN = 30
// The assistant's search sees work items and the Library. Journal entries and people are personal
// (CLAUDE.md: journal content goes to Groq only): search_hybrid returns them, and they come through
// only for a key granted that scope (0080).
const SEARCHABLE = new Set(['task', 'inbox_item', 'project', 'calendar_event', 'area', 'book', 'note', 'quote'])
const PERSONAL_HITS: Record<string, Scope> = { journal_entry: 'journal', person: 'people' }
/** May this key see a search hit / Trash row / activity row of this type? */
export const reachable = (type: string, scopes: ReadonlySet<Scope>): boolean => SEARCHABLE.has(type) || (type in PERSONAL_HITS && scopes.has(PERSONAL_HITS[type]))

// ── the tools ─────────────────────────────────────────────────────────────────────────────────

export interface ToolDef {
  name: string
  title: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties: false }
  /** Changes the user's data: hidden from a read-only key. */
  write: boolean
  /** Deletes for good (a table with no Trash): MCP's destructiveHint. */
  destructive?: boolean
  /** A personal area: listed and callable only for a key granted it (mcp_keys.scopes, 0080). */
  scope?: Scope
  run(a: Args, ctx: ToolContext): Promise<Record<string, unknown>>
}

export const id = { type: 'string', format: 'uuid' }
export const ids = (what: string) => ({ type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1, maxItems: MAX_BULK, description: `${what} — several at once, instead of "id" (at most ${MAX_BULK}).` })
export const dateArg = (what: string) => ({ type: 'string', description: `${what}: YYYY-MM-DD, or YYYY-MM-DDTHH:mm on the user's clock.` })
const repeatSchema = (what: string) => ({ type: ['string', 'null'], description: `${what}: ${RULE_HELP}, on the user's clock. null stops it repeating.` })
const eventTimes = {
  start: dateArg('When it starts — a date alone makes it all-day'),
  end: dateArg('When it ends (all-day: its last day). Or give duration_min'),
  duration_min: { type: 'integer', minimum: 1, maximum: 1440, description: 'How long, in minutes (instead of end; timed events only).' },
  kind: { type: 'string', enum: KINDS, description: 'event (a meeting, an appointment) or time_block (time set aside for work — tasks can go into one).' },
  remind_min: { type: ['integer', 'null'], minimum: 0, maximum: 1440, description: 'Remind this many minutes before each start (0 = at the start; timed events only). null = no reminder.' },
}

/** complete_task's `subtasks`: what happens to a parent's open subtasks (the app's question, 4 C). */
export const SUBTASK_MODES = ['leave', 'complete'] as const

export async function openTask(ctx: ToolContext, taskId: string): Promise<TaskRow> {
  const t = await ctx.store.getTask(taskId)
  if (!t) return bad(`No task with id ${taskId} (it may have been deleted). Use list_tasks or search to find it.`)
  if (t.status !== 'todo') return bad(`"${t.title}" is already ${t.status}.`)
  return t
}

/** `remind_min` on an event: 0–1440 minutes before each start, never on an all-day one (the event
 * menu's Remind row, 0077). Undefined when not given. */
function remindArg(a: Args, allDay: boolean): number | null | undefined {
  if (!('remind_min' in a)) return undefined
  if (a.remind_min === null) return null
  const m = whole(a, 'remind_min', 0, 1440, 0)
  return allDay ? bad('"remind_min" is for a timed event: an all-day one has no start time to remind before.') : m
}

const PRIORITY_NAMES: Record<number, string> = { 1: 'critical', 2: 'high', 3: 'medium' }
/** `priority`: 1 critical · 2 high · 3 medium, null = none (tasks/taskMenuSpec PRIORITY_LABELS). */
function priorityArg(a: Args): number | null | undefined {
  if (!('priority' in a)) return undefined
  return a.priority === null ? null : whole(a, 'priority', 1, 3, 0)
}

/** `remind_at`: a date-time on the user's clock (a reminder needs a time), or null. */
function remindAtArg(a: Args, zone: string): string | null | undefined {
  const w = whenOrNull(a, 'remind_at', zone)
  if (w === undefined || w === null) return w
  return 'at' in w ? w.at.toISOString() : bad('"remind_at" needs a time: YYYY-MM-DDTHH:mm on the user\'s clock.')
}

/** A live area / project by id, or a readable refusal. */
export async function liveRow(ctx: ToolContext, table: 'areas' | 'projects' | 'domains', rowId: string, what: string): Promise<Row> {
  const [r] = await ctx.store.find(table, { id: rowId, deleted_at: null }, { limit: 1 })
  return r ?? bad(`No ${what} with id ${rowId}. The projects tool lists the ids.`)
}

/** Today's open picks, goal first (_shared/today.ts todaysTop3) — the order Make goal renumbers. */
async function picksToday(ctx: ToolContext): Promise<TaskRow[]> {
  const { start, end } = dayWindow(ctx.now, ctx.zone)
  return todaysTop3(await ctx.store.dayTasks(start.toISOString(), end.toISOString()), ctx.now, ctx.zone)
}

/** A star: the Top 3 is today's, so a pick dated a later day comes to today at its own time (tasks/api
 * flipTop3 → planMath todayFor); starring takes it out of Someday. */
function starred(t: TaskRow, ctx: ToolContext): TaskRow {
  const day = dayWindow(ctx.now, ctx.zone)
  const dated = t.due_at ?? t.scheduled_start
  if (!dated || Date.parse(dated) < day.end.getTime()) return { ...t, top3: true, top3_rank: t.top3 ? (t.top3_rank ?? null) : null, someday: false }
  const [h, mi] = wallTime(dated, ctx.zone).slice(11).split(':').map(Number)
  return { ...t, top3: true, top3_rank: null, someday: false, due_at: wallToInstant(day.date, h, mi, ctx.zone).toISOString() }
}

export interface NewTask {
  title: string
  notes?: string | null
  due?: When | null
  durationMin?: number | null
  project?: { id: string; name?: string | null; domain_id?: string | null } | null
  area?: { id: string; domain_id?: string | null } | null
  domainId?: string | null
  top3?: boolean
  rule?: string | null
  labels?: string[]
  priority?: number | null
  remindAt?: string | null
  someday?: boolean
  parentId?: string | null
  externalRef?: Row | null
  /** Put it on the calendar at its due time (default: when `due` has a time). */
  timed?: boolean
}

/** A new task the way the app makes one (tasks/api createTask, + capture/api blockIfTimed): a due
 * time also blocks the calendar; a Top 3 pick dated later comes to today; a repeat on an undated
 * task starts today 09:00. Logs task.created (+ starred, recurrence_set, scheduled). */
export async function createTask(ctx: ToolContext, n: NewTask): Promise<{ task: TaskRow; block: EventRow | null }> {
  const today = dayWindow(ctx.now, ctx.zone)
  if (n.top3 && (await ctx.store.top3Count(today.end.toISOString())) >= MAX_TOP3) {
    return bad('Top 3 is full (3 open picks). Add it without top3, or ask the user which pick to swap out.')
  }
  let dueAt = n.due ? instantOf(n.due, ctx.zone) : null
  // The Top 3 is today's (top3Rule): a pick dated a later day comes to today at its own time, as
  // starring does in the app (tasks/api flipTop3 → planMath todayFor).
  if (n.top3 && dueAt && dueAt >= today.end) {
    const [h, mi] = wallTime(dueAt.toISOString(), ctx.zone).slice(11).split(':').map(Number)
    dueAt = wallToInstant(today.date, h, mi, ctx.zone)
  }
  // A repeat rolls from the due date: an undated one starts today, first thing (tasks/api setRecurrence).
  if (n.rule && !dueAt) dueAt = wallToInstant(today.date, 9, 0, ctx.zone)
  if (n.rule) checkTaskRule(ctx, n.rule, dueAt!.toISOString())
  const now = ctx.now.toISOString()
  const taskId = crypto.randomUUID()
  // A typed time puts the capture on the calendar (command-bar quickAdd → capture/api blockIfTimed).
  const block: EventRow | null =
    n.due && (n.timed ?? 'at' in n.due) && dueAt
      ? { id: crypto.randomUUID(), title: n.title, starts_at: dueAt.toISOString(), ends_at: new Date(dueAt.getTime() + (n.durationMin || BLOCK_MIN) * 60_000).toISOString(), all_day: false, task_id: taskId, type: 'task' }
      : null
  const task: TaskRow = {
    id: taskId,
    title: n.title,
    notes: n.notes ?? null,
    status: 'todo',
    due_at: dueAt ? dueAt.toISOString() : null,
    scheduled_start: block?.starts_at ?? null,
    scheduled_end: block?.ends_at ?? null,
    top3: !!n.top3,
    someday: !!n.someday && !n.top3,
    paused: false,
    labels: n.labels ?? [],
    priority: n.priority ?? null,
    duration_min: n.durationMin ?? null,
    project_id: (n.project?.id as string | undefined) ?? null,
    area_id: (n.area?.id as string | undefined) ?? null,
    // A task filed in a project or an area carries its domain (tasks/move.ts placeTask).
    domain_id: (n.project?.domain_id as string | null | undefined) ?? (n.area?.domain_id as string | null | undefined) ?? n.domainId ?? null,
    milestone_id: null,
    parent_task_id: n.parentId ?? null,
    recurrence_rule: n.rule ?? null,
    reminder_at: n.remindAt ?? null,
    reminder_sent: false,
    snoozed_until: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
    external_ref: n.externalRef ?? null,
  }
  await ctx.store.insertTask(task)
  await logIt(ctx, 'task.created', 'task', task.id, { title: n.title })
  // Today's Top 3 history (today/top3Today.ts) is read from these events.
  if (task.top3) await logIt(ctx, 'task.starred', 'task', task.id)
  if (n.rule) await logIt(ctx, 'task.recurrence_set', 'task', task.id, { rule: n.rule })
  if (task.reminder_at) await logIt(ctx, 'task.reminder_set', 'task', task.id, { reminder_at: task.reminder_at })
  if (block) {
    await ctx.store.insertEvent(block)
    await logIt(ctx, 'task.scheduled', 'task', task.id, { calendar_event_id: block.id })
  }
  return { task: { ...task, project_name: (n.project?.name as string | undefined) ?? null }, block }
}

/** A parent's live subtasks (tasks.parent_task_id, 0029), oldest first — the app's subtasksOf. */
export async function subtasksOf(ctx: ToolContext, parentId: string): Promise<TaskRow[]> {
  const rows = (await ctx.store.find('tasks', { parent_task_id: parentId, deleted_at: null })) as unknown as TaskRow[]
  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

/** Ticks an open task off (tasks/api completeTask → completion.ts planCompletion): a repeat's next
 * occurrence comes along — never a paused series', never a second open copy — and, like the app
 * (Kai 2026-10-16), a repeat's subtasks go with it to that copy, open again (`carried`). */
export async function completeTask(ctx: ToolContext, t: TaskRow): Promise<{ done: TaskRow; next: TaskRow | null; carried: number }> {
  const now = ctx.now.toISOString()
  // Plan the next occurrence before writing anything: a rule rrule can't read must not leave
  // the task done with its series silently ended.
  let next: TaskRow | null = null
  // A paused series (Perennials ‖) doesn't come back until it's resumed (completion.ts).
  // "Ends after N times": the copy carries one fewer, and the last one (COUNT=1) spawns nothing.
  const nextRule = t.recurrence_rule ? ruleAfterThis(t.recurrence_rule) : null
  if (t.recurrence_rule && nextRule && t.due_at && !t.paused) {
    // Rolls from max(due, today) like the app (_shared/repeat.ts), not from the old due date.
    const at = ctx.nextOccurrence(stepOf(t.recurrence_rule), new Date(t.due_at), ctx.zone, rollAfter(t.due_at, ctx.now, ctx.zone))
    if (at && !(await ctx.store.openOccurrence(t.title, nextRule, at.toISOString(), t.id))) {
      next = {
        ...t,
        id: crypto.randomUUID(),
        recurrence_rule: nextRule,
        status: 'todo',
        completed_at: null,
        due_at: at.toISOString(),
        reminder_at: nextReminderAt(t.reminder_at, t.due_at, at),
        reminder_sent: false,
        scheduled_start: null,
        scheduled_end: null,
        top3: false,
        top3_rank: null,
        slot_id: null,
        slot_date: null,
        sort_order: null,
        external_ref: null,
        created_at: now,
        updated_at: now,
      }
    }
  }
  if (!(await ctx.store.markDone(t.id, now))) return bad(`"${t.title}" isn't open any more.`)
  await logIt(ctx, 'task.completed', 'task', t.id)
  let carried = 0
  if (next) {
    await ctx.store.insertTask(next)
    await logIt(ctx, 'task.created', 'task', next.id, { recurrence_parent: t.id })
    for (const s of await subtasksOf(ctx, t.id)) {
      await ctx.store.patch('tasks', { id: s.id }, { parent_task_id: next.id, ...(s.status === 'done' ? { status: 'todo', completed_at: null } : {}) })
      if (s.status === 'done') await logIt(ctx, 'task.reopened', 'task', s.id)
      carried++
    }
  }
  return { done: { ...t, status: 'done', completed_at: now, top3: false }, next, carried }
}

/** A done task back to open (tasks/api reopenTask, after the session that completed it). */
export async function reopenTask(ctx: ToolContext, taskId: string): Promise<TaskRow> {
  const t = await ctx.store.getTask(taskId)
  if (!t) return bad(`No task with id ${taskId} (it may be in Trash). Use list_tasks with status done to find it.`)
  if (t.status === 'todo') return bad(`"${t.title}" is already open.`)
  const [row] = await ctx.store.patch('tasks', { id: t.id, deleted_at: null }, { status: 'todo', completed_at: null })
  if (!row) return bad(`"${t.title}" couldn't be reopened.`)
  await logIt(ctx, 'task.reopened', 'task', t.id)
  return { ...t, status: 'todo', completed_at: null }
}

/** Loop B's traces (rituals/loopDay.ts): was each ritual walked to its end on this loop day (04:00
 * rollover), and which tasks last night seeded for this morning. */
export async function ritualTrace(ctx: ToolContext): Promise<{ day: string; plan: boolean; shutdown: boolean; rows: ActivityRow[] }> {
  const day = loopDay(ctx.now, ctx.zone)
  const rows = await ctx.store.activity({ types: ['ritual.finished', 'ritual.seeded', 'ritual.unseeded'], since: new Date(ctx.now.getTime() - 3 * DAY_MS).toISOString(), limit: 500, asc: true })
  const finished = (ritual: string) => rows.some((r) => r.event_type === 'ritual.finished' && r.payload?.ritual === ritual && r.payload?.date === day)
  return { day, plan: finished('morning'), shutdown: finished('evening'), rows }
}

/** Task ids seeded for `forDate`, in the order they were last seeded; the last seed/unseed wins
 * (rituals/loopDay.ts seededTaskIds). `rows` oldest first. */
export function seededTaskIds(rows: readonly ActivityRow[], forDate: string): string[] {
  const seeded = new Set<string>()
  for (const r of rows) {
    if ((r.event_type !== 'ritual.seeded' && r.event_type !== 'ritual.unseeded') || r.payload?.for_date !== forDate) continue
    seeded.delete(r.entity_id) // a re-seed moves to the back
    if (r.event_type === 'ritual.seeded') seeded.add(r.entity_id)
  }
  return [...seeded]
}

/** A row's place in a list (tasks/manualOrder.ts orderKey): its manual order, else its date, else last. */
const UNDATED = 8.64e15
const ORDER_STEP = 60_000
export function orderKey(t: Pick<TaskRow, 'sort_order' | 'due_at' | 'scheduled_start'>): number {
  if (t.sort_order != null && Number.isFinite(t.sort_order)) return t.sort_order
  const iso = t.due_at ?? t.scheduled_start
  const ms = iso ? Date.parse(iso) : NaN
  return Number.isFinite(ms) ? ms : UNDATED
}

/** A key just before (or after) `anchor` among `others` — between it and its nearest neighbour on that
 * side, on the dates' scale (manualOrder.ts planListMove's midpoint, without the list: a key between
 * two rows is between them in every list that holds both). */
export function keyBeside(anchor: number, others: readonly number[], side: 'before' | 'after'): number {
  const near = side === 'before' ? Math.max(-Infinity, ...others.filter((k) => k < anchor)) : Math.min(Infinity, ...others.filter((k) => k > anchor))
  return Number.isFinite(near) ? (anchor + near) / 2 : anchor + (side === 'before' ? -ORDER_STEP : ORDER_STEP)
}

const sameInstant = (x: string | null | undefined, y: string | null | undefined) => (x ? Date.parse(x) : null) === (y ? Date.parse(y) : null)

const EDIT_FIELDS = [
  'title', 'notes', 'duration_min', 'project_id', 'area_id', 'domain_id', 'repeat', 'labels', 'priority', 'remind_at', 'someday', 'paused',
  'top3', 'goal', 'slot_id', 'place_before', 'place_after',
] as const
/** Edits that make sense on one task only. */
const ONE_TASK_FIELDS = ['goal', 'slot_id', 'slot_occurrence', 'place_before', 'place_after']

type Place = { id: string; name?: string | null; domain_id?: string | null }

/** edit_task for one task: every argument read, then the row settled and written once. */
async function editOne(a: Args, ctx: ToolContext, taskId: string): Promise<Row> {
  const t = await openTask(ctx, taskId)
  const z = ctx.zone
  // Every argument is read before anything is written.
  const title = 'title' in a ? text(a, 'title', 500, true)! : t.title
  const notes = 'notes' in a ? (text(a, 'notes', 10000) ?? null) : t.notes
  const durationMin = 'duration_min' in a ? minutes(a, 'duration_min') : t.duration_min
  const labels = words(a, 'labels')
  const priority = priorityArg(a)
  const rule = repeatArg(a, 'repeat')
  const remindAt = remindAtArg(a, z)
  const someday = flag(a, 'someday')
  const paused = flag(a, 'paused')
  const top3 = flag(a, 'top3')
  const goal = a.goal === true
  if (someday && (top3 || goal)) return bad('A Someday task isn\'t a Top 3 pick: give "someday" or "top3"/"goal", not both.')
  // "Move to…" (tasks/move.ts placeTask): a project, its domain with it, out of any area; an area, its
  // domain, out of any project; a domain alone. A milestone stays only in its own project. null = out of all.
  let place: { project_id: string | null; area_id: string | null; domain_id: string | null; milestone_id: string | null; said: string; name: string | null } | undefined
  const none = (what: string) => ({ project_id: null, area_id: null, domain_id: null, milestone_id: null, said: `out of its ${what}`, name: null })
  if ('project_id' in a) {
    const pid = uuid(a, 'project_id') ?? null
    const p = pid ? ((await ctx.store.projects()).find((x) => x.id === pid) ?? bad(`No project with id ${pid}. Call the projects tool for the ids.`)) : null
    place = p ? { project_id: p.id, area_id: null, domain_id: p.domain_id, milestone_id: p.id === t.project_id ? t.milestone_id : null, said: `project → ${p.name}`, name: p.name } : none('project')
  } else if ('area_id' in a) {
    const aid = uuid(a, 'area_id') ?? null
    const ar = aid ? ((await liveRow(ctx, 'areas', aid, 'area')) as unknown as Place) : null
    place = ar ? { project_id: null, area_id: ar.id, domain_id: ar.domain_id ?? null, milestone_id: null, said: `area → ${ar.name}`, name: null } : none('area')
  } else if ('domain_id' in a) {
    const did = uuid(a, 'domain_id') ?? null
    const d = did ? ((await liveRow(ctx, 'domains', did, 'domain')) as unknown as Place) : null
    place = d ? { project_id: null, area_id: null, domain_id: d.id, milestone_id: null, said: `domain → ${d.name}`, name: null } : none('domain')
  }
  // Into a Time slot (calendar/api putInSlot), or out of it.
  let slot: { rowId: string; occ: EventRow; title: string } | null | undefined
  if ('slot_id' in a) {
    const sid = uuid(a, 'slot_id') ?? null
    if (sid) {
      const row = await ctx.store.getEvent(sid)
      if (!row || row.type !== 'time_block' || row.all_day) return bad(`No Time block with id ${sid}: a task goes into a timed Time block (kind time_block) the calendar tool lists.`)
      const w = when(a, 'slot_occurrence', z)
      if (row.recurrence_rule && !w) return bad(`"${row.title}" repeats: give "slot_occurrence", the start of the one you mean as the calendar tool lists it.`)
      slot = { rowId: row.id, occ: row.recurrence_rule ? occurrenceOf(row, w!, ctx) : row, title: row.title }
    } else slot = null
  } else if ('slot_occurrence' in a) return bad('"slot_occurrence" goes with "slot_id".')
  // Manual order (0076): just before / after another task.
  let sortOrder: { key: number; said: string } | undefined
  const anchorId = uuid(a, 'place_before') ?? uuid(a, 'place_after')
  if (anchorId) {
    if (anchorId === t.id) return bad('A task can\'t be placed beside itself.')
    const anchor = (await ctx.store.getTask(anchorId)) ?? bad(`No task with id ${anchorId}.`)
    const open = await ctx.store.listTasks({ status: 'open', projectId: null, label: null, dueFrom: null, dueTo: null, limit: 5000 })
    const side = 'place_before' in a ? 'before' : 'after'
    sortOrder = { key: keyBeside(orderKey(anchor), open.filter((r) => r.id !== t.id && r.id !== anchor.id).map(orderKey), side), said: `placed ${side} "${anchor.title}"` }
  }
  // Goal of the day (tasks/api makeGoalWithUndo): it leads today's Top 3 — joining it if it isn't in
  // yet, never into a full one (the app asks before a swap; here the assistant asks the user).
  const picks = goal || top3 ? await picksToday(ctx) : []
  const isPick = picks.some((p) => p.id === t.id)
  const others = picks.filter((p) => p.id !== t.id)
  if ((goal || top3) && !isPick && others.length >= MAX_TOP3) {
    return bad(`Top 3 is full (${others.map((p) => `"${p.title}"`).join(', ')}). Ask the user which one to take out (edit_task with top3: false), then try again.`)
  }

  let next: TaskRow = { ...t, title, notes, duration_min: durationMin }
  const changed: string[] = []
  const logs: [string, Row][] = []
  const edit = (said: string, type: string, payload: Row = {}) => {
    changed.push(said)
    logs.push([type, payload])
  }
  if (title !== t.title) edit(`title → "${title}"`, 'task.updated', { field: 'title' })
  if (notes !== t.notes) edit(notes ? 'notes' : 'notes cleared', 'task.updated', { field: 'notes' })
  if (durationMin !== t.duration_min) edit(durationMin ? `duration → ${durationMin} min` : 'duration cleared', 'task.updated', { field: 'duration' })
  if (labels !== undefined && labels.join('\n') !== (t.labels ?? []).join('\n')) {
    next.labels = labels
    edit(labels.length ? `labels → ${labels.join(', ')}` : 'labels cleared', 'task.updated', { field: 'labels' })
  }
  if (priority !== undefined && priority !== (t.priority ?? null)) {
    next.priority = priority
    edit(priority ? `priority → ${PRIORITY_NAMES[priority]}` : 'priority cleared', 'task.updated', { field: 'priority' })
  }
  if (place && (place.project_id !== t.project_id || place.area_id !== (t.area_id ?? null) || place.domain_id !== t.domain_id)) {
    const { said, name, ...fields } = place
    next = { ...next, ...fields, project_name: name }
    edit(said, 'task.moved', { project_id: fields.project_id, area_id: fields.area_id, domain_id: fields.domain_id })
  }
  if (rule !== undefined && rule !== t.recurrence_rule) {
    next.recurrence_rule = rule
    edit(rule ? `repeats ${rule}` : 'no longer repeats', 'task.recurrence_set', { rule })
    // A repeat needs a date to roll from (tasks/api setRecurrence): an undated one starts today.
    if (rule && !t.due_at) {
      next.due_at = wallToInstant(dateKey(ctx.now, z), 9, 0, z).toISOString()
      next.someday = false
      edit(`due ${wallTime(next.due_at, z)} (a repeat starts today)`, 'task.rescheduled', { due_at: next.due_at })
    }
    if (rule) checkTaskRule(ctx, rule, next.due_at!)
  }
  if (remindAt !== undefined && !sameInstant(remindAt, t.reminder_at)) {
    next.reminder_at = remindAt
    next.reminder_sent = false
    edit(remindAt ? `reminder → ${wallTime(remindAt, z)}` : 'reminder off', 'task.reminder_set', { reminder_at: remindAt })
  }
  if (someday !== undefined && someday !== t.someday) {
    next.someday = someday
    edit(someday ? 'parked for Someday' : 'out of Someday', 'task.someday_set', { someday })
  }
  if (paused !== undefined && paused !== t.paused) {
    next.paused = paused
    edit(paused ? 'paused' : 'resumed', paused ? 'task.paused' : 'task.resumed')
  }
  const ranks: { row: TaskRow; rank: number }[] = []
  if (goal || (top3 && !isPick)) {
    if (!isPick) {
      const s = starred(next, ctx)
      if (!sameInstant(s.due_at, next.due_at)) changed.push(`due ${wallTime(s.due_at!, z)} (the Top 3 is today's)`)
      next = s
      edit("in today's Top 3", 'task.starred')
    }
    if (goal) {
      // The goal leads; the other picks keep their order behind it (top3Order rankWrites).
      next.top3_rank = 1
      others.forEach((p, i) => p.top3_rank !== i + 2 && ranks.push({ row: p, rank: i + 2 }))
      if (picks[0]?.id !== t.id || t.top3_rank !== 1) edit('the goal of the day', 'task.goal_set')
    }
  } else if (top3 === false && t.top3) {
    next.top3 = false
    next.top3_rank = null
    edit("out of today's Top 3", 'task.unstarred')
  }
  let blocksOff: EventRow[] = []
  if (slot === null && t.slot_id) {
    next = { ...next, ...OUT_OF_SLOT }
    edit('out of its Time slot (unscheduled)', 'task.unscheduled', { slot_id: t.slot_id })
  } else if (slot) {
    const fields = intoSlot(slot.rowId, slot.occ, z)
    if (fields.slot_id !== t.slot_id || fields.slot_date !== t.slot_date || !sameInstant(fields.scheduled_start, t.scheduled_start)) {
      // In a slot it has no block of its own: one it had comes off (calendar/api putInSlot).
      blocksOff = await ctx.store.taskBlocks(t.id)
      next = { ...next, ...fields, ...(dueFollows(t.due_at, fields.scheduled_start, ctx.now, z) ? { due_at: fields.scheduled_start } : null) }
      edit(`in ${slot.title} · ${spanText(slot.occ, z)}`, 'task.scheduled', { slot_id: fields.slot_id, slot_date: fields.slot_date })
    }
  }
  if (sortOrder) {
    // An order isn't a domain event (0076): nothing logged, as in the app.
    next.sort_order = sortOrder.key
    changed.push(sortOrder.said)
  }
  const task = settle(t, next, ctx.now, z)
  if (t.top3 && !task.top3 && top3 !== false) changed.push("left today's Top 3")
  if (remindAt === undefined && task.reminder_at && !sameInstant(task.reminder_at, t.reminder_at)) changed.push(`reminder → ${wallTime(task.reminder_at, z)}`)
  if (changed.length) {
    await ctx.store.updateTask(task)
    for (const [type, payload] of logs) await logIt(ctx, type, 'task', t.id, payload)
    for (const { row, rank } of ranks) await ctx.store.patch('tasks', { id: row.id }, { top3_rank: rank })
    const gone = blocksOff.length ? await ctx.store.deleteEvents(blocksOff.map((b) => b.id)) : []
    for (const blockId of gone) await logIt(ctx, 'calendar_event.deleted', 'calendar_event', blockId)
  }
  return { edited: taskOut(task, z, true), changed, timezone: z }
}

export const TOOLS: readonly ToolDef[] = [
  {
    name: 'today',
    title: 'Today',
    description:
      "The user's day on their own clock: their Top 3 picks (the goal of the day first), open tasks due or scheduled today, overdue tasks, today's calendar events, and whether Plan my day / Shut down were done today (with last night's seeds for this morning). Start here for \"what's on today?\" or \"what should I do next?\". All times are wall-clock in `timezone`.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    write: false,
    async run(_a, ctx) {
      const { date, start, end } = dayWindow(ctx.now, ctx.zone)
      const rows = await ctx.store.dayTasks(start.toISOString(), end.toISOString())
      const events = await eventsIn(ctx, start, end)
      const { top3, today, overdue } = splitToday(rows, ctx.now, ctx.zone)
      const trace = await ritualTrace(ctx)
      const seeds = seededTaskIds(trace.rows, trace.day)
      return {
        date,
        now: wallTime(ctx.now.toISOString(), ctx.zone),
        timezone: ctx.zone,
        top3: top3.map((t) => taskOut(t, ctx.zone)),
        today: today.map((t) => taskOut(t, ctx.zone)),
        overdue: overdue.slice(0, OVERDUE_SHOWN).map((t) => taskOut(t, ctx.zone)),
        ...(overdue.length > OVERDUE_SHOWN ? { overdue_not_shown: overdue.length - OVERDUE_SHOWN } : {}),
        events: await eventsOut(ctx, events),
        rituals: { plan_my_day_done: trace.plan, shut_down_done: trace.shutdown, ...(seeds.length ? { seeded_for_today: seeds } : {}) },
      }
    },
  },
  {
    name: 'search',
    title: 'Search',
    description:
      "Search the user's tasks, inbox notes, projects, areas, calendar events and Library (books, notes, quotes) by meaning and keywords — and their journal or people only if this key was allowed them. Returns the best matches with their ids (use get_task for a task's details).",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for, in plain words.' },
        limit: { type: 'integer', minimum: 1, maximum: 25, description: 'How many results (default 10).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    write: false,
    async run(a, ctx) {
      const query = text(a, 'query', 200, true)!
      const limit = whole(a, 'limit', 1, 25, 10)
      const hits = await ctx.store.search(query, Math.min(50, limit * 2))
      return {
        results: hits
          .filter((h) => reachable(h.entity_type, ctx.scopes))
          .slice(0, limit)
          .map((h) => ({ type: h.entity_type, id: h.entity_id, title: h.title, ...(h.snippet ? { snippet: h.snippet } : {}) })),
      }
    },
  },
  {
    name: 'list_tasks',
    title: 'List tasks',
    description:
      'List tasks with optional filters: status (open by default), a project or area (ids from the projects tool), a label, Someday, and a due-date range. Open tasks come soonest-due first; done tasks most recently finished first.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'done', 'all'], description: 'open (default), done, or all.' },
        project_id: { ...id, description: 'Only tasks in this project.' },
        area_id: { ...id, description: 'Only tasks in this area.' },
        label: { type: 'string', description: 'Only tasks carrying this label.' },
        someday: { type: 'boolean', description: 'true: only Someday tasks; false: none of them.' },
        due_from: dateArg('Due on or after'),
        due_to: dateArg('Due on or before (a date includes that whole day)'),
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'At most this many (default 50).' },
      },
      additionalProperties: false,
    },
    write: false,
    async run(a, ctx) {
      const from = when(a, 'due_from', ctx.zone)
      const to = when(a, 'due_to', ctx.zone)
      const rows = await ctx.store.listTasks({
        status: choice(a, 'status', ['open', 'done', 'all'] as const, 'open'),
        projectId: uuid(a, 'project_id') ?? null,
        areaId: uuid(a, 'area_id') ?? null,
        label: text(a, 'label', 100) ?? null,
        someday: flag(a, 'someday') ?? null,
        dueFrom: from ? bound(from, 'from', ctx.zone).toISOString() : null,
        dueTo: to ? bound(to, 'to', ctx.zone).toISOString() : null,
        limit: whole(a, 'limit', 1, 100, 50),
      })
      return { count: rows.length, timezone: ctx.zone, tasks: rows.map((t) => taskOut(t, ctx.zone)) }
    },
  },
  {
    name: 'get_task',
    title: 'Get task',
    description: "One task's full details: notes, due date, calendar block or Time slot, project / area / domain, labels, priority, repeat rule, reminder, link.",
    inputSchema: { type: 'object', properties: { id: { ...id, description: 'The task id.' } }, required: ['id'], additionalProperties: false },
    write: false,
    async run(a, ctx) {
      const taskId = uuid(a, 'id', true)!
      const t = await ctx.store.getTask(taskId)
      if (!t) return bad(`No task with id ${taskId} (it may have been deleted).`)
      return { timezone: ctx.zone, task: taskOut(t, ctx.zone, true) }
    },
  },
  {
    name: 'add_task',
    title: 'Add task',
    description:
      "Add a task to the user's task list. Only when the user asks for it. `due`: a date (YYYY-MM-DD, which means 09:00 that day) or a local date-time (YYYY-MM-DDTHH:mm) on the user's clock — a date-time also blocks that time on the calendar, as long as `duration_min` (30 minutes by default), as typing a time in the app does. A task lives in one place: a project (`project_id`) or an area (`area_id`). `top3: true` makes it one of today's Top 3 (at most 3 open picks); the Top 3 is today's, so a later due date comes to today, keeping its time. `repeat` makes it repeat (an undated one then starts today 09:00). `someday: true` parks it undated. `parent_id` makes it a subtask (one level deep). Unsure where something belongs? Use add_to_inbox instead.",
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'What to do, short.' },
        due: dateArg('When it is due'),
        duration_min: { type: 'integer', minimum: 1, maximum: 1440, description: 'How long it takes, in minutes — a timed task blocks this much of the calendar.' },
        project_id: { ...id, description: 'File it in this project (ids from the projects tool).' },
        area_id: { ...id, description: 'File it in this area instead (ids from the projects tool).' },
        top3: { type: 'boolean', description: "Star it into today's Top 3." },
        notes: { type: 'string', description: 'Longer details.' },
        repeat: { type: 'string', description: `How it repeats: ${RULE_HELP}, on the user's clock.` },
        labels: { type: 'array', items: { type: 'string' }, description: 'Labels (free words; the labels tool lists the ones in use).' },
        priority: { type: 'integer', minimum: 1, maximum: 3, description: '1 critical · 2 high · 3 medium.' },
        remind_at: { type: 'string', description: "A reminder: YYYY-MM-DDTHH:mm on the user's clock." },
        someday: { type: 'boolean', description: 'Park it for Someday (no date).' },
        parent_id: { ...id, description: 'Make it a subtask of this task (one level deep).' },
      },
      required: ['title'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const title = text(a, 'title', 500, true)!
      const due = when(a, 'due', ctx.zone)
      const durationMin = minutes(a, 'duration_min')
      const projectId = uuid(a, 'project_id')
      const areaId = uuid(a, 'area_id')
      if (projectId && areaId) return bad('A task lives in a project or an area, not both: give one.')
      const top3 = flag(a, 'top3') ?? false
      const someday = flag(a, 'someday') ?? false
      const notes = text(a, 'notes', 10000) ?? null
      const rule = repeatArg(a, 'repeat') ?? null
      if (someday && (due || top3 || rule)) return bad('A Someday task has no date, no repeat and isn\'t a Top 3 pick: leave out "due", "repeat" and "top3", or "someday".')
      const labels = words(a, 'labels') ?? []
      const priority = priorityArg(a) ?? null
      const remindAt = remindAtArg(a, ctx.zone) ?? null
      const parentId = uuid(a, 'parent_id')
      let project: Place | null = null
      if (projectId) {
        project = (await ctx.store.projects()).find((p) => p.id === projectId) ?? null
        if (!project) return bad(`No project with id ${projectId}. Call the projects tool for the ids.`)
      }
      const area = areaId ? ((await liveRow(ctx, 'areas', areaId, 'area')) as unknown as Place) : null
      if (parentId) {
        const parent = (await ctx.store.getTask(parentId)) ?? bad(`No task with id ${parentId} to put it under.`)
        if (parent.parent_task_id) return bad(`Subtasks go one level deep: "${parent.title}" is itself a subtask.`)
      }
      const { task, block } = await createTask(ctx, { title, notes, due: due ?? null, durationMin, project, area, top3, rule, labels, priority, remindAt, someday, parentId: parentId ?? null })
      return {
        added: taskOut(task, ctx.zone),
        ...(block ? { calendar_block: spanText(block, ctx.zone) } : {}),
        timezone: ctx.zone,
      }
    },
  },
  {
    name: 'edit_task',
    title: 'Edit task',
    description:
      "Change open tasks — only when the user asks, and give only what changes; `ids` applies the same change to several (the app's bulk bar). Fields: title, notes, duration_min, labels (the whole list), priority, repeat, remind_at, someday, paused (a repeating task rests until resumed), top3 (today's Top 3, at most 3), goal (true: the goal of the day, first in the Top 3), where it lives (one of project_id, area_id, domain_id — null takes it out), a Time slot (slot_id of a Time block, + slot_occurrence for a repeating one; null takes it out), and its place in a list (place_before / place_after another task). null clears notes, duration_min, labels, priority, repeat and remind_at. To move it to another day or time, use reschedule_task.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { ...id, description: 'The task id.' },
        ids: ids('The task ids'),
        title: { type: 'string', description: 'The new title.' },
        notes: { type: ['string', 'null'], description: 'The new notes (they replace the old ones).' },
        duration_min: { type: ['integer', 'null'], minimum: 1, maximum: 1440, description: 'How long it takes, in minutes.' },
        project_id: { type: ['string', 'null'], format: 'uuid', description: 'Move it into this project (ids from the projects tool); null = out of it.' },
        area_id: { type: ['string', 'null'], format: 'uuid', description: 'Move it into this area; null = out of it.' },
        domain_id: { type: ['string', 'null'], format: 'uuid', description: 'File it under this domain alone (no project, no area); null = out of it.' },
        repeat: repeatSchema('How it repeats'),
        labels: { type: ['array', 'null'], items: { type: 'string' }, description: 'Its labels — the whole list (they replace the old ones).' },
        priority: { type: ['integer', 'null'], minimum: 1, maximum: 3, description: '1 critical · 2 high · 3 medium; null = none.' },
        remind_at: { type: ['string', 'null'], description: "A reminder at YYYY-MM-DDTHH:mm on the user's clock; null = none." },
        someday: { type: 'boolean', description: 'true parks it for Someday; false brings it back.' },
        paused: { type: 'boolean', description: 'Pause (true) or resume (false) a repeating task.' },
        top3: { type: 'boolean', description: "true stars it into today's Top 3; false takes it out." },
        goal: { type: 'boolean', enum: [true], description: 'Make it the goal of the day (it joins the Top 3 if it isn\'t in it).' },
        slot_id: { type: ['string', 'null'], format: 'uuid', description: 'Put it into this Time block (its calendar id); null = out of its slot.' },
        slot_occurrence: dateArg('For a repeating Time block: the start of the occurrence, as the calendar tool lists it'),
        place_before: { ...id, description: 'Put it just before this task in its lists.' },
        place_after: { ...id, description: 'Put it just after this task in its lists.' },
      },
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      if (!EDIT_FIELDS.some((k) => k in a)) return bad(`Nothing to change: give at least one of ${EDIT_FIELDS.join(', ')}.`)
      if (['project_id', 'area_id', 'domain_id'].filter((k) => k in a).length > 1) return bad('Give one of project_id, area_id or domain_id: a task lives in one place.')
      if ('place_before' in a && 'place_after' in a) return bad('Give "place_before" or "place_after", not both.')
      if ('goal' in a && a.goal !== true) return bad('"goal" can only be true. To stop a task being the goal, make another one the goal, or take it out of the Top 3 (top3: false).')
      if (a.goal === true && a.top3 === false) return bad('The goal of the day is in the Top 3: leave out "top3: false".')
      if (a.ids !== undefined && ONE_TASK_FIELDS.some((k) => k in a)) return bad(`${ONE_TASK_FIELDS.join(', ')} take one task at a time: give "id".`)
      return eachId(a, (taskId) => editOne(a, ctx, taskId))
    },
  },
  {
    name: 'reschedule_task',
    title: 'Reschedule task',
    description:
      "Move open tasks to another day or time (only when the user asks); `ids` moves several. `when`: a date-time (YYYY-MM-DDTHH:mm, the user's clock) puts it on the calendar at that time — its calendar block moves there, keeping its length, else a new block as long as its duration_min (30 minutes by default). A date alone (YYYY-MM-DD) means 09:00 that day in that day's list, with no time on the calendar: a block already on that day stays, one on another day comes off. null takes the date off (and every block). As in the app, a date clears Someday, a task leaves its Time slot, a reminder keeps its lead, and a Top 3 pick moved to a later day gives its place up.",
    inputSchema: {
      type: 'object',
      properties: { id: { ...id, description: 'The task id.' }, ids: ids('The task ids'), when: { type: ['string', 'null'], description: "The new day, or day and time: YYYY-MM-DD, or YYYY-MM-DDTHH:mm on the user's clock. null = no date." } },
      required: ['when'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const w = whenOrNull(a, 'when', ctx.zone)
      if (w === undefined) return bad('"when" is required.')
      return eachId(a, async (taskId) => {
        const t = await openTask(ctx, taskId)
        const due = w ? instantOf(w, ctx.zone).toISOString() : null
        const { task, placed, removed } = await replanTask(ctx, t, due, !!w && 'at' in w)
        const changed = [due ? `due ${wallTime(due, ctx.zone)}` : 'date taken off']
        if (placed) changed.push(`on the calendar ${spanText(placed, ctx.zone)}`)
        if (removed) changed.push(`${removed} calendar block${removed === 1 ? '' : 's'} taken off the calendar (in Trash)`)
        if (t.slot_id) changed.push('out of its Time slot')
        if (t.someday && !task.someday) changed.push('out of Someday')
        if (t.top3 && !task.top3) changed.push("left today's Top 3")
        if (task.reminder_at && task.reminder_at !== t.reminder_at) changed.push(`reminder → ${wallTime(task.reminder_at, ctx.zone)}`)
        return { rescheduled: taskOut(task, ctx.zone), changed, timezone: ctx.zone }
      })
    },
  },
  {
    name: 'complete_task',
    title: 'Complete task',
    description:
      "Mark open tasks done (only when the user says they're done); `ids` ticks off several. A repeating task's next occurrence is created, as in the app — unless the series is paused — and its subtasks go with it, open again. A task with subtasks still open: `subtasks` says what happens to them — 'leave' (the default) leaves them open, 'complete' ticks them too (the app asks the user this; ask them if it isn't clear). The answer says what happened to them.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { ...id, description: 'The task id.' },
        ids: ids('The task ids'),
        subtasks: { type: 'string', enum: [...SUBTASK_MODES], description: "Its open subtasks: 'leave' them open (the default) or 'complete' them too." },
      },
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const mode = choice(a, 'subtasks', SUBTASK_MODES, 'leave')
      return eachId(a, async (taskId) => {
        const { done, next, carried } = await completeTask(ctx, await openTask(ctx, taskId))
        // 4 C (Kai 2026-10-16): a parent with subtasks still open — ticked too, or left open (the safe default).
        const open = next ? [] : (await subtasksOf(ctx, taskId)).filter((s) => s.status === 'todo')
        for (const s of mode === 'complete' ? open : []) await completeTask(ctx, s)
        const n = (k: number) => `${k} subtask${k === 1 ? '' : 's'}`
        const subtasks = carried
          ? `its ${n(carried)} went with it to the next occurrence, open again`
          : !open.length ? null
          : mode === 'complete' ? `ticked its ${n(open.length)} still open too: ${open.map((s) => s.title).join('; ')}`
          : `left its ${n(open.length)} open: ${open.map((s) => s.title).join('; ')} (subtasks: 'complete' ticks them)`
        return { done: taskOut(done, ctx.zone), ...(next ? { next: taskOut(next, ctx.zone) } : {}), ...(subtasks ? { subtasks } : {}), timezone: ctx.zone }
      })
    },
  },
  {
    name: 'reopen_task',
    title: 'Reopen task',
    description: 'Open done tasks again (the app\'s Reopen); `ids` reopens several. A repeat\'s next occurrence made when it was ticked off stays.',
    inputSchema: { type: 'object', properties: { id: { ...id, description: 'The task id.' }, ids: ids('The task ids') }, additionalProperties: false },
    write: true,
    async run(a, ctx) {
      return eachId(a, async (taskId) => ({ reopened: taskOut(await reopenTask(ctx, taskId), ctx.zone), timezone: ctx.zone }))
    },
  },
  {
    name: 'move_to_tomorrow',
    title: 'Move to tomorrow',
    description:
      "Move open tasks' due date to tomorrow 09:00 on the user's clock — the app's \"Tomorrow\"; `ids` moves several. As in the app, its reminder keeps its lead time, a calendar block on another day comes off the calendar, and a Top 3 pick gives its place up.",
    inputSchema: { type: 'object', properties: { id: { ...id, description: 'The task id.' }, ids: ids('The task ids') }, additionalProperties: false },
    write: true,
    async run(a, ctx) {
      return eachId(a, async (taskId) => {
        const t = await openTask(ctx, taskId)
        const { task, removed } = await replanTask(ctx, t, tomorrowAt9(ctx.now, ctx.zone), false)
        return { moved: taskOut(task, ctx.zone), ...(removed ? { calendar_blocks_removed: removed } : {}), timezone: ctx.zone }
      })
    },
  },
  {
    name: 'add_to_inbox',
    title: 'Add to inbox',
    description:
      "Drop a note, link or half-formed idea into the user's Inbox to sort later — like a quick capture in the app. Use it when something isn't clearly a task. Only when the user asks.",
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The note.' },
        url: { type: 'string', description: 'A link that goes with it (http/https).' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const note = text(a, 'text', 4000, true)!
      const url = text(a, 'url', 2000)
      if (url !== undefined && !/^https?:\/\/\S+$/i.test(url)) return bad('"url" must be an http(s) link.')
      const rawText = url && !note.includes(url) ? `${note}\n${url}` : note
      const itemId = crypto.randomUUID()
      await ctx.store.insertInbox({ id: itemId, raw_text: rawText, payload: { source: 'mcp', ...(url ? { url } : {}) } })
      // The trace a ⌘K capture leaves (lib/activity.ts), so streaks and Activity see it.
      await ctx.store.log('inbox.captured', 'inbox_item', itemId, { kind: 'text', source: 'mcp' })
      return { added_to_inbox: { id: itemId, text: rawText } }
    },
  },
  {
    name: 'calendar',
    title: 'Calendar',
    description:
      "Calendar events between two dates (both included), on the user's clock: events, Time blocks (`kind: time_block`, with the `tasks` that slot holds) and tasks' blocks (`kind: task`, with its task_id). A repeating event appears once per occurrence, each with the series' id. Defaults to today and the next 6 days; at most 31 days at once.",
    inputSchema: {
      type: 'object',
      properties: { from: dateArg('First day (default today)'), to: dateArg('Last day, included (default from + 6 days)') },
      additionalProperties: false,
    },
    write: false,
    async run(a, ctx) {
      const from: When = when(a, 'from', ctx.zone) ?? { day: dateKey(ctx.now, ctx.zone) }
      const first = 'day' in from ? from.day : dateKey(from.at, ctx.zone)
      const to: When = when(a, 'to', ctx.zone) ?? { day: addDays(first, 6) }
      const start = bound(from, 'from', ctx.zone)
      const end = bound(to, 'to', ctx.zone)
      if (end <= start) return bad('"to" must be on or after "from".')
      if (end.getTime() - start.getTime() > 32 * 86400_000) return bad('At most 31 days at once — ask for a shorter range.')
      const events = await eventsIn(ctx, start, end)
      // `until` is exclusive: a `to` day ends at the next midnight.
      return { from: wallTime(start.toISOString(), ctx.zone), until: wallTime(end.toISOString(), ctx.zone), timezone: ctx.zone, events: await eventsOut(ctx, events) }
    },
  },
  {
    name: 'add_event',
    title: 'Add event',
    description:
      "Put an event or a Time block on the user's calendar (only when they ask). `start`: a date-time on the user's clock, or a date for an all-day event; then `end` or `duration_min` (30 minutes when neither). `repeat` makes it a series that must fall on `start` (its first occurrence). For a task at a time use add_task or reschedule_task — those block the calendar for the task.",
    inputSchema: {
      type: 'object',
      properties: { title: { type: 'string', description: 'What it is, short.' }, ...eventTimes, repeat: repeatSchema('How it repeats') },
      required: ['title', 'start'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const { event } = await addEvent(a, ctx)
      return { added: eventOut(event, ctx.zone), timezone: ctx.zone }
    },
  },
  {
    name: 'edit_event',
    title: 'Edit event',
    description:
      "Change an event or Time block (only when the user asks) — give only what changes. `id` is the one the calendar tool shows; for a repeating event that's its series. Without `occurrence` the change is the event's — for a series, every occurrence's: `start` / `end` then give the new time of day (their dates aren't used; the series keeps its days). With `occurrence` (one occurrence's start, as the calendar tool lists it) only that one changes, to any day and time: it leaves the series as an event of its own. `repeat` (whole series only) must fall on the event's start; null leaves a series as one event, its first occurrence. To change a series from a day on, end it (add UNTIL=YYYYMMDDT235959Z to its rule) and add a new one. A task's calendar block moves with reschedule_task.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { ...id, description: 'The event id (for a repeating event, its series).' },
        occurrence: dateArg('Only this occurrence of a repeating event — its start'),
        title: { type: 'string', description: 'The new title.' },
        ...eventTimes,
        repeat: repeatSchema('How the series repeats'),
      },
      required: ['id'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const row = await liveEvent(ctx, uuid(a, 'id', true)!)
      const occ = when(a, 'occurrence', ctx.zone)
      const title = 'title' in a ? text(a, 'title', 500, true)! : row.title
      const kind = a.kind === undefined || a.kind === null ? (row.type ?? 'event') : choice(a, 'kind', KINDS, 'event')
      const rule = repeatArg(a, 'repeat')
      // A timed series' time is a time of day: its anchor's date says nothing to the user.
      const time = (e: EventRow) => (e.recurrence_rule && !e.all_day ? `${spanText(e, ctx.zone).slice(11)}, every occurrence` : spanText(e, ctx.zone))
      const what = (before: EventRow, after: EventRow) => [
        ...(after.title !== before.title ? [`title → "${after.title}"`] : []),
        ...(after.type !== (before.type ?? 'event') ? [`kind → ${after.type}`] : []),
        ...(spanText(after, ctx.zone) !== spanText(before, ctx.zone) ? [`time → ${time(after)}`] : []),
        ...((after.recurrence_rule ?? null) !== (before.recurrence_rule ?? null) ? [after.recurrence_rule ? `repeats ${after.recurrence_rule}` : 'no longer repeats'] : []),
        ...((after.remind_min ?? null) !== (before.remind_min ?? null) ? [after.remind_min == null ? 'no reminder' : `remind ${after.remind_min} min before`] : []),
      ]
      if (occ) {
        // One occurrence on its own (calendar/api detach): the series skips its start and a one-off
        // copy, linked back to the series, takes the change.
        if (!row.recurrence_rule) return bad(`"${row.title}" doesn't repeat: leave out "occurrence".`)
        if (rule !== undefined) return bad('"repeat" belongs to the whole series: leave out "occurrence" to change it.')
        const o = occurrenceOf(row, occ, ctx)
        const start = new Date(o.starts_at).toISOString()
        const span = spanArgs(a, ctx.zone, o) ?? { starts_at: o.starts_at, ends_at: o.ends_at, all_day: o.all_day }
        const remind = remindArg(a, span.all_day)
        const copy: EventRow = { ...row, id: crypto.randomUUID(), title, type: kind, ...span, recurrence_rule: null, recurrence_exdates: [], series_id: row.id, ...(remind !== undefined ? { remind_min: remind } : null) }
        const changed = what({ ...o, recurrence_rule: null }, copy)
        if (!changed.length) return { edited: eventOut(o, ctx.zone), changed, timezone: ctx.zone }
        await ctx.store.updateEvent({ ...row, recurrence_exdates: [...(row.recurrence_exdates ?? []), start] })
        await ctx.store.insertEvent(copy)
        await logIt(ctx, 'calendar_event.created', 'calendar_event', copy.id, { title, type: kind, series_id: row.id })
        // Its tasks go with it — out of it as an event or in the all-day band (calendar/api followSlot).
        const held = row.type === 'time_block' ? await rehome(ctx, await heldBy(ctx, row.id, o), () => (copy.type !== 'time_block' || copy.all_day ? OUT_OF_SLOT : intoSlot(copy.id, copy, ctx.zone))) : []
        return { edited: eventOut(copy, ctx.zone), changed: [...changed, `only the ${spanText(o, ctx.zone)} occurrence: it is an event of its own now`, ...held], timezone: ctx.zone }
      }
      const span = row.recurrence_rule ? seriesSpan(a, ctx.zone, row) : spanArgs(a, ctx.zone, row)
      const remind = remindArg(a, (span ?? row).all_day)
      const next: EventRow = { ...row, title, type: kind, ...span, ...(remind !== undefined ? { remind_min: remind } : null) }
      // An all-day event has no start to remind before (0077): a move to all-day drops it.
      if (next.all_day) next.remind_min = null
      // A series moved to another time of day: each skipped start moves with it, so it still names the
      // same occurrence (calendar/series retimeSeries).
      if (span && row.recurrence_rule) {
        const [h, mi] = wallTime(span.starts_at, ctx.zone).slice(11).split(':').map(Number)
        next.recurrence_exdates = (row.recurrence_exdates ?? []).map((x) => wallToInstant(dateKey(new Date(x), ctx.zone), h, mi, ctx.zone).toISOString())
      }
      if (rule !== undefined) Object.assign(next, { recurrence_rule: rule, recurrence_exdates: rule ? next.recurrence_exdates : [] })
      if (span || rule) checkSeries(next, ctx)
      const changed = what(row, next)
      if (!changed.length) return { edited: eventOut(row, ctx.zone), changed, timezone: ctx.zone }
      await ctx.store.updateEvent(next)
      await logIt(ctx, 'calendar_event.updated', 'calendar_event', row.id, { title, changed })
      // Where a Time block's tasks go, the app's rule (calendar/api):
      let held: string[] = []
      if (row.type === 'time_block') {
        const retimed = !!span && spanText(span, ctx.zone) !== spanText(row, ctx.zone)
        const reruled = (next.recurrence_rule ?? null) !== (row.recurrence_rule ?? null)
        // made an event: it holds none, so every task comes out (updateEvent → releaseRow);
        if (next.type !== 'time_block') held = await rehome(ctx, await heldBy(ctx, row.id, null), () => OUT_OF_SLOT)
        // a one-off moved: they go with it, out of it in the all-day band (followSlot);
        else if (!row.recurrence_rule && retimed) {
          held = await rehome(ctx, await heldBy(ctx, row.id, row), () => (next.all_day ? OUT_OF_SLOT : intoSlot(row.id, next, ctx.zone)))
        }
        // a series re-timed or its repeat set / changed / ended: each to its day's occurrence of what the
        // edit leaves, else out of the slot (reseat — the rule shared with the app, _shared/slots.ts).
        else if (retimed || reruled) {
          held = await rehome(ctx, (await heldBy(ctx, row.id, null)).filter((t) => !!t.slot_date), (t) => {
            const occ = occurrenceOn([next], t.slot_date!, ctx.zone, ctx.ruleBetween)
            return occ ? intoSlot(row.id, occ, ctx.zone) : OUT_OF_SLOT
          })
        }
      }
      return { edited: eventOut(next, ctx.zone), changed: [...changed, ...held], timezone: ctx.zone }
    },
  },
  {
    name: 'delete_event',
    title: 'Delete event',
    description:
      "Take an event or Time block off the calendar (only when the user asks). It goes to Trash, where the app can bring it back. For a repeating event: with `occurrence` (one occurrence's start, as the calendar tool lists it) only that one is skipped; without it the whole series goes, with any occurrence moved out of it. A task's calendar block comes off with reschedule_task.",
    inputSchema: {
      type: 'object',
      properties: { id: { ...id, description: 'The event id (for a repeating event, its series).' }, occurrence: dateArg('Only this occurrence of a repeating event — its start') },
      required: ['id'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const row = await liveEvent(ctx, uuid(a, 'id', true)!)
      const occ = when(a, 'occurrence', ctx.zone)
      if (occ) {
        // "This event" (calendar/api deleteEvent on an occurrence): the series skips that start.
        if (!row.recurrence_rule) return bad(`"${row.title}" doesn't repeat: leave out "occurrence" to delete it.`)
        const o = occurrenceOf(row, occ, ctx)
        const start = new Date(o.starts_at).toISOString()
        await ctx.store.updateEvent({ ...row, recurrence_exdates: [...(row.recurrence_exdates ?? []), start] })
        await logIt(ctx, 'calendar_event.deleted', 'calendar_event', row.id, { occurrence: start })
        // A Time slot lets go of its tasks: unscheduled, back in the rail (calendar/api releaseSlot).
        const freed = row.type === 'time_block' ? await restamp(ctx, await heldBy(ctx, row.id, o), () => OUT_OF_SLOT) : 0
        return { deleted: eventOut(o, ctx.zone), changed: [`skipped the ${spanText(o, ctx.zone)} occurrence; the rest of the series stays`, ...released(freed)], timezone: ctx.zone }
      }
      // An event, or "All events" for a series (deleteSeriesWithUndo): the row and every one-off moved
      // out of it; every task in any of its slots back to the rail.
      const held = row.type !== 'time_block' ? [] : row.recurrence_rule ? null : await heldBy(ctx, row.id, row)
      const gone = await ctx.store.deleteEvents([row.id])
      for (const deleted of gone) await logIt(ctx, 'calendar_event.deleted', 'calendar_event', deleted)
      const freed = await restamp(ctx, held ?? (await ctx.store.slotTasks(gone)).filter((t) => !!t.slot_id && gone.includes(t.slot_id)), () => OUT_OF_SLOT)
      const others = gone.length - 1
      return {
        deleted: eventOut(row, ctx.zone),
        changed: [`${row.recurrence_rule ? 'the whole series' : 'the event'} moved to Trash${others > 0 ? `, with ${others} occurrence${others === 1 ? '' : 's'} moved out of it` : ''}`, ...released(freed)],
        timezone: ctx.zone,
      }
    },
  },
  {
    name: 'projects',
    title: 'Projects, areas and domains',
    description:
      "Where things live (none in Trash): the user's projects (id, name, status — active or archived, type — standard or retainer, target date, domain), areas and domains, and the saved checklist templates. Use the ids with list_tasks, add_task, edit_task, get_project and the save_* tools.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    write: false,
    async run(_a, ctx) {
      const rows = await ctx.store.projects()
      const areas = await ctx.store.find('areas', { deleted_at: null }, { order: 'sort_order' })
      const domains = await ctx.store.find('domains', { deleted_at: null }, { order: 'sort_order' })
      const [settings] = await ctx.store.find('app_settings', {}, { limit: 1 })
      const domainName = (d: unknown) => (d ? ((domains.find((x) => x.id === d)?.name as string | undefined) ?? null) : null)
      const templates = Array.isArray(settings?.checklist_templates) ? (settings.checklist_templates as Row[]) : []
      return {
        projects: rows.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          type: p.type,
          // A target is a date in no zone, stored at UTC midnight (the date input's value): read in UTC, as the app does.
          ...(p.target_date ? { target_date: new Date(p.target_date).toISOString().slice(0, 10) } : {}),
          ...(domainName(p.domain_id) ? { domain: domainName(p.domain_id) } : {}),
        })),
        areas: areas.map((r) => ({ id: r.id, name: r.name, ...(domainName(r.domain_id) ? { domain: domainName(r.domain_id) } : {}), ...(r.color ? { color: colorName(r.color, PLACE_COLORS) } : {}) })),
        domains: domains.map((d) => ({ id: d.id, name: d.name, ...(d.color ? { color: colorName(d.color, PLACE_COLORS) } : {}) })),
        ...(templates.length ? { checklist_templates: templates.map((t) => ({ id: t.id, name: t.name, items: Array.isArray(t.items) ? t.items.length : 0 })) } : {}),
      }
    },
  },
]

/** "2 tasks it held are back unscheduled". */
const released = (n: number) => (n ? [`${n} task${n === 1 ? '' : 's'} it held ${n === 1 ? 'is' : 'are'} back unscheduled`] : [])

/** add_event's write, shared with filing an Inbox item as an event: the span, kind, repeat and
 * reminder from `a`, checked; logs calendar_event.created (calendar/api createEvent). */
export async function addEvent(a: Args, ctx: ToolContext, fallbackTitle?: string): Promise<{ event: EventRow }> {
  const title = fallbackTitle !== undefined ? (text(a, 'title', 500) ?? fallbackTitle) : text(a, 'title', 500, true)!
  const span = spanArgs(a, ctx.zone)!
  const event: EventRow = {
    id: crypto.randomUUID(),
    title,
    ...span,
    task_id: null,
    type: choice(a, 'kind', KINDS, 'event'),
    recurrence_rule: repeatArg(a, 'repeat') ?? null,
    recurrence_exdates: [],
    remind_min: remindArg(a, span.all_day) ?? null,
  }
  checkSeries(event, ctx)
  await ctx.store.insertEvent(event)
  await logIt(ctx, 'calendar_event.created', 'calendar_event', event.id, { title, type: event.type })
  return { event }
}

export interface ToolResult {
  content: { type: 'text'; text: string }[]
  isError?: true
}

const textResult = (s: string, isError = false): ToolResult => ({ content: [{ type: 'text', text: s }], ...(isError ? { isError: true as const } : {}) })

/** Runs one tool. Unknown arguments and bad values come back as a tool error (isError) the model can
 * correct; a failure underneath (database) as a short, detail-free one. */
export async function runTool(tool: ToolDef, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
  try {
    if (rawArgs !== undefined && rawArgs !== null && (typeof rawArgs !== 'object' || Array.isArray(rawArgs))) bad('"arguments" must be an object.')
    const a = (rawArgs ?? {}) as Args
    const known = Object.keys(tool.inputSchema.properties)
    for (const k of Object.keys(a)) if (!known.includes(k)) bad(`Unknown argument "${k}". ${known.length ? `Allowed: ${known.join(', ')}.` : 'This tool takes none.'}`)
    return textResult(JSON.stringify(await tool.run(a, ctx)))
  } catch (e) {
    if (e instanceof ToolInputError) return textResult(e.message, true)
    console.error(`mcp tool ${tool.name}:`, e)
    return textResult(`Couldn't ${tool.write ? 'save that' : 'read that'} in Kai's Flow just now — try again in a moment.`, true)
  }
}
