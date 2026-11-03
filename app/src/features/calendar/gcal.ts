import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { useToastStore } from '../../lib/toastStore'
import type { CalendarEvent } from '../../lib/types'
import { noteLocalWrite } from './blockMotion'
import type { Scope } from './scope'

// ── gcal-events (Kai 2026-11-03): a Google event the grant lets us write is edited like any other block — rename,
// move, resize, delete — and the change goes to Google through google-sync's `edit` action (the plan is
// _shared/gcalEdit.ts: This · This and following · All for a repeating one). Google first: the grid shows the change
// at once, and puts it back (with a sentence) when Google says no. The row itself is rewritten by google-sync's
// re-read of the calendar. Read-only ones (another calendar, someone else's event, a grant without the write
// scope) keep their old behaviour: details, Open in Google Calendar, Duplicate, Copy link. ──

/** A Google event of ours to change: the grant can write and it's on a calendar we own (google-sync decides, per event,
 * and stamps `external_ref.edit`). */
export const gcalEditable = (e: Pick<CalendarEvent, 'source' | 'external_ref'>): boolean => e.source === 'gcal' && !!e.external_ref?.edit

/** A repeating Google event — its occurrences ask This / Following / All. */
export const gcalRepeats = (e: Pick<CalendarEvent, 'source' | 'external_ref'>): boolean => gcalEditable(e) && !!e.external_ref?.master

/** The event in Google Calendar's own web page: the link Google gave, else the address its `eid` makes. */
export function gcalLink(e: Pick<CalendarEvent, 'gcal_id' | 'external_ref'>): string | null {
  const ref = e.external_ref
  if (ref?.link) return ref.link
  if (!e.gcal_id || !ref?.calendar_id) return null
  const eid = btoa(`${e.gcal_id} ${ref.calendar_id}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `https://calendar.google.com/calendar/event?eid=${eid}`
}

/** A join link on the event (Meet's, or another video entry point), if Google gave one. */
export const joinLink = (e: Pick<CalendarEvent, 'external_ref'>): string | null => (typeof e.external_ref?.url === 'string' && /^https:\/\//i.test(e.external_ref.url) ? e.external_ref.url : null)

export interface GcalChange {
  title?: string
  starts_at?: string
  ends_at?: string
  all_day?: boolean
  delete?: true
}

/** What google-sync answers an edit with: the ops that put every event back as it was (an Undo's body). */
export interface GcalUndo {
  calendar: string
  ops: unknown[]
}

const SAYS: Record<string, string> = {
  read_only: 'Google won’t let this event be changed from here',
  gone: 'That event is gone from Google',
  unsupported: 'Google can’t change the whole series from here — change just this event',
  token_expired: 'Google access has expired — reconnect in Settings',
  google_unavailable: 'Couldn’t reach Google',
  not_connected: 'Google Calendar isn’t connected',
}

async function whyNot(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = (await (error.context as Response).json().catch(() => null)) as { error?: string } | null
    if (body?.error && SAYS[body.error]) return SAYS[body.error]
  }
  return navigator.onLine === false ? 'You’re offline — Google events change only when you’re online' : 'Couldn’t reach Google'
}

const cached = (): CalendarEvent[] => queryClient.getQueryData<CalendarEvent[]>(['calendar_events']) ?? []

function setRows(change: (rows: CalendarEvent[]) => CalendarEvent[]): void {
  void queryClient.cancelQueries({ queryKey: ['calendar_events'] })
  queryClient.setQueryData<CalendarEvent[]>(['calendar_events'], (old) => (old ? change(old) : old))
}

/** The rows `scope` reaches: this occurrence, or the series' (from this one on for Following). */
function reach(rows: readonly CalendarEvent[], row: CalendarEvent, scope: Scope): CalendarEvent[] {
  const master = row.external_ref?.master
  if (scope === 'this' || !master) return rows.filter((r) => r.id === row.id)
  return rows.filter((r) => r.source === 'gcal' && r.external_ref?.master === master && r.external_ref.calendar_id === row.external_ref?.calendar_id && (scope === 'all' || r.starts_at >= row.starts_at))
}

/** What the grid shows meanwhile: the rows as the change would leave them (Google's re-read replaces them). */
function shown(r: CalendarEvent, row: CalendarEvent, c: GcalChange): CalendarEvent {
  if (c.delete) return { ...r, deleted_at: new Date().toISOString() }
  const next = { ...r }
  if (c.title !== undefined) next.title = c.title
  if (c.starts_at && c.ends_at) {
    const delta = Date.parse(c.starts_at) - Date.parse(row.starts_at)
    const length = Date.parse(c.ends_at) - Date.parse(c.starts_at)
    next.starts_at = new Date(Date.parse(r.starts_at) + delta).toISOString()
    next.ends_at = new Date(Date.parse(next.starts_at) + length).toISOString()
    if (c.all_day !== undefined) next.all_day = c.all_day
  }
  return next
}

/** One change to a Google event, as `scope` says. Shown at once; Google answers, then the calendar is re-read. Resolves
 * with the ops that undo it — null when Google said no (the grid is back as it was, with a sentence). */
export function gcalApply(row: CalendarEvent, scope: Scope, change: GcalChange): Promise<GcalUndo | null> {
  noteLocalWrite() // CAL10: what lands next is the person's own
  const hit = reach(cached(), row, scope)
  const prior = new Map(hit.map((r) => [r.id, r]))
  setRows((rows) => rows.map((r) => (prior.has(r.id) ? shown(r, row, change) : r)))
  return (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('google-sync', { body: { action: 'edit', id: row.id, scope, change } })
      if (error) throw error
      void queryClient.invalidateQueries({ queryKey: ['calendar_events'] })
      return ((data as { undo?: GcalUndo } | null)?.undo ?? null)
    } catch (e) {
      setRows((rows) => rows.map((r) => prior.get(r.id) ?? r))
      void queryClient.invalidateQueries({ queryKey: ['calendar_events'] })
      useToastStore.getState().push({ message: `${await whyNot(e)} · put back` })
      return null
    }
  })()
}

