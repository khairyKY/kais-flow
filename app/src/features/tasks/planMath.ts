// The Plan menu's pure half (Kai 2026-10-07: "Give me a button for replanning… We need a few options
// that are usable and don't clash… What does each shortcut mean?"). One list for every place a task
// gets a date — the ⋯ / right-click menu, the swipe, the task sheet's date chip, the bulk bar — each
// option saying the day and time it lands on and, in one plain line, what it means.
import { addDays, atDay, busyOnDay, dayHint, freeSlots, fromMin, quickPicks, type FreeStart } from '../../components/pickerMath'
import { cairoDateKey, scheduleToday } from '../../lib/dateShortcuts'
import { daysToWeekend, weekendLabel } from '../../lib/weekend'
import { cairoTimeKey } from '../calendar/eventTime'
import { filterByList } from './grouping'
import type { CalendarEvent, Task } from '../../lib/types'

export type PlanKey = 'today' | 'slot' | 'spread' | 'tomorrow' | 'weekend' | 'nextweek' | 'pick' | 'someday' | 'none'

export interface PlanOption {
  key: PlanKey
  label: string
  /** Where it lands: "Thu 8 · 09:00", "Today 14:30–15:00". */
  hint: string
  /** What it does, in one plain line. */
  means: string
  /** The instant a dated option writes. */
  iso?: string
  /** The task already sits on this option's day (drawn ticked). */
  current?: boolean
}

/** Strictly past its date (Tasks' Overdue list): the menu says Replan instead of Plan. */
export function isOverdue(task: Task, now = new Date()): boolean {
  return filterByList([task], 'overdue', now).length > 0
}

const DEFAULT_TIME = '09:00'

/** Plan's Today: today at the task's own time when its date had one, else 09:00 — the app's "no set
 * time" (every picked day lands there). Overdue at 15:00 yesterday → today 15:00. */
export function todayFor(task: Pick<Task, 'due_at'> | undefined, now = new Date()): string {
  return task?.due_at ? atDay(cairoDateKey(now), cairoTimeKey(new Date(task.due_at))) : scheduleToday(now)
}

/** "Today 14:30–15:00", "Tomorrow 09:00–09:30", "Thu 8 11:00–11:45". */
export function slotText(s: FreeStart, dur: number, now = new Date()): string {
  const today = cairoDateKey(now)
  const day = s.day === today ? 'Today' : s.day === addDays(today, 1) ? 'Tomorrow' : dayHint(s.day, today)
  return `${day} ${fromMin(s.start)}–${fromMin(s.start + dur)}`
}

export interface SpreadPick {
  task: Task
  /** Its free slot today (minutes into the day), or null → tomorrow, first thing. */
  slot: FreeStart | null
  dur: number
}

/** Replan all → Spread into free slots (Kai 2026-10-07, the 320-task overdue pile): in the order
 * given, each task takes the first free gap today that fits its own length (30m when unset) — each
 * one placed counts as busy for the next; what doesn't fit goes to tomorrow, first thing. Their own
 * blocks don't count as busy (they move). */
export function spreadPlan(tasks: readonly Task[], events: readonly CalendarEvent[], now: Date): SpreadPick[] {
  const today = cairoDateKey(now)
  const ids = new Set(tasks.map((t) => t.id))
  const busy = busyOnDay(events.filter((e) => !(e.task_id && ids.has(e.task_id))), today)
  return tasks.map((task) => {
    const dur = task.duration_min || 30
    const gap = freeSlots(busy, today, now, dur, 1)[0]
    if (!gap) return { task, slot: null, dur }
    busy.push({ start: gap.start, end: gap.start + dur, title: task.title })
    busy.sort((a, b) => a.start - b.start)
    return { task, slot: { day: today, start: gap.start }, dur }
  })
}

