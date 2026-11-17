// Shared events and Free together (v1.6.6, partner sharing P2; migration 0101).
//
// A shared event is TWO ordinary calendar_events rows, one per person, each owned by its person and linked by `shared_id`
// (server-made; a client write can't make or move a link). Everything that reads an event reads it as it always did. What this
// file adds:
//   - the words and the states a shared event needs (pure, tested),
//   - Free together: windows from the server's compare (`shared_free_together`: only windows, never a row),
//   - making a proposal, answering it, "Delete for both": RPCs (online-only: they change two people's rows at once and the
//     server checks the connection). Editing and "Remove from mine" are the person's own plain writes through the outbox:
//     the server copies an edit to the other copy, and a plain delete of one's own copy is "Remove from mine".
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { useToastStore } from '../../lib/toastStore'
import { toastUndo } from '../../lib/undo'
import { deleteEvent, restoreEvent } from '../calendar/api'
import type { CalendarEvent } from '../../lib/types'
import { HER_COLOR, type Connection } from './model'

export * from './sharedPure'
import { sharedState, type FreeTogether, type SharedState } from './sharedPure'
export type { FreeWindow } from './sharedPure'

// ── the look on the grid: a lookup by the stored row's id, from the cached rows ──

/** `color`: the colour I gave that person (palette C), for the dashed edge and the face. */
export interface SharedLook { state: SharedState; name: string; color: string }
let lookFor: { rows: CalendarEvent[]; conns: Connection[]; map: Map<string, SharedLook> } | null = null

/** The shared look of an event on the grid (`id` may be an occurrence id: shared events don't repeat, so the plain id). Memoised per cache snapshot. */
export function sharedLookOf(id: string): SharedLook | null {
  const rows = queryClient.getQueryData<CalendarEvent[]>(['calendar_events'])
  if (!rows) return null
  const conns = queryClient.getQueryData<Connection[]>(['share_connections']) ?? []
  if (!lookFor || lookFor.rows !== rows || lookFor.conns !== conns) {
    const map = new Map<string, SharedLook>()
    for (const r of rows) {
      const s = r.shared_id ? sharedState(r) : null
      if (!s) continue
      const c = conns.find((x) => x.partner_id === r.shared_with)
      map.set(r.id, { state: s, name: c?.partner_name ?? 'Them', color: c?.color ?? HER_COLOR })
    }
    lookFor = { rows, conns, map }
  }
  return lookFor.map.get(id) ?? null
}

// ── Free together ──

async function fetchFree(partnerId: string, from: Date, to: Date): Promise<FreeTogether> {
  const { data, error } = await supabase.rpc('shared_free_together', { p_partner: partnerId, p_from: from.toISOString(), p_to: to.toISOString() })
  if (error) throw error
  return data as FreeTogether
}

/** The free windows of the two of you in [from, to). Re-asked when a ping says the other calendar changed. */
export function useFreeTogether(partnerId: string, from: Date, to: Date, enabled = true) {
  const f = from.toISOString(), t = to.toISOString()
  return useQuery({ queryKey: ['shared_free', partnerId, f, t], enabled, staleTime: 15_000, queryFn: () => fetchFree(partnerId, from, to) })
}

// ── making, answering, deleting ──

export type SharedResult = 'ok' | 'paused' | 'gone'
interface Answer { ok?: boolean; error?: string }
const asResult = (a: Answer): SharedResult => (a.ok ? 'ok' : a.error === 'paused' ? 'paused' : 'gone')
const refresh = () => void queryClient.invalidateQueries({ queryKey: ['calendar_events'] })

/** Make a shared event (or propose one): my copy and an invited copy for them. Online-only; the server checks the connection. */
export async function createSharedEvent(c: Connection, v: { title: string; startsAt: string; endsAt: string; allDay?: boolean }): Promise<SharedResult> {
  const { data, error } = await supabase.rpc('shared_event_create', {
    p_id: crypto.randomUUID(), p_circle: c.circle_id, p_title: v.title, p_starts_at: v.startsAt, p_ends_at: v.endsAt, p_all_day: !!v.allDay,
  })
  if (error) throw error
  refresh()
  void queryClient.invalidateQueries({ queryKey: ['shared_free'] })
  return asResult(data as Answer)
}

/** Answer a proposal: Accept (both copies say so) or Decline (the invited copy goes, theirs reads "can't go"). */
export async function answerShared(e: CalendarEvent, accept: boolean): Promise<SharedResult> {
  const { data, error } = await supabase.rpc('shared_event_respond', { p_event: e.id, p_accept: accept })
  if (error) throw error
  const r = asResult(data as Answer)
  if (r === 'ok') queryClient.setQueryData<CalendarEvent[]>(['calendar_events'], (rows) => rows?.flatMap((x) => (x.id !== e.id ? [x] : accept ? [{ ...x, share_status: 'accepted' as const }] : [])))
  refresh()
  void queryClient.invalidateQueries({ queryKey: ['shared_free'] })
  return r
}

/** "Delete for both": both copies go to their own person's Trash. Undo is a restore of mine (the server brings theirs back too). */
export async function deleteSharedForBoth(e: CalendarEvent): Promise<SharedResult> {
  const { data, error } = await supabase.rpc('shared_event_delete_both', { p_event: e.id })
  if (error) throw error
  const r = asResult(data as Answer)
  if (r === 'ok') queryClient.setQueryData<CalendarEvent[]>(['calendar_events'], (rows) => rows?.map((x) => (x.id === e.id ? { ...x, deleted_at: new Date().toISOString() } : x)))
  refresh()
  return r
}

// ── what the menus do ──

/** The other person's name on a shared event, from the connections already loaded ("Them" before they arrive). */
export function sharedNameOf(e: Pick<CalendarEvent, 'shared_with'>): string {
  return queryClient.getQueryData<Connection[]>(['share_connections'])?.find((c) => c.partner_id === e.shared_with)?.partner_name ?? 'Them'
}

/** "Remove from mine": the person's own plain delete of their copy (offline-able, through the outbox). The copy stays linked in Trash and the
 * other copy reads "can't go"; nothing of theirs is touched. Undo is a restore: it is on the shared event again and they read it as before. */
export function removeFromMine(e: CalendarEvent): void {
  const name = sharedNameOf(e)
  const prior = { ...e }
  deleteEvent(e)
  toastUndo(`Removed from your calendar · ${e.title}. ${name} still has it.`, () => restoreEvent(prior))
}

/** Accept or Decline, with the words for what came back. */
export async function respondToShared(e: CalendarEvent, accept: boolean): Promise<void> {
  const push = useToastStore.getState().push
  const name = sharedNameOf(e)
  try {
    const r = await answerShared(e, accept)
    push({ message: r === 'ok' ? (accept ? `You’re on it with ${name}.` : `Declined. ${name} will see you can’t go.`) : r === 'paused' ? `${name} paused sharing. Try again when it is back on.` : 'That one is already gone.' })
  } catch {
    push({ message: 'Answering needs a connection. Try again when you are online.' })
  }
}
