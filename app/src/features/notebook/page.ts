// The Notebook page (Kai 2026-10-03 brainstorm §A; Claude Design prompt 10, not drawn yet): the day,
// laid out to be copied by hand into a paper journal. The pure half — the layout (blocks on/off, in
// order, a few options, presets), and the day's data → blocks of lines → plain text. The screen, the
// print copy and "Copy as text" all draw from `buildPage`, so the three can't disagree.
// No React, no Supabase: tested in four time zones (page.test.ts).
import { routinesForToday } from '../routines/streaks'
import { zoneDateKey } from '../../lib/dateShortcuts'
import { zoneTimeKey } from '../calendar/eventTime'
import type { CalendarEvent, Routine, RoutineCompletion, Task } from '../../lib/types'

// ── the layout ──

export const BLOCK_IDS = ['header', 'top3', 'habits', 'tasks', 'notes', 'night'] as const
export type BlockId = (typeof BLOCK_IDS)[number]

export const BLOCK_LABEL: Record<BlockId, string> = {
  header: 'Date',
  top3: 'Top 3 & plan',
  habits: 'Habits',
  tasks: 'Tasks',
  notes: 'Notes',
  night: 'Night lines',
}

export interface NotebookLayout {
  /** ☐ boxes, or the bullet journal's rapid log (• task, ○ event, – note; × done). */
  marks: 'box' | 'bullet'
  /** Every block once, in page order. */
  blocks: { id: BlockId; on: boolean }[]
  /** "SAT · 26 SEP" or "Saturday, 26 September"; `sleep` adds "woke __ · slept __". */
  header: { long: boolean; sleep: boolean }
  /** `plan`: the day's calendar under the Top 3, times on the 24h or 12h clock. */
  top3: { plan: boolean; clock: '24h' | '12h' }
  /** One row of boxes, or one habit per line. */
  habits: { row: boolean }
  /** Copying 30 lines by hand isn't fun: the rest is "+ N more in the app". */
  tasks: { cap: number }
  notes: { lines: number }
}

export const TASK_CAPS = [5, 10, 15] as const
export const NOTE_LINES = [0, 4, 6, 8, 12] as const

export type PresetId = 'kai' | 'bullet' | 'minimal'

const order = (ids: BlockId[], on: BlockId[]) => ids.map((id) => ({ id, on: on.includes(id) }))

// Kai's real page (vault: Journal/The Notebook.md): the date, TASKS copied from the plan, the HABITS row,
// NOTES, and the four night lines. Prayer is never on it — it's the day's anchor, not a score — and no
// preset ever adds it: the habits are the user's own routines, nothing else.
export const PRESETS: Record<PresetId, { label: string; layout: NotebookLayout }> = {
  kai: {
    label: 'Kai’s page',
    layout: {
      marks: 'box',
      blocks: order(['header', 'tasks', 'habits', 'notes', 'night', 'top3'], ['header', 'tasks', 'habits', 'notes', 'night']),
      header: { long: false, sleep: true },
      top3: { plan: true, clock: '24h' },
      habits: { row: true },
      tasks: { cap: 10 },
      notes: { lines: 6 },
    },
  },
  bullet: {
    label: 'Bullet journal',
    layout: {
      marks: 'bullet',
      blocks: order(['header', 'top3', 'tasks', 'habits', 'notes', 'night'], ['header', 'top3', 'tasks', 'habits', 'notes']),
      header: { long: true, sleep: false },
      top3: { plan: true, clock: '24h' },
      habits: { row: false },
      tasks: { cap: 10 },
      notes: { lines: 8 },
    },
  },
  minimal: {
    label: 'Minimal',
    layout: {
      marks: 'box',
      blocks: order(['header', 'top3', 'tasks', 'habits', 'notes', 'night'], ['header', 'top3', 'tasks']),
      header: { long: false, sleep: false },
      top3: { plan: false, clock: '24h' },
      habits: { row: true },
      tasks: { cap: 10 },
      notes: { lines: 6 },
    },
  },
}

export const DEFAULT_LAYOUT = PRESETS.kai.layout

const pick = <T>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback)
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

/** A stored layout (app_settings.notebook_layout, or this device's copy) → a whole, valid one. Unknown
 * blocks are dropped, a missing one joins at the end (off), options fall back to Kai's page. Never throws. */
