// The desktop widgets' feed (Rainmeter skins, ./index.ts): today's plan for one user, compact. Pure — no
// Deno APIs — so the app's vitest runs it (app/src/features/settings/widgetFeed.test.ts). index.ts reads the
// rows (one query per entity, as that user); this file applies the app's own rules on the user's clock:
//
//   Top 3, goal   _shared/today.ts (top3Rule): open picks, goal first; a pick finished today keeps its place
//                 (today/top3Order.ts top3Display: the goal, then open picks, then finished ones)
//   tasks         mcp/tools.ts splitToday — due or scheduled today, not a pick, not overdue
//   progress      today/todayLayout.ts dayCounts: done today ÷ (done today + today's open work)
//   plant         lib/growthStages.ts cherryStage — the Tasks/Today plant, from the same two counts
//   now / next    today/todayLayout.ts runningBlock + upNext.ts: a timed block running now whose task isn't
//                 done (the latest started), then the next two to start today
//   load          today/todayLayout.ts dayLoad — today-v2's over warning: the open Top 3 and today's other
//                 blocks inside what's left of 09:00–18:00 (rituals/ritualLogic DAY_FROM–DAY_TO)
//   colour        calendar/blockHue.ts, as the calendar draws a block: palette C's swatch, a colour saved
//                 before palette C as its new swatch, a custom hex as itself, none → Iris (task / Time
//                 block) or Rose (event)
//   names=0       widgets/snapshot.ts mask: "Your goal" · "Pick 2" · "A task" · "Busy"
import { dateKey, dayWindow, wallTime, wallToInstant } from '../_shared/zone.ts'
import { splitToday, type EventRow, type TaskRow } from '../mcp/tools.ts'

/** Palette C (calendar/blockHue.ts BLOCK_SWATCHES), the day hex a block stores. */
export const PALETTE_C: readonly string[] = [
  '#E58F99', '#E29572', '#C9A658', '#A0B569', '#72BF8E', '#47BFC5', '#81ADED', '#B59CE3',
  '#B36670', '#B16C4C', '#9C7B31', '#768A42', '#4A9266', '#0D9298', '#5A81BC', '#8972B3',
]
/** The nine swatches saved before palette C → the swatch each draws as (blockHue nearestSwatch; the test
 * checks it against the app's). */
export const LEGACY_TO_C: Readonly<Record<string, string>> = {
  '#a8a0be': '#B59CE3', '#8a9a7e': '#768A42', '#7a946e': '#768A42', '#b5654a': '#B16C4C', '#d4a8b0': '#E58F99',
  '#9ab4be': '#47BFC5', '#d4c78a': '#C9A658', '#c9a0a0': '#E58F99', '#c9a55a': '#C9A658',
}
const IRIS = '#B59CE3'
const ROSE = '#E58F99'
const HEX = /^#[0-9a-f]{6}$/i

export type FeedEvent = Pick<EventRow, 'id' | 'title' | 'starts_at' | 'ends_at' | 'all_day' | 'task_id' | 'type'> & { color?: string | null }

/** The hex a block is drawn in. */
export function blockColor(e: Pick<FeedEvent, 'color' | 'type' | 'task_id'>): string {
  const c = e.color?.trim()
  if (c && HEX.test(c)) return PALETTE_C.find((s) => s.toLowerCase() === c.toLowerCase()) ?? LEGACY_TO_C[c.toLowerCase()] ?? c.toUpperCase()
  return e.type === 'event' && !e.task_id ? ROSE : IRIS
}

/** lib/growthStages.ts cherryStage. */
export function cherryStage(open: number, doneToday: number): 'bud' | 'opening' | 'bloom' | 'fallen' {
  if (open === 0 && doneToday === 0) return 'bud'
  if (open === 0) return 'fallen'
  if (doneToday === 0) return 'opening'
  return 'bloom'
}

/** Plan my day's working window (rituals/ritualLogic DAY_FROM / DAY_TO), minutes past midnight. */
export const DAY_FROM = 9 * 60
export const DAY_TO = 18 * 60
/** Calls per link per hour (index.ts). Four skins refreshing every minute is 240. */
export const HOURLY_LIMIT = 300
/** Today's open tasks listed (the rest are counted in tasks_more). */
export const TASKS_SHOWN = 20

const ms = (iso: string) => Date.parse(iso)
const sec = (iso: string) => Math.floor(ms(iso) / 1000)
const inProgress = (e: FeedEvent, t: number) => ms(e.starts_at) <= t && t < ms(e.ends_at)

