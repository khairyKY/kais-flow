import { useToastStore, type Toast } from './toastStore'
import { playSound } from './sounds'
import { recordWrites, replayer } from './writeTape'
import { prefWritten } from './prefs'

// Foundation F1 (punch item 6): the ONE way to record an undoable action. Pattern for every call site:
//   1. capture the prior state BEFORE the write (the row/fields you're changing)
//   2. perform the write through the feature's api.ts as usual
//   3. toastUndo('Filed to Tasks · Today', () => writeBack(prior))
// The undo fn must route through the same api/outbox path as the original write
// so offline + reapply semantics hold. Never push a bare toast for an undoable
// action; never build a second undo mechanism.
//
// Quiet undo (Kai 2026-11-06: "too many notifications… keep Ctrl+Z global"): every call lands on ONE
// app-wide history, undone by ⌘Z / Ctrl+Z and redone by ⌘⇧Z / Ctrl+Y (AppLayout). Only destructive,
// bulk or unrecognised actions ALSO show a toast; routine edits are silent on a computer (a hint the
// first few times) and, on a phone, one coalesced "3 changes · Undo". Settings → "Undo toasts: All" restores
// a toast for every action.

const HISTORY_MAX = 100
const HINTS_KEY = 'kf_undo_hints'
const HINTS_MAX = 3
export const UNDO_TOASTS_KEY = 'kf_undo_toasts' // 'fewer' (default) | 'all' — synced (lib/prefs)
const BATCH_MS = 6000 // phone: edits this close together share one toast

interface Entry {
  id: string
  label: string
  run: () => void | Promise<void>
  /** The toast's onUndo, when one is on screen — dismissed when this entry is undone another way. */
  shown?: () => void
}

let past: Entry[] = []
let future: Entry[] = []
let busy = false // an undo/redo is running: what it calls (even toastUndo) is not a new action
let batch: { entries: Entry[]; at: number; shown: () => void } | null = null

// ── What gets a toast. Unknown wording errs loud (never lose an Undo the person can't otherwise find). ──
const DESTRUCTIVE = /deleted|trash|archived|dismissed|discarded|cleared|merged|pressed into|ends here|finished|week closed|photo goes|^removed(?! “)|removed ·|✦|failed|couldn/i
const BULK = /\b(?:[2-9]|\d{2,})\s+(?:\w+\s+)?(?:tasks?|blocks?|items?|lines?|pages?|events?|captures?|done|completed|replanned|filed|moved|changes)\b|\bseries\b|\ball\b|· (?:this event|this one|this and following|all of them)|“[^”]*” is now/i
const ROUTINE = /^(?:moved|resized|planned|scheduled|unscheduled|out of|in |reopened|done|snoozed|unsnoozed|renamed|linked|parked|date taken off|goal of the day|added to top 3|removed from top 3|taken out|planted|milestone (?:done|reopened)|repeat set|repeat removed|paused|resumed|skipped|duplicated|rescheduled|remind|no reminder|(?:added|removed) “|every |daily|weekly|monthly|yearly|never|restored|now a task|high|medium|low|no priority|priority)/i

/** Loud = destructive, bulk, or not a plain routine edit. Exported for the tests. */
export function isLoud(message: string): boolean {
  return DESTRUCTIVE.test(message) || BULK.test(message) || !ROUTINE.test(message)
}

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
export type UndoToasts = 'fewer' | 'all'
export function readUndoToasts(): UndoToasts {
  return store()?.getItem(UNDO_TOASTS_KEY) === 'all' ? 'all' : 'fewer'
}
export function writeUndoToasts(v: UndoToasts): void {
  try {
    store()?.setItem(UNDO_TOASTS_KEY, v)
    prefWritten(UNDO_TOASTS_KEY) // follows the person (lib/prefs)
  } catch {
    /* session-only is fine */
  }
}
const showAll = (): boolean => readUndoToasts() === 'all'
const phone = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches

const push = (t: Omit<Toast, 'id'>) => useToastStore.getState().push(t)

function dismissShown(fn: (() => void) | undefined): void {
  if (!fn) return
  const { toasts = [], dismiss } = useToastStore.getState()
  toasts.filter((t) => t.onUndo === fn).forEach((t) => dismiss(t.id))
}

/** Run an entry and hand back what undoes it in turn (redo ↔ undo), when its writes could be taped. */
async function play(e: Entry, onto: Entry[]): Promise<void> {
  busy = true
  try {
    dismissShown(e.shown)
    const inverse = await recordWrites(e.run)
    if (inverse.length) onto.push({ id: e.id, label: e.label, run: replayer(inverse) })
  } catch {
    push({ message: 'That undo slipped away — check the item.' })
  } finally {
    busy = false
  }
}

async function undoEntry(e: Entry): Promise<void> {
  past = past.filter((x) => x !== e)
  playSound('undo')
  await play(e, future)
}

/** ⌘Z / Ctrl+Z: the newest action, wherever in the app it happened. False when there is nothing. */
export function undoLatest(): boolean {
  const e = past.at(-1)
  if (!e) return false
  batch = null
  void undoEntry(e)
  return true
}

/** ⌘⇧Z / Ctrl+Y: what the last undo took back. */
export function redoLatest(): boolean {
  const e = future.pop()
  if (!e) return false
  playSound('undo')
  void play(e, past)
  return true
}

export function clearUndoHistory(): void {
  past = []
  future = []
  batch = null
}

export function toastUndo(message: string, undo: () => void | Promise<void>, opts: { loud?: boolean } = {}) {
  if (busy) return
  const e: Entry = { id: crypto.randomUUID(), label: message, run: undo }
  past.push(e)
  if (past.length > HISTORY_MAX) past.shift()
  future = []
  const onUndo = () => void (past.includes(e) && undoEntry(e))

  if (opts.loud || showAll() || isLoud(message)) {
    e.shown = onUndo
    push({ message, onUndo })
    return
  }
  if (phone()) return void phoneToast(e)
  hint()
}

/** Phone, quiet edit: one toast for a run of edits — "Moved · Undo", then "3 changes · Undo". */
function phoneToast(e: Entry): void {
  const now = Date.now()
  const entries = batch && now - batch.at < BATCH_MS ? [...batch.entries, e] : [e]
  if (batch) dismissShown(batch.shown)
  const onUndo = () => {
    batch = null
    ;[...entries].reverse().filter((x) => past.includes(x)).forEach((x) => void undoEntry(x)) // each undo is its own tape
  }
  entries.forEach((x) => (x.shown = onUndo))
  batch = { entries, at: now, shown: onUndo }
  push({ message: entries.length === 1 ? e.label : `${entries.length} changes`, onUndo })
}

/** Computer, quiet edit: the first few times, a tiny "Undo with Ctrl+Z" so the silence isn't a mystery. */
function hint(): void {
  const s = store()
  if (!s) return
  const n = Number(s.getItem(HINTS_KEY)) || 0
  if (n >= HINTS_MAX) return
  s.setItem(HINTS_KEY, String(n + 1))
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  push({ message: `Undo with ${mac ? '⌘Z' : 'Ctrl+Z'} · redo with ${mac ? '⌘⇧Z' : 'Ctrl+Y'}` })
}

// Non-undo action toasts, e.g. toastAction('Restored to Tasks', 'Jump there →', () => navigate('/tasks'))
export function toastAction(message: string, label: string, run: () => void) {
  useToastStore.getState().push({ message, action: { label, run } })
}