export function parseLayout(raw: unknown): NotebookLayout {
  const o = obj(raw)
  const d = DEFAULT_LAYOUT
  const seen = new Set<BlockId>()
  const blocks: NotebookLayout['blocks'] = []
  for (const b of Array.isArray(o.blocks) ? o.blocks : []) {
    const id = obj(b).id as BlockId
    if (!BLOCK_IDS.includes(id) || seen.has(id)) continue
    seen.add(id)
    blocks.push({ id, on: bool(obj(b).on, false) })
  }
  if (!blocks.length) blocks.push(...d.blocks.map((b) => ({ ...b })))
  for (const id of BLOCK_IDS) if (!blocks.some((b) => b.id === id)) blocks.push({ id, on: false })
  const h = obj(o.header)
  const t = obj(o.top3)
  return {
    marks: pick(o.marks, ['box', 'bullet'] as const, d.marks),
    blocks,
    header: { long: bool(h.long, d.header.long), sleep: bool(h.sleep, d.header.sleep) },
    top3: { plan: bool(t.plan, d.top3.plan), clock: pick(t.clock, ['24h', '12h'] as const, d.top3.clock) },
    habits: { row: bool(obj(o.habits).row, d.habits.row) },
    tasks: { cap: pick(obj(o.tasks).cap, TASK_CAPS, d.tasks.cap) },
    notes: { lines: pick(obj(o.notes).lines, NOTE_LINES, d.notes.lines) },
  }
}

/** The preset this layout is exactly, if any (the editor lights its chip). */
export function presetOf(layout: NotebookLayout): PresetId | null {
  const key = JSON.stringify(parseLayout(layout))
  return (Object.keys(PRESETS) as PresetId[]).find((p) => JSON.stringify(parseLayout(PRESETS[p].layout)) === key) ?? null
}

/** Move block `id` one place up (-1) or down (+1). Null at the edge. */
export function moveBlock(layout: NotebookLayout, id: BlockId, by: -1 | 1): NotebookLayout | null {
  const from = layout.blocks.findIndex((b) => b.id === id)
  const to = from + by
  if (from < 0 || to < 0 || to >= layout.blocks.length) return null
  const blocks = [...layout.blocks]
  blocks.splice(to, 0, ...blocks.splice(from, 1))
  return { ...layout, blocks }
}

// ── the page ──

export type Mark = '☐' | '☑' | '•' | '×' | '○' | '–'

export type PageLine =
  /** A task, a habit or a calendar item. Empty `text` = a blank to write in. */
  | { kind: 'item'; mark: Mark | null; text: string; time?: string; goal?: boolean; done?: boolean; taskId?: string }
  /** Habits on one line. */
  | { kind: 'row'; items: { mark: Mark; text: string; done: boolean }[] }
  /** A small heading inside a block ("PLAN"). */
  | { kind: 'sub'; text: string }
  | { kind: 'more'; text: string }
  /** An empty ruled line to write on. */
  | { kind: 'rule'; mark: Mark | null }
  /** A night line: its sign and its prompt. */
  | { kind: 'prompt'; mark: string; text: string }

export interface PageBlock {
  id: BlockId
  /** The block's heading ("TASKS"), or the date for the header. */
  title: string | null
  /** The header's right side: "woke __ · slept __". */
  aside?: string
  lines: PageLine[]
}

export interface PageData {
  /** The page's day, "YYYY-MM-DD" on the user's clock. */
  day: string
  zone: string
  /** The day's Top 3 in order, the goal first (finished picks included). */
  top3: readonly Task[]
  tasks: readonly Task[]
  events: readonly CalendarEvent[]
  routines: readonly Routine[]
  completions: readonly RoutineCompletion[]
}

export const NIGHT_LINES: readonly { mark: string; text: string }[] = [
  { mark: '+', text: 'what happened' },
  { mark: '−', text: 'what got in the way' },
  { mark: '→', text: 'tomorrow’s three' },
  { mark: '♡', text: 'one true line' },
]

const BLANKS = 3

const noon = (day: string) => new Date(`${day}T12:00:00Z`) // the date's own weekday/month in UTC, any zone

