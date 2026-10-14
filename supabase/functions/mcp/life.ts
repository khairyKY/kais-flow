// The MCP tools for the rest of a day (docs/MCP.md): routines and their streaks, focus rounds, the
// two rituals (Plan my day, Shut down), the Library, and the insights (the week, Slipping, Activity).
// Pure, like ./tools.ts; each write restates the app's own (features/<f>/api.ts, named on each).
import { addDays, dateKey, dayWindow, loopDay, wallTime, wallToInstant } from '../_shared/zone.ts'
import {
  bad,
  choice,
  clockArg,
  completeTask,
  dayArg,
  flag,
  id,
  idList,
  logIt,
  openTask,
  replanTask,
  ritualTrace,
  seededTaskIds,
  settle,
  splitToday,
  taskOut,
  text,
  tomorrowAt9,
  uuid,
  whole,
  words,
  type Args,
  type Row,
  type TaskRow,
  type ToolContext,
  type ToolDef,
} from './tools.ts'

const list = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : [])
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

// ── routines (features/routines) ────────────────────────────────────────────────────────────────

const weekday = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay()
const MAX_LOOKBACK_DAYS = 3650

/** A routine's streak on the user's days (features/routines/streaks.ts computeStreak, restated —
 * mcpFull.test.ts holds it to the app's): only scheduled days count; one missed scheduled day per
 * calendar month rains instead of breaking it; today, not done yet, doesn't break it. */
export function streakOf(dates: readonly string[], weekdays: readonly number[], todayKey: string): { current: number; best: number } {
  const completed = new Set(dates)
  if (!weekdays.length) return { current: 0, best: 0 }
  const scheduled = (k: string) => weekdays.includes(weekday(k))
  let current = 0
  const rained = new Set<string>()
  let key = todayKey
  if (scheduled(key) && !completed.has(key)) key = addDays(key, -1) // the day isn't over
  for (let steps = 0; steps < MAX_LOOKBACK_DAYS; steps++, key = addDays(key, -1)) {
    if (!scheduled(key)) continue
    if (completed.has(key)) current++
    else if (rained.has(key.slice(0, 7))) break
    else rained.add(key.slice(0, 7))
  }
  let best = 0
  if (completed.size) {
    let run = 0
    let rain = new Set<string>()
    key = [...completed].sort()[0]
    for (let steps = 0; key <= todayKey && steps < MAX_LOOKBACK_DAYS; steps++, key = addDays(key, 1)) {
      if (!scheduled(key)) continue
      if (completed.has(key)) best = Math.max(best, ++run)
      else if (key !== todayKey) {
        if (rain.has(key.slice(0, 7))) {
          run = 0
          rain = new Set()
        } else rain.add(key.slice(0, 7))
      }
    }
  }
  return { current, best: Math.max(best, current) }
}

const cadenceOf = (r: Row): number[] => list((r.cadence as Row | null)?.weekdays).map(Number)

async function routineRows(ctx: ToolContext, includeArchived: boolean): Promise<Row[]> {
  const today = dateKey(ctx.now, ctx.zone)
  const routines = (await ctx.store.find('routines', {}, { order: 'name' })).filter((r) => includeArchived || r.active)
  const completions = await ctx.store.find('routine_completions', {})
  return routines.map((r) => {
    const dates = completions.filter((c) => c.routine_id === r.id).map((c) => String(c.completed_on).slice(0, 10))
    const days = cadenceOf(r)
    const steps = list(r.steps).map((s, i) => ({ text: typeof s === 'string' ? s : String((s as Row)?.text ?? ''), ...(typeof list(r.step_minutes)[i] === 'number' ? { minutes: list(r.step_minutes)[i] } : {}) }))
    return {
      id: r.id,
      name: r.name,
      ...(r.description ? { description: r.description } : {}),
      days: days.length === 7 ? 'every day' : days.map((d) => WEEKDAYS[d]),
      ...(r.time_of_day ? { time_of_day: r.time_of_day } : {}),
      ...(r.clock_time ? { clock_time: String(r.clock_time).slice(0, 5) } : {}),
      ...(steps.length ? { steps } : {}),
      scheduled_today: days.includes(weekday(today)),
      done_today: dates.includes(today),
      streak: streakOf(dates, days, today),
      ...(r.goal_days ? { goal_days: r.goal_days } : {}),
      ...(r.challenge_start ? { challenge: { start: r.challenge_start, end: r.challenge_end } } : {}),
      ...(r.plant ? { plant: r.plant } : {}),
      ...(r.active ? {} : { archived: true }),
    }
  })
}

const PLANTS = ['vine', 'cherry', 'fern', 'clover', 'daisy'] as const

/** `days`: weekday names (["mon","wed"]) or ["every day"] → the cadence's weekdays (0 = Sunday). */
function daysArg(a: Args): number[] | undefined {
  const d = words(a, 'days', 7, 9)
  if (d === undefined) return undefined
  if (d.length === 1 && /^every ?day$|^daily$/i.test(d[0])) return [0, 1, 2, 3, 4, 5, 6]
  const out = d.map((x) => WEEKDAYS.indexOf(x.toLowerCase().slice(0, 3)))
  if (!out.length || out.some((x) => x < 0)) return bad('"days" takes weekday names (mon … sun) or ["every day"].')
  return [...new Set(out)].sort()
}

