import { get, set } from 'idb-keyval'
import { supabase } from './supabase'
import { queryClient } from './queryClient'
import { useToastStore } from './toastStore'

const OUTBOX_KEY = 'kf-outbox'

export interface OutboxEntry {
  id: string
  table: string
  op: 'upsert' | 'delete'
  payload: Record<string, unknown>
  queuedAt: number
}

async function getQueue(): Promise<OutboxEntry[]> {
  return (await get<OutboxEntry[]>(OUTBOX_KEY)) ?? []
}

async function setQueue(queue: OutboxEntry[]): Promise<void> {
  await set(OUTBOX_KEY, queue)
}

// Every read-modify-write of the outbox (adding an entry, peeking, removing after a
// successful upload) is serialized through this single chain. Without this, a flush in
// flight and a concurrent enqueue() race on the same IndexedDB key and can silently drop
// whichever write loses (the flush's stale local snapshot overwrites a newer enqueue).
let chain: Promise<void> = Promise.resolve()

function withQueue<T>(fn: (queue: OutboxEntry[]) => { next: OutboxEntry[]; result: T }): Promise<T> {
  const result = chain.then(async () => {
    const queue = await getQueue()
    const { next, result } = fn(queue)
    await setQueue(next)
    // X-pass foundation patch: let UI (topbar sync chrome) react without polling.
    // Peeks pass the same array through; only real mutations notify.
    if (typeof window !== 'undefined' && next !== queue) window.dispatchEvent(new Event('kf-outbox-change'))
    return result
  })
  // Keep the chain alive even if this step failed, so later ops aren't stuck behind a rejection.
  chain = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

function enqueue(entry: OutboxEntry): Promise<void> {
  return withQueue((queue) => {
    // Idempotent: a newer write for the same row replaces the queued one (last full-row-write wins).
    const filtered = queue.filter((e) => !(e.id === entry.id && e.table === entry.table))
    filtered.push(entry)
    return { next: filtered, result: undefined }
  })
}

function peekQueue(): Promise<OutboxEntry[]> {
  return withQueue((queue) => ({ next: queue, result: queue }))
}

function removeEntry(id: string, table: string): Promise<void> {
  return withQueue((queue) => ({
    next: queue.filter((e) => !(e.id === id && e.table === table)),
    result: undefined,
  }))
}

let flushing = false

// R4 P0 (2026-07-20 audit): a write the server permanently rejects — expired session, RLS
// denial, a column the client's still-unpushed migration hasn't created — used to be caught
// and silently dropped into "retry later" identically to a genuine offline failure. The
// optimistic cache update made the UI look like it worked; the real write never landed; the
// next refetch reverted it with zero signal why. One toast per stuck row per page load (not
// every 30s retry) so a permanent failure is now visible instead of invisible.
const toastedEntries = new Set<string>()

export async function flushOutbox(): Promise<void> {
  if (flushing || !navigator.onLine) return
  flushing = true
  try {
    for (;;) {
      const queue = await peekQueue()
      if (queue.length === 0) break
      const entry = queue[0]
      try {
        const { error } =
          entry.op === 'delete'
            ? await supabase.from(entry.table).delete().eq('id', entry.id)
            : await supabase.from(entry.table).upsert(entry.payload)
        if (error) throw error
        await removeEntry(entry.id, entry.table)
        toastedEntries.delete(`${entry.table}:${entry.id}`)
      } catch (err) {
        // A PostgrestError means the server actually responded and rejected the write —
        // a real, likely-permanent failure, not connectivity. A raw fetch failure (offline,
        // DNS, timeout) has no `.code`/`.message` shape and stays silent as before.
        const isServerRejection = !!err && typeof err === 'object' && 'code' in err && 'message' in err
        if (isServerRejection) {
          const key = `${entry.table}:${entry.id}`
          if (!toastedEntries.has(key)) {
            toastedEntries.add(key)
            const message = (err as { message?: string }).message || 'Unknown error'
            useToastStore.getState().push({ message: `Sync failed for ${entry.table}: ${message}` })
          }
        }
        break // stop and retry later, keep remaining queue intact
      }
    }
  } finally {
    flushing = false
  }
}

/** Optimistically updates the query cache for `table` and queues the write for sync. */
export function writeRow<T extends { id: string }>(
  table: string,
  row: T,
  op: 'upsert' | 'delete' = 'upsert',
): void {
  queryClient.setQueryData<T[] | T>([table], (old) => {
    if (!old) return undefined // no cached row/list yet — nothing to update optimistically
    // Every table caches an array under its query key, except the `app_settings` singleton
    // (cached as the row itself) — branch on shape rather than assuming `old` is always a list.
    if (!Array.isArray(old)) return op === 'delete' ? undefined : row
    if (op === 'delete') return old.filter((r) => r.id !== row.id)
    const idx = old.findIndex((r) => r.id === row.id)
    if (idx === -1) return [...old, row]
    const copy = [...old]
    copy[idx] = row
    return copy
  })
  // `search_tsv` (P5) is a `generated always as (...) stored` column on tasks/inbox_items — it
  // comes back on every `select('*')`, and this app's whole write pattern is "spread a fetched
  // row, change a field, upsert the full object" — so it must never be sent back, or Postgres
  // 400s on every write to those tables ("cannot insert/update a generated column").
  const { search_tsv: _searchTsv, ...payload } = row as unknown as Record<string, unknown>
  void enqueue({
    id: row.id,
    table,
    op,
    payload,
    queuedAt: Date.now(),
  }).then(() => void flushOutbox())
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushOutbox())
  setInterval(() => void flushOutbox(), 30_000)
  void flushOutbox()
}