/** "SAT · 26 SEP" or "Saturday, 26 September". */
export function headerDate(day: string, long: boolean): string {
  const d = noon(day)
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-US', { ...o, timeZone: 'UTC' })
  if (long) return `${part({ weekday: 'long' })}, ${d.getUTCDate()} ${part({ month: 'long' })}`
  return `${part({ weekday: 'short' })} · ${d.getUTCDate()} ${part({ month: 'short' })}`.toUpperCase()
}

/** Days from `from` to `to` (both "YYYY-MM-DD"), on the calendar. */
export function daysBetween(from: string, to: string): number {
  return Math.round((noon(to).getTime() - noon(from).getTime()) / 86_400_000)
}

/** "Day N" of using the app: the day the account began is Day 1. Null when that's unknown or later. */
export function dayNumber(startDay: string | null | undefined, day: string): number | null {
  if (!startDay) return null
  const n = daysBetween(startDay, day) + 1
  return n >= 1 ? n : null
}

/** "09:00" → "9:00am" for the 12h clock. */
function twelve(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`
}

/** A calendar item's time on the user's clock: "09:00–10:30", or "all day". */
function eventTime(e: CalendarEvent, zone: string, clock: '24h' | '12h'): string {
  if (e.all_day) return 'all day'
  const fmt = (iso: string) => (clock === '12h' ? twelve(zoneTimeKey(new Date(iso), zone)) : zoneTimeKey(new Date(iso), zone))
  const sameDay = zoneDateKey(new Date(e.ends_at), zone) === zoneDateKey(new Date(e.starts_at), zone)
  return sameDay && e.ends_at > e.starts_at ? `${fmt(e.starts_at)}–${fmt(e.ends_at)}` : fmt(e.starts_at)
}

/** The day's calendar: timed items starting that day on the user's clock, then all-day ones
 * (stored as UTC dates, end exclusive — the calendar's own rule). */
export function dayEvents(events: readonly CalendarEvent[], day: string, zone: string): CalendarEvent[] {
  const live = events.filter((e) => !e.deleted_at)
  const allDay = live.filter((e) => e.all_day && e.starts_at.slice(0, 10) <= day && day < e.ends_at.slice(0, 10))
  const timed = live.filter((e) => !e.all_day && zoneDateKey(new Date(e.starts_at), zone) === day).sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  return [...timed, ...allDay]
}

const onDay = (iso: string | null, day: string, zone: string) => !!iso && zoneDateKey(new Date(iso), zone) === day

/** The open tasks that belong to the day: due or scheduled on it (overdue ones wait for Plan my day's
 * carry-over, not the page), by their time — the block first, then the due time. */
export function dayTasks(tasks: readonly Task[], day: string, zone: string): Task[] {
  const at = (t: Task) => (onDay(t.scheduled_start, day, zone) ? t.scheduled_start! : t.due_at ?? '')
  return tasks
    .filter((t) => t.status === 'todo' && !t.someday && !t.deleted_at && (onDay(t.due_at, day, zone) || onDay(t.scheduled_start, day, zone)))
    .sort((a, b) => at(a).localeCompare(at(b)))
}

function taskMark(marks: NotebookLayout['marks'], done: boolean): Mark {
  return marks === 'bullet' ? (done ? '×' : '•') : done ? '☑' : '☐'
}

const blanks = (mark: Mark): PageLine[] => Array.from({ length: BLANKS }, () => ({ kind: 'item', mark, text: '' }))

function pickLines(top3: readonly Task[], marks: NotebookLayout['marks']): PageLine[] {
  return top3.map((t, i) => ({ kind: 'item', mark: taskMark(marks, !!t.completed_at), text: t.title, goal: i === 0, done: !!t.completed_at, taskId: t.id }))
}

/** The page: the layout's blocks that are on, in order, filled from the day. A block with nothing true
 * to say draws blanks to fill by hand (Top 3, Tasks) or is left out (Habits with no routine that day). */
export function buildPage(layout: NotebookLayout, data: PageData): PageBlock[] {
  const { marks } = layout
  const on = new Set(layout.blocks.filter((b) => b.on).map((b) => b.id))
  const out: PageBlock[] = []
  for (const { id } of layout.blocks) {
    if (!on.has(id)) continue
    if (id === 'header') {
      out.push({ id, title: headerDate(data.day, layout.header.long), aside: layout.header.sleep ? 'woke __ · slept __' : undefined, lines: [] })
    } else if (id === 'top3') {
      const lines = data.top3.length ? pickLines(data.top3, marks) : blanks(taskMark(marks, false))
      const plan = layout.top3.plan ? dayEvents(data.events, data.day, data.zone) : []
      if (plan.length) {
        lines.push({ kind: 'sub', text: 'PLAN' })
        for (const e of plan) lines.push({ kind: 'item', mark: marks === 'bullet' ? '○' : null, text: e.title, time: eventTime(e, data.zone, layout.top3.clock) })
      }
      out.push({ id, title: 'TOP 3', lines })
    } else if (id === 'tasks') {
      // Without its own Top 3 block (Kai's page), the picks lead the list — they're the day's tasks too.
      const picks = on.has('top3') ? [] : data.top3
      const pickIds = new Set(data.top3.map((t) => t.id))
      const rest = dayTasks(data.tasks, data.day, data.zone).filter((t) => !pickIds.has(t.id))
      const shown = rest.slice(0, layout.tasks.cap)
      const lines: PageLine[] = [
        ...pickLines(picks, marks),
        ...shown.map((t): PageLine => ({ kind: 'item', mark: taskMark(marks, false), text: t.title, taskId: t.id })),
      ]
      if (!lines.length) lines.push(...blanks(taskMark(marks, false)))
      if (rest.length > shown.length) lines.push({ kind: 'more', text: `+ ${rest.length - shown.length} more in the app` })
      out.push({ id, title: 'TASKS', lines })
    } else if (id === 'habits') {
      const done = new Set(data.completions.filter((c) => c.completed_on === data.day).map((c) => c.routine_id))
      // routinesForToday reads the device's local day; a local-noon Date of the page's day is that day in any zone.
      const [y, m, d] = data.day.split('-').map(Number)
      const due = routinesForToday([...data.routines], [...data.completions], new Date(y, m - 1, d, 12))
      if (!due.length) continue
      const items = due.map((r) => ({ mark: taskMark(marks, done.has(r.id)), text: r.name, done: done.has(r.id) }))
      out.push({ id, title: 'HABITS', lines: layout.habits.row ? [{ kind: 'row', items }] : items.map((i): PageLine => ({ kind: 'item', ...i })) })
    } else if (id === 'notes') {
      out.push({ id, title: 'NOTES', lines: Array.from({ length: layout.notes.lines }, (): PageLine => ({ kind: 'rule', mark: marks === 'bullet' ? '–' : null })) })
    } else {
      out.push({ id, title: null, lines: NIGHT_LINES.map((l): PageLine => ({ kind: 'prompt', ...l })) })
    }
  }
  return out
}

/** The task ids written on the page — what a photo of it can tick off. */
export function pageTaskIds(blocks: readonly PageBlock[]): string[] {
  return [...new Set(blocks.flatMap((b) => b.lines.flatMap((l) => (l.kind === 'item' && l.taskId ? [l.taskId] : []))))]
}

function lineText(l: PageLine): string | null {
  switch (l.kind) {
    case 'item':
      return [l.mark, l.goal ? '✶' : null, l.time ? `${l.time} ` : null, l.text || null].filter(Boolean).join(' ')
    case 'row':
      return l.items.map((i) => `${i.mark} ${i.text}`).join('   ')
    case 'sub':
    case 'more':
      return l.text
    case 'rule':
      return l.mark // a bare ruled line is only paper — nothing to paste
    case 'prompt':
      return `${l.mark}  ${l.text}`
  }
}

/** "Copy as text": plain lines with ☐ and •, a blank line between blocks — pastes cleanly into Notes or Obsidian. */
export function pageText(blocks: readonly PageBlock[]): string {
  return blocks
    .map((b) => {
      const head = b.id === 'header' ? [b.aside ? `${b.title}   ${b.aside}` : b.title] : b.title ? [b.title] : []
      return [...head, ...b.lines.map(lineText).filter((t): t is string => t !== null)].join('\n')
    })
    .join('\n\n')
}
