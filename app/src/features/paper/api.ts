// Paper capture: upload → read (one `capture-image` call per page) → review → the writes. Pages taken
// offline wait in IndexedDB (idb-keyval, beside the outbox) and go up when the connection is back; a
// page the server queued (Groq busy, or past today's 15) is read again later by resumeScans().
import { useQuery } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { get, update } from 'idb-keyval'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { toastAction, toastUndo } from '../../lib/undo'
import { useToastStore } from '../../lib/toastStore'
import { cairoDateKey } from '../../lib/dateShortcuts'
import { createTask } from '../tasks/api'
import { createEvent } from '../calendar/api'
import { upsertJournalEntry } from '../journal/api'
import { preparePage } from './image'
import { usePaperStore } from './paperStore'
import { addedSummary, planWrites, shouldResume, type CaptureRow, type EditLine } from './paperMath'
import type { AppSettings, InboxItem, Project } from '../../lib/types'

const BUCKET = 'captures'
const QUEUE_KEY = 'kf-paper-queue'
const toast = (message: string) => useToastStore.getState().push({ message })

// ── reads ──

async function fetchCaptures(): Promise<CaptureRow[]> {
  const { data, error } = await supabase.from('captures').select('*').is('reviewed_at', null).order('created_at', { ascending: false }).limit(30)
  if (error) throw error
  return data as CaptureRow[]
}

/** Captures not yet reviewed — the Inbox's "ready to review" rows and the results sheet. */
export function useCaptures() {
  return useQuery({ queryKey: ['captures'], queryFn: fetchCaptures, select: (rows) => rows.filter((r) => !r.reviewed_at) })
}

/** One capture by id, reviewed or not — a task's "From a photo of your page" link. The list cache
 * still holds one reviewed this session; anything older is fetched on its own. */
export function useCapture(id: string | null) {
  const listed = useQuery({ queryKey: ['captures'], queryFn: fetchCaptures }).data?.find((c) => c.id === id)
  const one = useQuery({
    queryKey: ['capture', id],
    enabled: !!id && !listed,
    queryFn: async () => {
      const { data, error } = await supabase.from('captures').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as CaptureRow | null
    },
  })
  return listed ?? one.data ?? null
}

/** The pages to show: this device's own copies when it took them, else short-lived signed URLs. */
export function usePageUrls(capture: CaptureRow | null | undefined): string[] {
  const local = usePaperStore((s) => (capture ? s.local[capture.id] : undefined))
  const signed = useQuery({
    queryKey: ['capture_urls', capture?.id, capture?.storage_paths.join(',')],
    enabled: !!capture && !local && capture.storage_paths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(capture!.storage_paths, 3600)
      if (error) throw error
      return data.map((d) => d.signedUrl ?? '')
    },
  })
  return local ?? signed.data ?? []
}

/** Pages read today (Cairo) — the server's own count (ai_usage, kind 'vision'). */
export function useScansToday(): number {
  const day = cairoDateKey(new Date())
  const { data } = useQuery({
    queryKey: ['ai_usage', 'vision', day],
    queryFn: async () => {
      const { data, error } = await supabase.from('ai_usage').select('count').eq('kind', 'vision').eq('day', day).maybeSingle()
      if (error) throw error
      return (data as { count: number } | null)?.count ?? 0
    },
  })
  return data ?? 0
}

// ── reading ──

type ReadAnswer = Pick<CaptureRow, 'status' | 'pages_read' | 'title' | 'items'>
type ReadStop = 'daily_limit' | 'rate_limited' | 'offline' | 'failed'

async function callRead(captureId: string, paths: string[], page: number, takenAt: string): Promise<ReadAnswer | ReadStop> {
  const projects = (queryClient.getQueryData<Project[]>(['projects']) ?? []).filter((p) => !p.deleted_at).map((p) => p.name)
  const { data, error } = await supabase.functions.invoke('capture-image', { body: { capture_id: captureId, paths, page, projects, taken_at: takenAt } })
  if (!error) return data as ReadAnswer
  if (!(error instanceof FunctionsHttpError)) return 'offline' // never reached the function
  const body = (await (error.context as Response).json().catch(() => null)) as { error?: string } | null
  return body?.error === 'daily_limit' ? 'daily_limit' : body?.error === 'rate_limited' ? 'rate_limited' : 'failed'
}

