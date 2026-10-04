import { QueryClient, defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import type { PersistedClient, Persister } from '@tanstack/query-persist-client-core'
import { get, set, del } from 'idb-keyval'

// ── S8 (Kai's K-g ruling: exclude) — personal content never lands in the IndexedDB read cache.
// These stay in memory for the session and are fetched fresh on each load; they are not written
// to disk by the persister. Writes to these tables are unaffected: they still go through the
// outbox (its own `kf-outbox` key), so offline edits queue and sync exactly as before.
// Keyed by the query key's first element, which is the table name everywhere in this app.
export const UNPERSISTED_QUERY_ROOTS: ReadonlySet<string> = new Set([
  'journal_entries', // K-g: journal
  'people', // K-g: people (names + facts)
  'interactions', // K-g: what happened with each person
  'notes', // K-g: library notes (your own writing)
  'push_subscriptions', // K-g: this device's push endpoint and keys
  'commentary', // your own writing on notes and quotes (library)
  'quotes', // library passages you kept (the Library is parked, so nothing is lost offline)
  'deleted_items', // Trash: carries whole trashed journal entries (body, mood, gratitude)
  'captures', // Paper capture: what your handwriting said (lecture notes, journal lines)
  'capture', // one capture, opened from a task's photo link
  'capture_urls', // signed photo URLs (an hour's life — no use on the next load)
])

export function isUnpersistedQueryKey(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0]
  return typeof root === 'string' && UNPERSISTED_QUERY_ROOTS.has(root)
}

/** The persister's filter: TanStack's default (successful queries only) minus personal content. */
export function shouldPersistQuery(query: Query): boolean {
  return defaultShouldDehydrateQuery(query) && !isUnpersistedQueryKey(query.queryKey)
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000, // 24h — keep cached data around for offline reads
      retry: 1,
    },
    // S8: `PersistQueryClientProvider` (App.tsx) passes no `dehydrateOptions`, so the persister's
    // dehydrate() falls back to this client default — the one place the filter needs to live.
    dehydrate: { shouldDehydrateQuery: shouldPersistQuery },
  },
})

/** Drops personal queries from a persisted snapshot. Applied on the way to disk (so a caller
 * passing its own dehydrateOptions can't bypass S8) and on the way back (so a snapshot written
 * before S8 shipped never re-hydrates journal or people rows into memory; the next save
 * overwrites it without them). */
export function withoutUnpersistedQueries(client: PersistedClient): PersistedClient {
  const queries = client.clientState.queries.filter((q) => !isUnpersistedQueryKey(q.queryKey))
  if (queries.length === client.clientState.queries.length) return client
  return { ...client, clientState: { ...client.clientState, queries } }
}

// IndexedDB-backed persister so the app opens instantly offline with last-known data.
const idbStore = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get(key),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: 'kais-flow-query-cache',
})

export const idbPersister: Persister = {
  persistClient: (client) => idbStore.persistClient(withoutUnpersistedQueries(client)),
  restoreClient: async () => {
    const client = await idbStore.restoreClient()
    return client && withoutUnpersistedQueries(client)
  },
  removeClient: () => idbStore.removeClient(),
}
