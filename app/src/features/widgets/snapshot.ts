import { cairoDateKey } from '../../lib/dateShortcuts'
import { isOverdue } from '../tasks/planMath'
import { isTodayTask, todayListTasks } from '../tasks/grouping'
import { BLOCK_SWATCHES, nearestSwatch, swatchValue } from '../calendar/blockHue'
import { remainingWork } from '../today/todayLayout'
import { computeStreak, computeTrellisDays, routinesForToday, localDateKey } from '../routines/streaks'
import { getSeason } from '../../lib/seasons'
import type { DayPhase } from '../today/dayPhase'
import type { CalendarEvent, Routine, RoutineCompletion, SlippingRow, Task } from '../../lib/types'

// The home-screen widgets' snapshot (Phone Widgets.dc.html): everything they draw, in one small
// JSON the Android shell keeps (native/android/java/.../widgets/Snap.java reads these exact keys).
// Pure — WidgetBridge feeds it the app's own reads. Times are epoch ms; the widgets format them on
// the user's clock (`zone`), and work out Now / Up next / the now line from `blocks` themselves, so
// those stay right between pushes. "Hide titles on the home screen" is applied here (mask).

/** The Memory widget's source word for what resurfaced (0078 added journal pages, quotes and notes). */
const RESURFACE_SOURCE = { task: 'Task', inbox: 'Inbox', journal_entry: 'Journal', quote: 'Quote', note: 'Note' } as const

export interface WidgetItem {
  id: string
  title: string
  start: number | null
  end: number | null
  done: boolean
}

/** A timed block today. `color`: its palette C swatch, lower case ('iris', 'rose' …), as the calendar draws it
 * (blockHue: its own colour, a pre-palette-C one as its new swatch, a custom one as the nearest swatch; none → the
 * kind's, Iris for a task or Time block, Rose for an event). `goal`: the goal's block (the gold rule and ✶). */
export interface WidgetBlock {
  id: string
  taskId: string
  title: string
  start: number
  end: number
  color: string
  goal: boolean
  done: boolean
}

export interface WidgetFocus {
  state: 'idle' | 'running' | 'paused'
  /** When a running round ends; 0 otherwise. */
  endsAt: number
  /** Seconds left (a paused round). */
  left: number
  roundMin: number
  taskId: string
  title: string
}

export interface WidgetSnapshot {
  v: 1
  at: number
  signedIn: boolean
  offline: boolean
  zone: string
  day: string
  dayN: number
  goal: WidgetItem | null
  picks: WidgetItem[]
  /** Today's tasks (the Today page's own section, not the Top 3): open ones first, then the ones done today. */
  tasks: WidgetItem[]
  /** Open tasks in Also open (not today's, not overdue). */
  alsoOpen: number
  /** The app's clock (Settings / the calendar's View options ▸ 24-hour time). */
  hour24: boolean
  plannedMin: number
  finishAt: number
  progress: { done: number; total: number }
  blocks: WidgetBlock[]
  /** Monday–Sunday of this week (and next): how many things each day holds. */
  week: { day: string; n: number }[]
  countdown: { title: string; at: number; route: string } | null
  focus: WidgetFocus
  routines: { id: string; title: string; done: boolean; week: number[] }[]
  bestStreak: number
  streak: { id: string; title: string; days: number; goal: number } | null
  inbox: number
  overdue: { count: number; oldestDays: number; titles: string[] }
  slipping: { title: string; days: number }[]
  ritual: { phase: DayPhase }
  journal: { line: string | null }
  memory: { text: string; when: string; source: string; route: string } | null
  specimen: { title: string; date: string; art: string } | null
  season: { name: string; weather: string | null; art: string }
}

export interface FocusInput {
  mode: 'pomodoro' | 'break' | 'stopwatch' | 'garden'
  isRunning: boolean
  secondsLeft: number
  roundMin: number
  taskId: string | null
}

