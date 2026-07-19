import { describe, expect, it } from 'vitest'
import { parseCsv, csvToBatch, guessMapping, type CsvMapping } from './csv'
import { stableHash } from './shared'

const csv = [
  'Title,Notes,Due Date,Priority,Project,Done',
  'Repot the basil,"Needs a bigger pot, terracotta",2026-07-20,HIGH,Garden,no',
  'File the report,,2026-07-21 14:30,MEDIUM,Work,yes',
  '"Say ""hello"" to the neighbours",,,LOW,,no',
  'Repot the basil,duplicate row same key,2026-07-20,HIGH,Garden,no',
].join('\r\n')

describe('parseCsv', () => {
  it('handles quoted fields, embedded commas, escaped quotes, CRLF', () => {
    const rows = parseCsv(csv)
    expect(rows).toHaveLength(5)
    expect(rows[1][1]).toBe('Needs a bigger pot, terracotta')
    expect(rows[3][0]).toBe('Say "hello" to the neighbours')
  })
})

describe('guessMapping', () => {
  it('guesses from headers', () => {
    const m = guessMapping(parseCsv(csv)[0])
    expect(m[0]).toBe('title')
    expect(m[2]).toBe('due')
    expect(m[4]).toBe('project')
  })
})

describe('csvToBatch', () => {
  const mapping: CsvMapping = { 0: 'title', 1: 'notes', 2: 'due', 3: 'priority', 4: 'project', 5: 'done' }
  const batch = csvToBatch(parseCsv(csv), mapping)

  it('maps rows to tasks and derives projects from distinct values', () => {
    expect(batch.tasks).toHaveLength(3) // 4 data rows, 1 collapses as duplicate key
    expect(batch.projects.map((p) => p.name).sort()).toEqual(['Garden', 'Work'])
    expect(batch.tasks[0].priority).toBe(1)
    expect(batch.tasks[1].done).toBe(true)
  })

  it('converts date-only and datetime dues as Cairo local → UTC', () => {
    expect(batch.tasks[0].due_at).toBe('2026-07-19T21:00:00.000Z') // midnight Cairo DST
    expect(batch.tasks[1].due_at).toBe('2026-07-21T11:30:00.000Z') // 14:30 Cairo → 11:30 UTC
  })

  it('external_ref.id = hash(title+due+project) — stable across parses (idempotency)', () => {
    const again = csvToBatch(parseCsv(csv), mapping)
    expect(again.tasks[0].external_ref.id).toBe(batch.tasks[0].external_ref.id)
    expect(batch.tasks[0].external_ref.id).toBe(stableHash('Repot the basil|2026-07-19T21:00:00.000Z|Garden'))
  })

  it('keeps the whole row keyed by header in external_ref.raw', () => {
    expect(batch.tasks[0].external_ref.raw).toMatchObject({ Title: 'Repot the basil', Project: 'Garden' })
  })
})
