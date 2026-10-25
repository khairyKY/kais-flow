import { useEffect, useState } from 'react'
import { get, set } from 'idb-keyval'
import { supabase } from './supabase'
import { queryClient } from './queryClient'
import { useToastStore } from './toastStore'
import { carryReminder } from './carryReminder'
import { releaseTop3 } from '../features/tasks/top3Rule'
import type { Task } from './types'

export const OUTBOX_KEY = 'kf-outbox'
/** Rows the server permanently rejected. Kept (not silently dropped) so a failure is
 * inspectable, but out of the live queue so it can't block anything behind it. */
export const DEAD_KEY = 'kf-outbox-dead'

export interface OutboxEntry {
  id: string
  table: string
  op: 'upsert' | 'delete'
  payload: Record<string, unknown>
  queuedAt: number
  /** The account signed in when the write was queued. It only ever goes out under that account's
   * session. Missing on entries queued before this field existed — those keep the old rule. */
  uid?: string
}

/** The signed-in account right now. writeRow is synchronous and supabase-js's session read is
 * not, so this follows the auth events instead of asking at queue time. */
let account: string | undefined
supabase.auth.onAuthStateChange((_event, session) => {
  account = session?.user.id
  // Writes held while there was no session go out as soon as their account is back. Deferred
  // so the flush's own session read happens outside supabase-js's event dispatch.
  if (account && typeof window !== 'undefined') setTimeout(() => void flushOutbox(), 0)
})

/** Whose writes may go out under `uid`'s session: its own, plus untagged legacy entries. */
function belongsTo(uid: string) {
  return (e: { uid?: string }) => !e.uid || e.uid === uid
}