/** Minutes past the user's midnight on `day`, clamped to the day (a block from yesterday starts at 0). */
function dayMin(iso: string, day: string, zone: string): number {
  const [d, hm] = wallTime(iso, zone).split(' ')
  if (d < day) return 0
  if (d > day) return 1440
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

export interface FeedInput {
  now: Date
  zone: string
  /** Open tasks around today (mcp/store.ts dayTasks). */
  open: readonly TaskRow[]
  /** Tasks completed today (not in Trash). */
  doneToday: readonly TaskRow[]
  /** Today's calendar, repeats expanded (_shared/series.ts expandSeries). */
  events: readonly FeedEvent[]
  names: boolean
  canTick: boolean
}

export function buildFeed(i: FeedInput) {
  const { now, zone } = i
  const t = now.getTime()
  const { date, start } = dayWindow(now, zone)
  const split = splitToday(i.open, now, zone)

  // ── Top 3: open picks + today's finished ones that kept a place, the goal first (top3Display) ──
  const rank = (x: TaskRow) => x.top3_rank ?? Infinity
  const donePicks = i.doneToday.filter((x) => x.top3_rank != null)
  const all = [...split.top3, ...donePicks].sort((a, b) => (rank(a) === rank(b) ? 0 : rank(a) < rank(b) ? -1 : 1))
  const [goalRow, ...rest] = all
  const top3Rows = goalRow ? [goalRow, ...rest.filter((x) => x.status === 'todo'), ...rest.filter((x) => x.status !== 'todo')].slice(0, 3) : []
  const goalId = goalRow?.id ?? null

  // ── Blocks: timed, today's (or running now) ──
  const doneIds = new Set(i.doneToday.map((x) => x.id))
  const timed = i.events
    .filter((e) => !e.all_day && ms(e.ends_at) > ms(start.toISOString()) && (dateKey(new Date(e.starts_at), zone) === date || inProgress(e, t)))
    .sort((a, b) => ms(a.starts_at) - ms(b.starts_at))
  const live = timed.filter((e) => !(e.task_id && doneIds.has(e.task_id)))
  let running: FeedEvent | null = null
  for (const e of live) if (inProgress(e, t) && (!running || ms(e.starts_at) > ms(running.starts_at))) running = e
  const next = live.filter((e) => ms(e.starts_at) > t).slice(0, 2)

  // ── Counts: progress, plant, over-planned ──
  const openToday = split.top3.length + split.today.length
  const done = i.doneToday.length
  const total = done + openToday
  const dayAt = (min: number) => wallToInstant(date, Math.floor(min / 60), min % 60, zone).getTime()
  const from = Math.max(t, dayAt(DAY_FROM))
  const to = dayAt(DAY_TO)
  const upNext = live.filter((e) => ms(e.ends_at) > t)
  const left = (e: FeedEvent) => Math.max(0, Math.min(to, ms(e.ends_at)) - Math.max(from, ms(e.starts_at))) / 60_000
  const pickIds = new Set(split.top3.map((x) => x.id))
  let planned = 0
  for (const p of split.top3) {
    const b = upNext.find((e) => e.task_id === p.id)
    planned += b ? left(b) : (p.duration_min ?? 0)
  }
  for (const e of upNext) if (!(e.task_id && pickIds.has(e.task_id))) planned += left(e)
  const free = Math.round(Math.max(0, (to - from) / 60_000))
  planned = Math.round(planned)

  // ── Out ──
  const title = (x: TaskRow, masked: string) => (i.names ? x.title : masked)
  const item = (x: TaskRow, masked: string) => ({ id: x.id, title: title(x, masked), done: x.status !== 'todo', priority: x.priority ?? null })
  const blockTitle = (e: FeedEvent) => (i.names ? e.title : e.task_id && e.task_id === goalId ? 'Your goal' : e.task_id ? 'A task' : 'Busy')
  const block = (e: FeedEvent) => ({
    title: blockTitle(e),
    start: sec(e.starts_at),
    end: sec(e.ends_at),
    start_hm: wallTime(e.starts_at, zone).slice(11),
    end_hm: wallTime(e.ends_at, zone).slice(11),
    color: blockColor(e),
    kind: e.type ?? 'event',
    task_id: e.task_id ?? null,
    is_goal: !!e.task_id && e.task_id === goalId,
  })
  return {
    v: 1,
    updated_at: now.toISOString(),
    now: Math.floor(t / 1000),
    zone,
    date,
    goal: goalRow ? item(goalRow, 'Your goal') : null,
    top3: top3Rows.map((x, n) => item(x, n === 0 ? 'Your goal' : `Pick ${n + 1}`)),
    tasks: split.today.slice(0, TASKS_SHOWN).map((x) => item(x, 'A task')),
    tasks_more: Math.max(0, split.today.length - TASKS_SHOWN),
    overdue: split.overdue.length,
    now_block: running ? block(running) : null,
    next_blocks: next.map(block),
    day: timed.map((e) => ({
      start: sec(e.starts_at),
      end: sec(e.ends_at),
      from_min: dayMin(e.starts_at, date, zone),
      to_min: Math.max(dayMin(e.starts_at, date, zone), dayMin(e.ends_at, date, zone)),
      color: blockColor(e),
      is_goal: !!e.task_id && e.task_id === goalId,
      done: !!e.task_id && doneIds.has(e.task_id),
    })),
    progress: total ? Math.round((done / total) * 1000) / 1000 : 0,
    done,
    total,
    plant: cherryStage(openToday, done),
    load: { planned_min: planned, free_min: free, over_min: Math.max(0, planned - free) },
    can_tick: i.canTick,
  }
}

export type Feed = ReturnType<typeof buildFeed>

