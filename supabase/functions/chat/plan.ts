// The chat's acting half (queue item 5, 2026-10-25): the tools it may call, how one of the model's
// planned steps becomes a call to the MCP server's own tool (mcp/tools.ts — the same code, run as the
// user), what takes each one back, and the honesty checks on what the model says. Pure — no Deno
// APIs — so the app's vitest runs it (app/src/features/chat/plan.test.ts).
//
// Reads run at once. Every write is planned with ONE `propose` call (Groq's gpt-oss models make one
// tool call per turn, so a list is the only way three gym sessions arrive together); nothing is
// written until the user confirms the card the app draws from the dry run. The journal and people
// are out of reach: no step can name them, and the chat's Store has neither scope.
import { resolveWhen } from './when.ts'

/** A tool call as the MCP server runs it. */
export interface Call {
  tool: string
  args: Record<string, unknown>
}

/** What the model may ask the database without asking the user (the MCP tool of the same name). */
export const READ_TOOLS = ['calendar', 'search', 'list_tasks', 'inbox', 'projects', 'get_task'] as const
/** What a confirmed card may run: the steps `propose` offers. */
export const WRITE_TOOLS = [
  'add_task', 'edit_task', 'reschedule_task', 'complete_task', 'move_to_tomorrow', 'snooze_task',
  'add_event', 'edit_event', 'delete_event', 'add_to_inbox', 'file_inbox_item', 'move_to_trash',
] as const
/** What a confirmed card may run. (Its Undo isn't a tool call: the app writes the rows back, restorePlan.) */
export const RUNNABLE: ReadonlySet<string> = new Set<string>(WRITE_TOOLS)
/** The most steps one card holds. */
export const MAX_STEPS = 20

const str = { type: 'string' }
const fn = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
})

/** The tools as Groq reads them: short, because the free plan allows 8K tokens a minute. */
export const CHAT_TOOLS = [
  fn('calendar', 'Events and blocks between two days, both included (default: today and the next 6 days).', { from: { ...str, description: 'YYYY-MM-DD' }, to: { ...str, description: 'YYYY-MM-DD' } }),
  fn('search', "Search the user's tasks, events, projects, inbox and notes.", { query: str }, ['query']),
  fn('list_tasks', 'Tasks, filtered.', {
    status: { type: 'string', enum: ['open', 'done', 'all'] },
    project_id: str,
    due_from: { ...str, description: 'YYYY-MM-DD' },
    due_to: { ...str, description: 'YYYY-MM-DD' },
  }),
  fn('inbox', 'The Inbox: captures waiting to be sorted.'),
  fn('projects', 'Projects and areas, with their ids.'),
  fn('get_task', 'One task in full.', { id: str }, ['id']),
  fn(
    'propose',
    "Plan changes to the user's data. NOTHING changes until the user taps Confirm on the card the app shows, so never say it's done. Put every change the request needs in ONE call, one step per item, in the user's order. " +
      'Steps: add_task (title, when?, duration_min?, project_id?, notes?, priority?, top3?) · edit_task (id + what changes: title, notes, duration_min, project_id, priority, top3) · reschedule_task (id, when) · complete_task (id) · move_to_tomorrow (id) · snooze_task (id, when) · ' +
      'add_event (title, when, kind?, remind_min?, repeat?) · edit_event (id + title/when/kind/remind_min) · delete_event (id) · add_to_inbox (text) · file_inbox_item (id, as, title?, when?, project_id?) · move_to_trash (id of a task or inbox item).',
    {
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            do: { type: 'string', enum: WRITE_TOOLS },
            id: { ...str, description: 'An existing item: its ref from the lists ([t2], [e1], [i3]) or an id from a tool result.' },
            title: str,
            when: { ...str, description: "The user's own words for the day and time, copied: 'Mon 7:00–8:15', 'Wed 5:45–7:00 PM', 'tomorrow 9am', '30 Oct'. A day alone: all-day event / due that day." },
            duration_min: { type: 'integer' },
            kind: { type: 'string', enum: ['event', 'time_block'] },
            remind_min: { type: 'integer' },
            repeat: { ...str, description: 'RRULE body, e.g. FREQ=WEEKLY;BYDAY=MO' },
            project_id: str,
            notes: { ...str, description: 'Tasks only. Events have no notes: keep short details in the title.' },
            priority: { type: 'integer', enum: [1, 2, 3] },
            top3: { type: 'boolean' },
            text: str,
            as: { type: 'string', enum: ['task', 'event', 'note'] },
          },
          required: ['do'],
          additionalProperties: false,
        },
      },
    },
    ['steps'],
  ),
]

/** Short refs the prompt's lists give items ([t2] a task, [e1] an event, [i3] an Inbox item) → ids. */
export type Refs = Record<string, { id: string; type: 'task' | 'calendar_event' | 'inbox_item' }>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EVENT_WHEN = new Set(['add_event', 'edit_event'])
const SNOOZE_WORDS = new Set(['later today', 'this evening', 'tomorrow', 'next week'])