/** `steps`: [{text, minutes?}] → the two aligned columns (routines/newRoutine.ts writeSteps). */
function stepsArg(a: Args): { steps: string[]; minutes: (number | null)[] } | undefined {
  const v = a.steps
  if (v === undefined) return undefined
  if (v === null) return { steps: [], minutes: [] }
  if (!Array.isArray(v) || v.length > 30) return bad('"steps" must be a list of at most 30 steps, each {text, minutes?}.')
  const parsed = v.map((s) => {
    const o = (typeof s === 'string' ? { text: s } : s) as Row
    const t = typeof o?.text === 'string' ? o.text.trim() : ''
    if (!t || t.length > 200) return bad('Each step needs "text" (at most 200 characters).')
    const m = o.minutes === undefined || o.minutes === null ? null : typeof o.minutes === 'number' && Number.isInteger(o.minutes) && o.minutes >= 1 && o.minutes <= 600 ? o.minutes : bad('A step\'s "minutes" is a whole number from 1 to 600.')
    return { t, m }
  })
  return { steps: parsed.map((p) => p.t), minutes: parsed.some((p) => p.m !== null) ? parsed.map((p) => p.m) : [] }
}

// ── focus (features/focus): the round itself is a device timer; what the server sees is its time entry ──

/** An assistant's round, told apart from the app's own entries by its note; it runs until its ended_at. */
const FOCUS_NOTE = 'Focus round (assistant)'

async function runningRound(ctx: ToolContext): Promise<Row | null> {
  const rounds = await ctx.store.find('time_entries', { note: FOCUS_NOTE }, { order: 'started_at', desc: true, limit: 5 })
  return rounds.find((r) => typeof r.ended_at === 'string' && Date.parse(r.ended_at) > ctx.now.getTime()) ?? null
}

// ── rituals (features/rituals): Loop B's traces are activity rows ──────────────────────────────────

const PLAN_STEPS = ['overdue', 'inbox', 'top3', 'block'] as const

async function ritualSteps(ctx: ToolContext, ritual: 'morning' | 'evening', steps: readonly string[], date: string): Promise<void> {
  for (const step of steps) await logIt(ctx, 'ritual.step_completed', 'ritual', `${ritual}-${date}`, { ritual, step, date })
  await logIt(ctx, 'ritual.finished', 'ritual', `${ritual}-${date}`, { ritual, date, steps: [...steps] })
}

/** A task to `due` (09:00 that day, no time) — the rituals' Today / Tomorrow, through the one replan. */
async function planTo(ctx: ToolContext, t: TaskRow, due: string): Promise<TaskRow> {
  return (await replanTask(ctx, t, due, false)).task
}

// ── the Library (features/library) ──────────────────────────────────────────────────────────────

const LIB_TABLE = { book: 'books', note: 'notes', quote: 'quotes' } as const
const LIB_FIELDS = {
  book: ['title', 'author', 'published_year', 'total_pages', 'current_page', 'status'],
  note: ['title', 'body', 'tags', 'book_id'],
  quote: ['text', 'author', 'source', 'page', 'tags', 'book_id'],
} as const

function libOut(kind: 'book' | 'note' | 'quote', r: Row): Row {
  if (kind === 'book') return { id: r.id, title: r.title, ...(r.author ? { author: r.author } : {}), ...(r.published_year ? { year: r.published_year } : {}), page: `${r.current_page}/${r.total_pages}`, status: r.status }
  if (kind === 'note') {
    const body = String(r.body ?? '')
    return { id: r.id, ...(r.title ? { title: r.title } : {}), body: body.length > 600 ? `${body.slice(0, 600)}…` : body, ...(list(r.tags).length ? { tags: r.tags } : {}), ...(r.book_id ? { book_id: r.book_id } : {}) }
  }
  return { id: r.id, text: r.text, ...(r.author ? { author: r.author } : {}), ...(r.source ? { source: r.source } : {}), ...(r.page ? { page: r.page } : {}), ...(list(r.tags).length ? { tags: r.tags } : {}), ...(r.book_id ? { book_id: r.book_id } : {}) }
}

// ── insights ────────────────────────────────────────────────────────────────────────────────────

/** The week's first day for this weekend (rituals/reviewWeek.ts weekStartDay): the day after it. */
export function weekStartDay(weekend: readonly number[]): number {
  const on = new Set(weekend)
  const last = [...on].find((d) => !on.has((d + 1) % 7))
  return last === undefined ? 0 : (last + 1) % 7
}

/** Activity rows about the journal or people reach only a key allowed them. */
function activityAllowed(r: { event_type: string; entity_type: string }, ctx: ToolContext): boolean {
  const journal = r.entity_type === 'journal_entry' || r.event_type.startsWith('journal.')
  const people = r.entity_type === 'people' || r.entity_type === 'person' || r.event_type.startsWith('people.') || r.event_type === 'notify.birthday'
  return (!journal || ctx.scopes.has('journal')) && (!people || ctx.scopes.has('people'))
}