/** The row in the ['captures'] cache, merged — the list may not have loaded yet (it's ours to seed). */
function patchCache(id: string, patch: Partial<CaptureRow>, base?: Partial<CaptureRow>) {
  queryClient.setQueryData<CaptureRow[]>(['captures'], (old = []) => {
    const at = old.findIndex((r) => r.id === id)
    if (at === -1) return [{ ...(base as CaptureRow), ...patch, id }, ...old]
    const copy = [...old]
    copy[at] = { ...copy[at], ...patch }
    return copy
  })
}

const running = new Set<string>()
/** Is the reading screen for this capture on screen (not "left reading")? */
const watching = (id: string) => {
  const s = usePaperStore.getState()
  return !s.away && s.stage?.kind === 'reading' && s.stage.captureId === id
}
let retryTimer: number | undefined

/** Reads pages `from`… of a capture, one call each, ticking the reading screen. Then the results, or
 * — if you left — a toast that brings them back. */
async function readFrom(id: string, paths: string[], from: number, takenAt: string): Promise<void> {
  if (running.has(id)) return
  running.add(id)
  try {
    for (let page = from; page < paths.length; page++) {
      const answer = await callRead(id, paths, page, takenAt)
      if (typeof answer === 'string') return stopped(id, answer, page, paths, takenAt)
      patchCache(id, answer)
      const s = usePaperStore.getState()
      if (watching(id) && s.stage?.kind === 'reading') s.show({ ...s.stage, read: page + 1 })
    }
    const row = queryClient.getQueryData<CaptureRow[]>(['captures'])?.find((r) => r.id === id)
    const n = row?.items.length ?? 0
    if (row?.status === 'failed') {
      if (watching(id)) usePaperStore.getState().show({ kind: 'unreadable', captureId: id })
      else toastAction("Couldn't read your page", 'Look', () => usePaperStore.getState().show({ kind: 'unreadable', captureId: id }))
    } else if (watching(id)) {
      usePaperStore.getState().show({ kind: 'results', captureId: id })
    } else {
      toastAction(`Your page is read · ${n} ${n === 1 ? 'thing' : 'things'}`, 'Review', () => usePaperStore.getState().show({ kind: 'results', captureId: id }))
    }
  } finally {
    running.delete(id)
  }
}

function stopped(id: string, why: ReadStop, page: number, paths: string[], takenAt: string) {
  const s = usePaperStore.getState()
  const here = watching(id)
  if (why === 'daily_limit') {
    patchCache(id, { status: 'queued', error: 'daily_limit' })
    if (here) s.show({ kind: 'limit' })
    else toast("That's 15 pages today — the rest are read tomorrow.")
  } else if (why === 'failed') {
    patchCache(id, { status: 'failed', error: 'upstream' })
    if (here) s.show({ kind: 'failed', captureId: id })
    else toast("Couldn't read your page just now — it's in the Inbox to try again.")
  } else {
    // Groq is busy (or the connection dropped mid-read): calm, and try again in a while.
    patchCache(id, { status: 'queued', error: 'rate_limited' })
    if (here) s.close()
    // The first page never reached the server, so it holds no row to resume from: this device
    // remembers the uploaded pages and reads them on the next reconnect.
    if (why === 'offline' && page === 0) {
      void update<Waiting[]>(QUEUE_KEY, (q = []) => (q.some((e) => e.id === id) ? q : [...q, { id, takenAt, blobs: [], paths }])).then(refreshWaiting)
    }
    toast(why === 'offline' ? "We'll read your page when you're back online." : "We'll read your page in a bit.")
    window.clearTimeout(retryTimer)
    retryTimer = window.setTimeout(() => void resumeScans(), 90_000)
  }
}