export interface SnapshotInput {
  /** The minute clock the app reads. */
  now: Date
  /** The real clock (ms), for the focus round's end; defaults to `now`. */
  clock?: number
  zone: string
  online: boolean
  hideTitles: boolean
  /** lib/clock hour24(): the widgets show times the way the app does. */
  hour24?: boolean
  tasks: readonly Task[]
  events: readonly CalendarEvent[]
  /** Today's Top 3 in order, the goal first (today/top3Order dayTop3). */
  top3: readonly Task[]
  dayN: number
  phase: DayPhase
  focus: FocusInput
  routines: readonly Routine[]
  completions: readonly RoutineCompletion[]
  inbox: number
  slipping: readonly SlippingRow[]
  journalLine: string | null
  resurface: { title: string; createdAt: string; source: keyof typeof RESURFACE_SOURCE; route: string } | null
  /** The newest herbarium specimen (an archived project). */
  specimen: { title: string; at: string } | null
  weather: { tempC: number; condition: string } | null
}

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : null)
const isHex = (c: string | null | undefined): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c)

/** "3 Sep" / "Oct 3" — short dates in the user's zone. */
function shortDate(iso: string, zone: string, monthFirst = false): string {
  const parts = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: zone }).formatToParts(new Date(iso))
  const day = parts.find((p) => p.type === 'day')?.value ?? ''
  const month = parts.find((p) => p.type === 'month')?.value ?? ''
  return monthFirst ? `${month} ${day}` : `${day} ${month}`
}

function ago(iso: string, now: Date): string {
  const days = Math.round((now.getTime() - new Date(iso).getTime()) / 86_400_000)
  if (days < 1) return 'today'
  if (days < 2) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 45) return `${Math.round(days / 7)} weeks ago`
  if (days < 60) return 'a month ago'
  return `${Math.round(days / 30)} months ago`
}

const SEASON_ART = { spring: 'cherry_bloom', summer: 'daisy_midday', autumn: 'daisy_midday', winter: 'clover_seedling' } as const

