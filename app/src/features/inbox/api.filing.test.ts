import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InboxItem } from '../../lib/types'
import { NO_PLACE } from '../tasks/move'

// P6 step 4: filing a GitHub issue keeps its link on the task (external_ref), so the task can show
// "View issue" after the inbox row composts.
const writes: { table: string; row: Record<string, unknown>; op?: string }[] = []
const toasts: { message: string; undo: () => void }[] = []

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../lib/queryClient', () => ({ queryClient: { getQueryData: (key: string[]) => (key[0] === 'areas' ? [{ id: 'a1', name: 'Health' }] : []) } }))
vi.mock('../../lib/outbox', () => ({
  writeRow: (table: string, row: Record<string, unknown>, op?: string) => writes.push({ table, row, op }),
}))
vi.mock('../../lib/activity', () => ({ logActivity: () => undefined }))
vi.mock('../../lib/undo', () => ({ toastUndo: (message: string, undo: () => void) => toasts.push({ message, undo }) }))

const { fileToTask, fileMany, fileCapture, dismissMany, snoozeMany, restoreMany, purgeMany } = await import('./api')

function item(over: Partial<InboxItem>): InboxItem {
  return {
    id: crypto.randomUUID(), kind: 'text', raw_text: 'Fix the login bug', transcript: null, ai_parse: null, confidence: null,
    status: 'pending', filed_task_id: null, payload: null, snoozed_until: null,
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...over,
  }
}
const taskWrite = () => writes.find((w) => w.table === 'tasks')!.row

describe('fileToTask', () => {
  beforeEach(() => { writes.length = 0 })

  it('a GitHub issue becomes a task that keeps the issue link', () => {
    const issue = item({ kind: 'github_issue', payload: { node_id: 'I_7', url: 'https://github.com/acme/app/issues/7', repo: 'acme/app', number: 7 } })
    fileToTask(issue, { silent: true })
    expect(taskWrite().external_ref).toEqual({ source: 'github', id: 'I_7', url: 'https://github.com/acme/app/issues/7' })
  })

  it('no link to keep → no external_ref (a plain capture, or a non-github.com url)', () => {
    fileToTask(item({}), { silent: true })
    expect(taskWrite()).not.toHaveProperty('external_ref')
    writes.length = 0
    fileToTask(item({ kind: 'github_issue', payload: { node_id: 'I_8', url: 'javascript:alert(1)' } }), { silent: true })
    expect(taskWrite()).not.toHaveProperty('external_ref')
  })

  // P7e A2: it used to land as a task due at 15:00 with nothing on the calendar.
  it('a timed card files with its calendar block, as long as the AI read (the one capture rule)', () => {
    const due = '2026-10-17T12:00:00.000Z'
    fileCapture(item({ ai_parse: { due_at: due, has_time: true, duration_min: 45, confidence: 0.9 } }), { to: 'task', title: 'Call Omar', dueAt: due, timed: true, place: NO_PLACE })
    expect(taskWrite()).toMatchObject({ due_at: due, duration_min: 45 })
    const block = writes.find((w) => w.table === 'calendar_events')!.row
    expect(block).toMatchObject({ task_id: taskWrite().id, starts_at: due, ends_at: '2026-10-17T12:45:00.000Z', type: 'task' })
  })

  it('a day-only card, or the date cleared, puts nothing on the calendar; a typed 30m still wins', () => {
    fileCapture(item({ payload: { duration_override: 30 }, ai_parse: { due_at: '2026-10-17T06:00:00Z', has_time: false, duration_min: 90, confidence: 0.9 } }), { to: 'task', title: 'Renew', dueAt: '2026-10-17T06:00:00Z', timed: false, place: NO_PLACE })
    expect(taskWrite().duration_min).toBe(30)
    fileToTask(item({ ai_parse: { due_at: '2026-10-17T12:00:00Z', has_time: true, confidence: 0.9 } }), { dueAt: null, silent: true })
    expect(writes.some((w) => w.table === 'calendar_events')).toBe(false)
  })

  it('no date passed: the AI read stands — its time blocks the calendar (morning ritual, resurfacing)', () => {
    fileToTask(item({ ai_parse: { due_at: '2026-10-17T12:00:00Z', has_time: true, confidence: 0.9 } }), { silent: true })
    expect(writes.find((w) => w.table === 'calendar_events')!.row).toMatchObject({ starts_at: '2026-10-17T12:00:00Z', ends_at: '2026-10-17T12:30:00.000Z' })
  })

  it('a cleared date files with no date — null is a choice, not "use the AI\'s"', () => {
    fileToTask(item({ ai_parse: { due_at: '2026-10-14T06:00:00Z', confidence: 0.9 } }), { dueAt: null, silent: true })
    expect(taskWrite().due_at).toBeNull()
  })
})

