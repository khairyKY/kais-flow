import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dehydrate, type Query } from '@tanstack/react-query'
import { persistQueryClientRestore, persistQueryClientSave, type PersistedClient } from '@tanstack/query-persist-client-core'

// S8 (K-g): the IndexedDB persister leaves personal content out. idb-keyval is faked with a Map,
// so these tests read exactly what would have been written to disk.
const idb = new Map<string, unknown>()
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => idb.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    idb.set(key, value)
  }),
  del: vi.fn(async (key: string) => {
    idb.delete(key)
  }),
}))

// Only for the outbox test at the bottom: signed in, offline, so a write stays queued.
vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({ upsert: vi.fn(), delete: () => ({ eq: vi.fn() }) }),
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u-1' } } }, error: null }),
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        cb('INITIAL_SESSION', { user: { id: 'u-1' } })
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
    },
  },
}))
vi.mock('./toastStore', () => ({ useToastStore: { getState: () => ({ push: vi.fn() }) } }))
vi.stubGlobal('navigator', { onLine: false })

const {
  UNPERSISTED_QUERY_ROOTS,
  idbPersister,
  isUnpersistedQueryKey,
  queryClient,
  shouldPersistQuery,
  withoutUnpersistedQueries,
} = await import('./queryClient')
const { OUTBOX_KEY, writeRow } = await import('./outbox')

const CACHE_KEY = 'kais-flow-query-cache'
const PERSONAL = ['journal_entries', 'people', 'interactions', 'notes', 'push_subscriptions', 'commentary', 'quotes', 'deleted_items', 'captures', 'capture', 'capture_urls']
const KEPT = ['tasks', 'inbox_items', 'projects', 'domains', 'areas', 'calendar_events', 'routines', 'app_settings', 'books', 'activity_log']

function fakeQuery(queryKey: unknown[], status: 'success' | 'pending' | 'error' = 'success'): Query {
  return { queryKey, state: { status } } as unknown as Query
}

function storedKeys(): string[] {
  const raw = idb.get(CACHE_KEY)
  if (typeof raw !== 'string') return []
  return (JSON.parse(raw) as PersistedClient).clientState.queries.map((q) => String(q.queryKey[0]))
}

beforeEach(() => {
  idb.clear()
  queryClient.clear()
})

describe('shouldPersistQuery (S8 predicate)', () => {
  it('excludes exactly the personal-content roots', () => {
    expect([...UNPERSISTED_QUERY_ROOTS].sort()).toEqual([...PERSONAL].sort())
    for (const root of PERSONAL) expect(shouldPersistQuery(fakeQuery([root]))).toBe(false)
  })

  it('matches on the first key element, so sub-keyed queries are excluded too', () => {
    expect(shouldPersistQuery(fakeQuery(['commentary', 'note', 'n-1']))).toBe(false)
    expect(isUnpersistedQueryKey(['journal_entries', { day: '2026-09-26' }])).toBe(true)
  })

  it('keeps everything else that loaded — tasks, inbox, calendar still open offline', () => {
    for (const root of KEPT) expect(shouldPersistQuery(fakeQuery([root]))).toBe(true)
    expect(shouldPersistQuery(fakeQuery(['activity_log', 'review_week', '2026-09-21']))).toBe(true)
  })

  it("keeps TanStack's default: only successful queries are persisted", () => {
    expect(shouldPersistQuery(fakeQuery(['tasks'], 'pending'))).toBe(false)
    expect(shouldPersistQuery(fakeQuery(['tasks'], 'error'))).toBe(false)
  })

  it('ignores keys that are not table names', () => {
    expect(isUnpersistedQueryKey([])).toBe(false)
    expect(isUnpersistedQueryKey([42])).toBe(false)
    expect(isUnpersistedQueryKey(['journal'])).toBe(false)
  })
})

