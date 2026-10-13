import type { Book, JournalEntry, Note, Quote, ResurfaceAction, ResurfacedLogRow } from '../../lib/types'

// ── "From a while ago" — the card's rules (Kai 2026-10-07: "I don't really understand what I can do
// with it; if I press Later… it's just a loop of snoozing something"). Every press settles the pick;
// "Not now" says how long; something put off twice asks once to keep it or let it go. Pure, so the
// card, Today and the tests share one copy. ──

/** What the card can offer. `keep` = Keep for something with nothing to make: a filed note (a task
 * already) or a memory (0078: a journal page, a quote, a library note — read again, never acted on). */
export type CardAction = 'plan' | 'done' | 'convert' | 'keep' | 'letgo' | 'notnow'

/** After this many "Not now"s the card stops offering a snooze and asks instead. */
export const PUT_OFF_LIMIT = 2

export interface CardSubject {
  kind: 'task' | 'note' | 'memory'
  /** A note already filed as a task (the Inbox's `filed`). */
  filed?: boolean
  putOffs: number
}

/** True when the card asks "keep it or let it go?" instead of offering another snooze. */
export const asksToSettle = (s: Pick<CardSubject, 'putOffs'>): boolean => s.putOffs >= PUT_OFF_LIMIT

/** The buttons, in order. */
export function cardActions(s: CardSubject): CardAction[] {
  const keep: CardAction = s.kind === 'task' ? 'plan' : s.kind === 'note' && !s.filed ? 'convert' : 'keep'
  if (asksToSettle(s)) return [keep, 'letgo']
  if (s.kind === 'task') return ['plan', 'done', 'letgo', 'notnow']
  // A memory: Keep (it may come round again after its rest) · Let it go (never again; nothing is deleted).
  if (s.kind === 'memory') return ['keep', 'letgo', 'notnow']
  return s.filed ? ['letgo', 'notnow'] : ['convert', 'letgo', 'notnow']
}

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`

/** "Not now · back in 5 days" — the real snooze length, never a bare "Later". */
export const notNowLabel = (snoozeDays: number): string => `Not now · back in ${days(snoozeDays)}`

export function actionLabel(a: CardAction, s: CardSubject, snoozeDays: number): string {
  const asking = asksToSettle(s)
  switch (a) {
    case 'plan':
      return asking ? 'Keep · Plan…' : 'Plan…'
    case 'convert':
      return asking ? 'Keep · Make it a task' : 'Make it a task'
    case 'keep':
      return 'Keep'
    case 'done':
      return 'Done'
    case 'letgo':
      return 'Let it go'
    case 'notnow':
      return notNowLabel(snoozeDays)
  }
}

/** "3 weeks ago" — coarse on purpose: the card is about "a while", not a timestamp. */
export function agoWords(fromIso: string, now: Date): string {
  const d = Math.max(0, Math.floor((now.getTime() - Date.parse(fromIso)) / 86_400_000))
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 14) return `${d} days ago`
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`
  if (d < 365) return `${Math.floor(d / 30)} months ago`
  const y = Math.floor(d / 365)
  return y === 1 ? 'a year ago' : `${y} years ago`
}

/** The meta line under the quote: what it is, where it lives, how old.
 * "Task · Shaheen website · added 3 weeks ago, untouched" / "Inbox note · captured 5 weeks ago". */
export function metaLine(
  s: { kind: 'task' | 'note'; place?: string | null; filed?: boolean; createdAt: string; updatedAt?: string | null },
  now: Date,
): string {
  if (s.kind === 'note') return ['Inbox note', s.filed ? 'filed as a task' : null, `captured ${agoWords(s.createdAt, now)}`].filter(Boolean).join(' · ')
  // A row written within a minute of its creation was never touched after it was added.
  const touched = s.updatedAt && Date.parse(s.updatedAt) - Date.parse(s.createdAt) > 60_000
  const age = `added ${agoWords(s.createdAt, now)}${touched ? ` · last touched ${agoWords(s.updatedAt!, now)}` : ', untouched'}`
  return ['Task', s.place, age].filter(Boolean).join(' · ')
}

/** How many times this thing was put off — counted from the synced log, so phone and PC agree. */
export const putOffCount = (rows: readonly ResurfacedLogRow[], entityId: string): number =>
  rows.filter((r) => r.entity_id === entityId && r.action === 'review_later').length

