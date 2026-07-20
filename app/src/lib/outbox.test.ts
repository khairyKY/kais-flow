import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, unknown>()

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => store.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value)
  }),
}))

const upsertMock = vi.fn()
const deleteEqMock = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => ({
      upsert: (payload: unknown) => upsertMock(table, payload),
      delete: () => ({ eq: (col: string, val: unknown) => deleteEqMock(table, col, val) }),
    }),
  },
}))

// A minimal stand-in for the query cache: remembers the value per key so a test can simulate
// "server refetch lands stale data" and then assert what the cache ends up holding.
const cache = new Map<string, unknown>()
const setQueryDataMock = vi.fn((key: unknown[], updater: unknown) => {
  const k = String(key[0])
  const next = typeof updater === 'function' ? (updater as (o: unknown) => unknown)(cache.get(k)) : updater
  cache.set(k, next)
  return next
})

vi.mock('./queryClient', () => ({
  queryClient: {
    setQueryData: (key: unknown[], updater: unknown) => setQueryDataMock(key, updater),
    cancelQueries: vi.fn(),
    getQueryCache: () => ({ subscribe: vi.fn() }),
  },
}))

const toastPushMock = vi.fn()
vi.mock('./toastStore', () => ({
  useToastStore: { getState: () => ({ push: toastPushMock }) },
}))

vi.stubGlobal('navigator', { onLine: true })

async function flushMicrotasks() {
  await new Promise((r) => setTimeout(r, 0))
}

