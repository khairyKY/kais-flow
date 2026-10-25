import { describe, expect, it } from 'vitest'
import { INBOX_COLUMNS, TASK_COLUMNS } from './columns'
import { fetchAll, PAGE_SIZE } from './fetchAll'

// Vite inlines every migration's text at test time (no node types needed in the app's tsconfig).
const MIGRATIONS = Object.values(
  import.meta.glob('../../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }),
) as string[]
const HEAVY = new Set(['embedding', 'search_tsv'])

/** Columns the migrations give `table`, in order: its create-table body, every `add column` (several
 * may share one `alter table`), minus every `drop column`. */
function migratedColumns(table: string): Set<string> {
  const cols = new Set<string>()
  for (const text of MIGRATIONS) {
    const sql = text.replace(/--[^\n]*/g, '').toLowerCase()
    const create = sql.match(new RegExp(`create table (?:if not exists )?(?:public\\.)?${table} \\(([\\s\\S]*?)\\n\\);`))
    if (create) for (const line of create[1].split('\n')) {
      const name = line.trim().split(/\s+/)[0]
      if (/^[a-z_][a-z0-9_]*$/.test(name) && !['unique', 'primary', 'constraint', 'check', 'foreign'].includes(name)) cols.add(name)
    }
    for (const alter of sql.matchAll(new RegExp(`alter table (?:if exists )?(?:public\\.)?${table}\\s([\\s\\S]*?);`, 'g'))) {
      for (const m of alter[1].matchAll(/add column (?:if not exists )?([a-z_][a-z0-9_]*)/g)) cols.add(m[1])
      for (const m of alter[1].matchAll(/drop column (?:if exists )?([a-z_][a-z0-9_]*)/g)) cols.delete(m[1])
    }
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

// sync-fix (2026-10-25): a write carrying a key its table doesn't have is refused by PostgREST (PGRST204)
// and parked by the outbox — "One change couldn't be saved". writeRow is generic, so TypeScript doesn't
// catch an extra key in `writeRow('tasks', { ...t, colour })`. Two cheap guards, both against the
// migrations' own column lists: every row type the app writes, and every object literal handed to writeRow.
// keyed by path under src/ (the glob names this folder's files './x.ts', the rest '../feature/x.ts')
const SOURCES = Object.fromEntries(
  Object.entries(import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>).map(([k, v]) => [k.replace(/^\.\//, 'lib/').replace(/^\.\.\//, ''), v]),
)
const source = (file: string) => SOURCES[file]
/** Keys the client keeps on a cached row that never go to the server. */
const CLIENT_ONLY: Record<string, string[]> = {
  calendar_events: ['seriesId'], // an expanded occurrence's link to its series row; calendar/api writes the row itself
}
/** `interface Name { … }`'s field names in `text`. */
function fieldsOf(text: string, name: string): string[] {
  const body = text.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? ''
  return [...body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_]*)\??:/gm)].map((m) => m[1])
}

describe('every write fits its table (columns from the migrations)', () => {
  const ROW_TYPES: [file: string, type: string, table: string][] = [
    ['lib/types.ts', 'Domain', 'domains'], ['lib/types.ts', 'Project', 'projects'], ['lib/types.ts', 'Task', 'tasks'],
    ['lib/types.ts', 'InboxItem', 'inbox_items'], ['lib/types.ts', 'ActivityLogEntry', 'activity_log'], ['lib/types.ts', 'CalendarEvent', 'calendar_events'],
    ['lib/types.ts', 'Routine', 'routines'], ['lib/types.ts', 'RoutineCompletion', 'routine_completions'], ['lib/types.ts', 'Area', 'areas'],
    ['lib/types.ts', 'SmartListRow', 'smart_lists'], ['lib/types.ts', 'PushSubscriptionRow', 'push_subscriptions'], ['lib/types.ts', 'AppSettings', 'app_settings'],
    ['lib/types.ts', 'ResurfacedLogRow', 'resurfaced_log'], ['lib/types.ts', 'TimeEntry', 'time_entries'], ['lib/types.ts', 'JournalEntry', 'journal_entries'],
    ['lib/types.ts', 'Book', 'books'], ['lib/types.ts', 'Note', 'notes'], ['lib/types.ts', 'Quote', 'quotes'], ['lib/types.ts', 'Commentary', 'commentary'],
    ['lib/types.ts', 'Person', 'people'], ['lib/types.ts', 'Interaction', 'interactions'], ['features/paper/paperMath.ts', 'CaptureRow', 'captures'],
  ]
  for (const [file, type, table] of ROW_TYPES) {
    it(`${type}: every field is a ${table} column`, () => {
      const fields = fieldsOf(source(file), type)
      expect(fields.length).toBeGreaterThan(2)
      const cols = migratedColumns(table)
      expect(fields.filter((f) => !cols.has(f) && !CLIENT_ONLY[table]?.includes(f))).toEqual([])
    })
  }

  it("every object literal handed to writeRow('<table>', { … }) names only that table's columns", () => {
    const bad: string[] = []
    let seen = 0
    for (const [file, text] of Object.entries(SOURCES)) {
      for (const m of text.matchAll(/writeRow(?:<[^>]*>)?\(\s*'([a-z_]+)',\s*\{/g)) {
        // Walk the literal's brackets and keep only its top level: `key: …`, shorthand `key`, spreads skipped.
        let depth = 1
        let top = ''
        for (let i = m.index! + m[0].length; i < text.length && depth > 0; i++) {
          const ch = text[i]
          if ('{[('.includes(ch)) depth++
          else if ('}])'.includes(ch)) depth--
          else if (depth === 1) top += ch
        }
        const keys = top
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part && !part.startsWith('...'))
          .map((part) => part.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?::|$)/)?.[1])
          .filter((k): k is string => !!k)
        const cols = migratedColumns(m[1])
        seen++
        for (const k of keys) if (!cols.has(k)) bad.push(`src/${file}: writeRow('${m[1]}', { ${k} })`)
      }
    }
    expect(seen).toBeGreaterThan(30)
    expect(bad).toEqual([])
  })
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