describe('the real client and persister', () => {
  function seed() {
    queryClient.setQueryData(['tasks'], [{ id: 't1', title: 'Call Omar' }])
    queryClient.setQueryData(['journal_entries'], [{ id: 'j1', body: 'private words' }])
    queryClient.setQueryData(['people'], [{ id: 'p1', name: 'Mona' }])
    queryClient.setQueryData(['commentary', 'note', 'n1'], [{ id: 'c1', body: 'my take' }])
    queryClient.setQueryData(['push_subscriptions'], [{ id: 's1', endpoint: 'https://push.example/x' }])
  }

  it('dehydrate() uses the S8 filter by default (no dehydrateOptions needed at the call site)', () => {
    seed()
    const keys = dehydrate(queryClient).queries.map((q) => q.queryKey[0])
    expect(keys).toEqual(['tasks'])
  })

  it('what reaches IndexedDB has no journal, people, commentary or push rows', async () => {
    seed()
    await persistQueryClientSave({ queryClient, persister: idbPersister })
    expect(storedKeys()).toEqual(['tasks'])
    expect(String(idb.get(CACHE_KEY))).not.toContain('private words')
  })

  it("filters on the way to disk even if a caller's dehydrateOptions would let them through", async () => {
    seed()
    await persistQueryClientSave({
      queryClient,
      persister: idbPersister,
      dehydrateOptions: { shouldDehydrateQuery: () => true },
    })
    expect(storedKeys()).toEqual(['tasks'])
  })

  it('a snapshot written before S8 never hydrates personal rows back into memory', async () => {
    const legacy: PersistedClient = {
      timestamp: Date.now(),
      buster: '',
      clientState: {
        mutations: [],
        queries: ['tasks', 'journal_entries', 'people'].map((root) => ({
          queryKey: [root],
          queryHash: JSON.stringify([root]),
          state: {
            data: [{ id: `${root}-1` }],
            dataUpdateCount: 1,
            dataUpdatedAt: Date.now(),
            error: null,
            errorUpdateCount: 0,
            errorUpdatedAt: 0,
            fetchFailureCount: 0,
            fetchFailureReason: null,
            fetchMeta: null,
            isInvalidated: false,
            status: 'success' as const,
            fetchStatus: 'idle' as const,
          },
        })),
      },
    }
    idb.set(CACHE_KEY, JSON.stringify(legacy))

    await persistQueryClientRestore({ queryClient, persister: idbPersister })

    expect(queryClient.getQueryData(['tasks'])).toEqual([{ id: 'tasks-1' }])
    expect(queryClient.getQueryData(['journal_entries'])).toBeUndefined()
    expect(queryClient.getQueryData(['people'])).toBeUndefined()
  })

  it('withoutUnpersistedQueries leaves a clean snapshot untouched', () => {
    const clean = { timestamp: 1, buster: '', clientState: { mutations: [], queries: [] } } as PersistedClient
    expect(withoutUnpersistedQueries(clean)).toBe(clean)
  })
})

describe('the outbox still carries writes to the excluded tables', () => {
  it('a journal write shows in the session cache and waits in the outbox, but not in the persisted cache', async () => {
    queryClient.setQueryData(['journal_entries'], [])
    const entry = { id: 'j-offline', body: 'Written while offline.' }

    writeRow('journal_entries', entry)
    await new Promise((r) => setTimeout(r, 0))

    // Read cache for this session: optimistic row is there.
    expect(queryClient.getQueryData(['journal_entries'])).toEqual([entry])
    // Write queue: the entry is waiting to sync.
    const queue = idb.get(OUTBOX_KEY) as { table: string; id: string; op: string }[]
    expect(queue).toEqual([expect.objectContaining({ table: 'journal_entries', id: 'j-offline', op: 'upsert' })])
    // Persisted read cache: nothing from the journal.
    await persistQueryClientSave({ queryClient, persister: idbPersister })
    expect(storedKeys()).not.toContain('journal_entries')
  })
})
