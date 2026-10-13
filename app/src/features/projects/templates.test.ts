import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, Project } from '../../lib/types'

// Checklist templates (A25): the rules are pure; the writes go through a mocked writeRow that applies
// each one to the cache (as lib/outbox does), and a captured toastUndo.
let projects: Project[] = []
let settings: Partial<AppSettings> | undefined
const writes: { table: string; row: Record<string, unknown>; op?: string }[] = []
const undos: { message: string; undo: () => void }[] = []
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/queryClient', () => ({ queryClient: { getQueryData: (key: string[]) => (key[0] === 'projects' ? projects : key[0] === 'tasks' ? [] : settings) } }))
vi.mock('../../lib/outbox', () => ({
  writeRow: (table: string, row: Record<string, unknown>, op?: string) => {
    writes.push({ table, row, op })
    if (table === 'projects') projects = projects.map((p) => (p.id === row.id ? (row as unknown as Project) : p))
  },
}))
vi.mock('../../lib/settings', () => ({
  useAppSettings: () => ({ data: settings }),
  updateAppSetting: (key: string, value: unknown) => {
    settings = { ...settings, [key]: value }
    writes.push({ table: 'app_settings', row: { [key]: value } })
  },
}))
vi.mock('../../lib/activity', () => ({ logActivity: vi.fn() }))
vi.mock('../../lib/undo', () => ({ toastUndo: (message: string, undo: () => void) => undos.push({ message, undo }), toastAction: vi.fn() }))
vi.mock('../calendar/api', () => ({ deleteEventsForTask: vi.fn(), restoreEventsForTask: vi.fn(), replanTaskBlocks: () => () => {} }))
const T = await import('./templates')

const LINES: NonNullable<Project['checklist']> = [
  { id: 'l1', title: 'Brief', type: 'one-shot', completed: true, task_id: null },
  { id: 'l2', title: 'Invoice', type: 'task-linked', completed: false, task_id: 'old-task' },
]
const P: Project = { id: 'p1', domain_id: 'd1', name: 'Site', type: 'standard', status: 'active', checklist: [], created_at: '', updated_at: '' }
const stored = () => T.parseTemplates(settings?.checklist_templates)

beforeEach(() => {
  projects = [{ ...P }]
  settings = { checklist_templates: null }
  writes.length = 0
  undos.length = 0
})

describe('parseTemplates', () => {
  it('keeps well-formed templates and drops the rest', () => {
    expect(T.parseTemplates(null)).toEqual([])
    expect(T.parseTemplates({ a: 1 })).toEqual([])
    expect(T.parseTemplates([{ id: 'x', name: 'Kit', items: [{ title: 'A', type: 'task-linked' }, { title: ' ' }, { title: 'B', type: 'weird' }, 7] }, { id: 1 }, null])).toEqual([
      { id: 'x', name: 'Kit', items: [{ title: 'A', type: 'task-linked' }, { title: 'B', type: 'one-shot' }] },
    ])
  })
})

describe('templateFrom + instantiate', () => {
  it('a template keeps titles and types, not ticks or tasks', () => {
    const t = T.templateFrom(LINES, 'Launch')
    expect(t.name).toBe('Launch')
    expect(t.items).toEqual([{ title: 'Brief', type: 'one-shot' }, { title: 'Invoice', type: 'task-linked' }])
  })
  it('PLAN_ADDENDUM §12: only task-linked items become tasks; every item becomes an unticked line', () => {
    const made: string[] = []
    const lines = T.instantiate([{ title: 'A', type: 'one-shot' }, { title: 'B', type: 'task-linked' }, { title: 'C', type: 'task-linked' }], (title) => {
      made.push(title)
      return `task-${title}`
    })
    expect(made).toEqual(['B', 'C'])
    expect(lines.map((l) => [l.title, l.type, l.completed, l.task_id])).toEqual([
      ['A', 'one-shot', false, null],
      ['B', 'task-linked', false, 'task-B'],
      ['C', 'task-linked', false, 'task-C'],
    ])
    expect(new Set(lines.map((l) => l.id)).size).toBe(3)
  })
})

describe('writes', () => {
  it('save → rename → delete, each with an Undo that puts it back', () => {
    const t = T.saveTemplateWithUndo({ ...P, checklist: LINES }, 'Launch')!
    expect(stored().map((x) => x.name)).toEqual(['Launch'])
    T.saveTemplateWithUndo({ ...P, checklist: LINES.slice(0, 1) }, 'Small')
    T.renameTemplateWithUndo(t.id, 'Launch kit')
    expect(stored().map((x) => x.name)).toEqual(['Launch kit', 'Small'])
    undos.at(-1)!.undo()
    expect(stored().map((x) => x.name)).toEqual(['Launch', 'Small'])
    T.deleteTemplateWithUndo(t.id)
    expect(stored().map((x) => x.name)).toEqual(['Small'])
    undos.at(-1)!.undo()
    expect(stored().map((x) => x.name)).toEqual(['Launch', 'Small'])
    undos[0].undo() // the first save's Undo
    expect(stored().map((x) => x.name)).toEqual(['Small'])
  })
  it('before 0079 is pushed nothing is sent', () => {
    settings = {}
    expect(T.saveTemplateWithUndo({ ...P, checklist: LINES }, 'Launch')).toBeNull()
    expect(writes).toEqual([])
  })
  it('use: task-linked items become tasks under the project and its domain, lines appended; one Undo takes it all back', () => {
    projects = [{ ...P, checklist: [LINES[0]] }]
    T.applyTemplateWithUndo(projects[0], { id: 't', name: 'Launch', items: [{ title: 'Brief', type: 'one-shot' }, { title: 'Invoice', type: 'task-linked' }] })
    const tasks = writes.filter((w) => w.table === 'tasks').map((w) => w.row)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ title: 'Invoice', project_id: 'p1', domain_id: 'd1', area_id: null, status: 'todo' })
    expect(writes.filter((w) => w.table === 'projects')).toHaveLength(1)
    const lines = projects[0].checklist!
    expect(lines.map((l) => l.title)).toEqual(['Brief', 'Brief', 'Invoice'])
    expect(lines[2].task_id).toBe(tasks[0].id)
    expect(undos).toHaveLength(1)
    expect(undos[0].message).toBe('Added “Launch” · 2 items, 1 as tasks')
    undos[0].undo()
    expect(writes.filter((w) => w.op === 'delete').map((w) => w.row.id)).toEqual([tasks[0].id])
    expect(projects[0].checklist).toEqual([LINES[0]])
  })
})
