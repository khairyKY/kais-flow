import type { OutboxEntry } from '../lib/outbox'

// Deliberately NOT importing features/activity/describe.ts: this runs in the shell's initial
// chunk, and describe.ts would add ~5 kB gzip to it (bundle budget) for a rare case. Activity-only
// rows get a short family + verb here instead ("Ritual · step completed").

// The topbar's queue popover (States.dc.html 2b: `TASK  'buy milk' · completed  4 MIN AGO`),
// built from the raw outbox. 2026-09-26 audit: it printed raw table names ("ACTIVITY_LOG saved")
// and listed every action twice, because each change also queues its `activity_log` row.
//
// Rows here are the user's changes, the same set `unsyncedChanges()` (lib/outbox.ts) counts:
// the non-activity entries, or — when only activity rows are waiting (a ritual step, a review
// verdict) — those. The paired activity row only lends its verb ("completed", "captured").
// (lib/outbox.ts belongs to another worker; if it ever exports its filter, use it here.)

/** Human names for every table the app writes through the outbox. Never the table name itself. */
const KIND: Record<string, string> = {
  tasks: 'Task',
  inbox_items: 'Inbox',
  journal_entries: 'Journal',
  calendar_events: 'Event',
  routines: 'Routine',
  routine_completions: 'Routine',
  people: 'Person',
  interactions: 'Person',
  projects: 'Project',
  areas: 'Area',
  domains: 'Domain',
  time_entries: 'Focus',
  app_settings: 'Settings',
  push_subscriptions: 'Settings',
  resurfaced_log: 'Resurfaced',
  books: 'Library',
  notes: 'Library',
  quotes: 'Library',
  commentary: 'Library',
}

/** Event family (the part before the dot) → kind, for activity-only rows. */
const FAMILY_KIND: Record<string, string> = {
  task: 'Task',
  capture: 'Inbox',
  inbox: 'Inbox',
  routine: 'Routine',
  ritual: 'Ritual',
  calendar_event: 'Event',
  calendar: 'Event',
  people: 'Person',
  person: 'Person',
  journal: 'Journal',
  project: 'Project',
  area: 'Area',
  domain: 'Review',
  review: 'Review',
  entity: 'Review',
  resurfaced: 'Resurfaced',
  book: 'Library',
  note: 'Library',
  quote: 'Library',
  commentary: 'Library',
  onboarding: 'Garden',
}

export interface SyncRow {
  key: string
  /** Mono tag, e.g. "Task" (the popover uppercases it). */
  kind: string
  /** e.g. `'buy milk' · completed`, or `step completed` for an activity-only row. */
  text: string
  queuedAt: number
}

/** The fields of a queued activity_log row this popover reads. */
function eventOf(e: OutboxEntry): { type: string; entityId: string } {
  const p = e.payload as { event_type?: unknown; entity_id?: unknown }
  return { type: String(p.event_type ?? ''), entityId: String(p.entity_id ?? '') }
}

function plural(n: number, noun: string): string {
  return `${n} ${n === 1 ? noun : `${noun}s`}`
}

/** The short verb from the change's own activity event: "task.completed" → "completed". */
function verbOf(eventType: string): string {
  const suffix = eventType.split('.').slice(1).join('.')
  if (!suffix) return ''
  if (suffix === 'created') return 'added'
  return suffix.replace(/_/g, ' ')
}

function labelOf(e: OutboxEntry): string {
  const p = e.payload as Record<string, unknown>
  // Journal bodies stay out of the chrome — the row says "Journal · added", like the export.
  if (e.table === 'journal_entries') return ''
  const v = p.title ?? p.raw_text ?? p.name ?? p.summary
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
}

export function syncRows(queue: OutboxEntry[]): SyncRow[] {
  const activity = queue.filter((e) => e.table === 'activity_log')
  const changes = queue.filter((e) => e.table !== 'activity_log')

  if (changes.length === 0) {
    return activity.map((e) => {
      const { type } = eventOf(e)
      return { key: `activity_log-${e.id}`, kind: FAMILY_KIND[type.split('.')[0]] ?? 'Change', text: verbOf(type) || 'saved', queuedAt: e.queuedAt }
    })
  }

  // The newest activity event per entity id lends its verb to that entity's row.
  const verbById = new Map<string, string>()
  for (const a of [...activity].sort((x, y) => x.queuedAt - y.queuedAt)) {
    const { type, entityId } = eventOf(a)
    const verb = verbOf(type)
    if (verb) verbById.set(entityId, verb)
  }

  return changes.map((e) => {
    const label = labelOf(e)
    const verb = verbById.get(e.id) ?? (e.op === 'delete' ? 'removed' : 'saved')
    return {
      key: `${e.table}-${e.id}`,
      kind: KIND[e.table] ?? 'Change',
      text: label ? `'${label}' · ${verb}` : verb,
      queuedAt: e.queuedAt,
    }
  })
}

/** Popover header: "Offline ◌ · 2 changes saved here" / "Syncing ↻ · 1 change waiting to sync". */
export function syncHeader(n: number, online: boolean): string {
  return online ? `Syncing ↻ · ${plural(n, 'change')} waiting to sync` : `Offline ◌ · ${plural(n, 'change')} saved here`
}
