import { clockRange, clockText } from '../../lib/clock'
import type { ChatCall, ChatOutcome } from './api'

// Queue item 5: the confirmation card the chat draws for a plan, and the honest report after it runs.
// Everything here reads what the tools themselves said (the dry run's preview, then the real run's
// output — supabase/functions/chat), on the user's clock as the tools write it ("2026-10-26 07:00"),
// in the person's own 12/24-hour style (lib/clock). Pure, so it's tested (planCard.test.ts).

/** [the card's verb, the report's verb]. */
const VERB: Record<string, [string, string]> = {
  add_task: ['Add task', 'Added task'],
  add_event: ['Add event', 'Added event'],
  edit_task: ['Change', 'Changed'],
  reschedule_task: ['Move', 'Moved'],
  complete_task: ['Complete', 'Completed'],
  move_to_tomorrow: ['Move to tomorrow', 'Moved to tomorrow'],
  snooze_task: ['Snooze', 'Snoozed'],
  edit_event: ['Change', 'Changed'],
  delete_event: ['Delete', 'Deleted'],
  add_to_inbox: ['Add to Inbox', 'Added to Inbox'],
  file_inbox_item: ['File', 'Filed'],
  move_to_trash: ['Move to Trash', 'Moved to Trash'],
  reopen_task: ['Reopen', 'Reopened'],
  restore_from_trash: ['Bring back', 'Brought back'],
}
const verb = (tool: string, done = false) => VERB[tool]?.[done ? 1 : 0] ?? tool.replace(/_/g, ' ')

interface Item {
  title?: string
  text?: string
  name?: string
  start?: string
  end?: string
  all_day?: boolean
  kind?: string
  due?: string
  scheduled?: string
}

/** The thing a tool's answer is about: the first object in it with a title (it may sit one level down,
 * e.g. file_inbox_item's `{ filed: { as, task } }`). */
export function itemOf(o: unknown, depth = 0): Item | null {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null
  const r = o as Record<string, unknown>
  if (typeof r.title === 'string' || typeof r.text === 'string') return r as Item
  if (depth >= 2) return null
  for (const v of Object.values(r)) {
    const found = itemOf(v, depth + 1)
    if (found) return found
  }
  return null
}

/** "Mon 26 Oct" for a "YYYY-MM-DD…" wall string. */
export function dayLabel(wall: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${wall.slice(0, 10)}T12:00:00Z`))
}

/** "Mon 26 Oct · 7:00–8:15 AM", "Mon 26 Oct · all day", "due Tue 27 Oct 9:00 AM" — what the tool said. */
export function whenText(item: Item, h24: boolean, extra?: unknown): string | null {
  if (item.start) {
    if (item.all_day || item.start.length === 10) return `${dayLabel(item.start)}${item.end && item.end !== item.start ? ` – ${dayLabel(item.end)}` : ''} · all day`
    const [s, e] = [item.start, item.end ?? '']
    if (!e) return `${dayLabel(s)} · ${clockText(s.slice(11), h24)}`
    return e.slice(0, 10) === s.slice(0, 10) ? `${dayLabel(s)} · ${clockRange(s.slice(11), e.slice(11), h24)}` : `${dayLabel(s)} ${clockText(s.slice(11), h24)} – ${dayLabel(e)} ${clockText(e.slice(11), h24)}`
  }
  // A task: on the calendar (scheduled / its new block, "2026-10-26 07:00–08:15"), else due.
  const block = item.scheduled ?? (typeof extra === 'string' ? extra : undefined)
  const span = block && /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})–(\d{2}:\d{2})$/.exec(block)
  if (span) return `${dayLabel(span[1])} · ${clockRange(span[2], span[3], h24)}`
  if (item.due) return `due ${dayLabel(item.due)}${item.due.length > 10 ? ` ${clockText(item.due.slice(11), h24)}` : ''}`
  return null
}

/** What a step does / did, from the tool's answer: "Mon 26 Oct · 7:00–8:15 AM · Gym · HC". */
export function describe(output: Record<string, unknown> | undefined, call: ChatCall, h24: boolean): string {
  const item = output ? itemOf(output) : null
  const title = item?.title ?? item?.text ?? (typeof call.args.title === 'string' ? call.args.title : typeof call.args.text === 'string' ? call.args.text : '')
  const when = item ? whenText(item, h24, output?.calendar_block) : null
  const changed = Array.isArray(output?.changed) && call.tool.startsWith('edit') ? (output.changed as string[]).slice(0, 3).join(', ') : ''
  return [when, title, changed].filter(Boolean).join(' · ')
}

const NOUN: Record<string, string> = { add_event: 'event', add_task: 'task', add_to_inbox: 'Inbox note' }

/** The card's title: "Add 3 events", "Add an event", "Complete · 2", or "3 changes". */
export function planHeader(calls: readonly ChatCall[], previews: readonly Record<string, unknown>[] = []): string {
  const n = calls.length
  const tool = calls[0]?.tool
  if (!tool || calls.some((c) => c.tool !== tool)) return `${n} changes`
  const blocks = tool === 'add_event' && previews.length === n && previews.every((p) => itemOf(p)?.kind === 'time_block')
  const noun = blocks ? 'Time block' : NOUN[tool]
  if (noun) return n === 1 ? `Add ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}` : `Add ${n} ${noun}s`
  return n === 1 ? verb(tool) : `${verb(tool)} · ${n}`
}

/** One line per step. A card of one kind of step needs no verb on each line (the title says it). */
export function planLines(calls: readonly ChatCall[], previews: readonly Record<string, unknown>[], h24: boolean): string[] {
  const same = calls.every((c) => c.tool === calls[0]?.tool) && !!NOUN[calls[0]?.tool ?? '']
  return calls.map((c, i) => {
    const what = describe(previews[i], c, h24)
    return same ? what : `${verb(c.tool)} · ${what}`
  })
}

/** After the run: each tool's real answer, or its refusal, word for word (named by the card's preview
 * of it — an edit's call carries only an id). */
export function outcomeLine(o: ChatOutcome, h24: boolean, preview?: Record<string, unknown>): string {
  if (o.ok) return `${verb(o.tool, true)} · ${describe(o.output, o, h24)}`
  const item = preview ? itemOf(preview) : null
  const title = item?.title ?? item?.text ?? (typeof o.args.title === 'string' ? o.args.title : typeof o.args.text === 'string' ? o.args.text : '')
  return `Couldn't ${verb(o.tool).toLowerCase()}${title ? ` “${title}”` : ''}: ${o.error ?? 'it was refused'}`
}

/** "Done — 3 of 3", or how many didn't. */
export function outcomeHeader(outcomes: readonly ChatOutcome[]): string {
  const ok = outcomes.filter((o) => o.ok).length
  if (ok === outcomes.length) return ok === 1 ? 'Done' : `Done — all ${ok}`
  if (ok === 0) return 'Nothing changed'
  return `${ok} of ${outcomes.length} done`
}

/** What the model reads back in the history: never "done" unless the app ran it. */
export function historyText(state: 'pending' | 'editing' | 'cancelled' | 'done' | 'undone', lines: readonly string[]): string {
  const list = lines.map((l) => `- ${l}`).join('\n')
  switch (state) {
    case 'pending':
      return `Proposed — not done yet, waiting for the user's OK:\n${list}`
    case 'editing':
      return `Proposed — not done; the user wants to change it:\n${list}`
    case 'cancelled':
      return `The user cancelled this — nothing changed:\n${list}`
    case 'undone':
      return `What the app did, then the user undid:\n${list}`
    case 'done':
      return `The user confirmed. What the app did:\n${list}`
  }
}
