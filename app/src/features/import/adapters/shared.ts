// Shared plumbing for import adapters — pure, no app imports, unit-testable.
import * as chrono from 'chrono-node'

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
  /** RRULE body ("FREQ=WEEKLY;BYDAY=MO") — only sources that carry a repeat set it. */
  recurrence_rule?: string | null
  /** The SOURCE id (external_ref.id) of the parent task — the wizard nests it one level deep. */
  sourceParentId?: string | null
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

/** A Library book. books has no external_ref column, so books (and their quotes) match
 *  existing rows by `titleKey` instead of a source id. */
export interface ImportBook {
  title: string
  author: string | null
  published_year: number | null
  total_pages: number | null
  /** Goodreads' exclusive shelf; Kindle books are 'reading'. 'to-read' imports only on opt-in. */
  shelf: 'read' | 'reading' | 'to-read'
}

/** A highlight → quotes row, tied to its book by title. */
export interface ImportQuote {
  text: string
  book: string
  author: string | null
  page: string | null
}

export interface ImportNote {
  title: string | null
  body: string
  tags: string[]
  /** Book title, when the note belongs to one (Kindle notes, Goodreads reviews). */
  book: string | null
  external_ref: ExternalRef
}

/** A pending Inbox capture (Markdown paragraphs, on opt-in). */
export interface ImportInboxItem {
  raw_text: string
  external_ref: ExternalRef
}

export interface ImportBatch {
  source: string
  projects: ImportProject[]
  tasks: ImportTask[]
  events: ImportEvent[]
  books: ImportBook[]
  quotes: ImportQuote[]
  notes: ImportNote[]
  inbox: ImportInboxItem[]
}

export function emptyBatch(source: string): ImportBatch {
  return { source, projects: [], tasks: [], events: [], books: [], quotes: [], notes: [], inbox: [] }
}

/** Several files of one source (Todoist exports one CSV per project) → one batch. */
export function mergeBatches(batches: ImportBatch[]): ImportBatch {
  const out = emptyBatch(batches[0]?.source ?? '')
  for (const b of batches) {
    for (const k of ['projects', 'tasks', 'events', 'books', 'quotes', 'notes', 'inbox'] as const) (out[k] as unknown[]).push(...b[k])
  }
  return out
}

// ── Timezone — the phase-file pitfall. Akiflow datetimes are naive Cairo wall-clock
// ("2026-07-17T17:15:00", no offset); the app stores UTC and renders Africa/Cairo.
// Convert explicitly via Intl (no tz library installed; Egypt has DST again since 2023). ──

const TZ = 'Africa/Cairo'

/** A source's own zone column ("US/Eastern", "Africa/Cairo") when Intl knows it, else Cairo. */
export function zoneOr(tz: string | null | undefined): string {
  if (!tz?.trim()) return TZ
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() })
    return tz.trim()
  } catch {
    return TZ
  }
}

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

const ISO_LOCAL = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/
const pad = (n: number) => String(n).padStart(2, '0')
const looseCache = new Map<string, string | null>()

/** Free-text date ("Oct 5", "tomorrow 9am", "October 5, 2026 9:00 AM", "5/10/2026") read on
 *  `tz`'s wall clock by chrono — the command bar's engine and reference (parseCommand, T-4).
 *  No time given → that day's midnight, like every other date-only import. `forward` reads
 *  "monday"/"Sep 1" as the next one (recurrences); off, an overdue "Sep 1" stays this year's.
 *  An explicit zone ("9:00 AM (GMT+3)") is already an instant and stands. */
