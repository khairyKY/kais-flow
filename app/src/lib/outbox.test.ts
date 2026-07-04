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

vi.mock('./queryClient', () => ({
  queryClient: { setQueryData: vi.fn() },
}))

vi.stubGlobal('navigator', { onLine: true })

async function flushMicrotasks() {
  await new Promise((r) => setTimeout(r, 0))
}

describe('outbox', () => {
  beforeEach(() => {
    store.clear()
    upsertMock.mockReset()
    deleteEqMock.mockReset()
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
