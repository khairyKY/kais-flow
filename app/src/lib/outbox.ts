import { useEffect, useState } from 'react'
import { get, set } from 'idb-keyval'
import { supabase } from './supabase'
import { queryClient } from './queryClient'
import { useToastStore } from './toastStore'

const OUTBOX_KEY = 'kf-outbox'
/** Rows the server permanently rejected. Kept (not silently dropped) so a failure is
 * inspectable, but out of the live queue so it can't block anything behind it. */
const DEAD_KEY = 'kf-outbox-dead'

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
        if (!isServerRejection) break // offline/transient — stop, keep the queue, retry later

        // R4 (2026-07-20): a permanently-rejected row used to stay at the head of the queue and
        // `break`, so it blocked EVERY write queued behind it — forever. One malformed journal
        // entry (user_id: '') was enough to wedge the whole outbox: later writes never reached
        // the server, the optimistic cache made them look applied, and the next refetch reverted
        // them. Park the poison row so the queue keeps draining, and say so out loud.
        const message = (err as { message?: string }).message || 'server rejected the write'
        await removeEntry(entry.id, entry.table)
        try {
          const dead = (await get<OutboxEntry[]>(DEAD_KEY)) ?? []
          await set(DEAD_KEY, [...dead, { ...entry, error: message, failedAt: Date.now() }])
        } catch {
          /* storage full/unavailable — dropping it still beats wedging every later write */
        }
        const key = `${entry.table}:${entry.id}`
        if (!toastedEntries.has(key)) {
          toastedEntries.add(key)
          // House rule: the word "error" (and raw server text / table names) never reaches the UI.
          // The full diagnostic lives in the dead-letter record above.
          useToastStore.getState().push({ message: "One change couldn't be saved — set aside so the rest sync on." })
        }
        // continue — the next entry gets its turn instead of queueing behind a dead one
      }
    }
  } finally {
    flushing = false
  }
}

/** Applies one queued write onto a cached value, mirroring writeRow's optimistic update. */
function applyEntry(old: unknown, entry: OutboxEntry): unknown {
  if (!old) return old
  const row = entry.payload as { id: string }
  if (!Array.isArray(old)) return entry.op === 'delete' ? undefined : row
  if (entry.op === 'delete') return old.filter((r: { id: string }) => r.id !== entry.id)
  const idx = old.findIndex((r: { id: string }) => r.id === entry.id)
  if (idx === -1) return [...old, row]
  const copy = [...old]
  // Server row spread first so columns the client never sends (e.g. generated ones) survive.
  copy[idx] = { ...copy[idx], ...row }
  return copy
}

/** R4 P0 (2026-07-20 audit): the outbox is a *write-behind* queue, but the read path had no
 * knowledge of it. Between the optimistic update and a successful flush, any refetch — and
 * realtime invalidates on every change to a synced table, including our own — replaced the
 * cache with server rows that don't have the pending change yet, so the UI silently reverted.
 * That is Kai's "if I dismiss smth it comes back", filing "comes back waiting", the project
 * colour resetting, and onboarding looping: four symptoms, one race. Re-applying the queue on
 * top of every fresh fetch makes the cache read "server state + what we still owe it". */
export async function reapplyPendingWrites(table: string): Promise<void> {
  const queue = await peekQueue()
  const pending = queue.filter((e) => e.table === table)
  if (pending.length === 0) return
  queryClient.setQueryData([table], (old: unknown) => pending.reduce(applyEntry, old))
}

/** Optimistically updates the query cache for `table` and queues the write for sync. */
export function writeRow<T extends { id: string }>(
  table: string,
  row: T,
  op: 'upsert' | 'delete' = 'upsert',
): void {
  // Without this, a fetch already in flight resolves after the optimistic write and clobbers
  // it — the same revert, just a narrower window than the refetch case above.
  void queryClient.cancelQueries({ queryKey: [table] })
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

  // Every table's query is keyed by `[table]`, so one subscription covers all of them.
  // `manual` marks a setQueryData (including our own re-apply below) — only real fetch
  // results need the queue laid back over them, and skipping manual writes avoids a loop.
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated') return
    const action = event.action as { type?: string; manual?: boolean }
    if (action?.type !== 'success' || action.manual) return
    const table = event.query.queryKey[0]
    if (typeof table === 'string') void reapplyPendingWrites(table)
  })
}

// ── React binding for the CALENDAR.md §7 pending/sync-failed block states ──────────────────
// A block whose write is still queued shows `· saving ◌` + a dashed outer outline; one whose
// write the server rejected shows the ⚠ / `· retry` treatment. Reads the same two idb keys the
// queue itself uses, refreshed by the kf-outbox-change event withQueue() already dispatches.
export function useOutboxMarks(table: string): { pending: Set<string>; failed: Set<string> } {
  const [marks, setMarks] = useState<{ pending: Set<string>; failed: Set<string> }>({
    pending: new Set(),
    failed: new Set(),
  })
  useEffect(() => {
    let alive = true
    const refresh = async () => {
      const [queue, dead] = await Promise.all([
        get<OutboxEntry[]>(OUTBOX_KEY),
        get<OutboxEntry[]>(DEAD_KEY),
      ])
      if (!alive) return
      setMarks({
        pending: new Set((queue ?? []).filter((e) => e.table === table).map((e) => e.id)),
        failed: new Set((dead ?? []).filter((e) => e.table === table).map((e) => e.id)),
      })
    }
    void refresh()
    window.addEventListener('kf-outbox-change', refresh)
    return () => {
      alive = false
      window.removeEventListener('kf-outbox-change', refresh)
    }
  }, [table])
  return marks
}