/** Settings → Calendar's "What the plan shortcuts mean": each Plan option in a sentence. */
export function planGlossary(weekend: readonly number[]): { label: string; means: string }[] {
  const first = daysToWeekend(0, weekend)
  return [
    { label: 'Today', means: 'today, at the task’s own time if it has one, else 09:00.' },
    { label: 'Next free slot', means: 'ASAP: the first gap on your calendar (08:00–20:00) that fits the task’s length — today if there is one, else the next day that has one. You see it and confirm; Another time offers the next gap.' },
    { label: 'Tomorrow, first thing', means: 'tomorrow at 09:00, the start of your day. Swipe right and the 2 key do the same.' },
    {
      label: 'This weekend',
      means: first == null ? 'not offered — you have no weekend set.' : `the first day of your weekend (${weekendLabel(weekend)}) at 09:00 — once it has started, the next one.`,
    },
    { label: 'Next week', means: 'Monday of next week at 09:00 (on a Sunday, the Monday after tomorrow).' },
    { label: 'Pick date & time…', means: 'any day, and a time if you want one.' },
    { label: 'Replan', means: 'what Plan says once a task is overdue. A calendar block of it that is already over comes off the calendar.' },
  ]
}

export interface PlanContext {
  /** One task (bulk: none — then Today is plain 09:00 and there's no free-slot finder). */
  task?: Task
  weekend: readonly number[]
  /** The first free slot for the task (`undefined` = don't offer the finder, `null` = none free). */
  slot?: FreeStart | null
  dur?: number
  /** A selection's Spread into free slots (Today's Replan all): how many land today / tomorrow. */
  spread?: { today: number; tomorrow: number }
  someday?: boolean
  clear?: boolean
}

/** The Plan list, in order: Today · Next free slot · Tomorrow, first thing · This weekend · Next week
 * · Pick date & time… (· Someday · No date where the caller has them). The dated ones are the date
 * picker's quick picks, so no two land on one day (with a Sat + Sun weekend, on a Saturday This
 * weekend is today and drops out; on a Friday it is tomorrow and drops out). */
export function planOptions(now: Date, c: PlanContext): PlanOption[] {
  const today = cairoDateKey(now)
  const current = c.task?.due_at ? cairoDateKey(new Date(c.task.due_at)) : null
  const ownTime = c.task?.due_at ? cairoTimeKey(new Date(c.task.due_at)) : DEFAULT_TIME
  const out: PlanOption[] = []
  for (const q of quickPicks(now, true, c.weekend)) {
    const at = `${dayHint(q.day, today)} · `
    const base = { current: q.day === current }
    if (q.key === 'today') {
      out.push({ key: 'today', label: 'Today', hint: at + ownTime, means: ownTime === DEFAULT_TIME ? 'today, no set time' : `today, keeps its ${ownTime}`, iso: todayFor(c.task, now), ...base })
      if (c.slot !== undefined) {
        out.push({ key: 'slot', label: 'Next free slot', hint: c.slot ? slotText(c.slot, c.dur ?? 30, now) : 'None free', means: 'ASAP: the first free gap that fits — you confirm' })
      }
      if (c.spread) {
        out.push({ key: 'spread', label: 'Spread into free slots', hint: `${c.spread.today} today · ${c.spread.tomorrow} tomorrow`, means: 'today’s free gaps in order, each its own length; the rest tomorrow — you confirm' })
      }
    } else if (q.key === 'tomorrow') out.push({ key: 'tomorrow', label: 'Tomorrow, first thing', hint: at + DEFAULT_TIME, means: 'the start of your day', iso: q.iso, ...base })
    else if (q.key === 'weekend') out.push({ key: 'weekend', label: 'This weekend', hint: at + DEFAULT_TIME, means: `the first day of your weekend (${weekendLabel(c.weekend)})`, iso: q.iso, ...base })
    else out.push({ key: 'nextweek', label: 'Next week', hint: at + DEFAULT_TIME, means: 'Monday of next week', iso: q.iso, ...base })
  }
  out.push({ key: 'pick', label: 'Pick date & time…', hint: '', means: 'any day — and a time, if you want one' })
  if (c.someday) out.push({ key: 'someday', label: 'Someday', hint: '', means: 'no date — parked until you pull it up' })
  if (c.clear) out.push({ key: 'none', label: 'No date', hint: '', means: 'takes the date off' })
  return out
}
