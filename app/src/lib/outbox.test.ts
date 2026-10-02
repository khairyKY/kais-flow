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
const selectInMock = vi.fn()

// The signed-in account. The outbox tags new entries with it (via the auth listener) and only
// flushes under a session (getSession). `null` = signed out / session expired.
const auth = { session: { user: { id: 'u-1' } } as { user: { id: string } } | null }
type AuthListener = (event: string, session: typeof auth.session) => void
let authListener: AuthListener = () => {}
function switchAccount(session: typeof auth.session) {
  auth.session = session
  authListener(session ? 'SIGNED_IN' : 'SIGNED_OUT', session)
}

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => ({
      upsert: (payload: unknown) => upsertMock(table, payload),
      delete: () => ({ eq: (col: string, val: unknown) => deleteEqMock(table, col, val) }),
      select: () => ({ in: (col: string, ids: string[]) => selectInMock(table, col, ids) }),
    }),
    auth: {
      getSession: async () => ({ data: { session: auth.session }, error: null }),
      onAuthStateChange: (cb: AuthListener) => {
        authListener = cb
        cb('INITIAL_SESSION', auth.session)
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
    },
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
    getQueryData: () => undefined,
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
    selectInMock.mockReset()
    toastPushMock.mockReset()
    setQueryDataMock.mockClear()
    auth.session = { user: { id: 'u-1' } }
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
    // House rule (F5c): calm copy only — no raw server text, no table name, never "error".
    const toastMessage = (toastPushMock.mock.calls[0][0] as { message: string }).message
    expect(toastMessage).toContain("couldn't be saved")
    expect(toastMessage).not.toMatch(/permission denied|error|tasks/i)
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

  it('strips server-owned columns from the payload it sends', async () => {
    // `search_tsv` is a generated column (Postgres 400s if you echo it back); `embedding` is
    // written only by the embed pipeline. Both arrive via `select('*')` and would otherwise
    // ride the read-modify-write pattern straight back to the server. (Audit H1.)
    upsertMock.mockResolvedValue({ error: new Error('offline') }) // keep the item queued
    const { writeRow } = await import('./outbox')
    writeRow('tasks', { id: 't-strip', title: 'keep me', search_tsv: 'xyz', embedding: [0.1, 0.2] })
    await flushMicrotasks()
    const queue = store.get('kf-outbox') as { id: string; payload: Record<string, unknown> }[]
    const entry = queue.find((e) => e.id === 't-strip')!
    expect(entry.payload.title).toBe('keep me')
    expect(entry.payload).not.toHaveProperty('search_tsv')
    expect(entry.payload).not.toHaveProperty('embedding')
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

  describe('empty user_id (audit 2026-09-26: people / time_entries / library creates vanished)', () => {
    it('never sends an empty user_id, so the DB default auth.uid() applies', async () => {
      upsertMock.mockResolvedValue({ error: new Error('offline') }) // keep items queued
      const { writeRow } = await import('./outbox')
      writeRow('people', { id: 'p-empty', user_id: '', name: 'Mona' })
      writeRow('people', { id: 'p-real', user_id: 'u-1', name: 'Omar' })
      await flushMicrotasks()
      const queue = store.get('kf-outbox') as { id: string; payload: Record<string, unknown> }[]
      expect(queue.find((e) => e.id === 'p-empty')!.payload).not.toHaveProperty('user_id')
      expect(queue.find((e) => e.id === 'p-real')!.payload.user_id).toBe('u-1')
    })

    const deadEmpty = (id: string, failedAt = 1) => ({
      id,
      table: 'people',
      op: 'upsert',
      payload: { id, user_id: '', name: `name-${id}` },
      queuedAt: 0,
      error: 'invalid input syntax for type uuid: ""',
      failedAt,
    })

    it('requeues a rejected empty-user_id write the server never got, without the column', async () => {
      upsertMock.mockResolvedValue({ error: new Error('offline') }) // hold the rescued row in the queue
      selectInMock.mockResolvedValue({ data: [], error: null })
      store.set('kf-outbox-dead', [deadEmpty('p1')])
      const { rescueEmptyUserIdWrites } = await import('./outbox')
      expect(await rescueEmptyUserIdWrites()).toBe(1)
      const queue = store.get('kf-outbox') as { id: string; payload: Record<string, unknown> }[]
      expect(queue).toHaveLength(1)
      expect(queue[0].payload).toEqual({ id: 'p1', name: 'name-p1' })
      expect(store.get('kf-outbox-dead')).toEqual([])
      expect(toastPushMock).toHaveBeenCalledTimes(1)
    })

    it('never replays over a row the server already has, and keeps unrelated dead letters', async () => {
      selectInMock.mockResolvedValue({ data: [{ id: 'p2' }], error: null })
      const other = { id: 't9', table: 'tasks', op: 'upsert', payload: { id: 't9', user_id: 'u-1' }, queuedAt: 0, error: 'rls' }
      store.set('kf-outbox-dead', [deadEmpty('p2'), other])
      const { rescueEmptyUserIdWrites } = await import('./outbox')
      expect(await rescueEmptyUserIdWrites()).toBe(0)
      expect(store.get('kf-outbox') ?? []).toEqual([])
      expect(store.get('kf-outbox-dead')).toEqual([other])
      expect(toastPushMock).not.toHaveBeenCalled()
    })

    it('lets a newer queued write for the same row win', async () => {
      upsertMock.mockResolvedValue({ error: new Error('offline') })
      selectInMock.mockResolvedValue({ data: [], error: null })
      const { writeRow, rescueEmptyUserIdWrites } = await import('./outbox')
      writeRow('people', { id: 'p3', name: 'newer' })
      await flushMicrotasks()
      store.set('kf-outbox-dead', [deadEmpty('p3')])
      expect(await rescueEmptyUserIdWrites()).toBe(0)
      const queue = store.get('kf-outbox') as { id: string; payload: { name: string } }[]
      expect(queue.filter((e) => e.id === 'p3').map((e) => e.payload.name)).toEqual(['newer'])
    })

    it('rescues only the latest failure per row', async () => {
      upsertMock.mockResolvedValue({ error: new Error('offline') })
      selectInMock.mockResolvedValue({ data: [], error: null })
      const older = { ...deadEmpty('p4', 1), payload: { id: 'p4', user_id: '', name: 'old' } }
      const newer = { ...deadEmpty('p4', 2), payload: { id: 'p4', user_id: '', name: 'new' } }
      store.set('kf-outbox-dead', [newer, older])
      const { rescueEmptyUserIdWrites } = await import('./outbox')
      expect(await rescueEmptyUserIdWrites()).toBe(1)
      const queue = store.get('kf-outbox') as { payload: { name: string } }[]
      expect(queue.map((e) => e.payload.name)).toEqual(['new'])
    })

    it('changes nothing when it cannot ask the server what it already has', async () => {
      selectInMock.mockResolvedValue({ data: null, error: { message: 'offline' } })
      store.set('kf-outbox-dead', [deadEmpty('p5')])
      const { rescueEmptyUserIdWrites } = await import('./outbox')
      expect(await rescueEmptyUserIdWrites()).toBe(0)
      expect(store.get('kf-outbox-dead')).toHaveLength(1)
    })
  })

  describe('sign-out support (P0-B: offline sign-out deleted unsent writes)', () => {
    it("counts unsynced changes without doubling each action's activity_log row", async () => {
      upsertMock.mockResolvedValue({ error: new Error('offline') }) // keep items queued
      const { writeRow, unsyncedChanges } = await import('./outbox')
      expect(await unsyncedChanges()).toBe(0)
      writeRow('inbox_items', { id: 'i1', raw_text: 'one' })
      writeRow('activity_log', { id: 'a1', event_type: 'inbox.captured' })
      writeRow('tasks', { id: 't1', title: 'two' })
      writeRow('activity_log', { id: 'a2', event_type: 'task.created' })
      await flushMicrotasks()
      expect(await unsyncedChanges()).toBe(2)
    })

    it('still counts activity rows when they are all that is waiting', async () => {
      upsertMock.mockResolvedValue({ error: new Error('offline') })
      const { writeRow, unsyncedChanges } = await import('./outbox')
      writeRow('activity_log', { id: 'a1', event_type: 'journal.updated' })
      await flushMicrotasks()
      expect(await unsyncedChanges()).toBe(1)
    })

    it('a flush requested mid-flush waits for the queue to drain instead of returning early', async () => {
      let release!: (v: { error: null }) => void
      upsertMock.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
      upsertMock.mockResolvedValue({ error: null })
      const { writeRow, flushOutbox, unsyncedChanges } = await import('./outbox')
      writeRow('tasks', { id: 't-slow', title: 'x' }) // starts a flush that stalls on the upsert
      await flushMicrotasks()
      let joined = false
      const second = flushOutbox().then(() => (joined = true))
      await flushMicrotasks()
      expect(joined).toBe(false) // the old early `return` resolved here with the write still queued
      release({ error: null })
      await second
      expect(await unsyncedChanges()).toBe(0)
    })

    it('does not try to flush while offline', async () => {
      vi.stubGlobal('navigator', { onLine: false })
      try {
        const { writeRow, flushOutbox, unsyncedChanges } = await import('./outbox')
        writeRow('tasks', { id: 't-off', title: 'x' })
        await flushMicrotasks()
        await flushOutbox()
        expect(upsertMock).not.toHaveBeenCalled()
        expect(await unsyncedChanges()).toBe(1)
      } finally {
        vi.stubGlobal('navigator', { onLine: true })
      }
    })
  })

  // Conductor scope (3), 2026-09-26: a queued write must only ever reach the server as the
  // account that made it — never with the anon key (dead-lettered), never as someone else.
  describe('entries carry their account', () => {
    it('tags each new entry with the signed-in account', async () => {
      upsertMock.mockResolvedValue({ error: new Error('offline') })
      const { writeRow } = await import('./outbox')
      writeRow('tasks', { id: 't1', title: 'x' })
      await flushMicrotasks()
      expect((store.get('kf-outbox') as { uid?: string }[])[0].uid).toBe('u-1')
    })

    it('with no session (signed out or expired) sends nothing and keeps the queue — no dead letters', async () => {
      upsertMock.mockResolvedValue({ error: new Error('offline') }) // queued while offline
      const { writeRow, flushOutbox } = await import('./outbox')
      writeRow('tasks', { id: 't-exp', title: 'queued before the session expired' })
      await flushMicrotasks()
      await flushOutbox()
      // Back online, but the session has expired: sent with the anon key, RLS would reject it.
      upsertMock.mockReset()
      upsertMock.mockResolvedValue({ error: { code: '42501', message: 'new row violates row-level security policy' } })
      switchAccount(null)
      await flushOutbox()
      expect(upsertMock).not.toHaveBeenCalled()
      expect(store.get('kf-outbox')).toEqual([expect.objectContaining({ id: 't-exp', uid: 'u-1' })])
      expect(store.get('kf-outbox-dead')).toBeUndefined()
      expect(toastPushMock).not.toHaveBeenCalled()

      // The same account signs back in → it goes out.
      upsertMock.mockResolvedValue({ error: null })
      switchAccount({ user: { id: 'u-1' } })
      await flushOutbox()
      expect(upsertMock).toHaveBeenCalledWith('tasks', expect.objectContaining({ id: 't-exp' }))
      expect(store.get('kf-outbox')).toEqual([])
    })

    it("flushes only this account's entries (and untagged legacy ones), leaving another account's untouched", async () => {
      upsertMock.mockResolvedValue({ error: null })
      const theirs = { id: 'x1', table: 'tasks', op: 'upsert', payload: { id: 'x1' }, queuedAt: 1, uid: 'u-2' }
      const legacy = { id: 'l1', table: 'tasks', op: 'upsert', payload: { id: 'l1' }, queuedAt: 2 }
      const mine = { id: 'm1', table: 'tasks', op: 'upsert', payload: { id: 'm1' }, queuedAt: 3, uid: 'u-1' }
      store.set('kf-outbox', [theirs, legacy, mine])
      const { flushOutbox } = await import('./outbox')
      await flushOutbox()
      expect(upsertMock.mock.calls.map((c) => (c[1] as { id: string }).id)).toEqual(['l1', 'm1'])
      expect(store.get('kf-outbox')).toEqual([theirs])
    })

    it("doesn't lay another account's pending writes over this account's rows", async () => {
      store.set('kf-outbox', [
        { id: 'x1', table: 'tasks', op: 'upsert', payload: { id: 'x1', title: 'theirs' }, queuedAt: 1, uid: 'u-2' },
        { id: 'm1', table: 'tasks', op: 'upsert', payload: { id: 'm1', title: 'mine' }, queuedAt: 2, uid: 'u-1' },
      ])
      const { reapplyPendingWrites } = await import('./outbox')
      cache.set('tasks', [])
      await reapplyPendingWrites('tasks')
      expect((cache.get('tasks') as { id: string }[]).map((r) => r.id)).toEqual(['m1'])
    })

    it("rescues a tagged empty-user_id dead letter only for its own account", async () => {
      upsertMock.mockResolvedValue({ error: new Error('offline') }) // hold rescued rows in the queue
      selectInMock.mockResolvedValue({ data: [], error: null })
      const dead = (id: string, uid?: string) => ({
        id, table: 'people', op: 'upsert', payload: { id, user_id: '', name: id }, queuedAt: 0,
        error: 'invalid input syntax for type uuid: ""', failedAt: 1, ...(uid ? { uid } : {}),
      })
      store.set('kf-outbox-dead', [dead('mine', 'u-1'), dead('theirs', 'u-2'), dead('legacy')])
      const { rescueEmptyUserIdWrites } = await import('./outbox')
      expect(await rescueEmptyUserIdWrites()).toBe(2)
      const queue = store.get('kf-outbox') as { id: string; uid?: string }[]
      expect(queue.map((e) => [e.id, e.uid])).toEqual([['mine', 'u-1'], ['legacy', 'u-1']])
      expect((store.get('kf-outbox-dead') as { id: string }[]).map((e) => e.id)).toEqual(['theirs'])
    })

    it('rescues nothing without a session', async () => {
      selectInMock.mockResolvedValue({ data: [], error: null })
      store.set('kf-outbox-dead', [{ id: 'p', table: 'people', op: 'upsert', payload: { id: 'p', user_id: '' }, queuedAt: 0 }])
      auth.session = null
      const { rescueEmptyUserIdWrites } = await import('./outbox')
      expect(await rescueEmptyUserIdWrites()).toBe(0)
      expect(store.get('kf-outbox-dead')).toHaveLength(1)
    })
  })
})
