// Today's Top 3 in the user's order, the first one the goal of the day (SCREENS-2026-09-28 §Plan
// ruling 4: "The first pick is the goal"). Kai 2026-10-07: "give me a button for making something
// the goal of the day", and let him order the three. The order lives on the rows (tasks.top3_rank,
// migration 0055) so the phone and the computer agree; before that, the goal was each device's own
// localStorage pick (./goalStore), which stays only as the fallback for rows nobody has ranked yet.
import { todayListTasks } from '../tasks/grouping'
import { starredIds, top3OfToday, type StarEvent } from './top3Today'
import type { Task } from '../../lib/types'

interface RankRow {
  id: string
  top3_rank?: number | null
  completed_at: string | null
  scheduled_start?: string | null
}

/** When each task was last starred — its latest star event, when that is a star (./top3Today). */
export function starTimes(events: readonly StarEvent[]): Map<string, number> {
  const latest = new Map<string, StarEvent>()
  for (const e of events) {
    const prev = latest.get(e.entity_id)
    if (!prev || Date.parse(e.created_at) >= Date.parse(prev.created_at)) latest.set(e.entity_id, e)
  }
  const out = new Map<string, number>()
  for (const [id, e] of latest) if (e.event_type === 'task.starred') out.set(id, Date.parse(e.created_at))
  return out
}

const cmp = (x: number, y: number) => (x === y ? 0 : x < y ? -1 : 1) // Infinity-safe (no NaN)

/** The Top 3's order. Ranked rows first, by rank — Kai's own order, once he set one. Without a rank
 * (nothing ordered yet, or an old build's star): the goal is this device's legacy pick, else the
 * pick starred first; the rest by their calendar block (unscheduled last), then by star time —
 * never by Today's list sort, which moved under Kai when he moved a block (2026-10-07: the goal
 * flipped from "Crypto" to "Read 2 pages" by itself). Ties keep the order given. */
export function orderTop3<R extends RankRow>(rows: readonly R[], legacyGoal: string | null, starredAt: ReadonlyMap<string, number> = new Map()): R[] {
  const star = (r: R) => starredAt.get(r.id) ?? Infinity
  const block = (r: R) => (r.scheduled_start ? Date.parse(r.scheduled_start) : Infinity)
  const byBlock = (a: R, b: R) => cmp(block(a), block(b)) || cmp(star(a), star(b))
  const ranked = rows.filter((r) => r.top3_rank != null).sort((a, b) => cmp(a.top3_rank!, b.top3_rank!))
  const loose = rows.filter((r) => r.top3_rank == null)
  if (ranked.length) return [...ranked, ...loose.sort(byBlock)]
  const goal = loose.find((r) => r.id === legacyGoal) ?? [...loose].sort((a, b) => cmp(star(a), star(b)))[0]
  return goal ? [goal, ...loose.filter((r) => r !== goal).sort(byBlock)] : []
}

/** What Today draws: the goal first — done or not (R4: a finished goal stays, struck through) — then
 * the rest, finished picks after open ones (A3). */
export function top3Display<R extends RankRow>(ordered: readonly R[]): R[] {
  const [goal, ...rest] = ordered
  return goal ? [goal, ...rest.filter((r) => !r.completed_at), ...rest.filter((r) => !!r.completed_at)] : []
}

/** Today's Top 3 as drawn, from the task list: starred now, or finished today while starred (the
 * star log, or a place kept — a finished goal stays the goal), in orderTop3's order. `stars` = the
 * picks' star events (today/api useStarEvents; the writes read the cached ones). */
export function dayTop3(tasks: readonly Task[], legacyGoal: string | null, stars: readonly StarEvent[], now = new Date()): Task[] {
  const doneWhileStarred = new Set([...starredIds(stars), ...tasks.filter((t) => t.completed_at && t.top3_rank != null).map((t) => t.id)])
  return top3Display(orderTop3(top3OfToday(todayListTasks([...tasks], now), doneWhileStarred), legacyGoal, starTimes(stars)))
}

/** The goal of the day's id (Tasks' ✶ Goal chip, the tray), or null with nothing picked. */
export function goalIdOf(tasks: readonly Task[], legacyGoal: string | null, stars: readonly StarEvent[] = [], now = new Date()): string | null {
  return dayTop3(tasks, legacyGoal, stars, now)[0]?.id ?? null
}

/** The rank each row of `order` needs (its place, 1 = goal), only where it isn't that already. */
export function rankWrites<R extends RankRow>(order: readonly R[]): { row: R; rank: number }[] {
  return order.flatMap((row, i) => (row.top3_rank === i + 1 ? [] : [{ row, rank: i + 1 }]))
}

/** Move up / down (the Top 3 rows' menu, Alt+↑/↓) or a drag: `id` to place `to` in `display`, never
 * below the last open pick (finished ones stay last). A finished pick doesn't move. Null when it
 * can't go there. Moving into the first place makes it the goal. */
export function moveInTop3<R extends RankRow>(display: readonly R[], id: string, to: number): R[] | null {
  const from = display.findIndex((r) => r.id === id)
  if (from < 0 || display[from].completed_at || to < 0 || to > display.findLastIndex((r) => !r.completed_at) || to === from) return null
  const next = [...display]
  next.splice(to, 0, ...next.splice(from, 1))
  return next
}

export interface GoalPlan<R> {
  /** The new order, goal first. */
  order: R[]
  /** Joining a full Top 3 takes this pick out (the 6l swap: the last open one that isn't the goal). */
  out: R | null
  /** It isn't in the Top 3 and three open picks already are — ask before the swap. */
  full: boolean
}

/** Make goal of the day: `task` leads. Not in the Top 3 yet → it joins; with `cap` open picks
 * already there, the last open non-goal pick makes room (the swap rule — the old goal stays, now
 * second). */
export function planMakeGoal<R extends RankRow>(display: readonly R[], task: R, cap = 3): GoalPlan<R> {
  const inTop3 = display.some((r) => r.id === task.id)
  const open = display.filter((r) => !r.completed_at)
  const out = !inTop3 && open.length >= cap ? (open.filter((r) => r !== display[0]).at(-1) ?? null) : null
  const order = [task, ...display.filter((r) => r.id !== task.id && r !== out)]
  return { order, out, full: !!out }
}