async function sessionUid(): Promise<string | undefined> {
  try {
    return (await supabase.auth.getSession()).data.session?.user.id
  } catch {
    return undefined
  }
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

/** The chain orders this window's steps only. Another window of the app on the same key — the Windows
 * tray's flyout beside the main window, or a second tab — could otherwise read the queue between this
 * window's read and write and lose an entry, so each step also holds a Web Lock (where there is one). */
function acrossWindows<T>(step: () => Promise<T>): Promise<T> {
  return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request('kf-outbox', step) : step()
}

function serial<T>(step: () => Promise<T>): Promise<T> {
  const result = chain.then(() => acrossWindows(step))
  // Keep the chain alive even if this step failed, so later ops aren't stuck behind a rejection.
  chain = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

function withQueue<T>(fn: (queue: OutboxEntry[]) => { next: OutboxEntry[]; result: T }): Promise<T> {
  return serial(async () => {
    const queue = await getQueue()
    const { next, result } = fn(queue)
    // A peek hands the same array back: nothing to write (outbox-speed 2026-10-14).
    if (next !== queue) await setQueue(next)
    // X-pass foundation patch: let UI (topbar sync chrome) react without polling.
    // Peeks pass the same array through; only real mutations notify.
    if (typeof window !== 'undefined' && next !== queue) window.dispatchEvent(new Event('kf-outbox-change'))
    return result
  })
}

function enqueue(entry: OutboxEntry): Promise<void> {
  return withQueue((queue) => {
    // queuedAt rises strictly, so (table, id, queuedAt) names one entry: the drain removes exactly
    // the one it sent, never a newer write for the same row queued while it was in flight.
    const last = queue.reduce((m, e) => Math.max(m, e.queuedAt), 0)
    const next = { ...entry, queuedAt: Math.max(entry.queuedAt, last + 1) }
    // Writes go out in the order they were made. A newer write for the same row replaces the queued
    // one only while nothing but activity rows (nothing references those) sits behind it. It used to
    // always move the row to the back — behind the writes that need it: a new task's block went out
    // before the task, the server refused it (foreign key), and every create-with-a-time lost its
    // block ("One change couldn't be saved", sync-fix 2026-10-25).
    const i = queue.findLastIndex((e) => e.id === entry.id && e.table === entry.table)
    const replace = i !== -1 && queue.slice(i + 1).every((e) => e.table === 'activity_log')
    return { next: [...(replace ? queue.filter((_, j) => j !== i) : queue), next], result: undefined }
  })
}

function peekQueue(): Promise<OutboxEntry[]> {
  return withQueue((queue) => ({ next: queue, result: queue }))
}

const sameEntry = (a: OutboxEntry) => (b: OutboxEntry) => b.id === a.id && b.table === a.table && b.queuedAt === a.queuedAt

function removeEntry(sent: OutboxEntry): Promise<void> {
  return withQueue((queue) => ({
    next: queue.filter((e) => !sameEntry(sent)(e)),
    result: undefined,
  }))
}

let flushing: Promise<void> | null = null

// R4 P0 (2026-07-20 audit): a write the server permanently rejects — expired session, RLS
// denial, a column the client's still-unpushed migration hasn't created — used to be caught
// and silently dropped into "retry later" identically to a genuine offline failure. The
// optimistic cache update made the UI look like it worked; the real write never landed; the
// next refetch reverted it with zero signal why. One toast per stuck row per page load (not
// every 30s retry) so a permanent failure is now visible instead of invisible.
const toastedEntries = new Set<string>()

/** Pushes the queue to the server, oldest first. A call made while a flush is already running
 * joins it (P0-B), so `await flushOutbox()` really means "the queue has had its turn" — sign-out
 * counts what's left right after. */
export function flushOutbox(): Promise<void> {
  if (!navigator.onLine) return Promise.resolve()
  flushing ??= drain().finally(() => {
    flushing = null
  })
  return flushing
}

async function drain(): Promise<void> {
  // Writes go out only under the account that queued them. With no session (signed out, or it
  // expired) nothing goes: sent with the anon key, RLS rejects them and they'd be dead-lettered —
  // the loss 3ff5c86 set out to prevent. They wait for that account to sign back in. Another
  // account's entries are skipped, never sent as this one's and never touched.
  const uid = await sessionUid()
  if (!uid) return
  const mine = belongsTo(uid)
  for (;;) {
    const queue = await peekQueue()
    const entry = queue.find(mine)
    if (!entry) break
    try {
      const { error } =
        entry.op === 'delete'
          ? await supabase.from(entry.table).delete().eq('id', entry.id)
          : await supabase.from(entry.table).upsert(entry.payload)
      if (error) throw error
      await removeEntry(entry)
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
      // The server's own words stay with the record (code, message, details, hint), so the next
      // refusal says what it was without a debugger (sync-fix: it used to keep the message only).
      const e = err as { code?: string; message?: string; details?: string | null; hint?: string | null }
      const parked: DeadEntry = { ...entry, error: e.message || 'server rejected the write', code: e.code, details: e.details ?? null, hint: e.hint ?? null, failedAt: Date.now() }
      await removeEntry(entry)
      try {
        await editDead((dead) => [...dead, parked])
      } catch {
        /* storage full/unavailable — dropping it still beats wedging every later write */
      }
      const key = `${entry.table}:${entry.id}`
      if (!toastedEntries.has(key)) {
        toastedEntries.add(key)
        // House rule: the word "error" (and raw server text / table names) never reaches the UI —
        // the toast names the change in the app's words ("Couldn't save: block 'Gym'").
        useToastStore.getState().push({
          message: `Couldn't save: ${changeName(entry)}. Set aside so the rest sync on.`,
          action: { label: 'Try again', run: () => void retryParked(parked) },
          secondary: { label: 'Discard', run: () => void discardParked(parked) },
        })
      }
      // continue — the next entry gets its turn instead of queueing behind a dead one
    }
  }
}

/** How many changes on this device haven't reached the server yet (P0-B: sign-out asks before
 * discarding them). Every action also queues an `activity_log` row, so those only count when
 * nothing else is waiting: one capture reads as one change, and a lone activity row still counts. */
export async function unsyncedChanges(): Promise<number> {
  const queue = await peekQueue()
  // A row can wait twice (an earlier write still owed before a newer one): it's one change.
  const rows = (es: OutboxEntry[]) => new Set(es.map((e) => `${e.table}:${e.id}`)).size
  return rows(queue.filter((e) => e.table !== 'activity_log')) || queue.length
}

// ── Parked writes: what they were, and the two ways out (the toast, the sync popover) ──

/** Human names for every table the app writes through the outbox. Never the table name itself. */
export const CHANGE_KIND: Record<string, string> = {
  tasks: 'Task',
  inbox_items: 'Inbox',
  journal_entries: 'Journal',
  calendar_events: 'Event',
  routines: 'Routine',
  routine_completions: 'Routine',
  people: 'Person',
  interactions: 'Person',
  projects: 'Project',
  areas: 'Area',
  domains: 'Domain',
  time_entries: 'Focus',
  app_settings: 'Settings',
  push_subscriptions: 'Settings',
  resurfaced_log: 'Resurfaced',
  books: 'Library',
  notes: 'Library',
  quotes: 'Library',
  commentary: 'Library',
  smart_lists: 'Smart list',
  captures: 'Paper',
  activity_log: 'History',
}

/** A change's title in one line ('' for a journal entry: its words stay out of the chrome). */
export function changeLabel(e: OutboxEntry): string {
  const p = e.payload as Record<string, unknown>
  if (e.table === 'journal_entries') return ''
  const v = p.title ?? p.raw_text ?? p.name ?? p.summary
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
}

/** What a parked toast names: "task 'buy milk'", "block 'Gym'", "Time block 'Admin'", "settings". */
export function changeName(e: OutboxEntry): string {
  const type = (e.payload as { type?: unknown }).type
  const noun = e.table === 'calendar_events' ? (type === 'task' ? 'block' : type === 'time_block' ? 'Time block' : 'event') : (CHANGE_KIND[e.table] ?? 'change').toLowerCase()
  const label = changeLabel(e)
  return label ? `${noun} '${label}'` : noun
}

/** On the queue's chain: a parked write leaving and the drain parking another can't clobber each other. */
function editDead(fn: (dead: DeadEntry[]) => DeadEntry[]): Promise<void> {
  return serial(async () => {
    await set(DEAD_KEY, fn((await get<DeadEntry[]>(DEAD_KEY)) ?? []))
    // The topbar's "not saved ⚠" (components/syncQueue.ts) and the blocks' ⚠ read the dead letters on this event.
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('kf-outbox-change'))
  })
}

/** Try again: the write goes back in the queue — as the row reads on this device now, when it's still
 * cached (a later edit wins over the parked copy), else as it was. */
export async function retryParked(parked: OutboxEntry): Promise<void> {
  await editDead((dead) => dead.filter((d) => !sameEntry(parked)(d)))
  toastedEntries.delete(`${parked.table}:${parked.id}`)
  const cached = queryClient.getQueryData<unknown>([parked.table])
  const live = (Array.isArray(cached) ? cached.find((r: { id?: string }) => r.id === parked.id) : (cached as { id?: string } | undefined)?.id === parked.id ? cached : undefined) as Record<string, unknown> | undefined
  const payload = parked.op === 'upsert' && live ? networkPayload({ ...parked.payload, ...live }) : parked.payload
  await enqueue({ id: parked.id, table: parked.table, op: parked.op, payload, queuedAt: Date.now(), ...(parked.uid ? { uid: parked.uid } : account ? { uid: account } : {}) })
  await flushOutbox()
}

/** Discard: forget the parked write; the screen goes back to what the server has. */
export async function discardParked(parked: OutboxEntry): Promise<void> {
  await editDead((dead) => dead.filter((d) => !sameEntry(parked)(d)))
  toastedEntries.delete(`${parked.table}:${parked.id}`)
  void queryClient.invalidateQueries({ queryKey: [parked.table] })
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
  // Only this account's pending writes belong on top of this account's rows.
  const pending = queue.filter((e) => e.table === table && (!account || belongsTo(account)(e)))
  if (pending.length === 0) return
  queryClient.setQueryData([table], (old: unknown) => pending.reduce(applyEntry, old))
}

/** What actually goes over the wire for a row. Server-owned columns never do:
 * - `search_tsv` (P5) is `generated always … stored` on tasks/inbox_items and Postgres 400s if it's
 *   echoed back — and this app's whole write pattern is "spread a fetched row, change a field,
 *   upsert the full object", so every `select('*')` row would carry it straight back.
 * - `embedding` (P5, `vector(384)`) is written only by the embed pipeline (audit H1 / lead on J-16).
 * - `user_id` when it's empty: every table defaults it to `auth.uid()`, but SENDING the column
 *   overrides that default, and Postgres rejects `''` as a uuid. Several api.ts files built new rows
 *   with `user_id: ''` (people, interactions, time_entries, library — the journal had the same bug
 *   in R4), so those creates dead-lettered and vanished on the next sign-in (audit 2026-09-26).
 *   Dropping it here fixes every current and future caller at the one chokepoint. */
function networkPayload(row: Record<string, unknown>): Record<string, unknown> {
  const { search_tsv: _searchTsv, embedding: _embedding, ...payload } = row
  if (!payload.user_id) delete payload.user_id
  return payload
}

/** A write the server refused, with what it said. */
export type DeadEntry = OutboxEntry & { error?: string; code?: string; details?: string | null; hint?: string | null; failedAt?: number }
let rescuing = false

/** One-time rescue for the `user_id: ''` bug above: writes the server rejected ONLY because of
 * that empty id go back into the live queue with the column dropped, so a person / time entry /
 * library row that looked saved but never landed is recovered on this device. Rows the server
 * already has are left alone (never replay an old write over newer data), and every other
 * dead letter stays parked. Idempotent: a rescued entry leaves the dead-letter store.
 * Call only while signed in as the account that owns this device's outbox. */
export async function rescueEmptyUserIdWrites(): Promise<number> {
  if (rescuing) return 0
  rescuing = true
  try {
    const uid = await sessionUid()
    if (!uid) return 0
    // A dead letter tagged with its account is rescued only for that account. Untagged ones were
    // parked before entries carried an account (pre-2026-09-26). Until 2026-09-24 this was a
    // single-user app, so those are Kai's, and the rule stays what it was: the account signed in
    // on this device, which AuthProvider only calls this for when it owns the outbox.
    const rescuable = (e: DeadEntry) => e.op === 'upsert' && e.payload?.user_id === '' && belongsTo(uid)(e)
    const dead = (await get<DeadEntry[]>(DEAD_KEY)) ?? []
    // Latest failure per row only — an older copy of the same row is superseded.
    const latest = new Map<string, DeadEntry>()
    for (const e of dead) {
      if (!rescuable(e)) continue
      const key = `${e.table}:${e.id}`
      const prev = latest.get(key)
      if (!prev || (e.failedAt ?? 0) >= (prev.failedAt ?? 0)) latest.set(key, e)
    }
    if (latest.size === 0) return 0

    const byTable = new Map<string, string[]>()
    for (const e of latest.values()) byTable.set(e.table, [...(byTable.get(e.table) ?? []), e.id])
    const existing = new Set<string>()
    for (const [table, ids] of byTable) {
      const { data, error } = await supabase.from(table).select('id').in('id', ids)
      if (error) return 0 // can't tell what the server has — try again on the next sign-in
      for (const r of (data ?? []) as { id: string }[]) existing.add(`${table}:${r.id}`)
    }

    const queued = new Set((await peekQueue()).map((e) => `${e.table}:${e.id}`))
    let rescued = 0
    for (const [key, e] of latest) {
      // A newer write for the row is already queued (it wins), or the row exists server-side.
      if (queued.has(key) || existing.has(key)) continue
      await enqueue({ id: e.id, table: e.table, op: 'upsert', payload: networkPayload(e.payload), queuedAt: Date.now(), uid })
      rescued++
    }
    // Drop this account's empty-user_id upserts from the dead letters: rescued, superseded, or
    // already on the server — none of them is a failure anyone needs to inspect any more.
    await set(
      DEAD_KEY,
      dead.filter((e) => !rescuable(e)),
    )
    if (rescued > 0) {
      useToastStore.getState().push({
        message: rescued === 1 ? 'Recovered one change that hadn\'t saved earlier.' : `Recovered ${rescued} changes that hadn't saved earlier.`,
      })
      void flushOutbox()
    }
    return rescued
  } finally {
    rescuing = false
  }
}

/** Optimistically updates the query cache for `table` and queues the write for sync. */
export function writeRow<T extends { id: string }>(
  table: string,
  row: T,
  op: 'upsert' | 'delete' = 'upsert',
): void {
  // Every task write lands here (swipe, picker, drag, bulk…), so this is where a moved task's
  // reminder keeps its lead time — once, for all of them (./carryReminder) — and a Top 3 pick taken
  // off today gives its place up (features/tasks/top3Rule).
  if (table === 'tasks' && op === 'upsert') {
    const prev = queryClient.getQueryData<Task[]>(['tasks'])?.find((r) => r.id === row.id)
    row = releaseTop3(carryReminder(prev, row as unknown as Task)) as unknown as T
  }
  // Without this, a fetch already in flight resolves after the optimistic write and clobbers
  // it — the same revert, just a narrower window than the refetch case above.
  void queryClient.cancelQueries({ queryKey: [table] })
  queryClient.setQueryData<T[] | T>([table], (old) => {
    // No cached row/list yet — nothing to update optimistically. Deliberately NOT seeded with
    // `[row]` (P0-B): a never-loaded list would then read as loaded — and fresh for staleTime —
    // holding one row, `['activity_log']` is shared by two differently-shaped queries, and
    // `app_settings` is a row, not a list. A page that must see its own new row before its list
    // has loaded holds it itself (JournalPage → holdRow).
    if (!old) return undefined
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
  // Server-owned columns and an empty user_id never go over the wire — see networkPayload.
  const payload = networkPayload(row as unknown as Record<string, unknown>)
  void enqueue({
    id: row.id,
    table,
    op,
    payload,
    queuedAt: Date.now(),
    ...(account ? { uid: account } : {}),
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
export interface OutboxMarks {
  pending: Set<string>
  failed: Set<string>
}

const sameIds = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((id) => b.has(id))

/** `table`'s marks from the two idb lists — `prev` itself when they didn't change. Every queue step
 * fires kf-outbox-change, and most don't touch this table (a drop queues a task, its activity rows,
 * the block). New Sets each time re-rendered the whole calendar per step, and the queue's next
 * IndexedDB step waited behind that render: a drop's writes left 0.5–1.9s late (outbox-speed). */
export function outboxMarks(prev: OutboxMarks, table: string, queue: OutboxEntry[] = [], dead: OutboxEntry[] = []): OutboxMarks {
  const pending = new Set(queue.filter((e) => e.table === table).map((e) => e.id))
  const failed = new Set(dead.filter((e) => e.table === table).map((e) => e.id))
  return sameIds(prev.pending, pending) && sameIds(prev.failed, failed) ? prev : { pending, failed }
}

export function useOutboxMarks(table: string): OutboxMarks {
  const [marks, setMarks] = useState<OutboxMarks>({
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
      setMarks((prev) => outboxMarks(prev, table, queue, dead))
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
