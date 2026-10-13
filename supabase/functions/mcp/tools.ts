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

import { addDays, dateKey, dayWindow, wallTime, wallToInstant } from '../_shared/zone.ts'
import { isTop3Today, todaysTop3 } from '../_shared/today.ts'

// The user's clock is _shared/zone.ts (notify and chat read the same one); re-exported for the tests.
export { DEFAULT_ZONE, userZone } from '../_shared/zone.ts'
export { addDays, dateKey, dayWindow, wallTime, wallToInstant }
import { expandSeries, type RuleBetween } from '../_shared/series.ts'
import { rollAfter, ruleAfterThis, stepOf } from '../_shared/repeat.ts'

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
}

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
}

/** One method per statement; every one runs inside the call's transaction, as the user. */
export interface Store {
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
  search(query: string, limit: number): Promise<SearchHit[]>
  /** Today's open picks (top3Rule): starred, open, not in Trash, not someday or paused, undated or dated before `todayEndIso`. */
  top3Count(todayEndIso: string): Promise<number>
  /** An open copy of a repeat already sits at `dueIso` (completion.ts openOccurrence). */
  openOccurrence(title: string, rule: string, dueIso: string, exceptId: string): Promise<boolean>
  insertTask(t: TaskRow): Promise<void>
  /** Writes the task's editable fields as `t` has them: title, notes, due, schedule, Top 3 (+ rank),
   * someday, duration, project / area / domain / milestone, repeat, reminder. */
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
}

/** The events in [start, end): one-off rows as the store found them, each repeating row as its
 * occurrences there — the app's own expansion (features/calendar/series.ts). */
async function eventsIn(ctx: ToolContext, start: Date, end: Date): Promise<EventRow[]> {
  return expandSeries(await ctx.store.events(start.toISOString(), end.toISOString()), start, end, ctx.zone, ctx.ruleBetween)
}

// ── input checks: a bad argument is a tool error the model can read and fix ─────────────────────

export class ToolInputError extends Error {}
const bad = (msg: string): never => {
  throw new ToolInputError(msg)
}

type Args = Record<string, unknown>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function text(a: Args, k: string, max: number, required = false): string | undefined {
  const v = a[k]
  if (v === undefined || v === null) return required ? bad(`"${k}" is required.`) : undefined
  if (typeof v !== 'string') return bad(`"${k}" must be a string.`)
  const t = v.trim()
  if (!t) return required ? bad(`"${k}" can't be empty.`) : undefined
  if (t.length > max) return bad(`"${k}" is too long (at most ${max} characters).`)
  return t
}

function uuid(a: Args, k: string, required = false): string | undefined {
  const v = text(a, k, 36, required)
  if (v !== undefined && !UUID.test(v)) return bad(`"${k}" must be an id (a UUID) as returned by another tool.`)
  return v
}

function flag(a: Args, k: string): boolean | undefined {
  const v = a[k]
  if (v === undefined || v === null) return undefined
  return typeof v === 'boolean' ? v : bad(`"${k}" must be true or false.`)
}

function whole(a: Args, k: string, min: number, max: number, fallback: number): number {
  const v = a[k]
  if (v === undefined || v === null) return fallback
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) return bad(`"${k}" must be a whole number from ${min} to ${max}.`)
  return v
}

function choice<T extends string>(a: Args, k: string, values: readonly T[], fallback: T): T {
  const v = a[k]
  if (v === undefined || v === null) return fallback
  return values.includes(v as T) ? (v as T) : bad(`"${k}" must be one of: ${values.join(', ')}.`)
}

function when(a: Args, k: string, zone: string): When | undefined {
  const v = text(a, k, 40)
  if (v === undefined) return undefined
  return readWhen(v, zone) ?? bad(`"${k}" must be a date (YYYY-MM-DD), a local date-time (YYYY-MM-DDTHH:mm, on the user's clock) or an ISO time with a zone.`)
}