// ── Inbox t3 + the bulk fixes: one toast, one Undo per action, whatever the selection's size. ──
const inboxWrites = () => writes.filter((w) => w.table === 'inbox_items').map((w) => w.row)
const undoLast = () => toasts.at(-1)!.undo()

describe('fileCapture', () => {
  beforeEach(() => { writes.length = 0; toasts.length = 0 })

  it('files a task into an AREA (the picker says "Project or area…"), the toast in 3a\'s words + where', () => {
    const c = item({})
    fileCapture(c, { to: 'task', title: 'Book a check-up', dueAt: null, place: { kind: 'area', id: 'a1', domainId: 'd1', name: 'Health' } })
    expect(taskWrite()).toMatchObject({ title: 'Book a check-up', area_id: 'a1', domain_id: 'd1', project_id: null })
    expect(toasts.map((t) => t.message)).toEqual(['Filed "Book a check-up" as a task · Health'])
  })

  it("a journal note: today's entry with the capture's words; Undo deletes it and the capture waits again", () => {
    const c = item({ raw_text: 'that thing salma said about the balcony plants' })
    fileCapture(c, { to: 'journal', body: c.raw_text })
    const entry = writes.find((w) => w.table === 'journal_entries')!.row
    expect(entry.body).toBe('that thing salma said about the balcony plants')
    expect(inboxWrites().at(-1)).toMatchObject({ status: 'filed', payload: { filed_to: 'journal' } })
    writes.length = 0
    undoLast()
    expect(writes.find((w) => w.table === 'journal_entries')).toMatchObject({ op: 'delete', row: { id: entry.id } })
    expect(inboxWrites().at(-1)).toMatchObject({ id: c.id, status: 'pending' })
  })

  it("a person: a note on their page; Undo removes it", () => {
    const c = item({ raw_text: 'salma: balcony plants need shade' })
    fileCapture(c, { to: 'person', person: { id: 'pp1', name: 'Salma' }, summary: c.raw_text })
    const note = writes.find((w) => w.table === 'interactions')!.row
    expect(note).toMatchObject({ person_id: 'pp1', summary: 'salma: balcony plants need shade' })
    expect(toasts[0].message).toBe('Added to Salma')
    writes.length = 0
    undoLast()
    expect(writes.find((w) => w.table === 'interactions')).toMatchObject({ op: 'delete', row: { id: note.id } })
  })
})

