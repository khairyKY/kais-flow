import { cairoDateKey, tomorrowHint } from '../../lib/dateShortcuts'
import { cairoTimeKey } from '../calendar/eventTime'
import { fromMin, type Busy } from '../../components/pickerMath'
import { filterByList } from '../tasks/grouping'
import { addDaysToKey, MAX_SEEDS, seedTargetDate } from './loopDay'
import type { InboxItem, Task } from '../../lib/types'

// ── The pure half of Plan my day (Plan.dc.html 6a–6m) and Shut down (Shutdown.dc.html 8a–8h):
// which rows each section lists, the suggested times, the workload line, and what Close the day
// writes. No React, no Supabase; every clock rule reads Cairo's wall clock (B2), whatever the
// device zone. The screens (MorningRitual / EveningRitual) only render these. ──

/** The suggested-times day and its mini timeline: 09:00–18:00 Cairo (SCREENS §Plan ruling 5). */
export const DAY_FROM = 9 * 60
export const DAY_TO = 18 * 60

const dayNum = (key: string) => Date.parse(`${key}T00:00:00Z`) / 86_400_000
/** Calendar days from key `a` to key `b` (positive = b is later). */
export const daysBetween = (a: string, b: string) => Math.round(dayNum(b) - dayNum(a))
const dueKey = (t: Task) => (t.due_at ? cairoDateKey(new Date(t.due_at)) : null)
const weekdayOf = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
const up15 = (m: number) => Math.ceil(m / 15) * 15

