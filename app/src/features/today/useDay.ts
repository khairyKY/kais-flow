import { cairoDateKey } from '../../lib/dateShortcuts'
import { RITUAL_STEP_COUNT, useRitualsFinishedToday, useSeedsFor, type RitualKind } from '../rituals/api'
import { seedTargetDate } from '../rituals/loopDay'
import { NOW_SOON_MIN, dayPhase, eveningState, morningState, ritualFinished, type DayCardState, type RitualState } from './dayPhase'
import { top3Tally } from './top3Today'
import { upNextEvents } from './upNext'
import { useMinuteNow } from './useMinuteNow'
import type { CalendarEvent, Task } from '../../lib/types'

export interface DayInput {
  events: CalendarEvent[]
  tasks: Task[]
  /** Today's Top 3, finished picks included, goal first (./top3Today). */
  top3: Task[]
  ritualSteps: Record<RitualKind, ReadonlySet<string>>
  /** R4-5a pins: which rituals the card may prompt. */
  prompts: Record<RitualKind, boolean>
}

export interface Day {
  /** The minute clock the page reads (useMinuteNow). */
  now: Date
  state: DayCardState<CalendarEvent, Task>
  morning: RitualState
  evening: RitualState
  /** What the evening seeded for the coming morning (ritual.seeded rows, still open tasks). */
  seeds: Task[]
  tally: { picked: number; done: number }
}

/** The day's phase and ritual progress — one read for the desktop Day card and the phone's
 * header, ritual card and NOW slip. */
export function useDay({ events, tasks, top3, ritualSteps, prompts }: DayInput): Day {
  const now = useMinuteNow()
  const taskById = new Map(tasks.map((t) => [t.id, t] as const))
  const today = cairoDateKey(now)
  const hasTaskBlockToday = events.some((e) => !!e.task_id && !e.all_day && cairoDateKey(new Date(e.starts_at)) === today)
  // Loop B's contract: a ritual walked past its last step logs `ritual.finished` for the Cairo loop
  // day (04:00 rollover), so a 00:30 shutdown still reads as tonight's. Step counts stay a fallback.
  const finishedToday = useRitualsFinishedToday(now)
  const m = morningState(ritualSteps.morning, RITUAL_STEP_COUNT.morning, hasTaskBlockToday)
  const e = eveningState(ritualSteps.evening, RITUAL_STEP_COUNT.evening)
  const morning: RitualState = { ...m, finished: finishedToday.morning || ritualFinished(m) }
  const evening: RitualState = { ...e, finished: finishedToday.evening || ritualFinished(e) }
  const seeds = useSeedsFor(seedTargetDate(now))
  const tally = top3Tally(top3)
  const openTop3 = top3.filter((t) => !t.completed_at)
  // "The running or next item": Up next's own list, minus blocks whose task is already done.
  const nextUp = upNextEvents(events, now).find((e) => !(e.task_id && taskById.get(e.task_id)?.status === 'done')) ?? null
  // An event running or starting within NOW_SOON_MIN is the move; further off, an open Top 3 is.
  const nextUpSoon = !!nextUp && new Date(nextUp.starts_at).getTime() - now.getTime() <= NOW_SOON_MIN * 60_000
  const state = dayPhase({ now, morning, evening, top3: tally, nextUp, nextUpSoon, firstOpenTop3: openTop3[0] ?? null, prompts })
  return { now, state, morning, evening, seeds, tally }
}
