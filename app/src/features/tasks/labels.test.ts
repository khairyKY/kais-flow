import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, Task } from '../../lib/types'

// Labels (Overlays.dc.html picker + manager): the rules are pure; the writes go through a mocked
// writeRow that applies each one to the cache (as lib/outbox does), and a captured toastUndo.
let cache: Task[] = []
let settings: Partial<AppSettings> | undefined
const writes: { table: string; row: Record<string, unknown> }[] = []
const undos: { message: string; undo: () => void }[] = []
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/queryClient', () => ({ queryClient: { getQueryData: (key: string[]) => (key[0] === 'tasks' ? cache : settings) } }))
vi.mock('../../lib/outbox', () => ({
  writeRow: (table: string, row: Record<string, unknown>) => {
    writes.push({ table, row })
    if (table === 'tasks') cache = cache.map((t) => (t.id === row.id ? (row as unknown as Task) : t))
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
const L = await import('./labels')

const task = (id: string, labels: string[], over: Partial<Task> = {}): Task => ({
  id, project_id: null, domain_id: null, area_id: null, title: id, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels, priority: null, duration_min: null, someday: false,
  reminder_at: null, reminder_sent: false, completed_at: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...over,
})
const labelsOf = (id: string) => cache.find((t) => t.id === id)!.labels
const taskWrites = () => writes.filter((w) => w.table === 'tasks')

beforeEach(() => {
  cache = [task('a', ['Urgent', 'calls']), task('b', ['Urgent']), task('c', ['errand']), task('gone', ['Urgent'], { deleted_at: '2026-10-10T00:00:00Z' })]
  settings = { label_meta: { Urgent: 'var(--acc-terra)' } }
  writes.length = 0
  undos.length = 0
})

describe('the label list (picker rows, manager rows)', () => {
  it('every label once, A–Z ignoring case, with its task count and colour; a coloured label with no task still lists', () => {
    const list = L.labelList([task('a', ['Urgent', 'calls']), task('b', ['Urgent', 'Urgent'])], { 'Deep work': 'var(--acc-hydrangea)', Urgent: 'var(--acc-terra)' })
    expect(list).toEqual([
      { name: 'calls', count: 1, color: L.NO_COLOR },
      { name: 'Deep work', count: 0, color: 'var(--acc-hydrangea)' },
      { name: 'Urgent', count: 2, color: 'var(--acc-terra)' },
    ])
  })

  it('a stored map keeps only the drawn swatches (it lands in a style)', () => {
    expect(L.parseLabelMeta({ a: 'var(--acc-sage)', b: 'url(https://x.test/p.png)', c: 3, '': 'var(--acc-sage)' })).toEqual({ a: 'var(--acc-sage)' })
    expect(L.parseLabelMeta(null)).toEqual({})
    expect(L.parseLabelMeta(['var(--acc-sage)'])).toEqual({})
  })
})

describe('picker filtering', () => {
  const all = L.labelList([task('a', ['Urgent', 'urgency', 'Deep work', 'errand'])])
  const names = (q: string) => L.matchLabels(all, q).rows.map((l) => l.name)

  it('no query: every label, nothing to create', () => {
    expect(L.matchLabels(all, '  ')).toEqual({ rows: all, create: null })
  })

  it('a query keeps the labels containing it, any case; Create offers the typed name', () => {
    expect(names('URG')).toEqual(['urgency', 'Urgent']) // A–Z
    expect(L.matchLabels(all, 'urg').create).toBe('urg')
    expect(names('work')).toEqual(['Deep work'])
  })

  it('an exact match (any case) comes first and is not offered again as Create', () => {
    expect(names('urgency')).toEqual(['urgency'])
    expect(L.matchLabels(all, 'URGENCY').create).toBeNull()
    expect(names('errand')[0]).toBe('errand')
  })

  it('nothing matches: no rows, Create the trimmed name', () => {
    expect(L.matchLabels(all, '  gym  ')).toEqual({ rows: [], create: 'gym' })
  })
})

describe('L on a selection (toggleLabel)', () => {
  it('adds the label to every selected task that lacks it, one Undo puts each back', () => {
    L.toggleLabel(['a', 'c'], 'errand')
    expect(labelsOf('a')).toEqual(['Urgent', 'calls', 'errand'])
    expect(labelsOf('c')).toEqual(['errand'])
    expect(taskWrites()).toHaveLength(1) // c already had it
    expect(undos.map((u) => u.message)).toEqual(['Added “errand” to 1 task'])
    undos[0].undo()
    expect(labelsOf('a')).toEqual(['Urgent', 'calls'])
  })

  it('when every selected task has it, takes it off all of them', () => {
    L.toggleLabel(['a', 'b'], 'Urgent')
    expect(labelsOf('a')).toEqual(['calls'])
    expect(labelsOf('b')).toEqual([])
    expect(undos[0].message).toBe('Removed “Urgent” from 2 tasks')
    undos[0].undo()
    expect([labelsOf('a'), labelsOf('b')]).toEqual([['Urgent', 'calls'], ['Urgent']])
  })

  it('one task: its own Undo (P7e A17); a new name is simply the first task to carry it', () => {
    L.toggleLabel(['c'], 'gym')
    expect(labelsOf('c')).toEqual(['errand', 'gym'])
    expect(undos[0].message).toBe('Added “gym”')
    undos[0].undo()
    expect(labelsOf('c')).toEqual(['errand'])
  })
})

describe('rename / delete (the manager)', () => {
  it('rename rewrites the label on every task that has it — trashed ones too — one Undo for all', () => {
    L.renameLabelWithUndo('Urgent', 'Now')
    expect(taskWrites().map((w) => w.row.id)).toEqual(['a', 'b', 'gone'])
    expect([labelsOf('a'), labelsOf('b'), labelsOf('gone')]).toEqual([['Now', 'calls'], ['Now'], ['Now']])
    expect(settings?.label_meta).toEqual({ Now: 'var(--acc-terra)' }) // the colour goes with the name
    expect(undos.map((u) => u.message)).toEqual(['Renamed to “Now” · 3 tasks'])
    undos[0].undo()
    expect([labelsOf('a'), labelsOf('b'), labelsOf('gone')]).toEqual([['Urgent', 'calls'], ['Urgent'], ['Urgent']])
    expect(settings?.label_meta).toEqual({ Urgent: 'var(--acc-terra)' })
  })

  it('renaming into an existing label (any case) merges: no task carries it twice', () => {
    cache = [task('a', ['Urgent', 'calls']), task('b', ['calls'])]
    L.renameLabelWithUndo('Urgent', 'CALLS')
    expect([labelsOf('a'), labelsOf('b')]).toEqual([['calls'], ['calls']])
    expect(undos[0].message).toBe('Merged into “calls” · 1 task')
    undos[0].undo()
    expect(labelsOf('a')).toEqual(['Urgent', 'calls'])
  })

  it('a case-only rename is a rename, not a merge', () => {
    L.renameLabelWithUndo('calls', 'Calls')
    expect(labelsOf('a')).toEqual(['Urgent', 'Calls'])
    expect(undos[0].message).toBe('Renamed to “Calls” · 1 task')
  })

  it('delete takes it off every task and out of the colours; Undo brings both back', () => {
    L.deleteLabelWithUndo('Urgent')
    expect([labelsOf('a'), labelsOf('b'), labelsOf('gone')]).toEqual([['calls'], [], []])
    expect(settings?.label_meta).toEqual({})
    expect(undos.map((u) => u.message)).toEqual(['Deleted “Urgent” from 3 tasks'])
    undos[0].undo()
    expect([labelsOf('a'), labelsOf('b'), labelsOf('gone')]).toEqual([['Urgent', 'calls'], ['Urgent'], ['Urgent']])
    expect(settings?.label_meta).toEqual({ Urgent: 'var(--acc-terra)' })
  })

  it("Undo keeps edits made since to the same tasks' other fields", () => {
    L.deleteLabelWithUndo('Urgent')
    cache = cache.map((t) => (t.id === 'b' ? { ...t, title: 'renamed meanwhile' } : t))
    undos[0].undo()
    expect(cache.find((t) => t.id === 'b')).toMatchObject({ title: 'renamed meanwhile', labels: ['Urgent'] })
  })

  it('before migration 0069 (the row has no label_meta) nothing is sent for colours; labels still rename', () => {
    settings = { timezone: 'Africa/Cairo' }
    L.renameLabelWithUndo('Urgent', 'Now', 'var(--acc-sage)')
    L.setLabelColor('Now', 'var(--acc-sage)')
    expect(writes.some((w) => w.table === 'app_settings')).toBe(false)
    expect(labelsOf('a')).toEqual(['Now', 'calls'])
  })

  it('＋ New / a colour on a name that exists in another case colours that label', () => {
    L.setLabelColor('URGENT', 'var(--acc-sage)')
    expect(settings?.label_meta).toEqual({ Urgent: 'var(--acc-sage)' })
    L.setLabelColor('Gym', 'var(--acc-clover)')
    expect(settings?.label_meta).toEqual({ Urgent: 'var(--acc-sage)', Gym: 'var(--acc-clover)' })
  })
})