async function upload(id: string, blobs: Blob[]): Promise<string[]> {
  const uid = (await supabase.auth.getSession()).data.session?.user.id
  if (!uid) throw new Error('signed out')
  const paths = blobs.map((_, i) => `${uid}/${id}/${i}.jpg`)
  for (let i = 0; i < blobs.length; i++) {
    const { error } = await supabase.storage.from(BUCKET).upload(paths[i], blobs[i], { contentType: 'image/jpeg', upsert: true })
    if (error) throw error
  }
  return paths
}

/** "Read": resize + rotate each page, upload, read. Offline (or the upload fails), the pages wait here. */
export async function startReading(): Promise<void> {
  const store = usePaperStore.getState()
  const pages = store.pages
  if (!pages.length) return
  const id = crypto.randomUUID()
  const takenAt = new Date().toISOString()
  store.show({ kind: 'reading', captureId: id, read: 0, total: pages.length })
  let blobs: Blob[]
  try {
    blobs = await Promise.all(pages.map((p) => preparePage(p.file, p.rotation)))
  } catch {
    store.close()
    return toast("Couldn't open that photo — try a JPG or PNG.")
  }
  // ponytail: these object URLs live for the session (a few pages); the results and crops read them.
  usePaperStore.setState((s) => ({ local: { ...s.local, [id]: blobs.map((b) => URL.createObjectURL(b)) } }))
  if (!navigator.onLine) return queueOffline(id, blobs, takenAt)
  let paths: string[]
  try {
    paths = await upload(id, blobs)
  } catch {
    return queueOffline(id, blobs, takenAt)
  }
  await readUploaded(id, paths, takenAt)
}

/** Pages are in Storage: the row as the server is about to make it (the results read it), then read. */
async function readUploaded(id: string, paths: string[], takenAt: string): Promise<void> {
  const row: CaptureRow = { id, storage_paths: paths, pages: paths.length, pages_read: 0, status: 'reading', error: null, title: null, items: [], reviewed_at: null, expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), photos_deleted_at: null, created_at: takenAt, updated_at: takenAt }
  patchCache(id, {}, row)
  await readFrom(id, paths, 0, takenAt)
  void queryClient.invalidateQueries({ queryKey: ['ai_usage'] })
}

/** Reads every capture the server left queued or half-read (Groq was busy, the app closed mid-read, or
 * yesterday's cap), oldest first, one at a time. On start, on reconnect, and 90s after a busy answer. */
export async function resumeScans(): Promise<void> {
  if (!navigator.onLine) return
  const { data } = await supabase.from('captures').select('*').in('status', ['queued', 'reading']).is('reviewed_at', null).order('created_at').limit(10)
  const now = new Date()
  for (const row of (data ?? []) as CaptureRow[]) {
    if (!shouldResume(row, now)) continue
    patchCache(row.id, row, row)
    await readFrom(row.id, row.storage_paths, row.pages_read, row.created_at)
  }
}

/** "Try again" on a page that failed. */
export function retryCapture(row: CaptureRow): void {
  usePaperStore.getState().show({ kind: 'reading', captureId: row.id, read: row.pages_read, total: row.pages })
  void readFrom(row.id, row.storage_paths, row.pages_read, row.created_at)
}

// ── offline: pages wait on this device ──

interface Waiting {
  id: string
  takenAt: string
  blobs: Blob[]
  /** Already uploaded (the connection went before the first read): only the read waits. */
  paths?: string[]
}

export async function refreshWaiting(): Promise<void> {
  const queue = (await get<Waiting[]>(QUEUE_KEY)) ?? []
  usePaperStore.setState({ waiting: queue.reduce((n, e) => n + (e.paths?.length ?? e.blobs.length), 0) })
}

async function queueOffline(id: string, blobs: Blob[], takenAt: string): Promise<void> {
  await update<Waiting[]>(QUEUE_KEY, (q) => [...(q ?? []), { id, takenAt, blobs }])
  await refreshWaiting()
  usePaperStore.getState().close()
  const n = usePaperStore.getState().waiting
  toast(`Saved — ${n} ${n === 1 ? 'page' : 'pages'} waiting, read when you're online.`)
}

