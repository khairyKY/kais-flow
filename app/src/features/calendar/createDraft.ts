import { create } from 'zustand'
import { toastUndo } from '../../lib/undo'
import { parseCommand, quickAddTask, type ParsedCommand } from '../command-bar/parseCommand'
import { offerProject } from '../projects/autoProject'
import { createTask, toastAdded } from '../tasks/api'
import type { Domain, Project } from '../../lib/types'
import { createEvent, deleteEvent, scheduleTask } from './api'
import { slotFields } from './eventTime'
import { TAP_MIN } from './phoneGridMath'
import { storeRange } from './rangeEdit'

// ── Add to the calendar, "type in place" (Kai 2026-11-16, Next up decisions §1 A). A tap or a drag on an
// empty slot opens a draft: a block right there with a caret in its title. Enter saves, Esc discards, a
// press anywhere else saves when there's a title and discards when there isn't. The kind is an event
// unless the title says otherwise: a leading "t " or a trailing "task" makes a task, a trailing "block" a
// Time block. Details (colour, repeat, project…) are the saved block's own popover / sheet. One state
// machine for the desktop grid and the phone grid. ──

export type DraftKind = 'event' | 'task' | 'block'

/** The slot a draft sits on: instants (a timed slot) or FullCalendar's dates (an all-day one). */
export interface DraftSpan {
  start: string
  end: string
  allDay: boolean
}

export interface Draft extends DraftSpan {
  /** What the title falls back to when it names no kind (a right-click's "New time block", a ⌘-click's task). */
  kind: DraftKind
}

/** The span a plain tap on `start` (an instant) makes. */
export const tapSpan = (start: string): DraftSpan => ({ start, end: new Date(Date.parse(start) + TAP_MIN * 60_000).toISOString(), allDay: false })

/** The kind a typed title names, and the title without the marker. */
export function readTitle(raw: string, preset: DraftKind = 'event'): { kind: DraftKind; text: string } {
  const text = raw.trim()
  const lead = /^t\s+(?=\S)/i.exec(text)
  if (lead) return { kind: 'task', text: text.slice(lead[0].length).trim() }
  const tail = /\s+(task|block)$/i.exec(text)
  if (tail) return { kind: tail[1].toLowerCase() === 'task' ? 'task' : 'block', text: text.slice(0, tail.index).trim() }
  return { kind: preset, text }
}

export type DraftEvent = 'enter' | 'escape' | 'outside'

/** What a key or a press does to a draft with this title (`text`: readTitle's, markers off). Enter on an
 * empty title waits (Kai 2026-10-21: no "Untitled" ever); Esc always discards; a press elsewhere keeps
 * what was typed and drops what wasn't. */
export function settle(text: string, ev: DraftEvent): 'save' | 'discard' | 'stay' {
  if (ev === 'escape') return 'discard'
  if (text) return 'save'
  return ev === 'enter' ? 'stay' : 'discard'
}

interface DraftStore {
  draft: Draft | null
  /** What's typed so far — the input owns the keystrokes, this is where a remount finds them again. */
  text: string
  open(d: Draft): void
  setText(t: string): void
  close(): void
}

export const useDraft = create<DraftStore>((set) => ({
  draft: null,
  text: '',
  open: (draft) => set({ draft, text: '' }),
  setText: (text) => set({ text }),
  close: () => set({ draft: null, text: '' }),
}))

// The press that settled a draft is also a click on whatever it landed on: if that was an empty slot it
// must not open the next draft ("tapping outside" only closes — the swallowed one is the click's select).
let outsideAt = -Infinity
export const markOutsidePress = (now = performance.now()) => void (outsideAt = now)
/** True once, within a second of an outside press settled a draft. */
export function takeOutsidePress(now = performance.now()): boolean {
  const hit = now - outsideAt < 1000
  outsideAt = -Infinity
  return hit
}

export interface DraftCtx {
  domains: Domain[]
  projects: Project[]
}

/** A task's quick parse (the command bar's: `!!`, `#project`, `*label`, `every week`, `// notes`); the slot, not the typed time, places it. */
export const parseTask = (text: string, { domains, projects }: DraftCtx): ParsedCommand => parseCommand(text, domains, projects, { zone: 'cairo' })

/** Writes the draft as what its title names, each through the outbox, with one Undo. */
export function saveDraft(span: DraftSpan, raw: string, preset: DraftKind, ctx: DraftCtx): void {
  const { kind, text } = readTitle(raw, preset)
  if (!text) return
  let startsAt = span.start
  let endsAt = span.end
  if (span.allDay) {
    // FullCalendar's all-day slot is dates; the stored form is storeRange's (midnights, the end the day after the last).
    const f = slotFields(span.start, span.end, true)
    ;({ starts_at: startsAt, ends_at: endsAt } = storeRange({ all_day: true, startDay: f.date, startTime: '00:00', endDay: f.endDate, endTime: '00:00' }))
  } else {
    startsAt = new Date(span.start).toISOString()
    endsAt = new Date(span.end).toISOString()
  }
  if (kind === 'task') {
    const parsed = parseTask(text, ctx)
    const minutes = span.allDay ? null : Math.max(1, Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000))
    const task = createTask({ ...quickAddTask(parsed, text), dueAt: startsAt, durationMin: minutes })
    scheduleTask(task, startsAt, endsAt, span.allDay)
    toastAdded(task, null)
    offerProject({ kind: 'task', row: task })
    return
  }
  const event = createEvent(text, startsAt, endsAt, kind === 'block' ? 'time_block' : 'event', null, span.allDay)
  toastUndo(`Added · ${text}`, () => void deleteEvent(event))
  offerProject({ kind: 'event', row: event })
}

/** A key or a press reached the open draft: carries it out and closes it. False when nothing happened (no
 * draft, or Enter on an empty title, which waits). */
export function finishDraft(ev: DraftEvent, ctx: DraftCtx): boolean {
  const { draft, text, close } = useDraft.getState()
  if (!draft) return false
  const act = settle(readTitle(text, draft.kind).text, ev)
  if (act === 'stay') return false
  close()
  if (act === 'save') saveDraft(draft, text, draft.kind, ctx)
  return true
}
