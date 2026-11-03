// Focus D3 (design-export/Focus redesign.html §D3, Kai's pick 2026-10-31): a focus session is a block split
// into rounds — focus segments in the block's own colour, short (and, on the cycle's last round, long) breaks
// between them, the rest of the block left over. Pure: the Focus page, the pill, the tray flyout and the
// tray icon all draw from these, and the tray windows can import it without loading the focus store.

import type { CalendarEvent, Task } from '../../lib/types'
import { blockHue, KIND_HUE } from '../calendar/blockHue'

export interface PlanSettings {
  focusRoundMin: number
  shortBreakMin: number
  longBreakMin: number
  roundsBeforeLongBreak: number
}

/** The block a session runs in: a calendar block (its times, name and colour), a task's own scheduled
 * window, or — from a task alone — now + its estimate (or one round). `start`/`end` are the plan's span;
 * `srcStart`/`srcEnd` the block's, so "Fill the block" can come back after a length chip. */
export interface FocusBlock {
  title: string
  start: string
  end: string
  srcStart: string
  srcEnd: string
  /** CSS colour (a --blk-* token, or a custom block's hex) and its text tone. */
  color: string
  ink: string
  rounds: number
  /** The rounds fill the block (vs one round of a chosen length). */
  fill: boolean
  /** "From your calendar" — the block is a calendar event / Time block, not the task's own guess. */
  fromCalendar: boolean
  eventId: string | null
}

export type SegKind = 'f' | 'b' | 'x'
export interface Seg {
  k: SegKind
  min: number
}

const breakAfter = (i: number, s: PlanSettings) => ((i + 1) % Math.max(1, s.roundsBeforeLongBreak) === 0 ? s.longBreakMin : s.shortBreakMin)

/** How many rounds fit `lenMin` (at least one): round, break, round … with no break after the last. */
export function fitRounds(lenMin: number, s: PlanSettings): number {
  let n = 1
  let used = s.focusRoundMin
  for (;;) {
    const next = used + breakAfter(n - 1, s) + s.focusRoundMin
    if (next > lenMin + 0.5) return n
    used = next
    n++
  }
}

/** f, b, f, b … f, then what's left of the block ('x', drawn empty). */
export function planSegs(rounds: number, lenMin: number, s: PlanSettings): Seg[] {
  const out: Seg[] = []
  let used = 0
  for (let i = 0; i < rounds; i++) {
    out.push({ k: 'f', min: s.focusRoundMin })
    used += s.focusRoundMin
    if (i < rounds - 1) {
      out.push({ k: 'b', min: breakAfter(i, s) })
      used += breakAfter(i, s)
    }
  }
  if (lenMin - used >= 1) out.push({ k: 'x', min: lenMin - used })
  return out
}

const minutes = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60_000))
export const blockMinutes = (b: Pick<FocusBlock, 'start' | 'end'>) => minutes(b.start, b.end)

export type SessionPhase = 'idle' | 'running' | 'paused' | 'end' | 'break' | 'done'

export interface SessionLike {
  mode: 'pomodoro' | 'break' | 'stopwatch' | 'garden'
  isRunning: boolean
  secondsLeft: number
  pomodoroStartIso: string | null
  breakType: 'short' | 'long'
  block: FocusBlock | null
  kept: number
}

/** Which of D3's states the page is in. Round end = a break waiting to start (breaks don't start by
 * themselves) — or the moment the round closes, which the page holds itself (`ending`). */
export function phaseOf(f: SessionLike, s: PlanSettings): SessionPhase {
  if (f.block && f.kept >= f.block.rounds && f.mode === 'pomodoro' && !f.isRunning && !f.pomodoroStartIso) return 'done'
  if (f.mode === 'break' || f.mode === 'garden') {
    const full = (f.breakType === 'long' ? s.longBreakMin : s.shortBreakMin) * 60
    return !f.isRunning && f.secondsLeft >= full ? 'end' : 'break'
  }
  if (f.isRunning) return 'running'
  return f.pomodoroStartIso || f.secondsLeft < s.focusRoundMin * 60 ? 'paused' : 'idle'
}

export interface Timeline {
  segs: Seg[]
  /** Index of the segment under way (-1: none). */
  cur: number
  /** How far through it, 0..1. */
  frac: number
  /** Focus segments kept (bloomed). */
  done: number
  phase: SessionPhase
}

