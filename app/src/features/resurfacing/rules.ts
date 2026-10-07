import type { ResurfaceAction, ResurfacedLogRow } from '../../lib/types'

// ── "From a while ago" — the card's rules (Kai 2026-10-07: "I don't really understand what I can do
// with it; if I press Later… it's just a loop of snoozing something"). Every press settles the pick;
// "Not now" says how long; something put off twice asks once to keep it or let it go. Pure, so the
// card, Today and the tests share one copy. ──

/** What the card can offer. `keep` = a filed note's Keep (it is a task already: nothing to make). */
export type CardAction = 'plan' | 'done' | 'convert' | 'keep' | 'letgo' | 'notnow'

/** After this many "Not now"s the card stops offering a snooze and asks instead. */
export const PUT_OFF_LIMIT = 2

export interface CardSubject {
  kind: 'task' | 'note'
  /** A note already filed as a task (the Inbox's `filed`). */
  filed?: boolean
  putOffs: number
}

/** True when the card asks "keep it or let it go?" instead of offering another snooze. */
export const asksToSettle = (s: Pick<CardSubject, 'putOffs'>): boolean => s.putOffs >= PUT_OFF_LIMIT

/** The buttons, in order. */
export function cardActions(s: CardSubject): CardAction[] {
  const keep: CardAction = s.kind === 'task' ? 'plan' : s.filed ? 'keep' : 'convert'
  if (asksToSettle(s)) return [keep, 'letgo']
  if (s.kind === 'task') return ['plan', 'done', 'letgo', 'notnow']
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
