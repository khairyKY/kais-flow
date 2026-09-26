import { describe, it, expect } from 'vitest'
import { entriesForDay, dayField, dayOrdinal, writtenStreak, isWritten, holdRow, withHeldRows, type HeldRows } from './journalDay'
import type { JournalEntry } from '../../lib/types'

function entry(p: Partial<JournalEntry> & { id: string; entry_date: string }): JournalEntry {
  return {
    body: 'something',
    mood: null,
    transcript: null,
    media_paths: [],
    gratitude: [],
    created_at: `${p.entry_date}T08:00:00.000Z`,
    updated_at: `${p.entry_date}T08:00:00.000Z`,
    ...p,
  }
}

describe('entriesForDay', () => {
  it('keeps only the day, in written order', () => {
    const rows = [
      entry({ id: 'c', entry_date: '2026-07-27', created_at: '2026-07-27T21:00:00.000Z' }),
      entry({ id: 'a', entry_date: '2026-07-27', created_at: '2026-07-27T06:00:00.000Z' }),
      entry({ id: 'x', entry_date: '2026-07-26' }),
      entry({ id: 'b', entry_date: '2026-07-27', created_at: '2026-07-27T13:00:00.000Z' }),
    ]
    expect(entriesForDay(rows, '2026-07-27').map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('dayField', () => {
  const day = [
    entry({ id: 'a', entry_date: '2026-07-27', mood: 'Calm', gratitude: ['tea'] }),
    entry({ id: 'b', entry_date: '2026-07-27', created_at: '2026-07-27T13:00:00.000Z' }),
  ]
  it('reads the day-level fields off the entry that holds them', () => {
    expect(dayField(day, 'mood')).toBe('Calm')
    expect(dayField(day, 'gratitude')).toEqual(['tea'])
  })
  it('survives the holder moving to a later entry', () => {
    expect(dayField([day[1], { ...day[0], id: 'c' }], 'mood')).toBe('Calm')
  })
  it('is null when nothing holds them', () => {
    expect(dayField([day[1]], 'mood')).toBeNull()
    expect(dayField([], 'gratitude')).toBeNull()
  })
})

describe('dayOrdinal', () => {
  const rows = [
    entry({ id: 'a', entry_date: '2026-07-20' }),
    entry({ id: 'b', entry_date: '2026-07-21' }),
    entry({ id: 'c', entry_date: '2026-07-21', created_at: '2026-07-21T19:00:00.000Z' }),
  ]
  it('counts days, not entries (drift J7) — two entries on one date is still one day', () => {
    expect(dayOrdinal(rows, '2026-07-21')).toBe(2)
  })
  it('counts the page you are on even before the first keystroke', () => {
    expect(dayOrdinal(rows, '2026-07-27')).toBe(3)
    expect(dayOrdinal([], '2026-07-27')).toBe(1)
  })
  it('ignores days after the one being viewed', () => {
    expect(dayOrdinal(rows, '2026-07-20')).toBe(1)
  })
  it('does not count an untouched "+ New entry" as a day written', () => {
    expect(dayOrdinal([entry({ id: 'z', entry_date: '2026-07-20', body: '  ' })], '2026-07-27')).toBe(1)
  })
})

describe('writtenStreak', () => {
  it('counts back from today', () => {
    const rows = ['2026-07-27', '2026-07-26', '2026-07-25'].map((d) => entry({ id: d, entry_date: d }))
    expect(writtenStreak(rows, '2026-07-27')).toBe(3)
  })
  it('still stands if today is unwritten but yesterday was', () => {
    const rows = ['2026-07-26', '2026-07-25'].map((d) => entry({ id: d, entry_date: d }))
    expect(writtenStreak(rows, '2026-07-27')).toBe(2)
  })
  it('breaks on a gap and on an empty entry', () => {
    const rows = [entry({ id: '1', entry_date: '2026-07-27' }), entry({ id: '2', entry_date: '2026-07-25' })]
    expect(writtenStreak(rows, '2026-07-27')).toBe(1)
    expect(writtenStreak([entry({ id: '3', entry_date: '2026-07-27', body: '' })], '2026-07-27')).toBe(0)
  })
  it('is zero with nothing written', () => {
    expect(writtenStreak([], '2026-07-27')).toBe(0)
  })
  it('does not double-count two entries on the same day', () => {
    const rows = [
      entry({ id: 'a', entry_date: '2026-07-27' }),
      entry({ id: 'b', entry_date: '2026-07-27', created_at: '2026-07-27T19:00:00.000Z' }),
    ]
    expect(writtenStreak(rows, '2026-07-27')).toBe(1)
  })
})

describe('isWritten', () => {
  it('treats whitespace-only as unwritten', () => {
    expect(isWritten(entry({ id: 'a', entry_date: '2026-07-27', body: '\n  ' }))).toBe(false)
    expect(isWritten(entry({ id: 'b', entry_date: '2026-07-27', body: 'x' }))).toBe(true)
  })
})

// P0-B (audit 2026-09-26): offline, with the journal list never loaded, typing into a blank day
// made one entry per keystroke. These pin the page-side model that keeps one stable row.
describe('holdRow / withHeldRows', () => {
  it('shows a row the page wrote while the list is empty (never loaded)', () => {
    const first = entry({ id: 'draft', entry_date: '2026-09-26', body: 'W' })
    const held = holdRow({}, first, [])
    expect(entriesForDay(withHeldRows([], held), '2026-09-26').map((e) => e.id)).toEqual(['draft'])
  })

  it('keystroke after keystroke keeps ONE row with the latest body', () => {
    // The page reads the day from withHeldRows, so every keystroke after the first finds the
    // row it created and updates it instead of starting another.
    let held: HeldRows = {}
    let body = ''
    for (const ch of 'Written while offline.') {
      body += ch
      const day = entriesForDay(withHeldRows([], held), '2026-09-26')
      const id = day.length ? day[0].id : `new-${body.length}`
      held = holdRow(held, entry({ id, entry_date: '2026-09-26', body }), [])
    }
    const day = entriesForDay(withHeldRows([], held), '2026-09-26')
    expect(day).toHaveLength(1)
    expect(day[0].body).toBe('Written while offline.')
  })

  it('lets the cached list win once it has the row, and forgets the held copy', () => {
    const mine = entry({ id: 'a', entry_date: '2026-09-26', body: 'held copy' })
    const held = holdRow({}, mine, [])
    const listed = [entry({ id: 'a', entry_date: '2026-09-26', body: 'from the cache' })]
    expect(withHeldRows(listed, held).map((e) => e.body)).toEqual(['from the cache'])
    // The next write prunes rows the list has caught up with.
    const next = holdRow(held, entry({ id: 'b', entry_date: '2026-09-26' }), listed)
    expect(Object.keys(next)).toEqual(['b'])
  })

  it('does not hold a row the list already has', () => {
    const listed = [entry({ id: 'a', entry_date: '2026-09-26' })]
    expect(holdRow({}, { ...listed[0], body: 'edited' }, listed)).toEqual({})
  })

  it('hides a held row once it is deleted, and shows it again on restore', () => {
    const row = entry({ id: 'a', entry_date: '2026-09-26' })
    let held = holdRow({}, row, [])
    held = holdRow(held, { ...row, deleted_at: '2026-09-26T10:00:00.000Z' }, [])
    expect(withHeldRows([], held)).toEqual([])
    held = holdRow(held, { ...row, deleted_at: null }, [])
    expect(withHeldRows([], held).map((e) => e.id)).toEqual(['a'])
  })

  it('returns the list untouched when nothing is held', () => {
    const listed = [entry({ id: 'a', entry_date: '2026-09-26' })]
    expect(withHeldRows(listed, {})).toBe(listed)
  })
})
