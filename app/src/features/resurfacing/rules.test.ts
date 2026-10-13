import { describe, expect, it } from 'vitest'
import type { Book, JournalEntry, Note, Quote, ResurfacedLogRow } from '../../lib/types'
import { actionLabel, agoWords, asksToSettle, cardActions, doneAction, excerpt, isSnoozed, latestPick, memoryMeta, memoryOf, metaLine, notNowLabel, putOffCount } from './rules'

const NOW = new Date('2026-10-07T10:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()
const row = (id: string, entity: string, over: Partial<ResurfacedLogRow> = {}): ResurfacedLogRow => ({
  id, entity_type: 'task', entity_id: entity, shown_on: '2026-10-07', action: 'pending', created_at: NOW.toISOString(), ...over,
})

describe('cardActions — every button settles something', () => {
  it('a task: Plan… · Done · Let it go · Not now', () => {
    expect(cardActions({ kind: 'task', putOffs: 0 })).toEqual(['plan', 'done', 'letgo', 'notnow'])
    expect(cardActions({ kind: 'task', putOffs: 1 })).toEqual(['plan', 'done', 'letgo', 'notnow'])
  })
  it('a waiting note: Make it a task · Let it go · Not now', () => {
    expect(cardActions({ kind: 'note', putOffs: 0 })).toEqual(['convert', 'letgo', 'notnow'])
  })
  it('a filed note (already a task): Let it go · Not now', () => {
    expect(cardActions({ kind: 'note', filed: true, putOffs: 0 })).toEqual(['letgo', 'notnow'])
  })
  it('put off twice: asks once — Keep or Let it go, no snooze', () => {
    for (const s of [{ kind: 'task' as const, putOffs: 2 }, { kind: 'note' as const, putOffs: 2 }, { kind: 'note' as const, filed: true, putOffs: 3 }]) {
      expect(asksToSettle(s)).toBe(true)
      expect(cardActions(s)).not.toContain('notnow')
      expect(cardActions(s)).toHaveLength(2)
      expect(cardActions(s)[1]).toBe('letgo')
    }
    expect(cardActions({ kind: 'task', putOffs: 2 })[0]).toBe('plan')
    expect(cardActions({ kind: 'note', putOffs: 2 })[0]).toBe('convert')
    expect(cardActions({ kind: 'note', filed: true, putOffs: 2 })[0]).toBe('keep')
    expect(asksToSettle({ putOffs: 1 })).toBe(false)
  })
})

describe('labels', () => {
  it('Not now says the real length', () => {
    expect(notNowLabel(5)).toBe('Not now · back in 5 days')
    expect(notNowLabel(1)).toBe('Not now · back in 1 day')
    expect(actionLabel('notnow', { kind: 'task', putOffs: 0 }, 2)).toBe('Not now · back in 2 days')
  })
  it('the keep action says Keep when the card is asking', () => {
    expect(actionLabel('plan', { kind: 'task', putOffs: 0 }, 5)).toBe('Plan…')
    expect(actionLabel('plan', { kind: 'task', putOffs: 2 }, 5)).toBe('Keep · Plan…')
    expect(actionLabel('convert', { kind: 'note', putOffs: 2 }, 5)).toBe('Keep · Make it a task')
    expect(actionLabel('letgo', { kind: 'task', putOffs: 2 }, 5)).toBe('Let it go')
  })
})

describe('metaLine — what it is and how old', () => {
  it('a task: kind · place · age, untouched', () => {
    expect(metaLine({ kind: 'task', place: 'Shaheen website', createdAt: daysAgo(21), updatedAt: daysAgo(21) }, NOW)).toBe('Task · Shaheen website · added 3 weeks ago, untouched')
  })
  it('a task touched since, no place', () => {
    expect(metaLine({ kind: 'task', place: null, createdAt: daysAgo(40), updatedAt: daysAgo(9) }, NOW)).toBe('Task · added 5 weeks ago · last touched 9 days ago')
  })
  it('an inbox note', () => {
    expect(metaLine({ kind: 'note', createdAt: daysAgo(35) }, NOW)).toBe('Inbox note · captured 5 weeks ago')
    expect(metaLine({ kind: 'note', filed: true, createdAt: daysAgo(90) }, NOW)).toBe('Inbox note · filed as a task · captured 3 months ago')
  })
  it('agoWords', () => {
    expect(agoWords(daysAgo(0), NOW)).toBe('today')
    expect(agoWords(daysAgo(1), NOW)).toBe('yesterday')
    expect(agoWords(daysAgo(4), NOW)).toBe('4 days ago')
    expect(agoWords(daysAgo(14), NOW)).toBe('2 weeks ago')
    expect(agoWords(daysAgo(400), NOW)).toBe('a year ago')
  })
})

describe('put-offs and snoozes come from the synced log', () => {
  const rows = [row('r3', 'a'), row('r2', 'a', { action: 'review_later', shown_on: '2026-09-20' }), row('r1', 'a', { action: 'review_later', shown_on: '2026-09-01' }), row('r0', 'b', { action: 'review_later' })]
  it('counts only this entity’s Not nows', () => {
    expect(putOffCount(rows, 'a')).toBe(2)
    expect(putOffCount(rows, 'b')).toBe(1)
    expect(putOffCount(rows, 'c')).toBe(0)
  })
  it('a snooze on any row (another device) or in this device’s ledger hides the entity until it wakes', () => {
    const now = NOW.getTime()
    const synced = [row('x2', 'a'), row('x1', 'a', { snoozed_until: daysAgo(-3) }), row('x0', 'b')]
    expect(isSnoozed(synced, 'a', {}, now)).toBe(true)
    expect(isSnoozed(synced, 'b', {}, now)).toBe(false)
    expect(isSnoozed(synced, 'b', { b: daysAgo(-1) }, now)).toBe(true)
    expect(isSnoozed(synced, 'b', { b: daysAgo(1) }, now)).toBe(false) // woke yesterday
    expect(latestPick(synced, {}, now)?.id).toBe('x0')
    expect(latestPick(synced, { b: daysAgo(-1) }, now)).toBeNull()
  })
  it('Done marks "done" only once 0059 is on the server (the row carries snoozed_until)', () => {
    expect(doneAction(row('d', 'a'))).toBe('converted')
    expect(doneAction(row('d', 'a', { snoozed_until: null }))).toBe('done')
  })
})

describe('memories (0078): journal pages, quotes, library notes', () => {
  const page = { id: 'j1', body: 'Walked by the river.\n\nThe light was gold.', entry_date: '2026-07-14', deleted_at: null, created_at: '2026-07-14T18:00:00Z' } as JournalEntry
  const book = { id: 'b1', title: 'The Overstory', author: 'Richard Powers' } as Book
  const quote = { id: 'q1', text: 'The best arguments in the world won’t change a person’s mind.', author: null, source: null, book_id: 'b1', created_at: daysAgo(35) } as Quote
  const note = { id: 'n1', title: null, body: 'Ideas for the garden', book_id: null, created_at: daysAgo(21) } as Note
  const data = { journal: [page], quotes: [quote], notes: [note], books: [book] }
  const pick = (entity_type: ResurfacedLogRow['entity_type'], entity_id: string) => ({ entity_type, entity_id })

  it('a memory: Keep · Let it go · Not now; put off twice asks Keep or Let it go', () => {
    expect(cardActions({ kind: 'memory', putOffs: 0 })).toEqual(['keep', 'letgo', 'notnow'])
    expect(cardActions({ kind: 'memory', putOffs: 2 })).toEqual(['keep', 'letgo'])
    expect(actionLabel('keep', { kind: 'memory', putOffs: 0 }, 5)).toBe('Keep')
  })
  it('a journal page: its words as one line, the day and how long ago', () => {
    const m = memoryOf(pick('journal_entry', 'j1'), data)!
    expect(m.text).toBe('Walked by the river. The light was gold.')
    expect(memoryMeta(m, NOW)).toBe('Journal · 14 Jul 2026 · 2 months ago')
  })
  it('a quote shows its book and who said it', () => {
    const m = memoryOf(pick('quote', 'q1'), data)!
    expect(m.text).toBe(quote.text)
    expect(memoryMeta(m, NOW)).toBe('Quote · The Overstory · Richard Powers · saved 5 weeks ago')
    const loose = memoryOf(pick('quote', 'q2'), { ...data, quotes: [{ ...quote, id: 'q2', book_id: null, source: 'a podcast', author: 'Someone' }] })!
    expect(memoryMeta(loose, NOW)).toBe('Quote · a podcast · Someone · saved 5 weeks ago')
  })
  it('a library note: its title, else its words', () => {
    expect(memoryMeta(memoryOf(pick('note', 'n1'), data)!, NOW)).toBe('Library note · saved 3 weeks ago')
    expect(memoryOf(pick('note', 'n1'), { ...data, notes: [{ ...note, title: 'Garden' }] })!.text).toBe('Garden')
  })
  it('gone, trashed or wordless → null (Today hides the section)', () => {
    expect(memoryOf(pick('journal_entry', 'nope'), data)).toBeNull()
    expect(memoryOf(pick('journal_entry', 'j1'), { ...data, journal: [{ ...page, deleted_at: NOW.toISOString() }] })).toBeNull()
    expect(memoryOf(pick('journal_entry', 'j1'), { ...data, journal: [{ ...page, body: '  ' }] })).toBeNull()
    expect(memoryOf(pick('note', 'n1'), { ...data, notes: [{ ...note, body: '' }] })).toBeNull()
    expect(memoryOf(pick('task', 'j1'), data)).toBeNull()
  })
  it('excerpt cuts a long page at a word', () => {
    const long = 'word '.repeat(80)
    const e = excerpt(long, 50)
    expect(e.length).toBeLessThanOrEqual(50)
    expect(e.endsWith('word…')).toBe(true)
    expect(excerpt('  short  ')).toBe('short')
  })
})
