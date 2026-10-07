import { describe, expect, it, vi } from 'vitest'
import type { OutboxEntry } from '../lib/outbox'
import { CALM, SLOW_SYNC_MS, SYNCED_FLASH_MS, syncHeader, syncLabel, syncRows, syncStep, type SyncFacts, type SyncMemory, type SyncView } from './syncQueue'

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

// Kai 2026-10-07: "tedious to keep seeing the sync status going and going back". A run of facts
// through the machine, the way the topbar feeds it; returns what was shown at each step.
function run(steps: Partial<SyncFacts>[], start: SyncMemory = CALM): (SyncView & { label: string | null; recheckAt: number | null })[] {
  let memory = start
  return steps.map((f) => {
    const s = syncStep(memory, { online: true, waiting: 0, oldestAt: null, parked: 0, now: 0, ...f })
    memory = s.memory
    return { ...s.view, label: syncLabel(s.view), recheckAt: s.recheckAt }
  })
}

describe('syncStep — the calm sync status', () => {
  it('a burst of ordinary writes shows nothing at all (no Syncing, no Synced)', () => {
    const burst = Array.from({ length: 20 }, (_, i) => [
      { waiting: 1, oldestAt: i * 500, now: i * 500 + 50 },
      { waiting: 0, now: i * 500 + 400 },
    ]).flat()
    expect(run(burst).every((v) => v.label === null)).toBe(true)
  })
  it('a write still waiting after ~4s shows "Syncing…"; the machine asks to look again right then', () => {
    const [early, late] = run([
      { waiting: 2, oldestAt: 1000, now: 1500 },
      { waiting: 2, oldestAt: 1000, now: 1000 + SLOW_SYNC_MS },
    ])
    expect(early.label).toBeNull()
    expect(early.recheckAt).toBe(1000 + SLOW_SYNC_MS)
    expect(late).toMatchObject({ kind: 'syncing', label: 'Syncing…' })
  })
  it('when a slow sync finishes it simply goes quiet — "Synced" is only for trouble clearing', () => {
    const [, done] = run([{ waiting: 1, oldestAt: 0, now: 5000 }, { waiting: 0, now: 6000 }])
    expect(done.label).toBeNull()
  })
  it('offline says how many wait; back online it drains, then a brief "Synced", then nothing', () => {
    const views = run([
      { online: false, waiting: 0, now: 0 },
      { online: false, waiting: 3, oldestAt: 100, now: 200 },
      { online: true, waiting: 3, oldestAt: 100, now: 9000 }, // reconnect: the old writes are slow by now
      { online: true, waiting: 0, now: 9500 },
      { online: true, waiting: 0, now: 9500 + SYNCED_FLASH_MS - 1 },
      { online: true, waiting: 0, now: 9500 + SYNCED_FLASH_MS },
    ])
    expect(views.map((v) => v.label)).toEqual(['Offline', 'Offline · 3 waiting', 'Syncing…', 'Synced', 'Synced', null])
    expect(views[3].recheckAt).toBe(9500 + SYNCED_FLASH_MS)
  })
  it('a parked (rejected) write is a clear state until it is seen; then "Synced" once', () => {
    const views = run([
      { parked: 1, now: 0 },
      { parked: 2, waiting: 1, oldestAt: 0, now: 100 },
      { parked: 0, now: 200 },
    ])
    expect(views.map((v) => v.label)).toEqual(['1 change not saved ⚠', '2 changes not saved ⚠', 'Synced'])
    expect(views[0].kind).toBe('parked')
  })
  it('a quick write while "Synced" shows neither blinks it off nor restarts it', () => {
    const views = run([
      { online: false, now: 0 },
      { online: true, now: 100 }, // Synced until 100 + FLASH
      { online: true, waiting: 1, oldestAt: 150, now: 150 },
      { online: true, waiting: 0, now: 300 },
      { online: true, waiting: 0, now: 100 + SYNCED_FLASH_MS },
    ])
    expect(views.map((v) => v.label)).toEqual(['Offline', 'Synced', 'Synced', 'Synced', null])
  })
})
