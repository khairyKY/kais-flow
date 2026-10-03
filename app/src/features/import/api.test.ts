import { describe, expect, it, vi } from 'vitest'
import { emptyBatch, type ImportBatch, type ImportTask } from './adapters/shared'

const writes: { table: string; row: Record<string, unknown>; op: string }[] = []
const activity: { type: string; payload: unknown }[] = []
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/outbox', () => ({
  writeRow: (table: string, row: Record<string, unknown>, op = 'upsert') => writes.push({ table, row, op }),
  flushOutbox: async () => {},
}))
vi.mock('../../lib/activity', () => ({
  logActivity: (type: string, _e: string, _id: string, payload: unknown) => activity.push({ type, payload }),
}))
const { planCommit, commitBatch, undoImport, refKey, quoteKey } = await import('./api')

const task = (id: string, over: Partial<ImportTask> = {}): ImportTask => ({
  title: id, notes: null, priority: null, duration_min: null, due_at: null, scheduled_start: null, scheduled_end: null,
  someday: false, done: false, completed_at: null, labels: [], sourceProjectId: null,
  external_ref: { source: 'todoist', id, raw: {} }, ...over,
})
const none = () => ({ projects: new Map(), tasks: new Map(), events: new Map(), notes: new Map(), inbox: new Map(), books: new Map(), quotes: new Set<string>() })
const opts = { includeCompleted: false, includeEvents: false }

describe('planCommit — tasks', () => {
  const batch: ImportBatch = {
    ...emptyBatch('todoist'),
    projects: [{ name: 'Garden', external_ref: { source: 'todoist', id: 'project:Garden', raw: {} } }],
    tasks: [
      task('child', { sourceParentId: 'parent' }), // listed before its parent on purpose
      task('parent', { sourceProjectId: 'project:Garden', recurrence_rule: 'FREQ=DAILY' }),
      task('grandchild', { sourceParentId: 'child' }),
      task('old', { done: true }),
      task('seen'),
    ],
  }
  const existing = { ...none(), tasks: new Map([[refKey('todoist', 'seen'), 'row-seen']]) }
  const plan = planCommit(batch, existing, opts)

  it('skips already-imported and (by default) completed tasks', () => {
    expect(plan.rows.tasks.map((r) => r.title)).toEqual(['parent', 'child', 'grandchild'])
    expect(plan.skipped).toMatchObject({ tasks: 1, completed: 1 })
  })

  it('nests subtasks one level deep under the top-level ancestor, parents written first', () => {
    const [parent, child, grandchild] = plan.rows.tasks
    expect(child.parent_task_id).toBe(parent.id)
    expect(grandchild.parent_task_id).toBe(parent.id)
    expect(parent.parent_task_id).toBeNull()
  })

  it('resolves projects and carries the recurrence rule', () => {
    expect(plan.rows.tasks[0]).toMatchObject({ project_id: plan.rows.projects[0].id, recurrence_rule: 'FREQ=DAILY', status: 'todo' })
  })

  it('includeCompleted brings the done ones in as done', () => {
    const all = planCommit(batch, existing, { ...opts, includeCompleted: true })
    expect(all.rows.tasks.find((r) => r.title === 'old')).toMatchObject({ status: 'done' })
  })
})

describe('planCommit — library', () => {
  const batch: ImportBatch = {
    ...emptyBatch('kindle'),
    books: [
      { title: 'Four Thousand Weeks: Time Management for Mortals', author: 'Oliver Burkeman', published_year: null, total_pages: null, shelf: 'reading' },
      { title: 'Dune (Dune Book 1)', author: 'Frank Herbert', published_year: 1965, total_pages: 600, shelf: 'read' },
      { title: 'The Overstory', author: 'Richard Powers', published_year: null, total_pages: null, shelf: 'to-read' },
    ],
    quotes: [
      { text: 'Attention is life.', book: 'Four Thousand Weeks: Time Management for Mortals', author: 'Oliver Burkeman', page: '12' },
      { text: 'Fear is the mind-killer.', book: 'Dune (Dune Book 1)', author: 'Frank Herbert', page: 'loc 1200' },
    ],
    notes: [{ title: null, body: 'Re-read this', tags: ['kindle'], book: 'Dune (Dune Book 1)', external_ref: { source: 'kindle', id: 'n1', raw: {} } }],
  }
  // The Library already has a hand-typed "Four thousand weeks" with that first quote in it.
  const existing = { ...none(), books: new Map([['four thousand weeks', 'book-ftw']]), quotes: new Set([quoteKey('Four thousand weeks', 'Attention is life')]) }
  const plan = planCommit(batch, existing, opts)

  it('reuses an existing book by title and skips its existing quotes', () => {
    expect(plan.rows.books.map((b) => b.title)).toEqual(['Dune (Dune Book 1)'])
    expect(plan.skipped).toMatchObject({ books: 1, quotes: 1, toRead: 1 })
  })

  it('finished books are read to the last page; quotes/notes point at their book', () => {
    const dune = plan.rows.books[0]
    expect(dune).toMatchObject({ status: 'finished', current_page: 600, total_pages: 600 })
    expect(plan.rows.quotes).toEqual([expect.objectContaining({ text: 'Fear is the mind-killer.', book_id: dune.id, source: 'Dune (Dune Book 1)', page: 'loc 1200' })])
    expect(plan.rows.notes[0]).toMatchObject({ body: 'Re-read this', book_id: dune.id })
  })

  it('want-to-read only on opt-in, landing as reading at page 0', () => {
    const withToRead = planCommit(batch, existing, { ...opts, includeToRead: true })
    expect(withToRead.rows.books.find((b) => b.title === 'The Overstory')).toMatchObject({ status: 'reading', current_page: 0, total_pages: 100 })
  })
})

describe('commitBatch / undoImport', () => {
  it('writes in FK order, logs the run, and the undo takes it all back', async () => {
    writes.length = 0
    const batch: ImportBatch = {
      ...emptyBatch('markdown'),
      projects: [{ name: 'Notes', external_ref: { source: 'markdown', id: 'project:Notes', raw: {} } }],
      tasks: [task('a', { sourceProjectId: 'project:Notes' })],
      inbox: [{ raw_text: 'An idea', external_ref: { source: 'markdown', id: 'p1', raw: {} } }],
    }
    const summary = await commitBatch(batch, none(), opts, () => {})
    expect(writes.map((w) => w.table)).toEqual(['projects', 'tasks', 'inbox_items'])
    expect(summary.written).toMatchObject({ projects: 1, tasks: 1, inbox: 1 })
    expect(activity.at(-1)).toMatchObject({ type: 'import.run', payload: { source: 'markdown' } })

    writes.length = 0
    await undoImport(summary)
    expect(writes.map((w) => [w.table, w.op])).toEqual([['inbox_items', 'upsert'], ['tasks', 'upsert'], ['projects', 'delete']])
    expect(writes[1].row).toMatchObject({ title: 'a', external_ref: null }) // re-importable
    expect(writes[1].row.deleted_at).toBeTruthy() // → Trash
    expect(activity.at(-1)?.type).toBe('import.undone')
  })
})
