import { useEffect, useRef, useState } from 'react'
import { get } from 'idb-keyval'
import { DEAD_KEY, OUTBOX_KEY, unsyncedChanges, type OutboxEntry } from '../lib/outbox'
import { useOnline } from '../lib/useOnline'

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

/** `saved` is the verb for a change with no activity row of its own; the not-saved list passes "changed". */
export function syncRows(queue: OutboxEntry[], saved = 'saved'): SyncRow[] {
  const activity = queue.filter((e) => e.table === 'activity_log')
  const changes = queue.filter((e) => e.table !== 'activity_log')

  if (changes.length === 0) {
    return activity.map((e) => {
      const { type } = eventOf(e)
      return { key: `activity_log-${e.id}`, kind: FAMILY_KIND[type.split('.')[0]] ?? 'Change', text: verbOf(type) || saved, queuedAt: e.queuedAt }
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
    const verb = verbById.get(e.id) ?? (e.op === 'delete' ? 'removed' : saved)
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

// ── The topbar's sync status (Kai 2026-10-07: "tedious to keep seeing the sync status going and
// going back … I don't need to keep seeing a notification for changes every 2 seconds"). Every
// write flipped it to "Syncing ↻ 1" and back to "Synced ●" with a glint — a round trip of about two
// seconds per change — and the Windows tray icon flipped with it. Now:
// - nothing while writes flush normally;
// - "Syncing…" only once something has waited longer than SLOW_SYNC_MS;
// - "Offline · N waiting" while offline;
// - "N not saved ⚠" when the server set a write aside (outbox dead letter) until someone looks;
// - a brief "Synced" only when an offline or not-saved spell clears. ──

export const SLOW_SYNC_MS = 4000
export const SYNCED_FLASH_MS = 2500

export type SyncKind = 'quiet' | 'syncing' | 'offline' | 'parked' | 'synced'
export interface SyncView {
  kind: SyncKind
  n: number
}
export interface SyncFacts {
  online: boolean
  /** unsyncedChanges(): the user's changes still queued. */
  waiting: number
  /** queuedAt of the oldest queued write. */
  oldestAt: number | null
  /** Writes the server rejected that nobody has looked at yet. */
  parked: number
  now: number
}
/** What the status remembers between steps: was it in trouble (offline / not saved), and until when "Synced" shows. */
export interface SyncMemory {
  troubled: boolean
  syncedUntil: number
}
export const CALM: SyncMemory = { troubled: false, syncedUntil: 0 }

/** One step of the status: what to show, what to remember, and when to look again (a write turning
 * slow, the "Synced" flash ending) — null when only new facts can change it. */
export function syncStep(m: SyncMemory, f: SyncFacts): { view: SyncView; memory: SyncMemory; recheckAt: number | null } {
  if (f.parked > 0) return { view: { kind: 'parked', n: f.parked }, memory: { troubled: true, syncedUntil: 0 }, recheckAt: null }
  if (!f.online) return { view: { kind: 'offline', n: f.waiting }, memory: { troubled: true, syncedUntil: 0 }, recheckAt: null }
  if (f.waiting > 0) {
    const slowAt = (f.oldestAt ?? f.now) + SLOW_SYNC_MS
    if (f.now >= slowAt) return { view: { kind: 'syncing', n: f.waiting }, memory: m, recheckAt: null }
    // A quick write during the "Synced" flash doesn't blink it off.
    const flashing = f.now < m.syncedUntil
    return { view: flashing ? { kind: 'synced', n: 0 } : { kind: 'quiet', n: f.waiting }, memory: m, recheckAt: flashing ? Math.min(slowAt, m.syncedUntil) : slowAt }
  }
  const syncedUntil = m.troubled ? f.now + SYNCED_FLASH_MS : m.syncedUntil
  if (f.now < syncedUntil) return { view: { kind: 'synced', n: 0 }, memory: { troubled: false, syncedUntil }, recheckAt: syncedUntil }
  return { view: { kind: 'quiet', n: 0 }, memory: CALM, recheckAt: null }
}

/** The topbar's words for a status; null = show nothing. */
export function syncLabel(v: SyncView): string | null {
  if (v.kind === 'syncing') return 'Syncing…'
  if (v.kind === 'offline') return v.n > 0 ? `Offline · ${v.n} waiting` : 'Offline'
  if (v.kind === 'parked') return `${plural(v.n, 'change')} not saved ⚠`
  if (v.kind === 'synced') return 'Synced'
  return null
}

/** True once `on` has held SLOW_SYNC_MS straight — the same rule for a page's own "Syncing" dot
 * (Today on a phone): a slow fetch shows, the refetch after every write doesn't. */
export function useLingering(on: boolean, ms = SLOW_SYNC_MS): boolean {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    if (!on) return
    const t = window.setTimeout(() => setSlow(true), ms)
    return () => window.clearTimeout(t)
  }, [on, ms])
  return on && slow
}

export type ParkedEntry = OutboxEntry & { failedAt?: number }

// Dead letters newer than this haven't been looked at. On a device's first run it's now: older ones
// were toasted when they happened (lib/outbox.ts), and this must not greet Kai with July's.
const SEEN_KEY = 'kf_sync_seen'
let seen: number | null = null
function seenAt(): number {
  if (seen !== null) return seen
  seen = Date.now()
  try {
    const stored = Number(localStorage.getItem(SEEN_KEY))
    if (stored) seen = stored
    else localStorage.setItem(SEEN_KEY, String(seen))
  } catch {
    /* no storage: this session only */
  }
  return seen
}

export interface SyncStatus {
  view: SyncView
  online: boolean
  /** The raw queue, for the popover's rows. */
  queue: OutboxEntry[]
  waiting: number
  parked: ParkedEntry[]
  /** The popover showed the not-saved rows: they stop counting. */
  seeParked: () => void
}

/** The outbox, its dead letters and the connection, through syncStep. The topbar and the Windows
 * tray read the same status, so neither flickers on an ordinary write. */
export function useSyncStatus(): SyncStatus {
  const online = useOnline()
  const [facts, setFacts] = useState<{ queue: OutboxEntry[]; waiting: number; parked: ParkedEntry[] }>({ queue: [], waiting: 0, parked: [] })
  useEffect(() => {
    let alive = true
    const read = () =>
      void Promise.all([get<OutboxEntry[]>(OUTBOX_KEY), unsyncedChanges(), get<ParkedEntry[]>(DEAD_KEY)]).then(([queue, waiting, dead]) => {
        const since = seenAt()
        if (alive) setFacts({ queue: queue ?? [], waiting, parked: (dead ?? []).filter((e) => (e.failedAt ?? 0) > since) })
      })
    read()
    const t = setInterval(read, 30_000) // belt and braces; the event does the work
    window.addEventListener('kf-outbox-change', read)
    window.addEventListener('online', read)
    window.addEventListener('offline', read)
    return () => {
      alive = false
      clearInterval(t)
      window.removeEventListener('kf-outbox-change', read)
      window.removeEventListener('online', read)
      window.removeEventListener('offline', read)
    }
  }, [])

  const oldestAt = facts.queue.length ? Math.min(...facts.queue.map((e) => e.queuedAt)) : null
  const memory = useRef(CALM)
  const [view, setView] = useState<SyncView>({ kind: 'quiet', n: 0 })
  useEffect(() => {
    let timer: number | undefined
    const run = () => {
      const s = syncStep(memory.current, { online, waiting: facts.waiting, oldestAt, parked: facts.parked.length, now: Date.now() })
      memory.current = s.memory
      setView(s.view)
      if (s.recheckAt !== null) timer = window.setTimeout(run, Math.max(0, s.recheckAt - Date.now()))
    }
    run()
    return () => window.clearTimeout(timer)
  }, [online, facts.waiting, facts.parked.length, oldestAt])

  const seeParked = () => {
    seen = Date.now()
    try {
      localStorage.setItem(SEEN_KEY, String(seen))
    } catch {
      /* this session only */
    }
    setFacts((f) => ({ ...f, parked: [] }))
  }
  return { view, online, ...facts, seeParked }
}
