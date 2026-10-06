// The MCP server's tools: what an AI assistant can read and do in one user's Kai's Flow (docs/MCP.md).
// Pure — no Deno APIs, no npm: imports — so the app's vitest runs it
// (app/src/features/settings/mcp.test.ts), the notify/ritual.ts pattern. index.ts hands in a Store
// whose SQL runs as that user (role `authenticated` + their uid → RLS), never as the service role.
//
// The app's rules, restated on the user's own clock (app_settings.timezone; Cairo when unset or not
// a zone Intl knows):
//   Today        features/tasks/grouping.ts filterByList('today'), split into Top 3 / today / overdue
//   "Tomorrow"   tomorrow 09:00 (lib/dateShortcuts scheduleTomorrow)
//   a bare date  09:00 that day (scheduleToday)
//   completing   a repeat spawns its next occurrence (features/tasks/completion.ts planCompletion)
//   every write  logs the same activity_log event the app's helper logs, so Slipping, streaks and the
//                digests see it (+ `source: 'mcp'` in the payload)

export const DEFAULT_ZONE = 'Africa/Cairo'

// ── the user's clock ─────────────────────────────────────────────────────────────────────────

/** `zone` if Intl knows it, else Cairo (the app's default). */
export function userZone(zone: string | null | undefined): string {
  if (!zone) return DEFAULT_ZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return zone
  } catch {
    return DEFAULT_ZONE
  }
}

const clocks = new Map<string, Intl.DateTimeFormat>()
function wall(t: number, zone: string): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  let f = clocks.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    clocks.set(zone, f)
  }
  const p: Record<string, number> = {}
  for (const { type, value } of f.formatToParts(t)) p[type] = Number(value)
  return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second }
}

/** `zone`'s UTC offset in ms at instant `t`. */
function offsetMs(t: number, zone: string): number {
  const w = wall(t, zone)
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(t / 1000) * 1000
}

const pad = (n: number) => String(n).padStart(2, '0')

/** YYYY-MM-DD of the day `t` falls on, on `zone`'s calendar. */
export function dateKey(t: Date, zone: string): string {
  const w = wall(t.getTime(), zone)
  return `${w.y}-${pad(w.m)}-${pad(w.d)}`
}

/** "YYYY-MM-DD HH:mm" on `zone`'s wall clock. */
export function wallTime(iso: string, zone: string): string {
  const w = wall(new Date(iso).getTime(), zone)
  return `${w.y}-${pad(w.m)}-${pad(w.d)} ${pad(w.h)}:${pad(w.mi)}`
}

/** The instant `hour:minute` on day `key` names on `zone`'s wall clock. Two passes, because the offset
 * at the first guess can differ across a DST switch; midnight that DST skips (Cairo, spring) resolves
 * to the day's first real instant, 01:00. */
export function wallToInstant(key: string, hour: number, minute: number, zone: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, hour, minute)
  return new Date(guess - offsetMs(guess - offsetMs(guess, zone), zone))
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Today on the user's clock: its date and the [start, end) instants. */
export function dayWindow(now: Date, zone: string): { date: string; start: Date; end: Date } {
  const date = dateKey(now, zone)
  return { date, start: wallToInstant(date, 0, 0, zone), end: wallToInstant(addDays(date, 1), 0, 0, zone) }
}

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

export interface EventRow {
  id: string
  title: string
  starts_at: string
  ends_at: string
  all_day: boolean
  task_id: string | null
}

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
  /** Open, not in Trash: starred, or not someday and (dated before `end`, or scheduled in [start, end)). */
  dayTasks(startIso: string, endIso: string): Promise<TaskRow[]>
  listTasks(f: TaskFilter): Promise<TaskRow[]>
  getTask(id: string): Promise<TaskRow | null>
  /** Not in Trash, by name. */
  projects(): Promise<ProjectRow[]>
  /** Not in Trash, overlapping [from, to), by start. */
  events(fromIso: string, toIso: string): Promise<EventRow[]>
  search(query: string, limit: number): Promise<SearchHit[]>
  /** Open, not in Trash, starred. */
  top3Count(): Promise<number>
  /** An open copy of a repeat already sits at `dueIso` (completion.ts openOccurrence). */
  openOccurrence(title: string, rule: string, dueIso: string, exceptId: string): Promise<boolean>
  insertTask(t: TaskRow): Promise<void>
  /** status todo → done; false when the task wasn't open any more. */
  markDone(id: string, atIso: string): Promise<boolean>
  setDue(id: string, dueIso: string): Promise<void>
  insertInbox(row: { id: string; raw_text: string; payload: Record<string, unknown> }): Promise<void>
  log(eventType: string, entityType: string, entityId: string, payload: Record<string, unknown>): Promise<void>
}

