import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { logActivity } from '../../lib/activity'
import { toastUndo } from '../../lib/undo'
import { completeTask, createTask, rescheduleDue } from '../tasks/api'
import { deleteEvent, deleteEventsForTask, deleteEventWithUndo, placeTask, restoreEvent } from '../calendar/api'
import { blockIfTimed } from '../capture/api'
import { durationOf } from '../capture/aiFill'
import { eventMinutes, type RailDropAction } from '../calendar/railDrop'
import { NO_PLACE, placeTask as placeIn, type MoveTarget } from '../tasks/move'
import { upsertJournalEntry } from '../journal/api'
import { createInteraction, deleteInteraction } from '../people/api'
import { cairoDateKey, scheduleToday } from '../../lib/dateShortcuts'
import { captureLink, dayWord, formatDue, githubUrl, suggestedTitle } from './inboxDisplay'
import { linkRef } from '../../lib/links'
import { INBOX_COLUMNS } from '../../lib/columns'
import { fetchAll } from '../../lib/fetchAll'
import type { CalendarEvent, InboxItem, Person, Task } from '../../lib/types'

async function fetchInboxItems(): Promise<InboxItem[]> {
  return fetchAll<InboxItem>((from, to) =>
    supabase.from('inbox_items').select(INBOX_COLUMNS).order('created_at', { ascending: false }).order('id').range(from, to),
  )
}

export function usePendingInboxItems() {
  return useQuery({
    queryKey: ['inbox_items'],
    queryFn: fetchInboxItems,
    select: (items) => items.filter((i) => !i.deleted_at && i.status === 'pending' && (!i.snoozed_until || new Date(i.snoozed_until) <= new Date())),
  })
}

// Unfiltered — shares the same cached query as usePendingInboxItems (same key+queryFn, no
// `select`), used by citation deep-links and resurfacing which need items of any status.
export function useAllInboxItems() {
  return useQuery({
    queryKey: ['inbox_items'],
    queryFn: fetchInboxItems,
    select: (items) => items.filter((i) => !i.deleted_at),
  })
}

function nowIso() {
  return new Date().toISOString()
}

/** A typed capture into the Inbox. `read`: what its typed tokens already say (quickAdd holdTyped,
 * "File captures for me" off) — the card's one-tap suggestion, and the extras filing keeps. */