describe('bulk actions — one toast, one Undo', () => {
  beforeEach(() => { writes.length = 0; toasts.length = 0 })
  const three = () => [item({ raw_text: 'a' }), item({ raw_text: 'b' }), item({ raw_text: 'c', status: 'dismissed' })]

  it('File: three tasks, one toast; Undo deletes all three tasks and puts the captures back', () => {
    const items = three().map((i) => ({ ...i, status: 'pending' as const }))
    fileMany(items.map((i) => [i, { to: 'task', title: i.raw_text, dueAt: null, place: { kind: 'none', name: 'None' } }] as const))
    const tasks = writes.filter((w) => w.table === 'tasks').map((w) => w.row)
    expect(tasks).toHaveLength(3)
    expect(toasts.map((t) => t.message)).toEqual(['3 captures filed'])
    writes.length = 0
    undoLast()
    expect(writes.filter((w) => w.table === 'tasks' && w.op === 'delete').map((w) => w.row.id).sort()).toEqual(tasks.map((t) => t.id).sort())
    expect(inboxWrites().map((r) => [r.id, r.status])).toEqual(items.map((i) => [i.id, 'pending']))
  })

  it('a selection of one says what the single action says', () => {
    const c = item({ raw_text: 'Buy ink' })
    fileMany([[c, { to: 'task', title: 'Buy ink', dueAt: null, place: { kind: 'none', name: 'None' } }]])
    expect(toasts.map((t) => t.message)).toEqual(['Filed "Buy ink" as a task'])
  })

  it('Dismiss / Snooze / Restore: one toast each; Undo writes every capture back as it was', () => {
    const items = three()
    dismissMany(items)
    expect(toasts.at(-1)!.message).toBe('3 captures dismissed')
    writes.length = 0
    undoLast()
    expect(inboxWrites().map((r) => r.status)).toEqual(['pending', 'pending', 'dismissed'])

    writes.length = 0
    snoozeMany(items.slice(0, 2), '2026-10-13T06:00:00Z')
    expect(toasts.at(-1)!.message).toMatch(/^2 captures snoozed until /)
    expect(inboxWrites().every((r) => r.snoozed_until === '2026-10-13T06:00:00Z')).toBe(true)
    writes.length = 0
    undoLast()
    expect(inboxWrites().every((r) => r.snoozed_until === null)).toBe(true)

    writes.length = 0
    restoreMany([items[2]])
    expect(toasts.at(-1)!.message).toBe('Restored to Inbox')
    writes.length = 0
    undoLast()
    expect(inboxWrites()[0].status).toBe('dismissed')
  })

  it('Clear now goes to Trash with Undo (no confirm) — and Undo takes it back out of Trash', () => {
    const items = three().map((i) => ({ ...i, status: 'dismissed' as const, deleted_at: null }))
    purgeMany(items)
    expect(toasts.at(-1)!.message).toBe('Moved 3 captures to Trash')
    expect(inboxWrites().every((r) => typeof r.deleted_at === 'string')).toBe(true)
    writes.length = 0
    undoLast()
    expect(inboxWrites().every((r) => r.deleted_at === null && r.status === 'dismissed')).toBe(true)
  })

  it('nothing selected, nothing written, no toast', () => {
    dismissMany([])
    fileMany([])
    expect(writes).toHaveLength(0)
    expect(toasts).toHaveLength(0)
  })
})

// Inbox "Someday" used to be a 365-day snooze (the capture vanished for a year). Now it files a
// someday task — undated, in Tasks › Someday — and the toast says so; Undo un-files it.
describe('Someday files a someday task', () => {
  beforeEach(() => { writes.length = 0; toasts.length = 0 })

  it('one capture: someday, no date even when the AI read one, its place kept; Undo deletes it', () => {
    const c = item({ raw_text: 'learn the cello', ai_parse: { due_at: '2026-10-14T06:00:00Z', confidence: 0.9 } })
    fileMany([[c, { to: 'task', title: 'Learn the cello', dueAt: null, place: { kind: 'area', id: 'a1', domainId: null, name: 'Health' }, someday: true }]])
    expect(taskWrite()).toMatchObject({ title: 'Learn the cello', someday: true, due_at: null, area_id: 'a1' })
    expect(inboxWrites().at(-1)).toMatchObject({ id: c.id, status: 'filed', snoozed_until: null })
    expect(toasts.map((t) => t.message)).toEqual(['Filed "Learn the cello" to Someday · Health'])
    const task = taskWrite()
    writes.length = 0
    undoLast()
    expect(writes.find((w) => w.table === 'tasks')).toMatchObject({ op: 'delete', row: { id: task.id } })
    expect(inboxWrites().at(-1)).toMatchObject({ id: c.id, status: 'pending' })
  })

  it('a selection: one toast that names Someday', () => {
    const pairs = [item({}), item({})].map((c) => [c, { to: 'task' as const, title: c.raw_text, dueAt: null, place: { kind: 'none' as const, name: 'None' }, someday: true }] as const)
    fileMany(pairs)
    expect(writes.filter((w) => w.table === 'tasks').every((w) => w.row.someday === true)).toBe(true)
    expect(toasts.map((t) => t.message)).toEqual(['2 captures filed to Someday'])
  })
})