/** Migration 0059 is on the server once fetched rows carry `snoozed_until` (the 0058 pattern):
 * only then may the client send that column, or the new 'done' action. */
export const serverSettles = (row: ResurfacedLogRow): boolean => 'snoozed_until' in row

/** Done's mark: 'done' once 0059 allows it, else 'converted' (the old check would reject 'done'). */
export const doneAction = (row: ResurfacedLogRow): ResurfaceAction => (serverSettles(row) ? 'done' : 'converted')

/** Snoozed on any device (a row's `snoozed_until`) or on this one (the pre-0059 ledger). */
export function isSnoozed(rows: readonly ResurfacedLogRow[], entityId: string, ledger: Record<string, string>, now: number): boolean {
  const later = (iso: string | null | undefined) => !!iso && Date.parse(iso) > now
  return later(ledger[entityId]) || rows.some((r) => r.entity_id === entityId && later(r.snoozed_until))
}

/** Today's pick: the newest row whose entity isn't snoozed. */
export const latestPick = (rows: readonly ResurfacedLogRow[], ledger: Record<string, string>, now: number): ResurfacedLogRow | null =>
  rows.find((r) => !isSnoozed(rows, r.entity_id, ledger, now)) ?? null

// ── Memories (0078, P7e A24): old journal pages, quotes and library notes come round too. The card
// quotes their words and says where they're from; journal text never leaves our DB and UI. ──

export type MemoryKind = 'journal_entry' | 'quote' | 'note'

export interface Memory {
  kind: MemoryKind
  /** The words the card quotes — a long page is cut to an excerpt. */
  text: string
  /** A journal page's day (YYYY-MM-DD); a quote's or note's save time (ISO). */
  at: string
  /** A quote's book (else its source); a note's book. */
  from: string | null
  /** Who said a quote (else its book's author). */
  by: string | null
}

/** One line, at most `max` characters, cut at a word with an ellipsis. */
export function excerpt(text: string, max = 180): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** The memory a pick points at, or null — gone (deleted, trashed), wordless, or not loaded yet. */
export function memoryOf(
  row: Pick<ResurfacedLogRow, 'entity_type' | 'entity_id'>,
  data: { journal: readonly JournalEntry[]; quotes: readonly Quote[]; notes: readonly Note[]; books: readonly Book[] },
): Memory | null {
  const id = row.entity_id
  const book = (bookId: string | null) => (bookId ? data.books.find((b) => b.id === bookId) : undefined)
  switch (row.entity_type) {
    case 'journal_entry': {
      const e = data.journal.find((x) => x.id === id && !x.deleted_at)
      return e?.body.trim() ? { kind: 'journal_entry', text: excerpt(e.body), at: e.entry_date, from: null, by: null } : null
    }
    case 'quote': {
      const q = data.quotes.find((x) => x.id === id)
      if (!q?.text.trim()) return null
      const b = book(q.book_id)
      return { kind: 'quote', text: excerpt(q.text, 280), at: q.created_at, from: b?.title ?? q.source ?? null, by: q.author ?? b?.author ?? null }
    }
    case 'note': {
      const n = data.notes.find((x) => x.id === id)
      const words = n?.title?.trim() || n?.body.trim()
      return n && words ? { kind: 'note', text: excerpt(words), at: n.created_at, from: book(n.book_id)?.title ?? null, by: null } : null
    }
    default:
      return null
  }
}

/** "14 Jul 2026" for a YYYY-MM-DD day — read as the calendar day it names, whatever the zone. */
const dayWords = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** The meta line under a memory: "Journal · 14 Jul 2026 · 3 months ago" / "Quote · The Overstory ·
 * Richard Powers · saved 5 weeks ago" / "Library note · saved 3 weeks ago". */
export function memoryMeta(m: Memory, now: Date): string {
  if (m.kind === 'journal_entry') return ['Journal', dayWords(m.at), agoWords(m.at, now)].join(' · ')
  const label = m.kind === 'quote' ? 'Quote' : 'Library note'
  return [label, m.from, m.by, `saved ${agoWords(m.at, now)}`].filter(Boolean).join(' · ')
}
