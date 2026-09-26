import { describe, expect, it, vi } from 'vitest'
import type { OutboxEntry } from '../lib/outbox'
import { syncHeader, syncRows } from './syncQueue'

// Just enough of idb-keyval + supabase for lib/outbox.ts to load, so the row list can be checked
// against the real `unsyncedChanges()` count it has to agree with.
const store = new Map<string, unknown>()
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => store.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value)
  }),
  del: vi.fn(async (key: string) => {
    store.delete(key)
  }),
}))
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({}),
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}))

let t = 1_000
function row(table: string, id: string, payload: Record<string, unknown> = {}, op: OutboxEntry['op'] = 'upsert'): OutboxEntry {
  return { id, table, op, payload: { id, ...payload }, queuedAt: t++ }
}
function act(eventType: string, entityId: string, payload: Record<string, unknown> = {}): OutboxEntry {
  const id = `a-${t}`
  return row('activity_log', id, { event_type: eventType, entity_type: eventType.split('.')[0], entity_id: entityId, payload })
}

const RAW_NAMES = /activity_log|inbox_items|journal_entries|calendar_events|app_settings|_/i

describe('syncRows', () => {
  it('one capture is one row, named like a person would name it', () => {
    const rows = syncRows([row('inbox_items', 'i1', { raw_text: 'basil seeds' }), act('inbox.captured', 'i1', { kind: 'text' })])
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('Inbox')
    expect(rows[0].text).toBe("'basil seeds' · captured")
  })

  it('a completed task borrows its verb from its own activity row', () => {
    const rows = syncRows([row('tasks', 't1', { title: 'buy milk' }), act('task.created', 't1'), act('task.completed', 't1')])
    expect(rows).toEqual([expect.objectContaining({ kind: 'Task', text: "'buy milk' · completed" })])
  })

  it('journal rows never print the body', () => {
    const rows = syncRows([row('journal_entries', 'j1', { body: 'private words' }), act('journal.updated', 'j1')])
    expect(rows[0]).toEqual(expect.objectContaining({ kind: 'Journal', text: 'updated' }))
    expect(JSON.stringify(rows)).not.toContain('private words')
  })

  it('when only activity rows wait (a ritual step), they are the changes — named, not raw', () => {
    const rows = syncRows([act('ritual.step_completed', 'r1', { ritual: 'morning', step: 'top3' }), act('review.week_closed', 'w1')])
    expect(rows).toEqual([
      expect.objectContaining({ kind: 'Ritual', text: 'step completed' }),
      expect.objectContaining({ kind: 'Review', text: 'week closed' }),
    ])
  })

  it('a delete with no activity row reads "removed"; an unknown table is just a "Change"', () => {
    expect(syncRows([row('tasks', 't2', {}, 'delete')])[0].text).toBe('removed')
    expect(syncRows([row('mystery_table', 'm1')])[0].kind).toBe('Change')
  })

  it('never shows a table name, whatever the queue holds', () => {
    const queue = [
      row('people', 'p1', { name: 'Salma' }),
      act('people.created', 'p1', { name: 'Salma' }),
      row('app_settings', 'true', { display_name: 'Mira' }),
      row('calendar_events', 'e1', { title: 'Deep work' }),
      act('calendar_event.created', 'e1'),
    ]
    for (const r of syncRows(queue)) {
      expect(r.kind).not.toMatch(RAW_NAMES)
      expect(r.text.replace(/'[^']*'/g, '')).not.toMatch(RAW_NAMES)
    }
  })
})

describe('syncRows agrees with unsyncedChanges()', () => {
  const queues: OutboxEntry[][] = [
    [],
    [row('tasks', 't1', { title: 'x' }), act('task.completed', 't1')],
    [row('inbox_items', 'i1', { raw_text: 'x' }), act('inbox.captured', 'i1'), row('tasks', 't9', { title: 'y' }), act('task.created', 't9')],
    [act('ritual.step_completed', 'r1'), act('review.week_closed', 'w1')],
    [row('app_settings', 'true', {})],
  ]
  it.each(queues.map((q, i) => [i, q] as const))('queue #%i', async (_i, queue) => {
    store.set('kf-outbox', queue)
    const { unsyncedChanges } = await import('../lib/outbox')
    expect(syncRows(queue)).toHaveLength(await unsyncedChanges())
  })
})

describe('syncHeader', () => {
  it('says "changes", singular for one', () => {
    expect(syncHeader(2, true)).toBe('Syncing ↻ · 2 changes waiting to sync')
    expect(syncHeader(1, true)).toBe('Syncing ↻ · 1 change waiting to sync')
    expect(syncHeader(3, false)).toBe('Offline ◌ · 3 changes saved here')
  })
})
