import { afterEach, describe, expect, it, vi } from 'vitest'
import { setAppZone } from '../../lib/appZone'
import type { Fact, Interaction, Person } from '../../lib/types'

const writes: { table: string; row: { id: string }; op: string }[] = []
const undos: (() => void)[] = []
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/outbox', () => ({
  writeRow: (table: string, row: { id: string }, op = 'upsert') => writes.push({ table, row, op }),
}))
vi.mock('../../lib/activity', () => ({ logActivity: () => {} }))
vi.mock('../../lib/undo', () => ({ toastUndo: (_m: string, undo: () => void) => undos.push(undo) }))
vi.mock('../../lib/queryClient', async () => {
  const { QueryClient } = await import('@tanstack/react-query')
  return { queryClient: new QueryClient() }
})
const { getDaysUntilBirthday, withFactRestored, withFactSaved, deletePersonWithUndo, removeFactWithUndo, logTouchWithUndo } = await import('./api')
const { queryClient } = await import('../../lib/queryClient')

const fact = (id: string, value = id): Fact => ({ id, label: 'Note', value })
const T = '2026-10-01T09:00:00Z'
const PRIYA: Person = { id: 'p1', user_id: 'u', name: 'Priya', facts: [fact('a'), fact('b')], domain_id: null, created_at: T, updated_at: T }
const touch = (id: string, person_id = 'p1'): Interaction => ({ id, user_id: 'u', person_id, summary: id, occurred_at: T, created_at: T, updated_at: T })

describe('people — Undo restores', () => {
  afterEach(() => {
    writes.length = 0
    undos.length = 0
  })
  it('deleting a person deletes, then Undo re-inserts the person first and then their interactions', () => {
    queryClient.setQueryData(['interactions'], [touch('i1'), touch('i2'), touch('x', 'p2')])
    deletePersonWithUndo(PRIYA)
    expect(writes).toEqual([{ table: 'people', row: { id: 'p1' }, op: 'delete' }])
    expect((queryClient.getQueryData(['interactions']) as Interaction[]).map((i) => i.id)).toEqual(['x'])
    writes.length = 0
    undos[0]()
    expect(writes.map((w) => `${w.table}:${w.row.id}:${w.op}`)).toEqual(['people:p1:upsert', 'interactions:i1:upsert', 'interactions:i2:upsert'])
    expect(writes[0].row).toEqual(PRIYA)
  })
  it('removing a fact writes it out, Undo puts it back in place on the person as it is now', () => {
    removeFactWithUndo(PRIYA, 'a')
    expect((writes[0].row as Person).facts.map((f) => f.id)).toEqual(['b'])
    queryClient.setQueryData(['people'], [{ ...PRIYA, name: 'Priya S', facts: [fact('b')] }])
    undos[0]()
    const back = writes[1].row as Person
    expect(back.name).toBe('Priya S')
    expect(back.facts.map((f) => f.id)).toEqual(['a', 'b'])
  })
  it('a quick touch logs one interaction, Undo deletes that same row', () => {
    logTouchWithUndo(PRIYA, 'call')
    const row = writes[0].row as Interaction
    expect(row.summary).toBe('Phone call catch up')
    undos[0]()
    expect(writes[1]).toEqual({ table: 'interactions', row: { id: row.id }, op: 'delete' })
  })
})

describe('people facts — undo + edit builders', () => {
  it('puts a removed fact back where it was', () => {
    const [a, b, c] = [fact('a'), fact('b'), fact('c')]
    expect(withFactRestored([a, c], b, 1).map((f) => f.id)).toEqual(['a', 'b', 'c'])
    expect(withFactRestored([a], c, 9).map((f) => f.id)).toEqual(['a', 'c'])
  })
  it('never restores a fact twice', () => {
    const a = fact('a')
    expect(withFactRestored([a], a, 0)).toEqual([a])
  })
  it('save replaces by id in place, or appends a new one', () => {
    const [a, b] = [fact('a'), fact('b')]
    expect(withFactSaved([a, b], fact('a', 'edited')).map((f) => f.value)).toEqual(['edited', 'b'])
    expect(withFactSaved([a], b).map((f) => f.id)).toEqual(['a', 'b'])
  })
})

describe('getDaysUntilBirthday — on the user’s calendar', () => {
  afterEach(() => setAppZone('Africa/Cairo'))
  // 2026-07-10 22:30Z is already 07-11 in Cairo (+3) but still 07-10 in Los Angeles.
  const now = new Date('2026-07-10T22:30:00Z')
  it('counts from the user’s day, not the device’s', () => {
    setAppZone('Africa/Cairo')
    expect(getDaysUntilBirthday('07-17', now)).toBe(6)
    setAppZone('America/Los_Angeles')
    expect(getDaysUntilBirthday('07-17', now)).toBe(7)
  })
  it('reads MM-DD, the picker’s YYYY-MM-DD (year ignored) and a written month', () => {
    setAppZone('UTC')
    expect(getDaysUntilBirthday('7-11', now)).toBe(1)
    expect(getDaysUntilBirthday('1990-07-11', now)).toBe(1)
    expect(getDaysUntilBirthday('July 11', now)).toBe(1)
    expect(getDaysUntilBirthday('07-10', now)).toBe(0)
  })
  it('wraps to next year once the day has passed', () => {
    setAppZone('UTC')
    expect(getDaysUntilBirthday('07-09', now)).toBe(364)
  })
  it('null for nothing or nonsense', () => {
    expect(getDaysUntilBirthday(null, now)).toBeNull()
    expect(getDaysUntilBirthday('13-40', now)).toBeNull()
  })
})