/** One planned step → the MCP call it is, or why it can't be one (the model reads that and fixes it). */
export function stepToCall(step: Record<string, unknown>, refs: Refs, now: Date, zone: string): Call | { error: string } {
  const { do: tool, id, when, ...rest } = step
  if (typeof tool !== 'string' || !(WRITE_TOOLS as readonly string[]).includes(tool)) return { error: `"${String(tool)}" isn't a step I can take.` }
  const args: Record<string, unknown> = { ...rest }
  let target: Refs[string] | null = null
  if (id !== undefined && id !== null) {
    const key = String(id).trim().replace(/^\[|\]$/g, '').toLowerCase()
    target = refs[key] ?? (UUID.test(key) ? { id: key, type: tool.includes('event') ? 'calendar_event' : 'task' } : null)
    if (!target) return { error: `${tool}: I can't tell which item "${String(id)}" is — use a ref from the lists or find it first.` }
    args.id = target.id
  }
  let name = tool
  if (tool === 'move_to_trash') {
    // An event goes to Trash through delete_event (the tool for events); a task or capture by its type.
    if (target?.type === 'calendar_event') name = 'delete_event'
    else args.type = target?.type ?? 'task'
  }
  if (when !== undefined && when !== null && when !== '') {
    const words = String(when)
    if (tool === 'snooze_task' && SNOOZE_WORDS.has(words.trim().toLowerCase())) args.until = words.trim().toLowerCase()
    else {
      const r = resolveWhen(words, now, zone)
      if (!r) return { error: `${tool}: I couldn't read the time "${words}".` }
      const minutes = r.end ? Math.round((Date.parse(`${r.end}:00Z`) - Date.parse(`${r.start}:00Z`)) / 60_000) : null
      if (EVENT_WHEN.has(tool) || (tool === 'file_inbox_item' && args.as === 'event')) {
        args.start = r.start
        if (r.end) args.end = r.end
      } else if (tool === 'reschedule_task') args.when = r.start
      else if (tool === 'snooze_task') args.until = r.start
      else if (tool === 'add_task' || tool === 'file_inbox_item') {
        args.due = r.start
        if (minutes && args.duration_min === undefined) args.duration_min = minutes
      } else return { error: `${tool} takes no "when" — use reschedule_task to move a task.` }
    }
  }
  return { tool: name, args }
}

/** The tables a confirmed batch can change — what its Undo puts back (Kai 2026-10-25: "add the undo
 * bit" — edits, moves, unschedules, status and project changes too, not only adds). In write order:
 * a task before its blocks. */
export const UNDO_TABLES = ['tasks', 'calendar_events', 'inbox_items', 'notes'] as const

/** Rows by table → id → the row as stored (minus the owner and search columns). */
export type Snapshot = Record<string, Map<string, Record<string, unknown>>>

/** One Undo for a whole batch: every row it changed or removed, exactly as it was (`put`), and every
 * row it made (`drop`, children first). The app writes them through its outbox. */
export interface Restore {
  put: { table: string; row: Record<string, unknown> }[]
  drop: { table: string; id: string }[]
}

/** The batch's Undo, from the rows before and after it: no tool call needed, nothing guessed. */
export function restorePlan(before: Snapshot, after: Snapshot): Restore {
  const out: Restore = { put: [], drop: [] }
  for (const table of UNDO_TABLES) {
    const was = before[table] ?? new Map()
    const now = after[table] ?? new Map()
    for (const [id, row] of was) if (JSON.stringify(now.get(id)) !== JSON.stringify(row)) out.put.push({ table, row })
    for (const id of now.keys()) if (!was.has(id)) out.drop.unshift({ table, id })
  }
  return out
}

/** A request to change something (not a question): retrieval hits and the app guide stay out of its
 * prompt, and no reference chips follow it. */
export function looksLikeAction(text: string): boolean {
  return /^\s*(?:(?:please|pls|can you|could you|would you|i need you to|go ahead and)\s+)?(?:add|schedule|book|put|create|make|move|reschedule|push|postpone|complete|finish|mark|tick|check off|delete|remove|cancel|trash|file|snooze|remind|block|set up|plan|rename|change|clear)\b/i.test(text)
}

/** The model saying it changed something ("I've added…"): only the app's card may claim that. */
export function claimsAction(text: string): boolean {
  return /\b(?:i(?:'|’)ve|i have|i(?:'|’)ll|i will|i just|i)\s+(?:now\s+)?(?:added|scheduled|created|booked|moved|rescheduled|deleted|removed|completed|marked|filed|snoozed|put|set up|blocked)\b/i.test(text) ||
    /\b(?:has|have) been (?:added|scheduled|created|booked|moved|deleted|completed|filed)\b/i.test(text)
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'you', 'are', 'was', 'into', 'about', 'what', 'have'])
const wordsOf = (s: string) => s.toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w))

/** Reference chips only for what the answer actually talks about: every meaningful word of the item's
 * title appears in the answer. At most `max`, no repeats. */
export function relevantCitations<T extends { title: string | null }>(answer: string, hits: readonly T[], max = 3): T[] {
  const said = new Set(wordsOf(answer))
  const seen = new Set<string>()
  const out: T[] = []
  for (const h of hits) {
    const w = wordsOf(h.title ?? '')
    const key = w.join(' ')
    if (!w.length || seen.has(key) || !w.every((x) => said.has(x))) continue
    seen.add(key)
    out.push(h)
    if (out.length === max) break
  }
  return out
}