let flushing = false
/** Uploads the pages saved offline, then reads them. */
export async function flushWaiting(): Promise<void> {
  if (flushing || !navigator.onLine) return
  flushing = true
  try {
    for (const entry of (await get<Waiting[]>(QUEUE_KEY)) ?? []) {
      let paths: string[]
      try {
        paths = entry.paths ?? (await upload(entry.id, entry.blobs))
      } catch {
        break // still no way through — next reconnect
      }
      await update<Waiting[]>(QUEUE_KEY, (q) => (q ?? []).filter((e) => e.id !== entry.id))
      await refreshWaiting()
      if (entry.blobs.length) usePaperStore.setState((s) => ({ local: { ...s.local, [entry.id]: s.local[entry.id] ?? entry.blobs.map((b) => URL.createObjectURL(b)) } }))
      void readUploaded(entry.id, paths, entry.takenAt)
    }
  } finally {
    flushing = false
  }
}

/** Boot: count what waits here, send it if we can, and pick up anything the server left queued. */
export function startPaperSync(): () => void {
  const go = () => void flushWaiting().then(resumeScans)
  void refreshWaiting()
  go()
  window.addEventListener('online', go)
  return () => window.removeEventListener('online', go)
}

// ── review → the writes ──

/** A line kept as a note: an Inbox item carrying its read, and the way back to the photo. */
function photoNote(capture: CaptureRow, line: EditLine): InboxItem {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    kind: 'text',
    raw_text: line.text,
    transcript: null,
    ai_parse: {
      kind: line.type === 'journal' ? 'note' : line.type,
      cleaned_text: line.text,
      title: line.text,
      due_at: line.dueAt,
      project_id: line.projectId,
      domain_id: line.domainId,
      confidence: line.confidence,
    },
    confidence: line.confidence,
    status: 'pending',
    filed_task_id: null,
    payload: { source: 'photo', source_ref: capture.id, page: line.page, box: line.box, title: capture.title },
    snoozed_until: null,
    created_at: now,
    updated_at: now,
  }
}

/** Reviewed: off the Inbox's "ready" list. "Delete after reading" (or `dropPhoto`: a page we couldn't
 * read) brings the photo's expiry to now, so the hourly sweep takes it. */
export function markReviewed(capture: CaptureRow, dropPhoto = false): void {
  const now = new Date().toISOString()
  const keep = !dropPhoto && queryClient.getQueryData<AppSettings>(['app_settings'])?.capture_keep_photos !== false
  writeRow('captures', { ...capture, reviewed_at: now, ...(keep ? {} : { expires_at: now }) })
}

/** "Add all" / "Inbox only": every kept line through the usual helpers, one toast, one Undo. */
export function applyResults(capture: CaptureRow, lines: readonly EditLine[], mode: 'all' | 'inbox'): void {
  const plan = planWrites(lines, capture.id, mode)
  const undo: (() => void)[] = []
  for (const p of plan) {
    if (p.to === 'task') {
      const task = createTask({ title: p.title, dueAt: p.dueAt, projectId: p.projectId, domainId: p.domainId, externalRef: { source: 'photo', id: p.ref } })
      undo.push(() => writeRow('tasks', task, 'delete'))
    } else if (p.to === 'event') {
      const event = createEvent(p.title, p.startsAt, p.endsAt, 'event', null, p.allDay)
      undo.push(() => writeRow('calendar_events', event, 'delete'))
    } else if (p.to === 'inbox') {
      const item = photoNote(capture, p.line)
      writeRow('inbox_items', item)
      logActivity('inbox.captured', 'inbox_item', item.id, { kind: 'photo' })
      undo.push(() => writeRow('inbox_items', item, 'delete'))
    } else {
      const entry = upsertJournalEntry({ entry_date: cairoDateKey(new Date()), body: p.body }, true)
      undo.push(() => writeRow('journal_entries', entry, 'delete'))
    }
  }
  const prior = { ...capture }
  markReviewed(capture)
  logActivity('capture.reviewed', 'capture', capture.id, { mode, written: plan.length })
  toastUndo(addedSummary(plan), () => {
    for (const fn of undo) fn()
    writeRow('captures', prior)
  })
}

