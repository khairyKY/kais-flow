import { parseCommand } from '../command-bar/parseCommand'
import { linkRef } from '../../lib/links'
import type { CreateTaskInput } from '../tasks/api'
import { dayWord } from '../inbox/inboxDisplay'
import { timeText } from '../calendar/eventTime'

// First Run 9g/9h — "What are 3 things on your mind today?". Each line is read by the command
// bar's own parser (chrono, on Cairo's clock): the date words leave the title and stay as the due
// date; a `30m` / `!!` rides along the same way. Every line becomes a Top 3 pick (api.ts).

export interface FirstThing {
  title: string
  dueAt: string | null
  durationMin: number | null
  priority: number | null
  /** `*label` words, when the line has any. */
  labels?: string[]
  /** "every day", `// notes`, a link — when the line has them (the bar's parse, P7e A5/A6/A19). */
  recurrenceRule?: CreateTaskInput['recurrenceRule']
  notes?: CreateTaskInput['notes']
  externalRef?: CreateTaskInput['externalRef']
}

/** One onboarding line → the task it becomes, or null for an empty line. */
export function readFirstThing(line: string, now: Date = new Date()): FirstThing | null {
  const text = line.trim()
  if (!text) return null
  const p = parseCommand(text, [], [], { now, zone: 'cairo' })
  return {
    title: p.title || text,
    dueAt: p.dueAt,
    durationMin: p.durationMin,
    priority: p.priority,
    ...(p.labels.length ? { labels: p.labels } : null),
    ...(p.recurrence ? { recurrenceRule: p.recurrence } : null),
    ...(p.notes ? { notes: p.notes } : null),
    ...(p.url ? { externalRef: linkRef(p.url) } : null),
  }
}

/** The date parse chip under a line (9h): "Tomorrow · 15:00", Cairo's day and 24h clock. */
export function whenChip(iso: string, now: Date = new Date()): string {
  return `${dayWord(iso, now)} · ${timeText(new Date(iso))}`
}

/** A day + time picked on a line's chip (9h: tapping the chip opens the date picker; null = No
 * date), and the date the line parsed to when it was picked. */
export interface PickedDate {
  over: string
  at: string | null
}

/** The line with its picked date, while the line still parses to the date it was picked over:
 * typing more title keeps the pick; typing a different date ("friday") takes over again. */
export function withPicked(thing: FirstThing | null, picked: PickedDate | undefined): FirstThing | null {
  return thing && picked && thing.dueAt === picked.over ? { ...thing, dueAt: picked.at } : thing
}