describe('outbox', () => {
  beforeEach(() => {
    store.clear()
    cache.clear()
    upsertMock.mockReset()
    deleteEqMock.mockReset()
    toastPushMock.mockReset()
    setQueryDataMock.mockClear()
    vi.resetModules()
  })

  it('flushes a queued upsert and empties the queue on success', async () => {
    upsertMock.mockResolvedValue({ error: null })
    const { writeRow, flushOutbox } = await import('./outbox')
    writeRow('tasks', { id: 't1', title: 'x' })
    await flushMicrotasks()
    await flushOutbox()
    expect(upsertMock).toHaveBeenCalledWith('tasks', expect.objectContaining({ id: 't1' }))
    expect(store.get('kf-outbox')).toEqual([])
  })

  it('stops on the first failure and keeps the item queued for retry', async () => {
    upsertMock.mockResolvedValue({ error: new Error('offline') })
    const { writeRow, flushOutbox } = await import('./outbox')
    writeRow('tasks', { id: 't2', title: 'y' })
    await flushMicrotasks()
    await flushOutbox()
    expect(upsertMock).toHaveBeenCalled()
    expect(store.get('kf-outbox')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 't2' })]),
    )
  })

  it('does not toast on a plain network/offline failure', async () => {
    upsertMock.mockResolvedValue({ error: new Error('offline') })
    const { writeRow, flushOutbox } = await import('./outbox')
    writeRow('tasks', { id: 't-net', title: 'x' })
    await flushMicrotasks()
    await flushOutbox()
    expect(toastPushMock).not.toHaveBeenCalled()
  })

  it('toasts once when the server rejects a write, and parks it out of the live queue', async () => {
    upsertMock.mockResolvedValue({ error: { code: '42501', message: 'permission denied' } })
    const { writeRow, flushOutbox } = await import('./outbox')
    writeRow('tasks', { id: 't-rejected', title: 'x' })
    await flushMicrotasks()
    await flushOutbox()
    await flushOutbox() // the 30s retry firing again must not re-toast

    expect(toastPushMock).toHaveBeenCalledTimes(1)
    expect(toastPushMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('permission denied') }),
    )
    // Parked, not retried forever, and kept for inspection rather than silently dropped.
    expect(store.get('kf-outbox')).toEqual([])
    expect(store.get('kf-outbox-dead')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 't-rejected', error: 'permission denied' })]),
    )
  })

  // The regression that wedged Kai's whole sync: one poison row blocked everything behind it.
  it('keeps draining the queue when an earlier row is permanently rejected', async () => {
    upsertMock.mockImplementation((table: string) =>
      table === 'journal_entries'
        ? Promise.resolve({ error: { code: '22P02', message: 'invalid input syntax for type uuid: ""' } })
        : Promise.resolve({ error: null }),
    )
    const { writeRow, flushOutbox } = await import('./outbox')
    writeRow('journal_entries', { id: 'bad-1', body: 'x' }) // poison, queued first
    await flushMicrotasks()
    writeRow('tasks', { id: 'good-1', title: 'behind the poison row' })
    await flushMicrotasks()
    await flushOutbox()

    expect(upsertMock).toHaveBeenCalledWith('tasks', expect.objectContaining({ id: 'good-1' }))
    expect(store.get('kf-outbox')).toEqual([])
  })

  // R4 P0: the exact race behind "if I dismiss smth it comes back to the inbox".
  describe('pending writes survive a refetch (write-behind read path)', () => {
    it('re-applies a queued status change over stale server rows', async () => {
      upsertMock.mockResolvedValue({ error: new Error('offline') }) // keep it queued
      const { writeRow, reapplyPendingWrites } = await import('./outbox')

      cache.set('inbox_items', [{ id: 'i1', status: 'pending' }])
      writeRow('inbox_items', { id: 'i1', status: 'dismissed' })
      await flushMicrotasks()
      expect((cache.get('inbox_items') as { status: string }[])[0].status).toBe('dismissed')

      // realtime fires, a refetch lands server rows that predate the flush
      cache.set('inbox_items', [{ id: 'i1', status: 'pending' }])
      await reapplyPendingWrites('inbox_items')

      expect((cache.get('inbox_items') as { status: string }[])[0].status).toBe('dismissed')
    })

    it('keeps server-only columns while re-applying the pending change', async () => {
      upsertMock.mockResolvedValue({ error: new Error('offline') })
      const { writeRow, reapplyPendingWrites } = await import('./outbox')

      cache.set('projects', [{ id: 'p1', color: null }])
      writeRow('projects', { id: 'p1', color: '#8A9A7E' })
      await flushMicrotasks()

      // refetch brings a generated/server-side column the client never sends
      cache.set('projects', [{ id: 'p1', color: null, search_tsv: 'xyz' }])
      await reapplyPendingWrites('projects')

      const row = (cache.get('projects') as Record<string, unknown>[])[0]
      expect(row.color).toBe('#8A9A7E')
      expect(row.search_tsv).toBe('xyz')
    })

    it('re-applies a queued delete so a removed row does not reappear', async () => {
      deleteEqMock.mockResolvedValue({ error: new Error('offline') })
      const { writeRow, reapplyPendingWrites } = await import('./outbox')

      cache.set('tasks', [{ id: 't1' }, { id: 't2' }])
      writeRow('tasks', { id: 't1' }, 'delete')
      await flushMicrotasks()

      cache.set('tasks', [{ id: 't1' }, { id: 't2' }]) // stale refetch
      await reapplyPendingWrites('tasks')

      expect((cache.get('tasks') as { id: string }[]).map((r) => r.id)).toEqual(['t2'])
    })

    it('leaves the cache alone when nothing is queued for that table', async () => {
      const { reapplyPendingWrites } = await import('./outbox')
      cache.set('tasks', [{ id: 't9' }])
      setQueryDataMock.mockClear()
      await reapplyPendingWrites('tasks')
      expect(setQueryDataMock).not.toHaveBeenCalled()
    })
  })

  it('replaces a queued write for the same row instead of stacking duplicates', async () => {
    upsertMock.mockResolvedValue({ error: new Error('offline') }) // keep items queued
    const { writeRow } = await import('./outbox')
    writeRow('tasks', { id: 't3', title: 'first' })
    await flushMicrotasks()
    writeRow('tasks', { id: 't3', title: 'second' })
    await flushMicrotasks()
    const queue = store.get('kf-outbox') as { id: string; payload: { title: string } }[]
    const entriesForT3 = queue.filter((e) => e.id === 't3')
    expect(entriesForT3).toHaveLength(1)
    expect(entriesForT3[0].payload.title).toBe('second')
  })

  it('does not lose a second write enqueued while the first write is still mid-flush', async () => {
    // Regression test: a slow in-flight flush used to keep a stale local queue snapshot and
    // overwrite storage with it, clobbering anything enqueued in the meantime (e.g. a task
    // write immediately followed by its activity_log write).
    let resolveFirstUpsert!: (v: { error: null }) => void
    upsertMock.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirstUpsert = resolve)),
    )
    upsertMock.mockResolvedValue({ error: null }) // subsequent calls resolve immediately

    const { writeRow } = await import('./outbox')
    writeRow('tasks', { id: 'task-1', title: 'A' }) // kicks off a flush that stalls on upsert
    await flushMicrotasks()
    writeRow('activity_log', { id: 'activity-1', event_type: 'task.created' }) // enqueued while the above is in flight
    await flushMicrotasks()

    resolveFirstUpsert({ error: null }) // let the stalled upsert complete
    await flushMicrotasks()
    await flushMicrotasks()

    expect(upsertMock).toHaveBeenCalledWith('tasks', expect.objectContaining({ id: 'task-1' }))
    expect(upsertMock).toHaveBeenCalledWith(
      'activity_log',
      expect.objectContaining({ id: 'activity-1' }),
    )
    expect(store.get('kf-outbox')).toEqual([])
  })
})
