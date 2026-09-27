import { describe, expect, it } from 'vitest'
import { INBOX_COLUMNS, TASK_COLUMNS } from './columns'
import { fetchAll, PAGE_SIZE } from './fetchAll'

// Vite inlines every migration's text at test time (no node types needed in the app's tsconfig).
const MIGRATIONS = Object.values(
  import.meta.glob('../../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }),
) as string[]
const HEAVY = new Set(['embedding', 'search_tsv'])

/** Columns the migrations give `table`: its create-table body plus every `add column`. */
function migratedColumns(table: string): Set<string> {
  const cols = new Set<string>()
  for (const text of MIGRATIONS) {
    const sql = text.toLowerCase()
    const create = sql.match(new RegExp(`create table (?:if not exists )?${table} \\(([\\s\\S]*?)\\n\\);`))
    if (create) for (const line of create[1].split('\n')) {
      const name = line.trim().split(/\s+/)[0]
      if (/^[a-z_][a-z0-9_]*$/.test(name) && !['unique', 'primary', 'constraint', 'check', 'foreign'].includes(name)) cols.add(name)
    }
    for (const m of sql.matchAll(new RegExp(`alter table ${table} add column (?:if not exists )?([a-z_][a-z0-9_]*)`, 'g'))) cols.add(m[1])
  }
  return cols
}

describe('client column lists', () => {
  for (const [table, list] of [['tasks', TASK_COLUMNS], ['inbox_items', INBOX_COLUMNS]] as const) {
    it(`${table}: every migrated column except the search columns`, () => {
      const want = [...migratedColumns(table)].filter((c) => !HEAVY.has(c)).sort()
      expect(want.length).toBeGreaterThan(10)
      expect(list.split(',').sort()).toEqual(want)
    })
  }
})

describe('fetchAll', () => {
  it('pages past the 1000-row cap and stops on a short page', async () => {
    const rows = Array.from({ length: 2 * PAGE_SIZE + 5 }, (_, i) => i)
    const calls: [number, number][] = []
    const got = await fetchAll(async (from, to) => {
      calls.push([from, to])
      return { data: rows.slice(from, to + 1), error: null }
    })
    expect(got).toEqual(rows)
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('throws the page error', async () => {
    await expect(fetchAll(async () => ({ data: null, error: new Error('boom') }))).rejects.toThrow('boom')
  })
})