/** The segments and where the session is on them. */
export function timelineOf(f: SessionLike, s: PlanSettings): Timeline | null {
  const b = f.block
  if (!b) return null
  const segs = planSegs(b.rounds, blockMinutes(b), s)
  const phase = phaseOf(f, s)
  const clamp = (x: number) => Math.min(1, Math.max(0, x))
  let cur = -1
  let frac = 0
  if (phase === 'running' || phase === 'paused') {
    cur = 2 * Math.min(f.kept, b.rounds - 1)
    frac = clamp(1 - f.secondsLeft / (s.focusRoundMin * 60))
  } else if (phase === 'break' && f.kept > 0 && f.kept < b.rounds) {
    cur = 2 * (f.kept - 1) + 1
    const full = (f.breakType === 'long' ? s.longBreakMin : s.shortBreakMin) * 60
    frac = clamp(1 - f.secondsLeft / full)
  }
  return { segs, cur, frac, done: Math.min(f.kept, b.rounds), phase }
}

/** Minutes kept so far: the rounds done, and the one under way. */
export function keptMinutes(f: SessionLike, s: PlanSettings): number {
  const now = f.mode === 'pomodoro' && f.pomodoroStartIso ? Math.max(0, s.focusRoundMin * 60 - f.secondsLeft) / 60 : 0
  return Math.floor(f.kept * s.focusRoundMin + now)
}

/** "2h", "1h 40m", "37m". */
export function hm(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
/** "Four blooms", "One bloom". */
export const bloomsWord = (n: number) => `${WORDS[n] ?? n} bloom${n === 1 ? '' : 's'}`

type EventLike = Pick<CalendarEvent, 'id' | 'title' | 'starts_at' | 'ends_at' | 'all_day' | 'task_id' | 'type' | 'color'> & { deleted_at?: string | null }
type TaskLike = Pick<Task, 'id' | 'title' | 'scheduled_start' | 'scheduled_end' | 'duration_min'> & { slot_id?: string | null }

const hueOf = (e: Pick<CalendarEvent, 'color'> | null) => (e?.color ? blockHue(e.color) : KIND_HUE.task)

/** The block a session on `task` (or on `event`, a block's own "Focus on this") runs in. The plan starts
 * now when now is inside the block (the rounds fill what's left), else at the block's start. */
export function blockFor(task: TaskLike | null, events: readonly EventLike[], s: PlanSettings, now: Date, event?: EventLike | null): FocusBlock {
  const t = now.getTime()
  const ofSpan = (title: string, start: string, end: string, e: EventLike | null, fromCalendar: boolean): FocusBlock => {
    const from = Date.parse(start) <= t && t < Date.parse(end) ? new Date(t).toISOString() : start
    const h = hueOf(e)
    return { title, start: from, end, srcStart: from, srcEnd: end, color: h.c, ink: h.ink, rounds: fitRounds(minutes(from, end), s), fill: true, fromCalendar, eventId: e?.id ?? null }
  }
  if (event && !event.all_day) return ofSpan(event.title, event.starts_at, event.ends_at, event, true)
  if (task) {
    const live = events.filter((e) => !e.deleted_at && !e.all_day)
    const today = (iso: string) => Math.abs(Date.parse(iso) - t) < 86_400_000
    // A task's own block: the one under way, else the next one today.
    const own = live.filter((e) => e.task_id === task.id && Date.parse(e.ends_at) > t && today(e.starts_at)).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0]
    if (own) return ofSpan(own.title, own.starts_at, own.ends_at, own, true)
    // In a Time block: the task's scheduled window is the slot's occurrence; the slot names and colours it.
    const slot = task.slot_id ? live.find((e) => e.id === task.slot_id) : undefined
    if (task.scheduled_start && task.scheduled_end && Date.parse(task.scheduled_end) > t && today(task.scheduled_start))
      return ofSpan(slot?.title ?? task.title, task.scheduled_start, task.scheduled_end, slot ?? null, !!slot)
  }
  // A task alone: its estimate, or one round.
  const len = task?.duration_min && task.duration_min > s.focusRoundMin ? task.duration_min : s.focusRoundMin
  const start = new Date(t).toISOString()
  const end = new Date(t + len * 60_000).toISOString()
  const h = KIND_HUE.task
  return { title: task?.title ?? 'Focus', start, end, srcStart: start, srcEnd: end, color: h.c, ink: h.ink, rounds: fitRounds(len, s), fill: true, fromCalendar: false, eventId: null }
}

/** A length chip: one round of `min` minutes from now (the block's name and colour kept). */
export function oneRound(b: FocusBlock, min: number, now: Date): FocusBlock {
  const start = now.toISOString()
  return { ...b, start, end: new Date(now.getTime() + min * 60_000).toISOString(), rounds: 1, fill: false }
}

/** "Fill the block": back to the block's own span (from now, if it's under way). */
export function fillBlock(b: FocusBlock, s: PlanSettings, now: Date): FocusBlock {
  const t = now.getTime()
  const start = Date.parse(b.srcStart) <= t && t < Date.parse(b.srcEnd) ? now.toISOString() : b.srcStart
  return { ...b, start, end: b.srcEnd, rounds: fitRounds(minutes(start, b.srcEnd), s), fill: true }
}
