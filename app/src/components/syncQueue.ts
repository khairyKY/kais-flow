import type { OutboxEntry } from '../lib/outbox'
import type { ActivityLogEntry } from '../lib/types'
import { describeActivity, plural, type ActivityCategory } from '../features/activity/describe'

// The topbar's queue popover (States.dc.html 2b: `TASK  'buy milk' · completed  4 MIN AGO`),
// built from the raw outbox. 2026-09-26 audit: it printed raw table names ("ACTIVITY_LOG saved")
// and listed every action twice, because each change also queues its `activity_log` row.
//
// Rows here are the user's changes, the same set `unsyncedChanges()` (lib/outbox.ts) counts:
// the non-activity entries, or — when only activity rows are waiting (a ritual step, a review
// verdict) — those. The paired activity row only lends its verb ("completed", "captured").

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

const CATEGORY_KIND: Record<ActivityCategory, string> = {
  tasks: 'Task',
  inbox: 'Inbox',
  routines: 'Routine',
  calendar: 'Event',
  people: 'Person',
  journal: 'Journal',
  projects: 'Project',
  review: 'Review',
  library: 'Library',
  garden: 'Garden',
}

export interface SyncRow {
  key: string
  /** Mono tag, e.g. "Task" (the popover uppercases it). */
  kind: string
  /** e.g. `'buy milk' · completed`, or `Morning ritual — pick your Top-3`. */
  text: string
  queuedAt: number
}

function asActivity(e: OutboxEntry): ActivityLogEntry {
  const p = e.payload as Partial<ActivityLogEntry>
  return {
    id: e.id,
    event_type: String(p.event_type ?? ''),
    entity_type: String(p.entity_type ?? ''),
    entity_id: String(p.entity_id ?? ''),
    payload: (p.payload as Record<string, unknown> | null) ?? null,
    created_at: new Date(e.queuedAt).toISOString(),
  }
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
      const line = describeActivity(asActivity(e))
      return { key: `activity_log-${e.id}`, kind: CATEGORY_KIND[line.category], text: line.text, queuedAt: e.queuedAt }
    })
  }

  // The newest activity event per entity id lends its verb to that entity's row.
  const verbById = new Map<string, string>()
  for (const a of [...activity].sort((x, y) => x.queuedAt - y.queuedAt)) {
    const act = asActivity(a)
    const verb = verbOf(act.event_type)
    if (verb) verbById.set(act.entity_id, verb)
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