export function buildSnapshot(i: SnapshotInput): WidgetSnapshot {
  const { now, tasks, events } = i
  const today = cairoDateKey(now)
  const t = now.getTime()
  const taskById = new Map(tasks.map((x) => [x.id, x] as const))
  const doneIds = new Set(tasks.filter((x) => x.status === 'done').map((x) => x.id))
  const live = events.filter((e) => !e.deleted_at)

  // ── Today's timed blocks (running, or starting today), in palette C as the calendar draws them ──
  const goalId = i.top3[0]?.id ?? null
  const hue = (e: CalendarEvent): string => {
    const own = swatchValue(e.color)
    if (!isHex(own)) return e.type === 'event' && !e.task_id ? 'rose' : 'iris' // blockHue KIND_HUE
    return (BLOCK_SWATCHES.find((sw) => sw.value.toLowerCase() === own.toLowerCase()) ?? nearestSwatch(own)).name.toLowerCase()
  }
  const blocks: WidgetBlock[] = live
    .filter((e) => !e.all_day && (cairoDateKey(new Date(e.starts_at)) === today || (ms(e.starts_at)! <= t && t < ms(e.ends_at)!)))
    .sort((a, b) => ms(a.starts_at)! - ms(b.starts_at)!)
    .map((e) => ({ id: e.id, taskId: e.task_id ?? '', title: e.title, start: ms(e.starts_at)!, end: ms(e.ends_at)!, color: hue(e), goal: !!e.task_id && e.task_id === goalId, done: !!e.task_id && doneIds.has(e.task_id) }))

  // ── The Top 3, each with its block's time today (else its own schedule) ──
  const item = (x: Task): WidgetItem => {
    const b = blocks.find((e) => e.taskId === x.id)
    return { id: x.id, title: x.title, start: b?.start ?? ms(x.scheduled_start), end: b?.end ?? ms(x.scheduled_end), done: x.status === 'done' || !!x.completed_at }
  }
  const goal = i.top3[0] ? item(i.top3[0]) : null
  const picks = i.top3.slice(1, 3).map(item)
  const work = remainingWork(i.top3.filter((x) => !x.completed_at), live, now, doneIds)

  const visible = todayListTasks([...tasks], now)
  // Today's tasks and Also open, apart (TodayPage): the Top 3 aside, overdue ones in their own fold.
  const top3Ids = new Set(i.top3.map((x) => x.id))
  const rest = visible.filter((x) => !top3Ids.has(x.id) && (x.completed_at || !isOverdue(x, now)))
  const todays = rest.filter((x) => isTodayTask(x, now) || (x.completed_at && cairoDateKey(new Date(x.completed_at)) === today))
  const todayItems = [...todays.filter((x) => !x.completed_at), ...todays.filter((x) => x.completed_at)].slice(0, 8).map(item)
  const alsoOpen = rest.filter((x) => !x.completed_at && !todays.includes(x)).length
  const doneToday = tasks.filter((x) => x.completed_at && cairoDateKey(new Date(x.completed_at)) === today).length
  const openToday = visible.filter((x) => !x.completed_at).length

  // ── The week, Monday first, two weeks of counts (the strip may roll over before the next push) ──
  const counts = new Map<string, number>()
  const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1)
  for (const e of live) bump(cairoDateKey(new Date(e.starts_at)))
  for (const x of tasks) if (x.status === 'todo' && !x.deleted_at && x.due_at && !live.some((e) => e.task_id === x.id)) bump(cairoDateKey(new Date(x.due_at)))
  const [y, m, d] = today.split('-').map(Number)
  const todayUtc = Date.UTC(y, m - 1, d)
  const monday = todayUtc - ((new Date(todayUtc).getUTCDay() + 6) % 7) * 86_400_000
  const week = Array.from({ length: 14 }, (_, k) => {
    const key = new Date(monday + k * 86_400_000).toISOString().slice(0, 10)
    return { day: key, n: counts.get(key) ?? 0 }
  })

  // ── Countdown: the most urgent dated task ahead, else the next all-day event ──
  // ponytail: no "pin a countdown" in the app yet — priority 1 with a date stands in for one.
  const ahead = (iso: string | null) => !!iso && cairoDateKey(new Date(iso)) > today
  const urgent = tasks
    .filter((x) => x.status === 'todo' && !x.deleted_at && x.priority === 1 && ahead(x.due_at))
    .sort((a, b) => ms(a.due_at)! - ms(b.due_at)!)[0]
  const allDay = live.filter((e) => e.all_day && ahead(e.starts_at)).sort((a, b) => ms(a.starts_at)! - ms(b.starts_at)!)[0]
  const countdown = urgent
    ? { title: urgent.title, at: ms(urgent.due_at)!, route: `/today?task=${urgent.id}` }
    : allDay
      ? { title: allDay.title, at: ms(allDay.starts_at)!, route: `/calendar?date=${cairoDateKey(new Date(allDay.starts_at))}` }
      : null

  // ── Focus ──
  const f = i.focus
  const inRound = f.mode === 'pomodoro' && (f.isRunning || f.secondsLeft < f.roundMin * 60)
  const focusTask = f.taskId ? taskById.get(f.taskId) : undefined
  const focus: WidgetFocus = {
    state: inRound ? (f.isRunning ? 'running' : 'paused') : 'idle',
    endsAt: inRound && f.isRunning ? (i.clock ?? t) + f.secondsLeft * 1000 : 0,
    left: inRound ? f.secondsLeft : 0,
    roundMin: f.roundMin,
    taskId: f.taskId ?? '',
    title: focusTask?.title ?? '',
  }

  // ── Routines: today's, each with its last seven days (sage = grew, petal = rained) ──
  const datesOf = (r: Routine) => i.completions.filter((c) => c.routine_id === r.id).map((c) => c.completed_on)
  const todayKey = localDateKey(now)
  const dueToday = routinesForToday([...i.routines], [...i.completions], now)
  const routines = dueToday.map((r) => ({
    id: r.id,
    title: r.name,
    done: datesOf(r).includes(todayKey),
    week: computeTrellisDays(datesOf(r), r.cadence, 7, now).map((day) => (day.state === 'grew' ? 2 : day.state === 'rained' ? 1 : 0)),
  }))
  const streaks = i.routines.filter((r) => r.active).map((r) => ({ r, s: computeStreak(datesOf(r), r.cadence, now) }))
  const top = streaks.filter((x) => x.s.current > 0).sort((a, b) => b.s.current - a.s.current)[0]

  // ── Triage ──
  const overdue = tasks.filter((x) => x.status === 'todo' && !x.deleted_at && !x.completed_at && isOverdue(x, now))
  // Days on the user's clock (taskDisplay's daysOverdue counts on the device's).
  const dayMs = (key: string) => Date.parse(`${key}T00:00:00Z`)
  const oldest = overdue.reduce((max, x) => Math.max(max, x.due_at ? Math.round((dayMs(today) - dayMs(cairoDateKey(new Date(x.due_at)))) / 86_400_000) : 0), 0)
  const byAge = [...overdue].sort((a, b) => ms(a.due_at)! - ms(b.due_at)!)

  const season = getSeason(now)
  const snap: WidgetSnapshot = {
    v: 1,
    at: t,
    signedIn: true,
    offline: !i.online,
    zone: i.zone,
    day: today,
    dayN: i.dayN,
    goal,
    picks,
    tasks: todayItems,
    alsoOpen,
    hour24: !!i.hour24,
    plannedMin: work.minutes,
    finishAt: work.finishAt.getTime(),
    progress: { done: doneToday, total: doneToday + openToday },
    blocks,
    week,
    countdown,
    focus,
    routines,
    bestStreak: streaks.reduce((max, x) => Math.max(max, x.s.best), 0),
    streak: top ? { id: top.r.id, title: top.r.name, days: top.s.current, goal: top.r.goal_days ?? 0 } : null,
    inbox: i.inbox,
    overdue: { count: overdue.length, oldestDays: oldest, titles: byAge.slice(0, 2).map((x) => x.title) },
    slipping: i.slipping.slice(0, 3).map((r) => ({ title: r.entity_name, days: r.days_since })),
    ritual: { phase: i.phase },
    journal: { line: i.journalLine },
    memory: i.resurface
      ? { text: i.resurface.title, when: shortDate(i.resurface.createdAt, i.zone), source: `${RESURFACE_SOURCE[i.resurface.source]} · ${ago(i.resurface.createdAt, now)}`, route: i.resurface.route }
      : null,
    specimen: i.specimen ? { title: i.specimen.title, date: shortDate(i.specimen.at, i.zone, true), art: 'wisteria_p80' } : null,
    season: {
      name: season[0].toUpperCase() + season.slice(1),
      weather: i.weather ? `${i.weather.tempC}° ${i.weather.condition}` : null,
      art: SEASON_ART[season],
    },
  }
  return i.hideTitles ? mask(snap) : snap
}