/** Runs an undo's ops on Google. */
export async function gcalUndo(u: GcalUndo): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('google-sync', { body: { action: 'undo', calendar: u.calendar, ops: u.ops } })
    if (error) throw error
  } catch (e) {
    useToastStore.getState().push({ message: `${await whyNot(e)} · not undone` })
  }
  void queryClient.invalidateQueries({ queryKey: ['calendar_events'] })
}

/** A delete's Undo needs Google's answer (what to confirm again): kept by row id until the toast is gone. */
const deletes = new Map<string, Promise<GcalUndo | null>>()

export function gcalDelete(row: CalendarEvent, scope: Scope = 'this'): Promise<GcalUndo | null> {
  const done = gcalApply(row, scope, { delete: true })
  deletes.set(row.id, done)
  return done
}

/** Undo of a delete: the event comes back in Google, and the calendar is re-read. */
export function gcalRestore(row: CalendarEvent): void {
  const done = deletes.get(row.id)
  deletes.delete(row.id)
  void done?.then((u) => u && gcalUndo(u))
}

/** The one-row edits (writeEvent's chokepoint — a drag, a resize, a typed time, a rename, the Date row): the change
 * between the cached row and `next`, sent as This. Nothing else of a Google row is ours to write (colour, project, remind
 * stay in Google). */
export function gcalWrite(next: CalendarEvent, op: 'upsert' | 'delete' = 'upsert'): void {
  const prior = cached().find((r) => r.id === next.id)
  if (!prior || !gcalEditable(prior)) return
  if (op === 'delete' || (next.deleted_at && !prior.deleted_at)) return void gcalDelete(prior)
  const change: GcalChange = {}
  if (next.title !== prior.title && next.title.trim()) change.title = next.title
  if (next.starts_at !== prior.starts_at || next.ends_at !== prior.ends_at || next.all_day !== prior.all_day) {
    change.starts_at = next.starts_at
    change.ends_at = next.ends_at
    if (next.all_day !== prior.all_day) change.all_day = next.all_day
  }
  if (change.title !== undefined || change.starts_at) void gcalApply(prior, 'this', change)
}
