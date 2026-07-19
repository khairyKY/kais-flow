// Shared plumbing for import adapters — pure, no app imports, unit-testable.

export interface ExternalRef {
  source: string
  id: string
  /** The WHOLE original source row — nothing is ever silently dropped. */
  raw: Record<string, unknown>
}

/** Normalized task shape an adapter emits. `sourceProjectId` is the SOURCE's project id/name —
 *  the wizard resolves it to an app project uuid at commit time (existing row or new). */
export interface ImportTask {
  title: string
  notes: string | null
  priority: number | null
  duration_min: number | null
  due_at: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  someday: boolean
  done: boolean
  completed_at: string | null
  labels: string[]
  sourceProjectId: string | null
  external_ref: ExternalRef
}

export interface ImportProject {
  name: string
  external_ref: ExternalRef
}

export interface ImportEvent {
  title: string
  starts_at: string
  ends_at: string
  all_day: boolean
  external_ref: ExternalRef
}

export interface ImportBatch {
  source: string
  projects: ImportProject[]
  tasks: ImportTask[]
  events: ImportEvent[]
}

// ── Timezone — the phase-file pitfall. Akiflow datetimes are naive Cairo wall-clock
// ("2026-07-17T17:15:00", no offset); the app stores UTC and renders Africa/Cairo.
// Convert explicitly via Intl (no tz library installed; Egypt has DST again since 2023). ──

const TZ = 'Africa/Cairo'

function tzOffsetMs(tz: string, date: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  )
  const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second)
  return asIfUtc - date.getTime()
}

/** Naive local wall-clock ("YYYY-MM-DDTHH:mm:ss" or date-only "YYYY-MM-DD", meaning midnight)
 *  in `tz` → UTC ISO string. Two-pass so a DST boundary between guess and answer still lands. */
export function naiveLocalToUtc(naive: string, tz: string = TZ): string {
  const wall = naive.includes('T') ? naive : `${naive}T00:00:00`
  const guess = new Date(`${wall}Z`)
  const offset = tzOffsetMs(tz, guess)
  let utc = new Date(guess.getTime() - offset)
  const offset2 = tzOffsetMs(tz, utc)
  if (offset2 !== offset) utc = new Date(guess.getTime() - offset2)
  return utc.toISOString()
}

// ── Priority — Akiflow GOAL/HIGH/MEDIUM/LOW → the app's 1/2/3 scheme
// (taskDisplay.ts: 1 = "!!!" most urgent, 2 = "!!", 3 = "!"). GOAL folds into 1 —
// the app has no goal tier on tasks; the raw value survives in external_ref.raw. ──
const PRIORITY_MAP: Record<string, number> = { GOAL: 1, HIGH: 1, MEDIUM: 2, LOW: 3, '1': 1, '2': 2, '3': 3 }

export function mapPriority(p: string | number | null | undefined): number | null {
  if (p == null) return null
  return PRIORITY_MAP[String(p).trim().toUpperCase()] ?? null
}

/** djb2 hash → hex — stable idempotency key for sources with no ids (CSV). */
export function stableHash(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0
  return h.toString(16)
}

/** Akiflow descriptions arrive as HTML-ish text with <br /> line breaks — flatten to plain text. */
export function stripBreaks(s: string): string {
  return s.replace(/<br\s*\/?>/gi, '\n').trim()
}