/** A task's length, in minutes: 1 minute to a day. */
const minutes = (a: Args, k: string): number | null => (a[k] === undefined || a[k] === null ? null : whole(a, k, 1, 1440, 0))

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
function repeatArg(a: Args, k: string): string | null | undefined {
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

function taskOut(t: TaskRow, zone: string, full = false): Record<string, unknown> {
  const o: Record<string, unknown> = { id: t.id, title: t.title }
  if (t.status !== 'todo') o.status = t.status
  if (t.due_at) o.due = wallTime(t.due_at, zone)
  if (t.scheduled_start) o.scheduled = wallTime(t.scheduled_start, zone) + (t.scheduled_end ? `–${wallTime(t.scheduled_end, zone).slice(11)}` : '')
  if (t.duration_min !== null) o.duration_min = t.duration_min
  if (t.project_name) o.project = t.project_name
  if (t.labels?.length) o.labels = t.labels
  if (t.top3) o.top3 = true
  if (t.priority !== null) o.priority = t.priority
  if (t.someday) o.someday = true
  if (t.recurrence_rule) o.repeats = t.recurrence_rule
  if (t.paused) o.paused = true
  if (t.completed_at) o.completed = wallTime(t.completed_at, zone)
  if (full) {
    if (t.notes) o.notes = t.notes
    if (t.reminder_at) o.reminder = wallTime(t.reminder_at, zone)
    if (t.project_id) o.project_id = t.project_id
    if (t.parent_task_id) o.parent_task_id = t.parent_task_id
    o.created = wallTime(t.created_at, zone)
  }
  return o
}

/** "2026-10-08 18:00–19:30" (a timed span; the end's date only when it differs) or "2026-10-08" /
 * "2026-10-08 – 2026-10-10" (all-day, last day included). */
function spanText(e: Pick<EventRow, 'starts_at' | 'ends_at' | 'all_day'>, zone: string): string {
  if (e.all_day) return firstDay(e) === lastDay(e) ? firstDay(e) : `${firstDay(e)} – ${lastDay(e)}`
  const [s, en] = [wallTime(e.starts_at, zone), wallTime(e.ends_at, zone)]
  return `${s}–${en.slice(0, 10) === s.slice(0, 10) ? en.slice(11) : en}`
}

function eventOut(e: EventRow, zone: string): Record<string, unknown> {
  // An occurrence answers with its series' id — the one stored, the one search returns. An all-day
  // event is its days (the last one included), not a time on anyone's clock.
  const o: Record<string, unknown> = e.all_day
    ? { id: e.seriesId ?? e.id, title: e.title, start: firstDay(e), end: lastDay(e), all_day: true }
    : { id: e.seriesId ?? e.id, title: e.title, start: wallTime(e.starts_at, zone), end: wallTime(e.ends_at, zone) }
  if (e.type && e.type !== 'event') o.kind = e.type
  if (e.task_id) o.task_id = e.task_id
  if (e.recurrence_rule) o.repeats = e.recurrence_rule
  return o
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
  due: string,
  timed: boolean,
  durationMin: number | null,
  zone: string,
): { place: { block: B | null; starts_at: string; ends_at: string } | null; keep: B | null; clear: B[] } {
  const latestFirst = [...blocks].sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))
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
async function replanTask(ctx: ToolContext, t: TaskRow, due: string, timed: boolean): Promise<{ task: TaskRow; placed: EventRow | null; removed: number }> {
  const m = replanMoves(await ctx.store.taskBlocks(t.id), due, timed, t.duration_min, ctx.zone)
  const on = m.place ?? m.keep
  const schedule = on ? { scheduled_start: on.starts_at, scheduled_end: on.ends_at } : m.clear.length ? { scheduled_start: null, scheduled_end: null } : {}
  const task = settle(t, { ...t, due_at: due, someday: false, ...schedule }, ctx.now, ctx.zone)
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

// ── writing an event the way the app does ────────────────────────────────────────────────────────

const KINDS = ['event', 'time_block'] as const
type Span = Pick<EventRow, 'starts_at' | 'ends_at' | 'all_day'>
/** A new event's length when nothing says (QuickCreate's 09:00–09:30). */
const EVENT_MIN = 30
const MAX_EVENT_DAYS = 31

/** An event's [start, end) from `start` / `end` / `duration_min` on the user's clock. `base` is the
 * event being edited: what isn't given keeps its value (a moved event keeps its length). A date
 * `start` makes it all-day (`end` = its last day); a date-time makes it timed. Undefined when none
 * of the three is given. */
function spanArgs(a: Args, zone: string, base?: Span): Span | undefined {
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
function occurrenceOf(row: EventRow, w: When, ctx: ToolContext): EventRow {
  const at = 'at' in w ? w.at.getTime() : wallToInstant(w.day, 0, 0, ctx.zone).getTime()
  const near = expandSeries([row], new Date(at - 2 * DAY_MS), new Date(at + 2 * DAY_MS), ctx.zone, ctx.ruleBetween)
  const dayOf = (o: EventRow) => (o.all_day ? firstDay(o) : dateKey(new Date(o.starts_at), ctx.zone))
  const hit = near.find((o) => o.seriesId && ('at' in w ? Date.parse(o.starts_at) === at : dayOf(o) === w.day))
  return hit ?? bad(`"${row.title}" has no occurrence at ${'at' in w ? wallTime(w.at.toISOString(), ctx.zone) : w.day} (skipped, or not on its rule). The calendar tool lists each occurrence's start.`)
}

/** An event an assistant may change: live, and the calendar's own — a task's block follows its task. */
async function liveEvent(ctx: ToolContext, eventId: string): Promise<EventRow> {
  const e = await ctx.store.getEvent(eventId)
  if (!e) return bad(`No event with id ${eventId} (it may have been deleted). Use calendar or search to find it.`)
  if (e.task_id || e.type === 'task') return bad(`"${e.title}" is a task's calendar block: reschedule_task moves the task and its block together.`)
  return e
}

const MAX_TOP3 = 3
const OVERDUE_SHOWN = 30
// ponytail: the assistant sees work items only. Journal entries and people are personal (CLAUDE.md:
// journal content goes to Groq only), so search drops them even though search_hybrid returns them.
const SEARCHABLE = new Set(['task', 'inbox_item', 'project', 'calendar_event'])

// ── the tools ─────────────────────────────────────────────────────────────────────────────────

export interface ToolDef {
  name: string
  title: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties: false }
  /** Changes the user's data: hidden from a read-only key. */
  write: boolean
  run(a: Args, ctx: ToolContext): Promise<Record<string, unknown>>
}

const id = { type: 'string', format: 'uuid' }
const dateArg = (what: string) => ({ type: 'string', description: `${what}: YYYY-MM-DD, or YYYY-MM-DDTHH:mm on the user's clock.` })
const repeatSchema = (what: string) => ({ type: ['string', 'null'], description: `${what}: ${RULE_HELP}, on the user's clock. null stops it repeating.` })
const eventTimes = {
  start: dateArg('When it starts — a date alone makes it all-day'),
  end: dateArg('When it ends (all-day: its last day). Or give duration_min'),
  duration_min: { type: 'integer', minimum: 1, maximum: 1440, description: 'How long, in minutes (instead of end; timed events only).' },
  kind: { type: 'string', enum: KINDS, description: 'event (a meeting, an appointment) or time_block (time set aside for work).' },
}

async function openTask(ctx: ToolContext, taskId: string): Promise<TaskRow> {
  const t = await ctx.store.getTask(taskId)
  if (!t) return bad(`No task with id ${taskId} (it may have been deleted). Use list_tasks or search to find it.`)
  if (t.status !== 'todo') return bad(`"${t.title}" is already ${t.status}.`)
  return t
}

export const TOOLS: readonly ToolDef[] = [
  {
    name: 'today',
    title: 'Today',
    description:
      "The user's day on their own clock: their Top 3 picks, open tasks due or scheduled today, overdue tasks, and today's calendar events. Start here for \"what's on today?\" or \"what should I do next?\". All times are wall-clock in `timezone`.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    write: false,
    async run(_a, ctx) {
      const { date, start, end } = dayWindow(ctx.now, ctx.zone)
      const rows = await ctx.store.dayTasks(start.toISOString(), end.toISOString())
      const events = await eventsIn(ctx, start, end)
      const { top3, today, overdue } = splitToday(rows, ctx.now, ctx.zone)
      return {
        date,
        now: wallTime(ctx.now.toISOString(), ctx.zone),
        timezone: ctx.zone,
        top3: top3.map((t) => taskOut(t, ctx.zone)),
        today: today.map((t) => taskOut(t, ctx.zone)),
        overdue: overdue.slice(0, OVERDUE_SHOWN).map((t) => taskOut(t, ctx.zone)),
        ...(overdue.length > OVERDUE_SHOWN ? { overdue_not_shown: overdue.length - OVERDUE_SHOWN } : {}),
        events: events.map((e) => eventOut(e, ctx.zone)),
      }
    },
  },
  {
    name: 'search',
    title: 'Search',
    description:
      "Search the user's tasks, inbox notes, projects and calendar events by meaning and keywords. Returns the best matches with their ids (use get_task for a task's details). Journal entries and people are never searched here.",
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
          .filter((h) => SEARCHABLE.has(h.entity_type))
          .slice(0, limit)
          .map((h) => ({ type: h.entity_type, id: h.entity_id, title: h.title, ...(h.snippet ? { snippet: h.snippet } : {}) })),
      }
    },
  },
  {
    name: 'list_tasks',
    title: 'List tasks',
    description:
      'List tasks with optional filters: status (open by default), a project (ids come from the projects tool), a label, and a due-date range. Open tasks come soonest-due first; done tasks most recently finished first.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'done', 'all'], description: 'open (default), done, or all.' },
        project_id: { ...id, description: 'Only tasks in this project.' },
        label: { type: 'string', description: 'Only tasks carrying this label.' },
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
        label: text(a, 'label', 100) ?? null,
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
    description: "One task's full details: notes, due date, calendar block, project, labels, priority, repeat rule, reminder.",
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
      "Add a task to the user's task list. Only when the user asks for it. `due`: a date (YYYY-MM-DD, which means 09:00 that day) or a local date-time (YYYY-MM-DDTHH:mm) on the user's clock — a date-time also blocks that time on the calendar, as long as `duration_min` (30 minutes by default), as typing a time in the app does. `top3: true` makes it one of today's Top 3 (at most 3 open picks); the Top 3 is today's, so a later due date comes to today, keeping its time. `repeat` makes it repeat (an undated one then starts today 09:00). Unsure where something belongs? Use add_to_inbox instead.",
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'What to do, short.' },
        due: dateArg('When it is due'),
        duration_min: { type: 'integer', minimum: 1, maximum: 1440, description: 'How long it takes, in minutes — a timed task blocks this much of the calendar.' },
        project_id: { ...id, description: 'File it in this project (ids from the projects tool).' },
        top3: { type: 'boolean', description: "Star it into today's Top 3." },
        notes: { type: 'string', description: 'Longer details.' },
        repeat: { type: 'string', description: `How it repeats: ${RULE_HELP}, on the user's clock.` },
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
      const top3 = flag(a, 'top3') ?? false
      const notes = text(a, 'notes', 10000) ?? null
      const rule = repeatArg(a, 'repeat') ?? null
      let project: ProjectRow | null = null
      if (projectId) {
        project = (await ctx.store.projects()).find((p) => p.id === projectId) ?? null
        if (!project) return bad(`No project with id ${projectId}. Call the projects tool for the ids.`)
      }
      const today = dayWindow(ctx.now, ctx.zone)
      if (top3 && (await ctx.store.top3Count(today.end.toISOString())) >= MAX_TOP3) {
        return bad('Top 3 is full (3 open picks). Add it without top3, or ask the user which pick to swap out.')
      }
      let dueAt = due ? ('at' in due ? due.at : wallToInstant(due.day, 9, 0, ctx.zone)) : null
      // The Top 3 is today's (top3Rule): a pick dated a later day comes to today at its own time, as
      // starring does in the app (tasks/api flipTop3 → planMath todayFor).
      if (top3 && dueAt && dueAt >= today.end) {
        const [h, mi] = wallTime(dueAt.toISOString(), ctx.zone).slice(11).split(':').map(Number)
        dueAt = wallToInstant(today.date, h, mi, ctx.zone)
      }
      // A repeat rolls from the due date: an undated one starts today, first thing (tasks/api setRecurrence).
      if (rule && !dueAt) dueAt = wallToInstant(today.date, 9, 0, ctx.zone)
      if (rule) checkTaskRule(ctx, rule, dueAt!.toISOString())
      const now = ctx.now.toISOString()
      const taskId = crypto.randomUUID()
      // A typed time puts the capture on the calendar (command-bar quickAdd → capture/api blockIfTimed).
      const block: EventRow | null =
        due && 'at' in due && dueAt
          ? { id: crypto.randomUUID(), title, starts_at: dueAt.toISOString(), ends_at: new Date(dueAt.getTime() + (durationMin || BLOCK_MIN) * 60_000).toISOString(), all_day: false, task_id: taskId, type: 'task' }
          : null
      const task: TaskRow = {
        id: taskId,
        title,
        notes,
        status: 'todo',
        due_at: dueAt ? dueAt.toISOString() : null,
        scheduled_start: block?.starts_at ?? null,
        scheduled_end: block?.ends_at ?? null,
        top3,
        someday: false,
        paused: false,
        labels: [],
        priority: null,
        duration_min: durationMin,
        project_id: project?.id ?? null,
        // A task filed in a project carries the project's domain (tasks/api setProject).
        domain_id: project?.domain_id ?? null,
        area_id: null,
        milestone_id: null,
        parent_task_id: null,
        recurrence_rule: rule,
        reminder_at: null,
        reminder_sent: false,
        snoozed_until: null,
        completed_at: null,
        created_at: now,
        updated_at: now,
      }
      await ctx.store.insertTask(task)
      await ctx.store.log('task.created', 'task', task.id, { title, source: 'mcp' })
      // Today's Top 3 history (today/top3Today.ts) is read from these events.
      if (top3) await ctx.store.log('task.starred', 'task', task.id, { source: 'mcp' })
      if (rule) await ctx.store.log('task.recurrence_set', 'task', task.id, { rule, source: 'mcp' })
      if (block) {
        await ctx.store.insertEvent(block)
        await ctx.store.log('task.scheduled', 'task', task.id, { calendar_event_id: block.id, source: 'mcp' })
      }
      return {
        added: taskOut({ ...task, project_name: project?.name ?? null }, ctx.zone),
        ...(block ? { calendar_block: spanText(block, ctx.zone) } : {}),
        timezone: ctx.zone,
      }
    },
  },
  {
    name: 'edit_task',
    title: 'Edit task',
    description:
      "Change an open task's title, notes, duration, project or repeat — only when the user asks, and give only what changes. null clears `notes`, `duration_min` and `repeat`; `project_id: null` takes it out of its project. A repeat on an undated task dates it today 09:00, as in the app. To move it to another day or time, use reschedule_task.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { ...id, description: 'The task id.' },
        title: { type: 'string', description: 'The new title.' },
        notes: { type: ['string', 'null'], description: 'The new notes (they replace the old ones).' },
        duration_min: { type: ['integer', 'null'], minimum: 1, maximum: 1440, description: 'How long it takes, in minutes.' },
        project_id: { type: ['string', 'null'], format: 'uuid', description: 'Move it into this project (ids from the projects tool).' },
        repeat: repeatSchema('How it repeats'),
      },
      required: ['id'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const t = await openTask(ctx, uuid(a, 'id', true)!)
      if (!['title', 'notes', 'duration_min', 'project_id', 'repeat'].some((k) => k in a)) {
        return bad('Nothing to change: give at least one of title, notes, duration_min, project_id, repeat.')
      }
      // Every argument is read before anything is written.
      const title = 'title' in a ? text(a, 'title', 500, true)! : t.title
      const notes = 'notes' in a ? (text(a, 'notes', 10000) ?? null) : t.notes
      const durationMin = 'duration_min' in a ? minutes(a, 'duration_min') : t.duration_min
      const rule = repeatArg(a, 'repeat')
      let project: ProjectRow | null | undefined
      if ('project_id' in a) {
        const projectId = uuid(a, 'project_id') ?? null
        project = projectId ? ((await ctx.store.projects()).find((p) => p.id === projectId) ?? bad(`No project with id ${projectId}. Call the projects tool for the ids.`)) : null
      }
      const next: TaskRow = { ...t, title, notes, duration_min: durationMin }
      const changed: string[] = []
      const logs: [string, Record<string, unknown>][] = []
      const edit = (said: string, type: string, payload: Record<string, unknown>) => {
        changed.push(said)
        logs.push([type, payload])
      }
      if (title !== t.title) edit(`title → "${title}"`, 'task.updated', { field: 'title' })
      if (notes !== t.notes) edit(notes ? 'notes' : 'notes cleared', 'task.updated', { field: 'notes' })
      if (durationMin !== t.duration_min) edit(durationMin ? `duration → ${durationMin} min` : 'duration cleared', 'task.updated', { field: 'duration' })
      // "Move to…" (tasks/move.ts placeTask): a project, its domain with it, out of any area; a milestone
      // stays only in its own project. null = out of all of them.
      if (project !== undefined && (project?.id ?? null) !== t.project_id) {
        Object.assign(next, { project_id: project?.id ?? null, area_id: null, domain_id: project?.domain_id ?? null, milestone_id: null, project_name: project?.name ?? null })
        edit(project ? `project → ${project.name}` : 'out of its project', 'task.moved', { project_id: next.project_id, area_id: null, domain_id: next.domain_id })
      }
      if (rule !== undefined && rule !== t.recurrence_rule) {
        next.recurrence_rule = rule
        edit(rule ? `repeats ${rule}` : 'no longer repeats', 'task.recurrence_set', { rule })
        // A repeat needs a date to roll from (tasks/api setRecurrence): an undated one starts today.
        if (rule && !t.due_at) {
          next.due_at = wallToInstant(dateKey(ctx.now, ctx.zone), 9, 0, ctx.zone).toISOString()
          next.someday = false
          edit(`due ${wallTime(next.due_at, ctx.zone)} (a repeat starts today)`, 'task.rescheduled', { due_at: next.due_at })
        }
        if (rule) checkTaskRule(ctx, rule, next.due_at!)
      }
      const task = settle(t, next, ctx.now, ctx.zone)
      if (logs.length) {
        await ctx.store.updateTask(task)
        for (const [type, payload] of logs) await ctx.store.log(type, 'task', t.id, { ...payload, source: 'mcp' })
      }
      return { edited: taskOut(task, ctx.zone, true), changed, timezone: ctx.zone }
    },
  },
  {
    name: 'reschedule_task',
    title: 'Reschedule task',
    description:
      "Move an open task to another day or time (only when the user asks). `when`: a date-time (YYYY-MM-DDTHH:mm, the user's clock) puts it on the calendar at that time — its calendar block moves there, keeping its length, else a new block as long as its duration_min (30 minutes by default). A date alone (YYYY-MM-DD) means 09:00 that day in that day's list, with no time on the calendar: a block already on that day stays, one on another day comes off. As in the app, Someday is cleared, a reminder keeps its lead, and a Top 3 pick moved to a later day gives its place up.",
    inputSchema: {
      type: 'object',
      properties: { id: { ...id, description: 'The task id.' }, when: dateArg('The new day, or day and time') },
      required: ['id', 'when'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const t = await openTask(ctx, uuid(a, 'id', true)!)
      const w = when(a, 'when', ctx.zone) ?? bad('"when" is required.')
      const due = ('at' in w ? w.at : wallToInstant(w.day, 9, 0, ctx.zone)).toISOString()
      const { task, placed, removed } = await replanTask(ctx, t, due, 'at' in w)
      const changed = [`due ${wallTime(due, ctx.zone)}`]
      if (placed) changed.push(`on the calendar ${spanText(placed, ctx.zone)}`)
      if (removed) changed.push(`${removed} calendar block${removed === 1 ? '' : 's'} taken off the calendar (in Trash)`)
      if (t.someday) changed.push('out of Someday')
      if (t.top3 && !task.top3) changed.push("left today's Top 3")
      if (task.reminder_at && task.reminder_at !== t.reminder_at) changed.push(`reminder → ${wallTime(task.reminder_at, ctx.zone)}`)
      return { rescheduled: taskOut(task, ctx.zone), changed, timezone: ctx.zone }
    },
  },
  {
    name: 'complete_task',
    title: 'Complete task',
    description: "Mark an open task done (only when the user says it's done). A repeating task's next occurrence is created, as in the app — unless the series is paused.",
    inputSchema: { type: 'object', properties: { id: { ...id, description: 'The task id.' } }, required: ['id'], additionalProperties: false },
    write: true,
    async run(a, ctx) {
      const t = await openTask(ctx, uuid(a, 'id', true)!)
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
            created_at: now,
            updated_at: now,
          }
        }
      }
      if (!(await ctx.store.markDone(t.id, now))) return bad(`"${t.title}" isn't open any more.`)
      await ctx.store.log('task.completed', 'task', t.id, { source: 'mcp' })
      if (next) {
        await ctx.store.insertTask(next)
        await ctx.store.log('task.created', 'task', next.id, { recurrence_parent: t.id, source: 'mcp' })
      }
      return {
        done: taskOut({ ...t, status: 'done', completed_at: now, top3: false }, ctx.zone),
        ...(next ? { next: taskOut(next, ctx.zone) } : {}),
        timezone: ctx.zone,
      }
    },
  },
  {
    name: 'move_to_tomorrow',
    title: 'Move to tomorrow',
    description:
      "Move an open task's due date to tomorrow 09:00 on the user's clock — the app's \"Tomorrow\". As in the app, its reminder keeps its lead time, a calendar block on another day comes off the calendar, and a Top 3 pick gives its place up.",
    inputSchema: { type: 'object', properties: { id: { ...id, description: 'The task id.' } }, required: ['id'], additionalProperties: false },
    write: true,
    async run(a, ctx) {
      const t = await openTask(ctx, uuid(a, 'id', true)!)
      const { task, removed } = await replanTask(ctx, t, tomorrowAt9(ctx.now, ctx.zone), false)
      return { moved: taskOut(task, ctx.zone), ...(removed ? { calendar_blocks_removed: removed } : {}), timezone: ctx.zone }
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
      "Calendar events between two dates (both included), on the user's clock: events, Time blocks (`kind: time_block`) and tasks' blocks (`kind: task`, with its task_id). A repeating event appears once per occurrence, each with the series' id. Defaults to today and the next 6 days; at most 31 days at once.",
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
      return { from: wallTime(start.toISOString(), ctx.zone), until: wallTime(end.toISOString(), ctx.zone), timezone: ctx.zone, events: events.map((e) => eventOut(e, ctx.zone)) }
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
      const title = text(a, 'title', 500, true)!
      const e: EventRow = {
        id: crypto.randomUUID(),
        title,
        ...spanArgs(a, ctx.zone)!,
        task_id: null,
        type: choice(a, 'kind', KINDS, 'event'),
        recurrence_rule: repeatArg(a, 'repeat') ?? null,
        recurrence_exdates: [],
      }
      checkSeries(e, ctx)
      await ctx.store.insertEvent(e)
      // calendar/api createEvent's trace.
      await ctx.store.log('calendar_event.created', 'calendar_event', e.id, { title, type: e.type, source: 'mcp' })
      return { added: eventOut(e, ctx.zone), timezone: ctx.zone }
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
      ]
      if (occ) {
        // One occurrence on its own (calendar/api detach): the series skips its start and a one-off
        // copy, linked back to the series, takes the change.
        if (!row.recurrence_rule) return bad(`"${row.title}" doesn't repeat: leave out "occurrence".`)
        if (rule !== undefined) return bad('"repeat" belongs to the whole series: leave out "occurrence" to change it.')
        const o = occurrenceOf(row, occ, ctx)
        const start = new Date(o.starts_at).toISOString()
        const copy: EventRow = { ...row, id: crypto.randomUUID(), title, type: kind, ...(spanArgs(a, ctx.zone, o) ?? { starts_at: o.starts_at, ends_at: o.ends_at, all_day: o.all_day }), recurrence_rule: null, recurrence_exdates: [], series_id: row.id }
        const changed = what({ ...o, recurrence_rule: null }, copy)
        if (!changed.length) return { edited: eventOut(o, ctx.zone), changed, timezone: ctx.zone }
        await ctx.store.updateEvent({ ...row, recurrence_exdates: [...(row.recurrence_exdates ?? []), start] })
        await ctx.store.insertEvent(copy)
        await ctx.store.log('calendar_event.created', 'calendar_event', copy.id, { title, type: kind, series_id: row.id, source: 'mcp' })
        return { edited: eventOut(copy, ctx.zone), changed: [...changed, `only the ${spanText(o, ctx.zone)} occurrence: it is an event of its own now`], timezone: ctx.zone }
      }
      const span = row.recurrence_rule ? seriesSpan(a, ctx.zone, row) : spanArgs(a, ctx.zone, row)
      const next: EventRow = { ...row, title, type: kind, ...span }
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
      await ctx.store.log('calendar_event.updated', 'calendar_event', row.id, { title, changed, source: 'mcp' })
      return { edited: eventOut(next, ctx.zone), changed, timezone: ctx.zone }
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
        await ctx.store.log('calendar_event.deleted', 'calendar_event', row.id, { occurrence: start, source: 'mcp' })
        return { deleted: eventOut(o, ctx.zone), changed: [`skipped the ${spanText(o, ctx.zone)} occurrence; the rest of the series stays`], timezone: ctx.zone }
      }
      // An event, or "All events" for a series (deleteSeriesWithUndo): the row and every one-off moved out of it.
      const ids = await ctx.store.deleteEvents([row.id])
      for (const deleted of ids) await ctx.store.log('calendar_event.deleted', 'calendar_event', deleted, { source: 'mcp' })
      const others = ids.length - 1
      return {
        deleted: eventOut(row, ctx.zone),
        changed: [`${row.recurrence_rule ? 'the whole series' : 'the event'} moved to Trash${others > 0 ? `, with ${others} occurrence${others === 1 ? '' : 's'} moved out of it` : ''}`],
        timezone: ctx.zone,
      }
    },
  },
  {
    name: 'projects',
    title: 'Projects',
    description: "The user's projects (not in Trash): id, name, status, type and target date. Use an id with list_tasks, add_task or edit_task.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    write: false,
    async run(_a, ctx) {
      const rows = await ctx.store.projects()
      return {
        projects: rows.map((p) => ({ id: p.id, name: p.name, status: p.status, type: p.type, ...(p.target_date ? { target_date: dateKey(new Date(p.target_date), ctx.zone) } : {}) })),
      }
    },
  },
]

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
