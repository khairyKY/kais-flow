import { useQuery } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { syncedLabel } from './api'

// Calendar subscriptions by link (ics-subscribe, Kai 2026-11-06; migration 0094): any .ics feed on the calendar, read-only,
// no Google account. The link itself is private: it lives server-side (calendar_subscriptions.url is not selectable
// by the client), so everything that touches it — preview, add, rename, recolour, refresh, remove — is an `ics-sync`
// call; here only the list (name, host, colour, status) is read.

export interface Subscription {
  id: string
  /** The link's host name, for display — never the link. */
  host: string
  name: string
  /** "#RRGGBB": the feed's own, else a palette C swatch. */
  color: string | null
  /** "Use the feed's reminders". */
  use_alarms: boolean
  status: 'ok' | 'failing' | null
  /** ics-sync's stable code for the last failure (ERRORS below). */
  error: string | null
  synced_at: string | null
  event_count: number
  created_at: string
}

const COLS = 'id, host, name, color, use_alarms, status, error, synced_at, event_count, created_at'

export function useSubscriptions() {
  return useQuery({
    queryKey: ['calendar_subscriptions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('calendar_subscriptions').select(COLS).order('created_at')
      if (error) throw error
      return data as Subscription[]
    },
  })
}

export const ICS_ERRORS: Record<string, string> = {
  bad_url: 'That isn’t a calendar link. Paste a webcal:// or https:// address that ends in .ics, or one your calendar app calls a subscribe link.',
  blocked: 'That address is on a private network, so it can’t be reached from here. Use the public link.',
  unreachable: 'Couldn’t reach that address. Check the link and try again.',
  timeout: 'That address took too long to answer. Try again in a minute.',
  http_error: 'That address answered with an error. The link may have changed or been turned off.',
  too_large: 'That calendar is too big to subscribe to (over 5 MB, or too many events).',
  not_ics: 'That address didn’t send a calendar. Check it is the .ics link.',
  duplicate: 'You are already subscribed to that link.',
  too_many: 'You can subscribe to up to 20 calendars. Remove one first.',
  not_found: 'That subscription is gone.',
  server_error: 'Something went wrong on our side. Try again in a minute.',
}

async function errorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    if (body?.error && ICS_ERRORS[body.error]) return ICS_ERRORS[body.error]
    // The gateway's own 404: the function was never deployed.
    if (res.status === 404) return 'Calendar subscriptions aren’t on the server yet (ics-sync needs deploying).'
  }
  return navigator.onLine === false ? 'You’re offline. Subscriptions change only when you’re online.' : 'Couldn’t reach the server. Try again.'
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ics-sync', { body })
  // A refresh that failed still changed the row (status, error), and a landing changed the events — show both.
  void queryClient.invalidateQueries({ queryKey: ['calendar_subscriptions'] })
  if (body.action !== 'preview') void queryClient.invalidateQueries({ queryKey: ['calendar_events'] })
  if (error) throw new Error(await errorMessage(error))
  return data as T
}

export interface IcsPreview {
  name: string
  /** The feed's own colour (X-APPLE-CALENDAR-COLOR / COLOR, else the link's ?color=), if it has one. */
  color: string | null
  /** Events in the window kept (60 days back, 400 ahead), repeats counted one by one. */
  events: number
  reminders: boolean
  host: string
}

export interface IcsCounts {
  fetched: number
  new: number
  updated: number
  removed: number
}

/** Fetches the link once and says what is in it. Stores nothing. */
export const previewIcs = (url: string) => call<IcsPreview>({ action: 'preview', url })

export const addIcs = (a: { url: string; name: string; color: string | null; use_alarms: boolean }) => call<IcsCounts & { id: string }>({ action: 'add', ...a })

export const refreshIcs = (id: string) => call<IcsCounts>({ action: 'refresh', id })

export const updateIcs = (id: string, patch: { name?: string; color?: string | null; use_alarms?: boolean }) => {
  // Shown at once; the server then rewrites the events to match.
  queryClient.setQueryData<Subscription[]>(['calendar_subscriptions'], (rows) => rows?.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  return call<IcsCounts>({ action: 'update', id, ...patch })
}

export const removeIcs = (id: string) => call<{ removed: number }>({ action: 'remove', id })

/** The row's second line: where it comes from, how much, and when it was last read (or why not). */
export function subscriptionLine(s: Pick<Subscription, 'host' | 'status' | 'error' | 'synced_at' | 'event_count'>): string {
  const events = `${s.event_count} ${s.event_count === 1 ? 'event' : 'events'}`
  if (s.status === 'failing') return `${s.host} · ${ICS_ERRORS[s.error ?? ''] ?? ICS_ERRORS.server_error}${s.synced_at ? ` Last updated ${syncedLabel(s.synced_at)}.` : ''}`
  if (!s.synced_at) return `${s.host} · not read yet`
  return `${s.host} · ${events} · updated ${syncedLabel(s.synced_at)}`
}