export interface ToolContext {
  store: Store
  zone: string
  now: Date
  /** rrule's next occurrence strictly after `from` (index.ts: npm:rrule; the test: the app's recurrence.ts). */
  nextOccurrence: (rule: string, from: Date) => Date | null
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

// ── what the model sees: compact, wall-clock times, nulls left out ───────────────────────────

function taskOut(t: TaskRow, zone: string, full = false): Record<string, unknown> {
  const o: Record<string, unknown> = { id: t.id, title: t.title }
  if (t.status !== 'todo') o.status = t.status
  if (t.due_at) o.due = wallTime(t.due_at, zone)
  if (t.scheduled_start) o.scheduled = wallTime(t.scheduled_start, zone) + (t.scheduled_end ? `–${wallTime(t.scheduled_end, zone).slice(11)}` : '')
  if (t.project_name) o.project = t.project_name
  if (t.labels?.length) o.labels = t.labels
  if (t.top3) o.top3 = true
  if (t.priority !== null) o.priority = t.priority
  if (t.someday) o.someday = true
  if (t.recurrence_rule) o.repeats = t.recurrence_rule
  if (t.completed_at) o.completed = wallTime(t.completed_at, zone)
  if (full) {
    if (t.notes) o.notes = t.notes
    if (t.duration_min !== null) o.duration_min = t.duration_min
    if (t.reminder_at) o.reminder = wallTime(t.reminder_at, zone)
    if (t.project_id) o.project_id = t.project_id
    if (t.parent_task_id) o.parent_task_id = t.parent_task_id
    if (t.paused) o.paused = true
    o.created = wallTime(t.created_at, zone)
  }
  return o
}

function eventOut(e: EventRow, zone: string): Record<string, unknown> {
  const o: Record<string, unknown> = { id: e.id, title: e.title, start: wallTime(e.starts_at, zone), end: wallTime(e.ends_at, zone) }
  if (e.all_day) o.all_day = true
  if (e.task_id) o.task_id = e.task_id
  return o
}

/** Today's open tasks, as the app sorts them (grouping.ts): Top 3 picks; due or scheduled today;
 * dated before today. Someday tasks only count when starred. */
export function splitToday(rows: readonly TaskRow[], now: Date, zone: string): { top3: TaskRow[]; today: TaskRow[]; overdue: TaskRow[] } {
  const day = dateKey(now, zone)
  const out = { top3: [] as TaskRow[], today: [] as TaskRow[], overdue: [] as TaskRow[] }
  for (const t of rows) {
    if (t.status !== 'todo') continue
    if (t.top3) {
      out.top3.push(t)
      continue
    }
    if (t.someday) continue
    const scheduledToday = !!t.scheduled_start && dateKey(new Date(t.scheduled_start), zone) === day
    const dated = t.due_at ?? t.scheduled_start
    const on = dated ? dateKey(new Date(dated), zone) : null
    if (scheduledToday || on === day) out.today.push(t)
    else if (on !== null && on < day) out.overdue.push(t)
  }
  return out
}

/** Polish F2a: a repeat's next copy reminds as far before its new due time as the original did. */
function nextReminderAt(reminderAt: string | null, fromDue: string, toDue: Date): string | null {
  if (!reminderAt) return null
  return new Date(toDue.getTime() - (new Date(fromDue).getTime() - new Date(reminderAt).getTime())).toISOString()
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
      const events = await ctx.store.events(start.toISOString(), end.toISOString())
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
      "Add a task to the user's task list. Only when the user asks for it. `due`: a date (YYYY-MM-DD, which means 09:00 that day) or a local date-time (YYYY-MM-DDTHH:mm) on the user's clock. `top3: true` makes it one of today's Top 3 (at most 3 open picks). Unsure where something belongs? Use add_to_inbox instead.",
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'What to do, short.' },
        due: dateArg('When it is due'),
        project_id: { ...id, description: 'File it in this project (ids from the projects tool).' },
        top3: { type: 'boolean', description: "Star it into today's Top 3." },
        notes: { type: 'string', description: 'Longer details.' },
      },
      required: ['title'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const title = text(a, 'title', 500, true)!
      const due = when(a, 'due', ctx.zone)
      const projectId = uuid(a, 'project_id')
      const top3 = flag(a, 'top3') ?? false
      const notes = text(a, 'notes', 10000) ?? null
      let project: ProjectRow | null = null
      if (projectId) {
        project = (await ctx.store.projects()).find((p) => p.id === projectId) ?? null
        if (!project) return bad(`No project with id ${projectId}. Call the projects tool for the ids.`)
      }
      if (top3 && (await ctx.store.top3Count()) >= MAX_TOP3) {
        return bad('Top 3 is full (3 open picks). Add it without top3, or ask the user which pick to swap out.')
      }
      const now = ctx.now.toISOString()
      const task: TaskRow = {
        id: crypto.randomUUID(),
        title,
        notes,
        status: 'todo',
        due_at: due ? ('at' in due ? due.at : wallToInstant(due.day, 9, 0, ctx.zone)).toISOString() : null,
        scheduled_start: null,
        scheduled_end: null,
        top3,
        someday: false,
        paused: false,
        labels: [],
        priority: null,
        duration_min: null,
        project_id: project?.id ?? null,
        // A task filed in a project carries the project's domain (tasks/api setProject).
        domain_id: project?.domain_id ?? null,
        area_id: null,
        milestone_id: null,
        parent_task_id: null,
        recurrence_rule: null,
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
      return { added: taskOut({ ...task, project_name: project?.name ?? null }, ctx.zone), timezone: ctx.zone }
    },
  },
  {
    name: 'complete_task',
    title: 'Complete task',
    description: "Mark an open task done (only when the user says it's done). A repeating task's next occurrence is created, as in the app.",
    inputSchema: { type: 'object', properties: { id: { ...id, description: 'The task id.' } }, required: ['id'], additionalProperties: false },
    write: true,
    async run(a, ctx) {
      const t = await openTask(ctx, uuid(a, 'id', true)!)
      const now = ctx.now.toISOString()
      // Plan the next occurrence before writing anything: a rule rrule can't read must not leave
      // the task done with its series silently ended.
      let next: TaskRow | null = null
      if (t.recurrence_rule && t.due_at) {
        const at = ctx.nextOccurrence(t.recurrence_rule, new Date(t.due_at))
        if (at && !(await ctx.store.openOccurrence(t.title, t.recurrence_rule, at.toISOString(), t.id))) {
          next = {
            ...t,
            id: crypto.randomUUID(),
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
    description: "Move an open task's due date to tomorrow 09:00 on the user's clock — the app's \"Tomorrow\".",
    inputSchema: { type: 'object', properties: { id: { ...id, description: 'The task id.' } }, required: ['id'], additionalProperties: false },
    write: true,
    async run(a, ctx) {
      const t = await openTask(ctx, uuid(a, 'id', true)!)
      const due = tomorrowAt9(ctx.now, ctx.zone)
      await ctx.store.setDue(t.id, due)
      await ctx.store.log('task.rescheduled', 'task', t.id, { due_at: due, source: 'mcp' })
      return { moved: taskOut({ ...t, due_at: due, someday: false }, ctx.zone), timezone: ctx.zone }
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
    description: "Calendar events between two dates (both included), on the user's clock. Defaults to today and the next 6 days; at most 31 days at once.",
    inputSchema: {
      type: 'object',
      properties: { from: dateArg('First day (default today)'), to: dateArg('Last day, included (default from + 6 days)') },
      additionalProperties: false,
    },
    write: false,
    async run(a, ctx) {
      const from: When = when(a, 'from', ctx.zone) ?? { day: dateKey(ctx.now, ctx.zone) }
      const firstDay = 'day' in from ? from.day : dateKey(from.at, ctx.zone)
      const to: When = when(a, 'to', ctx.zone) ?? { day: addDays(firstDay, 6) }
      const start = bound(from, 'from', ctx.zone)
      const end = bound(to, 'to', ctx.zone)
      if (end <= start) return bad('"to" must be on or after "from".')
      if (end.getTime() - start.getTime() > 32 * 86400_000) return bad('At most 31 days at once — ask for a shorter range.')
      const events = await ctx.store.events(start.toISOString(), end.toISOString())
      // `until` is exclusive: a `to` day ends at the next midnight.
      return { from: wallTime(start.toISOString(), ctx.zone), until: wallTime(end.toISOString(), ctx.zone), timezone: ctx.zone, events: events.map((e) => eventOut(e, ctx.zone)) }
    },
  },
  {
    name: 'projects',
    title: 'Projects',
    description: "The user's projects (not in Trash): id, name, status, type and target date. Use an id with list_tasks or add_task.",
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