/** "Hide titles on the home screen": names become what they are ("Your goal", "A pick"…). */
export function mask(s: WidgetSnapshot): WidgetSnapshot {
  const goalId = s.goal?.id
  return {
    ...s,
    goal: s.goal && { ...s.goal, title: 'Your goal' },
    picks: s.picks.map((p, n) => ({ ...p, title: `Pick ${n + 2}` })),
    tasks: s.tasks.map((t) => ({ ...t, title: 'A task' })),
    blocks: s.blocks.map((b) => ({ ...b, title: b.taskId && b.taskId === goalId ? 'Your goal' : b.taskId ? 'A task' : 'Busy' })),
    countdown: s.countdown && { ...s.countdown, title: 'Countdown' },
    focus: { ...s.focus, title: s.focus.title ? 'Your focus' : '' },
    routines: s.routines.map((r) => ({ ...r, title: 'A routine' })),
    streak: s.streak && { ...s.streak, title: 'Routine' },
    overdue: { ...s.overdue, titles: [] },
    slipping: s.slipping.map((r) => ({ ...r, title: 'Something quiet' })),
    journal: { line: null },
    memory: s.memory && { ...s.memory, text: 'Something from a while ago' },
    specimen: s.specimen && { ...s.specimen, title: 'A finished project' },
  }
}
