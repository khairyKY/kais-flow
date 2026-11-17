// Sharing with people you connect (migration 0100): everything the app asks or tells the server about it.
//
//   Own data goes through the outbox, as everywhere: my level for one person (`share_grants`, so lowering it offline waits its
//   turn) and the Private flag of an event or a task (features/sharing/private.ts).
//   Making, peeking at and accepting a code, leaving and pausing are online-only: they change two people at once and the
//   server answers (a code is checked there, never here).
//   Another person's day is only ever read through the RPC `shared_day` - the server masks it to the level both of you
//   allow. Nothing here can select their rows: no policy lets it.
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import { useToastStore } from '../../lib/toastStore'
import { useAuth } from '../auth/AuthProvider'
import { notices, seenOf, type Connection, type Level, type Relation, type SeenMap } from './model'
import { appZone } from '../../lib/appZone'

export const CONNECTIONS_KEY = ['share_connections'] as const
export const SHARED_DAY_KEY = 'shared_day'
export const INVITES_KEY = ['share_invites'] as const
export const LINKS_KEY = ['share_links'] as const

// ── connections ──

async function fetchConnections(): Promise<Connection[]> {
  const { data, error } = await supabase.rpc('share_connections')
  if (error) throw error
  return (data ?? []) as Connection[]
}

/** The people I share with. Realtime's share_pings (lib/realtime) and a refocus re-ask it. */
export function useConnections() {
  const uid = useAuth().session?.user.id
  return useQuery({ queryKey: CONNECTIONS_KEY, queryFn: fetchConnections, enabled: !!uid, staleTime: 30_000 })
}

const cachedConnections = (): Connection[] => queryClient.getQueryData<Connection[]>(CONNECTIONS_KEY) ?? []
const patchConnection = (circleId: string, patch: Partial<Connection>) =>
  queryClient.setQueryData<Connection[]>(CONNECTIONS_KEY, (old) => old?.map((c) => (c.circle_id === circleId ? { ...c, ...patch } : c)))

/** My level for one person: written as the owner's own row through the outbox (offline, it waits). */
export function setMyLevel(c: Connection, level: Level, uid: string): void {
  patchConnection(c.circle_id, { my_level: level, level: lowerOf(level, c.their_level) })
  writeRow('share_grants', { id: c.my_grant_id, circle_id: c.circle_id, owner_id: uid, viewer_id: c.partner_id, level })
  void queryClient.invalidateQueries({ queryKey: [SHARED_DAY_KEY] })
}
const ORDER: readonly Level[] = ['busy', 'titles', 'details']
const lowerOf = (a: Level, b: Level): Level => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b)

async function update(table: string, patch: Record<string, unknown>, match: Record<string, string>): Promise<void> {
  let q = supabase.from(table).update(patch)
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
  const { error } = await q
  if (error) throw error
}

/** Relationship label (Partner / Family / Friend): the label and where new defaults start. Either person may change it. */
export async function setRelation(c: Connection, relation: Relation): Promise<void> {
  patchConnection(c.circle_id, { relation })
  try { await update('circles', { relation }, { id: c.circle_id }) } catch (e) { void queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY }); throw e }
}

/** My own view of one person, on my own member row: the lane on my calendar, her card on Today, her colour. The other side
 * never reads these and they ping nobody. Online-only like the rest of the connection (a stale lane for a second is harmless). */
async function setMine(c: Connection, patch: Partial<Pick<Connection, 'show_lane' | 'show_day' | 'color'>>): Promise<void> {
  patchConnection(c.circle_id, patch)
  try { await update('circle_members', patch, { circle_id: c.circle_id }) } catch (e) { void queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY }); throw e }
}
/** "Show her lane on my calendar". */
export const setLane = (c: Connection, on: boolean): Promise<void> => setMine(c, { show_lane: on })
/** "Show her day on Today". */
export const setDay = (c: Connection, on: boolean): Promise<void> => setMine(c, { show_day: on })
/** Her colour: one of palette C's 16 swatches (the server's check refuses any other). */
export const setColor = (c: Connection, color: string): Promise<void> => setMine(c, { color })

/** Pause for both of us until `until` (an ISO instant or 'infinity'); null resumes. Either person may. */
export async function setPause(c: Connection, until: string | null): Promise<void> {
  patchConnection(c.circle_id, { paused_until: until, paused_by_me: !!until })
  try { await update('circles', { paused_until: until }, { id: c.circle_id }) } catch (e) { void queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY }); throw e }
  void queryClient.invalidateQueries({ queryKey: [SHARED_DAY_KEY] })
}

/** Disconnect: the circle and everything in it go, for both of us, at once. Nothing is kept. */
export async function leaveCircle(c: Connection): Promise<void> {
  const { error } = await supabase.from('circles').delete().eq('id', c.circle_id)
  if (error) throw error
  forgetSeen(c.circle_id)
  queryClient.setQueryData<Connection[]>(CONNECTIONS_KEY, (old) => old?.filter((x) => x.circle_id !== c.circle_id))
  queryClient.removeQueries({ queryKey: [SHARED_DAY_KEY, c.partner_id] })
}

