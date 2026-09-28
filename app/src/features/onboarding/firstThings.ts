import { parseCommand } from '../command-bar/parseCommand'
import { dayWord } from '../inbox/inboxDisplay'
import { cairoTimeKey } from '../calendar/eventTime'

// First Run 9g/9h — "What are 3 things on your mind today?". Each line is read by the command
// bar's own parser (chrono, on Cairo's clock): the date words leave the title and stay as the due
// date; a `30m` / `!!` rides along the same way. Every line becomes a Top 3 pick (api.ts).

export interface FirstThing {
  title: string
  dueAt: string | null
  durationMin: number | null
  priority: number | null
}

/** One onboarding line → the task it becomes, or null for an empty line. */
export function readFirstThing(line: string, now: Date = new Date()): FirstThing | null {
  const text = line.trim()
  if (!text) return null
  const p = parseCommand(text, [], [], { now, zone: 'cairo' })
  return { title: p.title || text, dueAt: p.dueAt, durationMin: p.durationMin, priority: p.priority }
}

/** The date parse chip under a line (9h): "Tomorrow · 15:00", Cairo's day and 24h clock. */
export function whenChip(iso: string, now: Date = new Date()): string {
  return `${dayWord(iso, now)} · ${cairoTimeKey(new Date(iso))}`
}