export const LIFE_TOOLS: readonly ToolDef[] = [
  {
    name: 'routines',
    title: 'Routines',
    description: "The user's routines: days, time, steps (with minutes), whether today is one of its days and it's done, its streak (current and best — one missed day a month is forgiven, as in the app), goal and challenge. Archived ones only with include_archived.",
    inputSchema: { type: 'object', properties: { include_archived: { type: 'boolean' } }, additionalProperties: false },
    write: false,
    async run(a, ctx) {
      return { date: dateKey(ctx.now, ctx.zone), timezone: ctx.zone, routines: await routineRows(ctx, flag(a, 'include_archived') ?? false) }
    },
  },
  {
    name: 'save_routine',
    title: 'Save routine',
    description:
      'Create a routine (no id) or change one (id; give only what changes) — only when the user asks. days: weekday names or ["every day"]; time_of_day: morning, afternoon, evening or a word of their own; clock_time: HH:MM (it reminds then); steps: [{text, minutes?}] (the whole list); goal_days: a streak goal; challenge_start + challenge_end: a challenge window (its days become the goal); plant: vine, cherry, fern, clover or daisy. active false archives it (true brings it back).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { ...id, description: 'The routine to change; leave out to create one.' },
        name: { type: 'string' },
        description: { type: ['string', 'null'] },
        days: { type: 'array', items: { type: 'string' }, description: 'Weekday names (mon … sun) or ["every day"] (default).' },
        time_of_day: { type: ['string', 'null'] },
        clock_time: { type: ['string', 'null'], description: 'HH:MM, 24h.' },
        steps: { type: ['array', 'null'], items: { type: 'object', properties: { text: { type: 'string' }, minutes: { type: 'integer', minimum: 1, maximum: 600 } }, required: ['text'] } },
        goal_days: { type: ['integer', 'null'], minimum: 1, maximum: 3650 },
        challenge_start: { type: 'string', description: 'YYYY-MM-DD.' },
        challenge_end: { type: 'string', description: 'YYYY-MM-DD.' },
        domain_id: { type: ['string', 'null'], format: 'uuid' },
        plant: { type: 'string', enum: [...PLANTS] },
        active: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const rid = uuid(a, 'id')
      const values: Row = {}
      if ('name' in a || !rid) values.name = text(a, 'name', 200, true)
      if ('description' in a) values.description = text(a, 'description', 2000) ?? null
      const days = daysArg(a)
      if (days) values.cadence = { weekdays: days }
      if ('time_of_day' in a) values.time_of_day = text(a, 'time_of_day', 30) ?? null
      const clock = clockArg(a, 'clock_time')
      if (clock !== undefined) values.clock_time = clock
      const steps = stepsArg(a)
      if (steps) Object.assign(values, { steps: steps.steps, step_minutes: steps.minutes })
      if ('goal_days' in a) values.goal_days = a.goal_days === null ? null : whole(a, 'goal_days', 1, 3650, 30)
      const cs = dayArg(a, 'challenge_start', ctx.zone)
      const ce = dayArg(a, 'challenge_end', ctx.zone)
      if (!!cs !== !!ce) return bad('A challenge takes "challenge_start" and "challenge_end".')
      if (cs && ce) {
        if (ce < cs) return bad('"challenge_end" must be on or after "challenge_start".')
        // routines/api createChallenge: the window's days are the streak goal too (0046).
        Object.assign(values, { challenge_start: cs, challenge_end: ce, ...('goal_days' in a ? {} : { goal_days: Math.round((Date.parse(ce) - Date.parse(cs)) / 86_400_000) + 1 }) })
      }
      if ('domain_id' in a) {
        const did = uuid(a, 'domain_id') ?? null
        if (did) {
          const [d] = await ctx.store.find('domains', { id: did, deleted_at: null }, { limit: 1 })
          if (!d) return bad(`No domain with id ${did}. The projects tool lists them.`)
        }
        values.domain_id = did
      }
      if ('plant' in a) values.plant = choice(a, 'plant', PLANTS, 'vine')
      const active = flag(a, 'active')
      if (!rid) {
        if (active === false) return bad('A new routine starts active.')
        const row: Row = { id: crypto.randomUUID(), cadence: { weekdays: [0, 1, 2, 3, 4, 5, 6] }, active: true, steps: [], step_minutes: [], ...values }
        // 0072: description is sent only once there is one (a server without it never sees the column).
        if (!row.description) delete row.description
        await ctx.store.insert('routines', row)
        await logIt(ctx, 'routine.created', 'routine', row.id as string, { name: row.name, time_of_day: row.time_of_day ?? null, ...(cs ? { challenge: true, goal_days: row.goal_days } : {}) })
        return { created: (await routineRows(ctx, true)).find((r) => r.id === row.id) ?? { id: row.id, name: row.name } }
      }
      const [r] = await ctx.store.find('routines', { id: rid }, { limit: 1 })
      if (!r) return bad(`No routine with id ${rid}. The routines tool lists them.`)
      if (active !== undefined && active !== r.active) values.active = active
      const keys = Object.keys(values).filter((k) => JSON.stringify(values[k] ?? null) !== JSON.stringify(r[k] ?? null))
      if (!keys.length) return { saved: (await routineRows(ctx, true)).find((x) => x.id === rid), changed: [] }
      await ctx.store.patch('routines', { id: rid }, Object.fromEntries(keys.map((k) => [k, values[k]])))
      // routines/api updateRoutine / archiveRoutine / restoreRoutine.
      const name = (values.name ?? r.name) as string
      if (keys.some((k) => k !== 'active')) await logIt(ctx, 'routine.updated', 'routine', rid, { name })
      if (keys.includes('active')) await logIt(ctx, values.active ? 'routine.restored' : 'routine.archived', 'routine', rid, { name })
      return { saved: (await routineRows(ctx, true)).find((x) => x.id === rid), changed: keys.map((k) => (k === 'active' ? (values.active ? 'active again' : 'archived') : k)) }
    },
  },
  {
    name: 'check_routine',
    title: 'Check routine',
    description: "Tick a routine off for today — or another day (date) — or take the tick back (done: false). Only when the user says they did it.",
    inputSchema: {
      type: 'object',
      properties: { id: { ...id, description: 'The routine.' }, done: { type: 'boolean', description: 'true (default) ticks it; false takes the tick back.' }, date: { type: 'string', description: 'YYYY-MM-DD (default today, the user\'s day).' } },
      required: ['id'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const rid = uuid(a, 'id', true)!
      const done = flag(a, 'done') ?? true
      const today = dateKey(ctx.now, ctx.zone)
      const date = dayArg(a, 'date', ctx.zone) ?? today
      if (date > today) return bad("A routine can't be ticked for a day that hasn't come yet.")
      const [r] = await ctx.store.find('routines', { id: rid }, { limit: 1 })
      if (!r) return bad(`No routine with id ${rid}. The routines tool lists them.`)
      if (!r.active) return bad(`"${r.name}" is archived: save_routine with active true brings it back.`)
      // routines/api toggleCompletion: one row per (routine, day).
      const [existing] = await ctx.store.find('routine_completions', { routine_id: rid, completed_on: date }, { limit: 1 })
      let changed: string[] = []
      if (done && !existing) {
        await ctx.store.insert('routine_completions', { id: crypto.randomUUID(), routine_id: rid, completed_on: date })
        await logIt(ctx, 'routine.checked', 'routine', rid, { date })
        changed = [`ticked for ${date}`]
      } else if (!done && existing) {
        await ctx.store.remove('routine_completions', { id: existing.id })
        await logIt(ctx, 'routine.unchecked', 'routine', rid, { date })
        changed = [`tick taken back for ${date}`]
      }
      return { routine: (await routineRows(ctx, true)).find((x) => x.id === rid), changed }
    },
  },
  {
    name: 'start_focus',
    title: 'Start focus',
    description:
      "Start a focus round on an open task (only when the user asks): it's logged as time on the task (and its project) from now for `minutes` (default 25). stop_focus ends it early. The app's own Focus timer on a device is separate — this records the round, it doesn't start a device's timer.",
    inputSchema: {
      type: 'object',
      properties: { task_id: { ...id, description: 'The task to focus on.' }, minutes: { type: 'integer', minimum: 1, maximum: 180, description: 'How long (default 25).' } },
      required: ['task_id'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const t = await openTask(ctx, uuid(a, 'task_id', true)!)
      const minutes = whole(a, 'minutes', 1, 180, 25)
      const running = await runningRound(ctx)
      if (running) return bad(`A focus round is already running until ${wallTime(running.ended_at as string, ctx.zone)}: stop_focus ends it first.`)
      const ends = new Date(ctx.now.getTime() + minutes * 60_000).toISOString()
      // projects/api logTimeEntry, as a round the Focus page logs: the task and its project.
      const entry = { id: crypto.randomUUID(), project_id: t.project_id, task_id: t.id, note: FOCUS_NOTE, duration_min: minutes, started_at: ctx.now.toISOString(), ended_at: ends }
      await ctx.store.insert('time_entries', entry)
      await logIt(ctx, 'project.work_logged', 'project', t.project_id ?? t.id, { note: FOCUS_NOTE, duration_min: minutes, time_entry_id: entry.id, task_id: t.id })
      return { focus: { task: taskOut(t, ctx.zone), minutes, until: wallTime(ends, ctx.zone) }, timezone: ctx.zone }
    },
  },
  {
    name: 'stop_focus',
    title: 'Stop focus',
    description: 'End the running focus round now (only when the user asks): its time becomes what was actually spent. complete_task: true also ticks the task off, like the Focus page\'s Check off.',
    inputSchema: { type: 'object', properties: { complete_task: { type: 'boolean' } }, additionalProperties: false },
    write: true,
    async run(a, ctx) {
      const finish = flag(a, 'complete_task') ?? false
      const r = await runningRound(ctx)
      if (!r) return bad('No focus round from an assistant is running (one that ran its full time is already logged).')
      const spent = Math.max(1, Math.ceil((ctx.now.getTime() - Date.parse(r.started_at as string)) / 60_000))
      await ctx.store.patch('time_entries', { id: r.id }, { duration_min: spent, ended_at: ctx.now.toISOString() })
      await logIt(ctx, 'project.work_edited', 'project', (r.project_id ?? r.task_id) as string, { time_entry_id: r.id, duration_min: spent })
      const t = r.task_id ? await ctx.store.getTask(r.task_id as string) : null
      const done = finish && t && t.status === 'todo' ? await completeTask(ctx, t) : null
      return { stopped: { minutes: spent, ...(t ? { task: taskOut(done?.done ?? t, ctx.zone) } : {}), ...(done?.next ? { next: taskOut(done.next, ctx.zone) } : {}) }, timezone: ctx.zone }
    },
  },
  {
    name: 'plan_my_day',
    title: 'Plan my day',
    description:
      "The morning ritual's Start the day (only when the user asks): carry each overdue task to today, tomorrow or Someday (carry), then make `top3` (task ids, at most 3, the first one the goal of the day) today's Top 3 — any other pick is taken out; an overdue pick comes to today. The ritual is then marked done for today. The today tool shows what to plan (overdue, Top 3, last night's seeds).",
    inputSchema: {
      type: 'object',
      properties: {
        carry: { type: 'array', maxItems: 50, items: { type: 'object', properties: { id: id, to: { type: 'string', enum: ['today', 'tomorrow', 'someday'] } }, required: ['id', 'to'] } },
        top3: { type: 'array', maxItems: 3, items: { type: 'string', format: 'uuid' }, description: "Today's Top 3 in order — the first is the goal." },
      },
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const carry = a.carry === undefined ? [] : Array.isArray(a.carry) && a.carry.length <= 50 ? (a.carry as unknown[]) : bad('"carry" is a list of {id, to}.')
      const moves = carry.map((c) => {
        const o = (c ?? {}) as Args
        return { id: uuid(o, 'id', true)!, to: choice(o, 'to', ['today', 'tomorrow', 'someday'] as const, 'today') }
      })
      const picks = a.top3 === undefined ? null : Array.isArray(a.top3) && a.top3.length === 0 ? [] : idList(a, 'top3', 3)
      const day = dayWindow(ctx.now, ctx.zone)
      const today9 = wallToInstant(day.date, 9, 0, ctx.zone).toISOString()
      // Read every task before writing anything.
      const carried = await Promise.all(moves.map(async (m) => ({ ...m, task: await openTask(ctx, m.id) })))
      // A pick comes out of Someday, as a star does (tasks/api flipTop3).
      if (picks) await Promise.all(picks.map((p) => openTask(ctx, p)))
      const out: Row = { carried: [] as Row[] }
      // Carry-over (MorningRitual choose): Today and Tomorrow are 09:00, Someday parks it.
      for (const c of carried) {
        let t = c.task
        if (c.to === 'someday') {
          t = settle(t, { ...t, someday: true }, ctx.now, ctx.zone)
          await ctx.store.updateTask(t)
          await logIt(ctx, 'task.someday_set', 'task', t.id, { someday: true })
        } else t = await planTo(ctx, t, c.to === 'today' ? today9 : tomorrowAt9(ctx.now, ctx.zone))
        ;(out.carried as Row[]).push({ ...taskOut(t, ctx.zone), to: c.to })
      }
      if (picks) {
        // Start the day: top3Diff — unstar every pick not chosen, star the chosen (an overdue one comes
        // to today, ruling 3), then rank them in pick order (the first the goal, tasks.top3_rank).
        const starredNow = await ctx.store.find('tasks', { top3: true, status: 'todo', deleted_at: null })
        for (const s of starredNow.filter((x) => !picks.includes(x.id as string))) {
          await ctx.store.patch('tasks', { id: s.id }, { top3: false, top3_rank: null })
          await logIt(ctx, 'task.unstarred', 'task', s.id as string)
        }
        const top: TaskRow[] = []
        for (const [i, p] of picks.entries()) {
          let t = (await ctx.store.getTask(p))!
          const dated = t.due_at ?? t.scheduled_start
          if (dated && Date.parse(dated) < day.start.getTime()) t = await planTo(ctx, t, today9)
          const was = t.top3
          const later = dated && Date.parse(dated) >= day.end.getTime()
          let next: TaskRow = { ...t, top3: true, top3_rank: i + 1, someday: false }
          if (!was && later) {
            const [h, mi] = wallTime(dated!, ctx.zone).slice(11).split(':').map(Number)
            next = { ...next, due_at: wallToInstant(day.date, h, mi, ctx.zone).toISOString() }
          }
          next = settle(t, next, ctx.now, ctx.zone)
          await ctx.store.updateTask(next)
          if (!was) await logIt(ctx, 'task.starred', 'task', t.id)
          top.push(next)
        }
        out.top3 = top.map((t) => taskOut(t, ctx.zone))
      }
      await ritualSteps(ctx, 'morning', PLAN_STEPS, loopDay(ctx.now, ctx.zone))
      return { ...out, plan_my_day_done: true, timezone: ctx.zone }
    },
  },
  {
    name: 'shut_down',
    title: 'Shut down',
    description:
      "The evening ritual's Close the day (only when the user asks): roll unfinished tasks to tomorrow 09:00 (roll), plant tomorrow's 3 (seeds — at most 3; the morning's Plan my day starts from them; a seed still on today's plate rolls to tomorrow too), optionally save one line about today to the journal (line — only a key allowed the journal), and mark the ritual done. Past midnight (before 04:00) it still closes the day being lived.",
    inputSchema: {
      type: 'object',
      properties: {
        roll: { type: 'array', maxItems: 50, items: { type: 'string', format: 'uuid' }, description: 'Tasks to roll to tomorrow 09:00.' },
        seeds: { type: 'array', maxItems: 3, items: { type: 'string', format: 'uuid' }, description: "Tomorrow's 3 (replaces tonight's earlier seeds)." },
        line: { type: 'string', description: "One line about today, saved to the journal (a journal key only)." },
      },
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const roll = a.roll === undefined ? [] : idList(a, 'roll', 50)
      const seeds = a.seeds === undefined ? null : Array.isArray(a.seeds) && a.seeds.length === 0 ? [] : idList(a, 'seeds', 3)
      const line = text(a, 'line', 2000)
      if (line && !ctx.scopes.has('journal')) return bad("\"line\" goes to the journal, which this key can't reach: the user can switch Journal on for this key in Settings → AI assistants. Leave out \"line\".")
      // The loop day (rituals/loopDay.ts): before 04:00 it is still the day being closed.
      const day = loopDay(ctx.now, ctx.zone)
      const forDate = addDays(day, 1)
      const tomorrow9 = wallToInstant(forDate, 9, 0, ctx.zone).toISOString()
      const rolling = await Promise.all(roll.map((r) => openTask(ctx, r)))
      const seeding = seeds ? await Promise.all(seeds.map((s) => openTask(ctx, s))) : []
      const rolled: Row[] = []
      for (const t of rolling) rolled.push(taskOut(await planTo(ctx, t, tomorrow9), ctx.zone))
      const out: Row = { rolled }
      if (seeds) {
        // closeDay: seed every star not yet seeded, take back seeds no longer starred, and roll a seed
        // still open on today's plate (Today's own list) to tomorrow 09:00.
        const trace = await ritualTrace(ctx)
        const seeded = seededTaskIds(trace.rows, forDate)
        const payload = { ritual: 'evening', step: 'seeds', for_date: forDate, date: day }
        for (const s of seeds.filter((x) => !seeded.includes(x))) await logIt(ctx, 'ritual.seeded', 'task', s, payload)
        for (const s of seeded.filter((x) => !seeds.includes(x))) await logIt(ctx, 'ritual.unseeded', 'task', s, payload)
        const { start, end } = dayWindow(ctx.now, ctx.zone)
        const plate = splitToday(await ctx.store.dayTasks(start.toISOString(), end.toISOString()), ctx.now, ctx.zone)
        const onPlate = new Set([...plate.top3, ...plate.today, ...plate.overdue].map((t) => t.id))
        for (const t of seeding) {
          if (!onPlate.has(t.id) || roll.includes(t.id)) continue
          rolled.push(taskOut(await planTo(ctx, (await ctx.store.getTask(t.id))!, tomorrow9), ctx.zone))
        }
        out.seeds = seeding.map((t) => ({ id: t.id, title: t.title }))
      }
      if (line) {
        // EveningRitual saveLine → journal/api upsertJournalEntry for the loop day; the event says a
        // line was written, never what it says.
        const entry = { id: crypto.randomUUID(), body: line, entry_date: day, mood: null, transcript: null, media_paths: [], gratitude: [] }
        await ctx.store.insert('journal_entries', entry)
        await logIt(ctx, 'journal.created', 'journal_entry', entry.id, { entry_date: day })
        await logIt(ctx, 'journal.line_added', 'ritual', day, { date: day })
        out.line_saved = { journal_entry_id: entry.id, date: day }
      }
      await ritualSteps(ctx, 'evening', ['sweep', ...(line ? ['line'] : []), 'seeds', 'goodnight'], day)
      return { ...out, shut_down_done: true, seeds_for: forDate, timezone: ctx.zone }
    },
  },
  {
    name: 'library',
    title: 'Library',
    description: "The user's Library: books (with reading progress), notes and quotes — all, or one kind; `query` narrows them to the ones whose words contain it.",
    inputSchema: {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['books', 'notes', 'quotes', 'all'] }, query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 100, description: 'At most this many of each (default 50).' } },
      additionalProperties: false,
    },
    write: false,
    async run(a, ctx) {
      const kind = choice(a, 'kind', ['books', 'notes', 'quotes', 'all'] as const, 'all')
      const q = text(a, 'query', 200)?.toLowerCase()
      const limit = whole(a, 'limit', 1, 100, 50)
      const hit = (r: Row) => !q || JSON.stringify([r.title, r.author, r.body, r.text, r.source, r.tags]).toLowerCase().includes(q)
      const out: Row = {}
      for (const [k, kindOne] of [['books', 'book'], ['notes', 'note'], ['quotes', 'quote']] as const) {
        if (kind !== 'all' && kind !== k) continue
        const rows = await ctx.store.find(LIB_TABLE[kindOne], {}, k === 'books' ? { order: 'title' } : { order: 'created_at', desc: true })
        out[k] = rows.filter(hit).slice(0, limit).map((r) => libOut(kindOne, r))
      }
      return out
    },
  },
  {
    name: 'save_library_item',
    title: 'Save Library item',
    description:
      'Add a book, note or quote (no id), or change one (id; give only what changes) — only when the user asks. book: title, author, published_year, total_pages, current_page (reading progress; reaching the last page finishes it), status (reading or finished). note: title, body, tags, book_id. quote: text, author, source, page, tags, book_id.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['book', 'note', 'quote'] },
        id: { ...id, description: 'The item to change; leave out to add one.' },
        title: { type: ['string', 'null'] },
        author: { type: ['string', 'null'] },
        published_year: { type: ['integer', 'null'], minimum: 0, maximum: 3000 },
        total_pages: { type: 'integer', minimum: 1, maximum: 100000 },
        current_page: { type: 'integer', minimum: 0, maximum: 100000 },
        status: { type: 'string', enum: ['reading', 'finished'] },
        body: { type: 'string' },
        text: { type: 'string' },
        source: { type: ['string', 'null'] },
        page: { type: ['string', 'null'] },
        tags: { type: ['array', 'null'], items: { type: 'string' } },
        book_id: { type: ['string', 'null'], format: 'uuid' },
      },
      required: ['kind'],
      additionalProperties: false,
    },
    write: true,
    async run(a, ctx) {
      const kind = choice(a, 'kind', ['book', 'note', 'quote'] as const, 'note')
      const allowed: readonly string[] = LIB_FIELDS[kind]
      const stray = Object.keys(a).filter((k) => !['kind', 'id', ...allowed].includes(k))
      if (stray.length) return bad(`A ${kind} takes ${allowed.join(', ')} — not ${stray.join(', ')}.`)
      const iid = uuid(a, 'id')
      const table = LIB_TABLE[kind]
      const v: Row = {}
      if ('title' in a) v.title = text(a, 'title', 500, kind === 'book') ?? null
      if ('author' in a) v.author = text(a, 'author', 200) ?? null
      if ('published_year' in a) v.published_year = a.published_year === null ? null : whole(a, 'published_year', 0, 3000, 2000)
      if ('total_pages' in a) v.total_pages = whole(a, 'total_pages', 1, 100000, 100)
      if ('current_page' in a) v.current_page = whole(a, 'current_page', 0, 100000, 0)
      if ('status' in a) v.status = choice(a, 'status', ['reading', 'finished'] as const, 'reading')
      if ('body' in a) v.body = text(a, 'body', 20000, true)
      if ('text' in a) v.text = text(a, 'text', 5000, true)
      if ('source' in a) v.source = text(a, 'source', 300) ?? null
      if ('page' in a) v.page = text(a, 'page', 20) ?? null
      if ('tags' in a) v.tags = words(a, 'tags') ?? []
      if ('book_id' in a) {
        const bid = uuid(a, 'book_id') ?? null
        if (bid && !(await ctx.store.find('books', { id: bid }, { limit: 1 })).length) return bad(`No book with id ${bid}. The library tool lists them.`)
        v.book_id = bid
      }
      if (!iid) {
        // library/api createBook / createNote / createQuote.
        const base: Row =
          kind === 'book' ? { title: v.title ?? bad('"title" is required.'), author: null, published_year: null, current_page: 0, total_pages: 100, status: 'reading' }
          : kind === 'note' ? { title: null, body: v.body ?? bad('"body" is required.'), tags: [], domain_id: null, book_id: null }
          : { text: v.text ?? bad('"text" is required.'), author: null, source: null, tags: [], book_id: null, page: null }
        const row: Row = { id: crypto.randomUUID(), ...base, ...v }
        if (kind === 'book') row.current_page = Math.min(row.current_page as number, row.total_pages as number)
        await ctx.store.insert(table, row)
        await logIt(ctx, `${kind}.created`, kind, row.id as string, kind === 'book' ? { title: row.title } : kind === 'note' ? { title: row.title } : { author: row.author, source: row.source })
        return { added: libOut(kind, row) }
      }
      const [r] = await ctx.store.find(table, { id: iid }, { limit: 1 })
      if (!r) return bad(`No ${kind} with id ${iid}. The library tool lists them.`)
      const keys = Object.keys(v).filter((k) => JSON.stringify(v[k] ?? null) !== JSON.stringify(r[k] ?? null))
      if (!keys.length) return { saved: libOut(kind, r), changed: [] }
      const next = { ...r, ...v }
      if (kind === 'book' && keys.some((k) => k === 'current_page' || k === 'status')) {
        // library/api updateBookProgress: capped at the last page, which finishes it unless a status is given.
        next.current_page = Math.min(next.current_page as number, next.total_pages as number)
        if (!('status' in v)) next.status = (next.current_page as number) >= (next.total_pages as number) ? 'finished' : r.status
      }
      await ctx.store.patch(table, { id: iid }, Object.fromEntries(Object.keys(v).concat(kind === 'book' ? ['current_page', 'status'] : []).map((k) => [k, next[k]])))
      const progress = kind === 'book' && keys.every((k) => k === 'current_page' || k === 'status')
      await logIt(ctx, progress ? 'book.progress_updated' : `${kind}.updated`, kind, iid, progress ? { current_page: next.current_page, status: next.status } : kind === 'quote' ? {} : { title: next.title })
      return { saved: libOut(kind, next), changed: keys }
    },
  },
  {
    name: 'delete_library_item',
    title: 'Delete Library item',
    description:
      "Remove a book, note or quote — for good: the Library has no Trash (the app's Remove deletes too, with only a moment's Undo). Ask the user to confirm first. The answer holds everything it was, so it can be added back; a book's notes and quotes stay, unlinked.",
    inputSchema: {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['book', 'note', 'quote'] }, id: { ...id, description: 'The item.' } },
      required: ['kind', 'id'],
      additionalProperties: false,
    },
    write: true,
    destructive: true,
    async run(a, ctx) {
      const kind = choice(a, 'kind', ['book', 'note', 'quote'] as const, 'note')
      const iid = uuid(a, 'id', true)!
      const [gone] = await ctx.store.remove(LIB_TABLE[kind], { id: iid })
      if (!gone) return bad(`No ${kind} with id ${iid}. The library tool lists them.`)
      await logIt(ctx, `${kind}.deleted`, kind, iid)
      const { user_id: _u, ...was } = gone
      return { deleted: { kind, ...was } }
    },
  },
  {
    name: 'insights',
    title: 'Insights',
    description:
      "How things are going: this week so far (tasks done and added, focus minutes, routine check-ins, captures — the week starts the day after the user's weekend), what's Slipping (domains, projects and areas untouched longer than the user's threshold), and every active routine's streak.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    write: false,
    async run(_a, ctx) {
      const [s] = await ctx.store.find('app_settings', {}, { limit: 1 })
      const weekend = Array.isArray(s?.weekend_days) ? (s.weekend_days as number[]) : [0, 6]
      const today = dateKey(ctx.now, ctx.zone)
      const back = (weekday(today) - weekStartDay(weekend) + 7) % 7
      const from = addDays(today, -back)
      const stats = await ctx.store.weekStats(wallToInstant(from, 0, 0, ctx.zone).toISOString(), ctx.now.toISOString(), from, today)
      const threshold = typeof s?.slipping_default_days === 'number' ? s.slipping_default_days : 7
      const slipping = (await ctx.store.find('slipping', {}))
        .filter((r) => Number(r.days_since) > threshold)
        .sort((x, y) => Number(y.days_since) - Number(x.days_since))
        .map((r) => ({ type: r.entity_type, id: r.entity_id, name: r.entity_name, days_since: r.days_since }))
      const streaks = (await routineRows(ctx, false)).map((r) => ({ id: r.id, name: r.name, streak: r.streak, done_today: r.done_today }))
      return { timezone: ctx.zone, week: { from, through: today, ...stats }, slipping_after_days: threshold, slipping, streaks }
    },
  },
  {
    name: 'activity',
    title: 'Activity',
    description: "The user's recent activity, newest first — what was added, done, moved, captured, reminded — the log Slipping, streaks and the digests read. Filter by `type` (an event like task.completed, or a prefix like task.) and `since` (a date).",
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'An event type (task.completed) or a prefix ending in a dot (task.).' },
        since: { type: 'string', description: 'YYYY-MM-DD: only from that day on.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'At most this many (default 30).' },
      },
      additionalProperties: false,
    },
    write: false,
    async run(a, ctx) {
      const type = text(a, 'type', 60)
      const since = dayArg(a, 'since', ctx.zone)
      const limit = whole(a, 'limit', 1, 100, 30)
      // Over-read: rows about the journal or people are dropped for a key that may not see them.
      const rows = await ctx.store.activity({
        ...(type ? (type.endsWith('.') ? { prefix: type } : { types: [type] }) : {}),
        ...(since ? { since: wallToInstant(since, 0, 0, ctx.zone).toISOString() } : {}),
        limit: Math.min(300, limit * 3),
      })
      return {
        timezone: ctx.zone,
        activity: rows
          .filter((r) => activityAllowed(r, ctx))
          .slice(0, limit)
          .map((r) => {
            const { source, entity_key, ...payload } = (r.payload ?? {}) as Row
            return { at: wallTime(r.created_at, ctx.zone), event: r.event_type, entity_type: r.entity_type, entity_id: entity_key ?? r.entity_id, ...(source ? { by: source } : {}), ...(Object.keys(payload).length ? { details: payload } : {}) }
          }),
      }
    },
  },
]