/** "2h 10m" · "45m" · "5h" — the spoken lengths on the workload line and the headers. */
export function span(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** "Sun 27 Sep" on Cairo's calendar — the rituals' header date. */
export function headerDate(now: Date): string {
  const k = cairoDateKey(now)
  const d = new Date(`${k}T12:00:00Z`)
  return `${weekdayOf(k)} ${d.getUTCDate()} ${d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}`
}

/** Minutes since Cairo midnight. */
export const cairoMin = (d: Date) => {
  const [h, m] = cairoTimeKey(d).split(':').map(Number)
  return h * 60 + m
}

// ── Plan my day ──

export type CarryChoice = 'today' | 'tomorrow' | 'someday'
/** One Carry-over row in the draft: the due date it came in with (so "Overdue 64d" stays on the
 * row after its choice moved it) and the choice made, if any. */
export interface CarryEntry {
  id: string
  due: string | null
  choice?: CarryChoice
}

/** Carry-over = the open tasks strictly past their date (Tasks' Overdue list). The rows it opened
 * with stay listed (a choice moves a task off "overdue", but the row keeps showing the choice);
 * anything newly overdue joins at the end; done and deleted tasks leave. */
export function carryRows(tasks: readonly Task[], draft: readonly CarryEntry[], now: Date): CarryEntry[] {
  const open = new Map(tasks.filter((t) => t.status === 'todo').map((t) => [t.id, t]))
  const kept = draft.filter((e) => open.has(e.id))
  const known = new Set(draft.map((e) => e.id))
  const fresh = filterByList([...tasks], 'overdue', now).filter((t) => !known.has(t.id)).map((t) => ({ id: t.id, due: t.due_at ?? t.scheduled_start }))
  return [...kept, ...fresh]
}

/** "From yesterday" · "Overdue 64d" — how late a carried row came in. */
export function carryMeta(due: string | null, now: Date): string | null {
  if (!due) return null
  const days = daysBetween(cairoDateKey(new Date(due)), cairoDateKey(now))
  return days === 1 ? 'From yesterday' : days > 1 ? `Overdue ${days}d` : null
}

/** Pick your 3's rows (ruling 3–4): last night's seeds, then what's already starred, then what's
 * due today, then the rest of the week by date — never a carried row (it's starred in place), at
 * most `cap` rows but every pick always shown. */
export function pickCandidates(tasks: readonly Task[], seeds: readonly Task[], picks: readonly string[], carried: ReadonlySet<string>, now: Date, cap = 4): Task[] {
  const today = cairoDateKey(now)
  const open = tasks.filter((t) => t.status === 'todo' && !t.deleted_at && !t.someday && !carried.has(t.id))
  const byDue = (a: Task, b: Task) => (a.due_at ?? '').localeCompare(b.due_at ?? '')
  const week = filterByList([...open], 'week', now).sort(byDue)
  const ordered = [...new Map([...seeds, ...open.filter((t) => t.top3), ...week.filter((t) => dueKey(t) === today), ...week].filter((t) => !carried.has(t.id)).map((t) => [t.id, t])).values()]
  const shown = ordered.slice(0, cap)
  // A pick from further down (typed in, or picked from "All tasks") joins the end.
  const byId = new Map(open.map((t) => [t.id, t]))
  const extra = picks.filter((id) => !shown.some((t) => t.id === id)).map((id) => byId.get(id)).filter((t): t is Task => !!t)
  return [...shown, ...extra]
}

/** A pick's time, as the user left it: a start (minutes into the Cairo day) + length, or null =
 * "No time" (the time picker's footer ghost). No entry = still just a suggestion. */
export interface Chosen {
  at: number | null
  dur: number
}

export interface PickIn {
  id: string
  dur: number
  /** The pick already has a block on today's calendar (minutes into the day). */
  booked?: { start: number; end: number }
}

export type SlotKind = 'suggested' | 'accepted' | 'booked' | 'untimed' | 'noslot'
export interface Slot {
  id: string
  kind: SlotKind
  start: number
  end: number
  /** The slot starts right as this calendar event ends ("after Deep work"). */
  after?: string
  /** Ends after 18:00 ("Runs past 18:00", amber). */
  late: boolean
}

/** Suggested times (ruling 5; Kai: the plan ALWAYS suggests times): each pick, in pick order, gets
 * the earliest free start on today's calendar from 09:00 (or the next quarter after `nowMin`),
 * before 18:00, that fits its length before the next busy block — past 18:00 only when nothing
 * follows it. Accepted, booked and earlier suggestions count as busy for the ones after. No start
 * left → "noslot" (the row turns into "Pick one"). */
export function suggestTimes(picks: readonly PickIn[], busy: readonly Busy[], chosen: Readonly<Record<string, Chosen>>, nowMin: number): Slot[] {
  const taken: { start: number; end: number; title?: string }[] = busy.map((b) => ({ ...b }))
  const out: Slot[] = []
  const late = (end: number) => end > DAY_TO
  // Fixed ones first (they hold their place whatever order), then the rest fill around them.
  for (const p of picks) {
    const c = chosen[p.id]
    if (p.booked) out.push({ id: p.id, kind: 'booked', ...p.booked, late: late(p.booked.end) })
    else if (c && c.at != null) {
      out.push({ id: p.id, kind: 'accepted', start: c.at, end: c.at + c.dur, late: late(c.at + c.dur) })
      taken.push({ start: c.at, end: c.at + c.dur })
    } else if (c) out.push({ id: p.id, kind: 'untimed', start: 0, end: 0, late: false })
  }
  const from = Math.max(DAY_FROM, up15(nowMin))
  for (const p of picks) {
    if (out.some((s) => s.id === p.id)) continue
    const starts = [from, ...taken.map((b) => up15(b.end))].filter((s) => s >= from && s < DAY_TO).sort((a, b) => a - b)
    const start = starts.find((s) => !taken.some((b) => b.start < s + p.dur && b.end > s))
    if (start == null) {
      out.push({ id: p.id, kind: 'noslot', start: 0, end: 0, late: false })
      continue
    }
    const before = busy.find((b) => b.end === start)
    out.push({ id: p.id, kind: 'suggested', start, end: start + p.dur, after: before ? before.title.split(' — ')[0] : undefined, late: late(start + p.dur) })
    taken.push({ start, end: start + p.dur })
  }
  const order = new Map(picks.map((p, i) => [p.id, i]))
  return out.sort((a, b) => order.get(a.id)! - order.get(b.id)!)
}

export interface Workload {
  text: string
  /** Minutes past the day's capacity (09:00–18:00 from now), 0 when it fits. */
  over: number
}

/** The footer's workload line (ruling 6, MK Workload): the calendar still ahead today plus every
 * pick that isn't already a block, against what's left of 09:00–18:00. "You'll finish" = the end
 * of the last block or placed slot, with anything unplaced added after it, rounded up to 10 min. */
export function planWorkload(busy: readonly Busy[], picks: readonly PickIn[], slots: readonly Slot[], nowMin: number): Workload {
  const from = Math.max(nowMin, DAY_FROM)
  const ahead = busy.filter((b) => b.end > from)
  const meetings = ahead.reduce((n, b) => n + b.end - Math.max(b.start, from), 0)
  const loose = picks.filter((p) => !p.booked)
  const pickMin = loose.reduce((n, p) => n + p.dur, 0)
  const planned = meetings + pickMin
  if (planned === 0) return { text: 'Nothing planned yet · the day is open', over: 0 }
  const placed = slots.filter((s) => s.kind === 'suggested' || s.kind === 'accepted')
  const unplaced = loose.filter((p) => !placed.some((s) => s.id === p.id)).reduce((n, p) => n + p.dur, 0)
  const lastEnd = Math.max(from, ...ahead.map((b) => b.end), ...placed.map((s) => s.end))
  const finish = Math.ceil((lastEnd + unplaced) / 10) * 10
  const over = Math.max(0, planned - Math.max(0, DAY_TO - from), ...placed.map((s) => s.end - DAY_TO))
  if (loose.length > 0 && placed.length === 0 && slots.every((s) => s.kind === 'noslot' || s.kind === 'booked')) {
    const n = loose.length
    return { text: `~${span(meetings)} of meetings · ${n === 1 ? "the pick doesn't" : `the ${n} picks don't`} fit`, over }
  }
  return { text: `~${span(planned)} planned · you${over ? "'d" : "'ll"} finish around ${fromMin(finish)}`, over }
}

/** The footer's mono status (6a/6b/6f): mid-way through deciding the carry-over, how many are
 * decided; otherwise the picks and how many have a time. */
export function planStatus(carry: readonly CarryEntry[], picks: number, timed: number): string {
  const decided = carry.filter((e) => e.choice).length
  if (decided > 0 && decided < carry.length) return `${decided} of ${carry.length} decided`
  return picks > 0 ? `${picks} picked · ${timed} timed` : '0 picked'
}

/** A 4th star: the swap puts the new one in the last seat, the goal (first) always stays. */
export function withPick(picks: readonly string[], id: string): { picks: string[]; full: boolean } {
  if (picks.includes(id)) return { picks: picks.filter((p) => p !== id), full: false }
  if (picks.length < MAX_SEEDS) return { picks: [...picks, id], full: false }
  return { picks: [...picks], full: true }
}
export const swapIn = (picks: readonly string[], id: string): string[] => [...picks.slice(0, MAX_SEEDS - 1), id]

/** An inbox row's capture meta (ruling 7): "Voice · last night 23:10", "Typed · Fri". */
export function captureMeta(item: Pick<InboxItem, 'kind' | 'created_at'>, now: Date): string {
  const how = item.kind === 'voice' ? 'Voice' : item.kind === 'email' ? 'Email' : item.kind === 'github_issue' ? 'GitHub' : 'Typed'
  const at = new Date(item.created_at)
  const k = cairoDateKey(at)
  const days = daysBetween(k, cairoDateKey(now))
  const hhmm = cairoTimeKey(at)
  const when =
    days <= 0 ? `today ${hhmm}` : days === 1 ? (cairoMin(at) >= 18 * 60 ? `last night ${hhmm}` : 'yesterday') : days < 7 ? weekdayOf(k) : `${Number(k.slice(8))} ${new Date(`${k}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}`
  return `${how} · ${when}`
}

/** Plan my day's four sections, in order, as the morning ritual's logged steps (the ids the
 * activity log and the Today card already count — rituals/api RITUAL_STEP_COUNT). */
export const PLAN_STEPS = ['overdue', 'inbox', 'top3', 'block'] as const
export const SHUT_STEPS = ['sweep', 'line', 'seeds', 'goodnight'] as const
const STEP_NAME: Record<string, string> = { overdue: 'Carry-over', inbox: 'Inbox', top3: 'Pick your 3', block: 'Suggested times', sweep: 'Sweep', line: 'One line', seeds: "Tomorrow's 3", goodnight: 'Close the day' }

/** The Today card's Resume meta (6m): "~1 min left" · "Pick your 3 next". */
export function resumeMeta(kind: 'morning' | 'evening', logged: ReadonlySet<string>): string[] {
  const steps: readonly string[] = kind === 'morning' ? PLAN_STEPS : SHUT_STEPS
  const left = steps.filter((s) => !logged.has(s))
  const minutes = Math.max(1, Math.floor(((kind === 'morning' ? 3 : 2) * left.length) / steps.length))
  return left.length ? [`~${minutes} min left`, `${STEP_NAME[left[0]]} next`] : []
}

// ── Shut down ──

/** The Sweep's rows (ruling 1): today's plate still open (Today's own list: starred, scheduled
 * today or due by today), in the order first seen, plus every row touched on this screen — done
 * or rolled rows stay, showing the choice, so a second tap can take it back. */
export function sweepRows(tasks: readonly Task[], seen: readonly string[], touched: ReadonlySet<string>, now: Date): { rows: Task[]; seen: string[] } {
  const plate = filterByList([...tasks], 'today', now)
  const onPlate = new Set(plate.map((t) => t.id))
  const ids = [...seen, ...plate.map((t) => t.id).filter((id) => !seen.includes(id))]
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const rows = ids.map((id) => byId.get(id)).filter((t): t is Task => !!t && !t.deleted_at && (onPlate.has(t.id) || touched.has(t.id)))
  return { rows, seen: ids }
}

export interface Suggestion {
  task: Task
  why: string
}

/** Tomorrow's 3 suggestions (ruling 2): due tomorrow → today's leftovers (Top 3 first) → starred
 * elsewhere → due later this week. Leftovers read "Left today" even once rolled to tomorrow. */
export function tomorrowSuggestions(tasks: readonly Task[], sweep: readonly Task[], now: Date, cap = 5): Suggestion[] {
  const today = cairoDateKey(now)
  const tomorrow = addDaysToKey(today, 1)
  const open = tasks.filter((t) => t.status === 'todo' && !t.deleted_at && !t.someday)
  const left = new Set(sweep.filter((t) => t.status === 'todo').map((t) => t.id))
  const out: Suggestion[] = []
  const add = (t: Task, why: string) => {
    if (!out.some((s) => s.task.id === t.id)) out.push({ task: t, why })
  }
  open.filter((t) => !left.has(t.id) && dueKey(t) === tomorrow).forEach((t) => add(t, 'Due tomorrow'))
  const leftovers = sweep.filter((t) => left.has(t.id) && !t.someday)
  ;[...leftovers.filter((t) => t.top3), ...leftovers.filter((t) => !t.top3)].forEach((t) => add(t, 'Left today'))
  open.filter((t) => t.top3).forEach((t) => add(t, 'Starred'))
  open
    .filter((t) => {
      const k = dueKey(t)
      return !!k && k > tomorrow && daysBetween(today, k) < 7
    })
    .sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? ''))
    .forEach((t) => add(t, `Due ${weekdayOf(dueKey(t)!)}`))
  return out.slice(0, cap)
}

/** What Close the day writes (ruling 2): seed every star not yet seeded, take back seeds no longer
 * starred, and roll each starred Sweep row that is still open and not rolled to tomorrow 09:00. */
export function closeDay(stars: readonly string[], seeded: readonly string[], sweepOpen: ReadonlySet<string>): { seed: string[]; unseed: string[]; roll: string[] } {
  return {
    seed: stars.filter((id) => !seeded.includes(id)),
    unseed: seeded.filter((id) => !stars.includes(id)),
    roll: stars.filter((id) => sweepOpen.has(id)),
  }
}

/** "→ Mon 09:00" — a rolled Sweep row's meta. */
export const rolledMeta = (now: Date) => `→ ${tomorrowHint(now)}`

/** "Monday" — the morning these seeds pre-fill (the loop day after `now`'s, loopDay.ts). */
export function seedDayName(now: Date, style: 'long' | 'short' = 'long'): string {
  return new Date(`${seedTargetDate(now)}T12:00:00Z`).toLocaleDateString('en-US', { weekday: style, timeZone: 'UTC' })
}