// ── invites ──

export interface Invite { id: string; code: string; relation: Relation; expires_at: string }

export async function createInvite(relation: Relation): Promise<Invite> {
  const { data, error } = await supabase.rpc('share_invite_create', { p_relation: relation })
  if (error) throw error
  void queryClient.invalidateQueries({ queryKey: INVITES_KEY })
  return data as Invite
}

async function fetchInvites(): Promise<Invite[]> {
  const { data, error } = await supabase.from('share_invites').select('id,code,relation,expires_at').is('used_at', null).is('cancelled_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Invite[]
}
export function useInvites() {
  const uid = useAuth().session?.user.id
  return useQuery({ queryKey: INVITES_KEY, queryFn: fetchInvites, enabled: !!uid, staleTime: 30_000 })
}
export async function cancelInvite(id: string): Promise<void> {
  await update('share_invites', { cancelled_at: new Date().toISOString() }, { id })
  void queryClient.invalidateQueries({ queryKey: INVITES_KEY })
}

export type CodeError = 'bad_code' | 'try_later' | 'already_connected'
export interface Peek { ok: true; from_name: string; relation: Relation; level: Level; expires_at: string }
export type PeekResult = Peek | { ok: false; error: CodeError }

/** The confirm screen's facts: who invited me and as what. The same answer for every kind of bad code. */
export async function peekInvite(code: string): Promise<PeekResult> {
  const { data, error } = await supabase.rpc('share_invite_peek', { p_code: code })
  if (error) throw error
  return data as PeekResult
}

export async function acceptInvite(code: string, level?: Level): Promise<{ ok: true; circle_id: string } | { ok: false; error: CodeError }> {
  const { data, error } = await supabase.rpc('share_invite_accept', level ? { p_code: code, p_level: level } : { p_code: code })
  if (error) throw error
  void queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY })
  return data as { ok: true; circle_id: string } | { ok: false; error: CodeError }
}

/** A person's code failed: the words, the same for a wrong, used or out-of-date code (nobody can probe codes). */
export const codeProblem = (e: CodeError): string =>
  e === 'try_later' ? 'Too many tries. Wait 15 minutes, then try again.'
    : e === 'already_connected' ? 'You are already connected with them.'
      : 'That code doesn’t work. It may be used or out of date. Ask for a new one.'

// ── the other person's day (read only, masked by the server) ──

export interface SharedBlock {
  id: string
  starts_at: string
  ends_at: string
  all_day: boolean
  /** Absent when masked (Busy only, or Private). */
  title?: string
  kind?: 'event' | 'time_block' | 'task' | 'external'
  masked?: boolean
  recurrence_rule?: string | null
  recurrence_exdates?: string[] | null
}
export interface SharedTask { id: string; title: string; notes?: string | null; done?: boolean; goal?: boolean }
export interface SharedDay {
  /** null: no connection, a pause, or nothing allowed. */
  level: Level | null
  zone?: string
  now?: string
  blocks?: SharedBlock[]
  top3?: SharedTask[]
  tasks?: SharedTask[]
  paused_until?: string
}

/** One person's day in [from, to), as the lower of your two levels lets you see it. */
export function useSharedDay(partnerId: string | undefined, from: Date, to: Date, enabled = true) {
  const f = from.toISOString(), t = to.toISOString()
  return useQuery({
    queryKey: [SHARED_DAY_KEY, partnerId, f, t],
    enabled: !!partnerId && enabled,
    staleTime: 20_000,
    queryFn: async (): Promise<SharedDay> => {
      const { data, error } = await supabase.rpc('shared_day', { p_owner: partnerId, p_from: f, p_to: t })
      if (error) throw error
      return data as SharedDay
    },
  })
}

// ── what this device has already seen (so a change is told once, in the app) ──

const SEEN_KEY = 'kf-share-seen'
const ended = new Set<string>()
function readSeen(): SeenMap | null {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? 'null') as SeenMap | null } catch { return null }
}
function writeSeen(m: SeenMap): void {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(m)) } catch { /* private window: told again next time */ }
}
function forgetSeen(circleId: string): void {
  ended.add(circleId)
  const m = readSeen()
  if (m && circleId in m) { delete m[circleId]; writeSeen(m) }
}

/** Mounted once in the signed-in shell: toasts what changed on the other side since this device last looked. */
export function useShareNotices(): void {
  const { data } = useConnections()
  useEffect(() => {
    if (!data) return
    const prev = readSeen()
    if (prev) {
      for (const message of notices(prev, data, ended, new Date(), appZone())) useToastStore.getState().push({ message })
    }
    writeSeen(seenOf(data))
  }, [data])
}

export { cachedConnections }