export function captureText(rawText: string, read?: { ai_parse: Record<string, unknown>; payload: Record<string, unknown> | null }): InboxItem {
  const item: InboxItem = {
    id: crypto.randomUUID(),
    kind: 'text',
    raw_text: rawText,
    transcript: null,
    ai_parse: read?.ai_parse ?? null,
    confidence: typeof read?.ai_parse.confidence === 'number' ? read.ai_parse.confidence : null,
    status: 'pending',
    filed_task_id: null,
    payload: read?.payload ?? null,
    snoozed_until: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  writeRow('inbox_items', item)
  logActivity('inbox.captured', 'inbox_item', item.id, { kind: 'text' })
  return item
}

// ── Punch 7: destination feedback. Every triage action toasts with a working Undo, and the
// filing toast names where the thing actually went. The toast lives here rather than in
// InboxPage so every entry point (cards, keyboard strip, GitHub rows, Morning Ritual triage)
// gets it from one place. `silent` is for callers that compose these into a bigger action and
// push their own single toast — bulk loops, resurfacing's "Kept", Trash's restore. ──

function lookupName(table: 'projects' | 'areas' | 'domains', id: string | null | undefined): string | null {
  if (!id) return null
  const rows = queryClient.getQueryData<{ id: string; name: string }[]>([table]) ?? []
  return rows.find((r) => r.id === id)?.name ?? null
}

/** Where the written task lives: its project, area or domain, by name. */
const placeOf = (task: Task) => lookupName('projects', task.project_id) ?? lookupName('areas', task.area_id) ?? lookupName('domains', task.domain_id)

/** "Shaheen website · Today" / "Tasks · Tomorrow" / "Tasks" — read off the task that was
 * actually written, so the toast can't claim a destination the row doesn't have. */
function destinationOf(task: Task): string {
  const where = placeOf(task) ?? 'Tasks'
  return task.due_at ? `${where} · ${dayWord(task.due_at)}` : where
}

/** The filing toast (Inbox.dc.html 3a: `Filed "Send invoice to Shaheen" as a task`), plus where it
 * went and when when it has either (punch 7: name the real destination). */
function filedLine(task: Task): string {
  const where = [placeOf(task), task.due_at ? dayWord(task.due_at) : null].filter(Boolean)
  if (task.someday) return `Filed "${task.title}" to Someday${where.length ? ` · ${where.join(' · ')}` : ''}`
  return `Filed "${task.title}" as a task${where.length ? ` · ${where.join(' · ')}` : ''}`
}

/** Undoing a *just-created* task hard-deletes it rather than routing it to Trash — same as
 * the auto-file undo in `capture/api.ts`; a task the user un-made shouldn't need composting.
 * Its block (a timed filing's, fileToTask) goes first, while the task it points at still exists. */
function unfile(item: InboxItem, task: Task): void {
  deleteEventsForTask(task.id)
  writeRow('tasks', task, 'delete')
  logActivity('task.deleted', 'task', task.id, { reason: 'inbox file undo' })
  writeRow('inbox_items', item)
}

/** Hides the item from the triage queue until `until` — a lighter cousin of `tasks.snoozeTask`,
 * no push reminder (that half of SPECS.md's "Snooze" backlog item stays future-phase). */
export function snoozeInboxItem(item: InboxItem, until: string, silent = false): void {
  const prior = { ...item }
  writeRow('inbox_items', { ...item, snoozed_until: until })
  logActivity('inbox.snoozed', 'inbox_item', item.id, { until })
  if (!silent) toastUndo(`Snoozed until ${formatDue(until)}`, () => writeRow('inbox_items', prior))
}

/** Manual triage: file a pending inbox item into a task under the chosen domain/project.
 * `title` lets the caller file the AI-cleaned/edited title instead of the raw capture
 * (the AI's `cleaned_text` used to be shown but never actually filed). Priority/duration typed
 * locally at capture time (command bar `!`/`30m` syntax) ride along on `item.payload` when the
 * item didn't auto-file — applied here so a deferred manual filing doesn't lose them either. */
// Returns the created task so callers can offer a real Undo (WA-4 punch 21 — convertResurfaced).
export function fileToTask(
  item: InboxItem,
  opts: { domainId?: string | null; projectId?: string | null; areaId?: string | null; dueAt?: string | null; timed?: boolean; title?: string; silent?: boolean; someday?: boolean } = {},
): Task {
  const prior = { ...item }
  // …and, from a held ⌘K line (quickAdd holdTyped), its `*labels`, repeat and `// notes`.
  const overrides = item.payload as { priority_override?: number | null; duration_override?: number | null; labels_override?: string[]; repeat_override?: string | null; notes_override?: string | null } | null
  const parse = item.ai_parse as { due_at?: string | null; has_time?: boolean | null; duration_min?: number | null } | null
  // The triage card shows the AI's parsed date as a promise ("→ Sat, 18:00"); no caller was
  // passing it through, so every manual filing silently dropped it — and the punch-7 toast
  // could never truthfully say "· Today". Default to the parse; an explicit opt still wins —
  // null included (the card's date field cleared).
  // A someday task is undated (Tasks › Someday), whatever the parse said.
  const parsedDue = opts.someday ? null : opts.dueAt !== undefined ? opts.dueAt : (parse?.due_at ?? null)
  // P7e A2, the one capture rule (capture/api blockIfTimed): a TIME puts the filed task on the calendar
  // — the card's own pick when the caller passes one (`timed`), else the AI's read of the words.
  const timed = opts.timed ?? (opts.dueAt === undefined && parse?.has_time === true)
  // P6 step 4: a filed GitHub issue keeps its link (the task's "View issue").
  const issue = item.kind === 'github_issue' ? (item.payload as { node_id?: string; url?: string } | null) : null
  const issueUrl = githubUrl(issue?.url)
  const task = createTask({
    title: opts.title?.trim() || item.raw_text,
    domainId: opts.domainId ?? null,
    projectId: opts.projectId ?? null,
    areaId: opts.areaId ?? null,
    dueAt: parsedDue,
    priority: overrides?.priority_override ?? null,
    // A typed `30m`, else the length the AI read ("for an hour") — the block's length too.
    durationMin: overrides?.duration_override ?? durationOf(parse?.duration_min),
    someday: opts.someday,
    labels: overrides?.labels_override ?? [],
    recurrenceRule: opts.someday ? null : (overrides?.repeat_override ?? null),
    notes: overrides?.notes_override ?? null,
    // A capture's link rides along too (P7e A19): the task's "↗ site" and `o`.
    externalRef: issue?.node_id && issueUrl ? { source: 'github', id: issue.node_id, url: issueUrl } : linkRef(captureLink(item)),
  })
  blockIfTimed(task, timed)
  writeRow('inbox_items', { ...item, status: 'filed', filed_task_id: task.id })
  logActivity('inbox.filed', 'inbox_item', item.id, { task_id: task.id })
  if (!opts.silent) toastUndo(filedLine(task), () => unfile(prior, task))
  return task
}

/** The AI's suggestion for an item (the Inbox page's `E`, the calendar rail): its short title
 * (dates already pulled out — inboxDisplay.suggestedTitle), domain and project. */
export function aiFiling(item: InboxItem): { title?: string; domainId: string | null; projectId: string | null } {
  const parse = item.ai_parse as { domain_id?: string | null; project_id?: string | null } | null
  return { title: parse ? suggestedTitle(item) : undefined, domainId: parse?.domain_id ?? null, projectId: parse?.project_id ?? null }
}

// ── Inbox t3 (Inbox.dc.html 3a/3b): a capture goes to a task (in a project, an AREA or a domain),
// today's journal, or a person's page ("Where does this go? Task · Journal note · Salma"). ──

export type FileTo =
  /** `someday`: the Snooze menu's Someday — a someday task (no date), not a year-long snooze. */
  /** `timed`: the card's date has a clock time — the task gets its calendar block (A2). */
  | { to: 'task'; title: string; dueAt: string | null; timed?: boolean; place: MoveTarget; someday?: boolean }
  | { to: 'journal'; body: string }
  | { to: 'person'; person: Pick<Person, 'id' | 'name'>; summary: string }

const NOWHERE = { project_id: null, area_id: null, domain_id: null, milestone_id: null }

function markFiled(item: InboxItem, filedTo: 'journal' | 'person', meta: Record<string, unknown>): void {
  writeRow('inbox_items', { ...item, status: 'filed', payload: { ...(item.payload ?? {}), filed_to: filedTo } })
  logActivity('inbox.filed', 'inbox_item', item.id, meta)
}

/** Files one capture where `to` says, without a toast: the line to say and the way back. */
function fileQuietly(item: InboxItem, to: FileTo, now = new Date()): { message: string; undo: () => void } {
  const prior = { ...item }
  if (to.to === 'journal') {
    const entry = upsertJournalEntry({ entry_date: cairoDateKey(now), body: to.body.trim() || item.raw_text }, true)
    markFiled(item, 'journal', { journal_entry_id: entry.id })
    return { message: "Added to today's journal", undo: () => { writeRow('journal_entries', entry, 'delete'); writeRow('inbox_items', prior) } }
  }
  if (to.to === 'person') {
    const note = createInteraction({ person_id: to.person.id, summary: to.summary.trim() || item.raw_text, occurred_at: now.toISOString() })
    markFiled(item, 'person', { person_id: to.person.id })
    return { message: `Added to ${to.person.name}`, undo: () => { deleteInteraction(note.id); writeRow('inbox_items', prior) } }
  }
  const at = placeIn(NOWHERE, to.place)
  const task = fileToTask(item, { title: to.title, dueAt: to.dueAt, timed: !!to.timed, projectId: at.project_id, areaId: at.area_id, domainId: at.domain_id, someday: to.someday, silent: true })
  return { message: filedLine(task), undo: () => unfile(prior, task) }
}

/** One capture, one toast with Undo. */
export function fileCapture(item: InboxItem, to: FileTo): void {
  const { message, undo } = fileQuietly(item, to)
  toastUndo(message, undo)
}

const captures = (n: number) => `${n} capture${n === 1 ? '' : 's'}`

/** A selection filed in one go: ONE toast, ONE Undo that takes every filing back (tasks deleted
 * through `unfile`, journal lines and person notes removed, the captures pending again). */
export function fileMany(pairs: readonly (readonly [InboxItem, FileTo])[]): void {
  if (!pairs.length) return
  const done = pairs.map(([item, to]) => fileQuietly(item, to))
  const someday = pairs.every(([, to]) => to.to === 'task' && to.someday)
  toastUndo(done.length === 1 ? done[0].message : `${captures(done.length)} filed${someday ? ' to Someday' : ''}`, () => done.forEach((d) => d.undo()))
}

/** "Done now" (P7e A8, Akiflow's inbox-zero E): a two-minute capture filed as a task that is already
 * done — its card's title, date and place. One toast, one Undo: the task goes, the capture comes back. */
export function fileDone(pairs: readonly (readonly [InboxItem, Extract<FileTo, { to: 'task' }>])[]): void {
  if (!pairs.length) return
  const done = pairs.map(([item, to]) => {
    const prior = { ...item }
    const at = placeIn(NOWHERE, to.place)
    const task = fileToTask(item, { title: to.title, dueAt: to.dueAt, projectId: at.project_id, areaId: at.area_id, domainId: at.domain_id, silent: true })
    completeTask(task)
    return { title: task.title, undo: () => unfile(prior, task) }
  })
  toastUndo(done.length === 1 ? `Filed "${done[0].title}" as done` : `${captures(done.length)} filed as done`, () => done.forEach((d) => d.undo()))
}

/** Every row written back as it was — the Undo of the bulk actions below. `deleted_at` is sent
 * explicitly: an upsert leaves out what it isn't given, and Clear now's Undo must un-Trash. */
function writeBack(priors: readonly InboxItem[]): () => void {
  return () => priors.forEach((p) => writeRow('inbox_items', { ...p, deleted_at: p.deleted_at ?? null }))
}

function many(items: readonly InboxItem[], write: (item: InboxItem) => void, message: string): void {
  if (!items.length) return
  const priors = items.map((i) => ({ ...i }))
  items.forEach(write)
  toastUndo(message, writeBack(priors))
}

export const dismissMany = (items: readonly InboxItem[]) => many(items, (i) => dismissInboxItem(i, true), items.length === 1 ? 'Dismissed' : `${captures(items.length)} dismissed`)
export const snoozeMany = (items: readonly InboxItem[], until: string) =>
  many(items, (i) => snoozeInboxItem(i, until, true), `${items.length === 1 ? 'Snoozed' : `${captures(items.length)} snoozed`} until ${formatDue(until)}`)
export const restoreMany = (items: readonly InboxItem[]) => many(items, (i) => restoreInboxItem(i, true), items.length === 1 ? 'Restored to Inbox' : `${captures(items.length)} restored`)
/** The Dismissed tab's "Clear now": to Trash (30 days, then compost), with Undo — never a confirm. */
export const purgeMany = (items: readonly InboxItem[]) => many(items, purgeInboxItem, `Moved ${captures(items.length)} to Trash`)

/** How the calendar rail names an item, and how long it blocks one (its typed `30m`, else 30). */
export const inboxTitle = (item: InboxItem): string => aiFiling(item).title ?? item.raw_text
export const inboxMinutes = (item: InboxItem): number => (item.payload as { duration_override?: number | null } | null)?.duration_override || 30

/** The calendar rail (Kai 2026-10-07): an inbox item dropped on the grid, or planned at a time, is
 * filed as its AI suggestion says and time-blocked there. One toast, one Undo for both. */
export function fileToCalendar(item: InboxItem, startsAt: string, endsAt: string, allDay = false): CalendarEvent {
  const prior = { ...item }
  const task = fileToTask(item, { ...aiFiling(item), dueAt: startsAt, silent: true })
  const { event, undo } = placeTask(task, startsAt, endsAt, allDay)
  toastUndo(`Scheduled · ${task.title}`, () => {
    undo()
    unfile(prior, task)
  })
  return event
}

/** The calendar rail the other way (Kai 2026-10-12): a block dragged onto the rail does what the
 * section means (calendar/railDrop decides which). A task's block comes off the calendar — onto
 * Today it is also due today, no time. A plain event or empty block turns into an inbox capture or
 * a task (due today, or in the Lists scope's `place`) and goes to Trash. One toast, one Undo that
 * puts everything back. Returns false for the soft-no. */
export function eventToRail(event: CalendarEvent, action: RailDropAction, place: MoveTarget = NO_PLACE, now = new Date()): boolean {
  if (action === 'soft-no') return false
  if (action === 'unschedule') {
    deleteEventWithUndo(event, 'Unscheduled')
    return true
  }
  const prior = { ...event }
  const undoSlot = deleteEvent(event) // a Time slot's tasks come back with it
  if (action === 'unschedule-today') {
    // Read after the delete: it just cleared the task's schedule, and rescheduleDue writes this row.
    const task = queryClient.getQueryData<Task[]>(['tasks'])?.find((t) => t.id === event.task_id)
    const undoDue = task ? rescheduleDue(task, scheduleToday(now)) : () => {}
    toastUndo(`Unscheduled · ${event.title} · Today`, () => {
      undoDue()
      restoreEvent(prior)
      undoSlot()
    })
    return true
  }
  if (action === 'to-inbox') {
    const item = captureText(event.title)
    toastUndo(`Moved to Inbox · ${event.title}`, () => {
      writeRow('inbox_items', item, 'delete')
      restoreEvent(prior)
      undoSlot()
    })
    return true
  }
  const at = placeIn({ project_id: null, area_id: null, domain_id: null, milestone_id: null }, action === 'to-list' ? place : NO_PLACE)
  const task = createTask({
    title: event.title,
    durationMin: eventMinutes(event),
    dueAt: action === 'to-today' ? scheduleToday(now) : null,
    projectId: at.project_id,
    areaId: at.area_id,
    domainId: at.domain_id,
  })
  toastUndo(`Now a task · ${destinationOf(task)}`, () => {
    writeRow('tasks', task, 'delete')
    logActivity('task.deleted', 'task', task.id, { reason: 'calendar rail drop undo' })
    restoreEvent(prior)
    undoSlot()
  })
  return true
}

export function dismissInboxItem(item: InboxItem, silent = false): void {
  const prior = { ...item }
  writeRow('inbox_items', { ...item, status: 'dismissed' })
  logActivity('inbox.dismissed', 'inbox_item', item.id, {})
  if (!silent) toastUndo('Dismissed', () => writeRow('inbox_items', prior))
}

/** Dismissed → pending again (Inbox.dc.html 2a/2b "Restore"). */
export function restoreInboxItem(item: InboxItem, silent = false): void {
  const prior = { ...item }
  writeRow('inbox_items', { ...item, status: 'pending', snoozed_until: null, deleted_at: null })
  logActivity('inbox.restored', 'inbox_item', item.id, {})
  if (!silent) toastUndo('Restored to Inbox', () => writeRow('inbox_items', prior))
}

/** The bar's "Added to Inbox · Undo" (P7e A17): the capture goes to Trash — with the task the AI filed it as,
 * when its read landed first (that task never should have existed: removed outright, as unfile does). */
export function uncapture(item: InboxItem): void {
  const now = queryClient.getQueryData<InboxItem[]>(['inbox_items'])?.find((i) => i.id === item.id) ?? item
  const filed = now.filed_task_id ? queryClient.getQueryData<Task[]>(['tasks'])?.find((t) => t.id === now.filed_task_id) : undefined
  if (filed) {
    deleteEventsForTask(filed.id)
    writeRow('tasks', filed, 'delete')
    logActivity('task.deleted', 'task', filed.id, { reason: 'capture undo' })
  }
  purgeInboxItem({ ...now, status: 'pending', filed_task_id: null })
}

/** The Dismissed tab's "Clear now" (2a): into Trash, not gone — Trash keeps it 30 days, then the
 * server's `compost-expired` pg_cron job (migration 0032) deletes it for good. */
export function purgeInboxItem(item: InboxItem): void {
  writeRow('inbox_items', { ...item, deleted_at: new Date().toISOString() })
  logActivity('inbox.purged', 'inbox_item', item.id, {})
}