export function parseLooseDate(text: string, now: Date = new Date(), tz: string = TZ, forward = false): string | null {
  const v = text.trim()
  if (!v) return null
  if (ISO_LOCAL.test(v)) return naiveLocalToUtc(v.replace(' ', 'T'), tz)
  // ponytail: one cache for every adapter — exports repeat the same few date strings thousands of times.
  const key = `${tz}|${now.getTime()}|${forward}|${v}`
  if (looseCache.has(key)) return looseCache.get(key)!
  if (looseCache.size > 5000) looseCache.clear()
  const hit = chrono.parse(v, { instant: now, timezone: tzOffsetMs(tz, now) / 60_000 }, { forwardDate: forward })[0]
  let out: string | null = null
  if (hit) {
    const s = hit.start
    if (s.isCertain('timezoneOffset')) out = s.date().toISOString()
    else {
      const time = s.isCertain('hour') ? `${pad(s.get('hour')!)}:${pad(s.get('minute') ?? 0)}:00` : '00:00:00'
      out = naiveLocalToUtc(`${s.get('year')}-${pad(s.get('month')!)}-${pad(s.get('day')!)}T${time}`, tz)
    }
  }
  looseCache.set(key, out)
  return out
}

/** Today's midnight on `tz`'s wall clock, as UTC — the due date of a repeat with no start. */
export function todayMidnight(now: Date = new Date(), tz: string = TZ): string {
  return naiveLocalToUtc(new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now), tz)
}

const WEEKDAY: Record<string, string> = { mo: 'MO', tu: 'TU', we: 'WE', th: 'TH', fr: 'FR', sa: 'SA', su: 'SU' }
const FREQ: Record<string, string> = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }

/** Plain-English repeat ("every day", "every 2 weeks", "every other month", "every mon, fri",
 *  "every weekday", "weekly", Obsidian's "every week when done", Todoist's "every! day at 9am")
 *  → an RRULE body the app's rrule-based recurrence reads. Anything murkier → null; the source
 *  text survives in external_ref.raw. */
export function parseRecurrence(text: string): string | null {
  const t = text.toLowerCase().replace(/!/g, '').replace(/\bwhen done\b/, '')
    .replace(/\s+(at|from|starting|until|ending|for)\b.*$/, '').replace(/\s+/g, ' ').trim()
  const alias: Record<string, string> = { daily: 'every day', weekly: 'every week', monthly: 'every month', yearly: 'every year', annually: 'every year' }
  const s = alias[t] ?? t
  if (/^every (weekday|workday)s?$/.test(s) || s === 'weekdays') return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
  const days = (list: string) => {
    const parts = list.split(/\s*(?:,|\band\b)\s*/)
    return parts.every((d) => /^(mon|tue|wed|thu|fri|sat|sun)/.test(d)) ? parts.map((d) => WEEKDAY[d.slice(0, 2)]).join(',') : null
  }
  const m = s.match(/^every (?:(other|\d+) )?(day|week|month|year)s?(?: on (.+))?$/)
  if (m) {
    const interval = m[1] === 'other' ? 2 : m[1] ? parseInt(m[1], 10) : 1
    const byday = m[3] && FREQ[m[2]] === 'WEEKLY' ? days(m[3]) : null
    return `FREQ=${FREQ[m[2]]}${interval > 1 ? `;INTERVAL=${interval}` : ''}${byday ? `;BYDAY=${byday}` : ''}`
  }
  const d = s.match(/^every (.+)$/)
  const byday = d ? days(d[1]) : null
  return byday ? `FREQ=WEEKLY;BYDAY=${byday}` : null
}

/** Match key for books (and the quotes under them): lowercase letters/digits of the main title —
 *  subtitle (after ':') and series/author parentheticals dropped, so Kindle's "Dune (Dune Book 1)"
 *  meets Goodreads' "Dune (Dune, #1)" and a hand-typed "dune".
 *  ponytail: two different books sharing a main title collapse; add author to the key if that bites. */
export function titleKey(title: string): string {
  const main = title.split(/[:(]/)[0]
  return textKey(main) || textKey(title)
}

/** Punctuation-, case- and whitespace-blind text key (curly vs straight quotes, double spaces). */
export function textKey(s: string): string {
  return s.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/** Runs `fn` over `items`, handing the event loop back every `size` items — so a 5,000-row export
 *  (chrono on every date cell) never freezes the page while it parses. */
export async function eachChunked<T>(items: T[], fn: (item: T, i: number) => void, size = 250): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    if (i > 0 && i % size === 0) await new Promise((r) => setTimeout(r, 0))
    fn(items[i], i)
  }
}
