// Partner sharing P2 (migration 0103): what the app asks and tells the server about status and notices.
// Online-only, like pausing and leaving (api.ts): a status is about right now, the server stamps and caps its times, and
// every notice is built, masked and held there. Nothing here can read another person's rows: the status is the RPC
// `share_status_of` (null for no connection, a lower level, a pause, or status off - it never says which), a notice is
// the recipient's own row of `share_notices` (RLS), already masked.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { useAuth } from '../auth/AuthProvider'
import type { ClearKind, MyStatus, NoticeMode, NoticeSetting, PartnerNotice, Status } from './statusModel'

export const NOTICE_SETTINGS_KEY = ['share_notice_settings'] as const
export const MY_STATUS_KEY = ['share_status_mine'] as const
export const PARTNER_STATUS_KEY = 'shared_status'
export const NOTICES_KEY = ['partner_notices'] as const

// ── my switches: "Show my status to Reem", and each kind of notice ──

export function useNoticeSettings() {
  const uid = useAuth().session?.user.id
  return useQuery({
    queryKey: NOTICE_SETTINGS_KEY,
    enabled: !!uid,
    staleTime: 30_000,
    queryFn: async (): Promise<NoticeSetting[]> => {
      const { data, error } = await supabase.rpc('share_notice_settings')
      if (error) throw error
      return (data ?? []) as NoticeSetting[]
    },
  })
}

const patchSetting = (circleId: string, f: (s: NoticeSetting) => NoticeSetting) =>
  queryClient.setQueryData<NoticeSetting[]>(NOTICE_SETTINGS_KEY, (old) => old?.map((s) => (s.circle_id === circleId ? f(s) : s)))
const reask = (key: readonly unknown[]) => void queryClient.invalidateQueries({ queryKey: key })

export async function setStatusOn(circleId: string, on: boolean): Promise<void> {
  patchSetting(circleId, (s) => ({ ...s, status_on: on }))
  const { error } = await supabase.rpc('share_status_on_set', { p_circle: circleId, p_on: on })
  if (error) { reask(NOTICE_SETTINGS_KEY); throw error }
  reask(MY_STATUS_KEY)
}

export async function setNoticeMode(circleId: string, kind: string, mode: NoticeMode): Promise<void> {
  patchSetting(circleId, (s) => {
    const rest = { ...s.notice_prefs }
    delete rest[kind]
    return { ...s, notice_prefs: mode === 'off' ? rest : { ...rest, [kind]: mode } }
  })
  const { error } = await supabase.rpc('share_notice_pref_set', { p_circle: circleId, p_kind: kind, p_mode: mode })
  if (error) { reask(NOTICE_SETTINGS_KEY); throw error }
}

// ── my status: the Now card's line and its sheet ──

export function useMyStatus(enabled = true) {
  const uid = useAuth().session?.user.id
  return useQuery({
    queryKey: MY_STATUS_KEY,
    enabled: !!uid && enabled,
    staleTime: 20_000,
    refetchInterval: 60_000, // the auto words change when a block starts or ends: nothing is written then
    queryFn: async (): Promise<MyStatus> => {
      const { data, error } = await supabase.rpc('share_status_mine')
      if (error) throw error
      return data as MyStatus
    },
  })
}

/** Own words (null clears them) and when they go. */
export async function setStatusWords(words: string | null, clear: ClearKind): Promise<void> {
  const { error } = await supabase.rpc('share_status_set', { p_words: words, p_clear: clear })
  if (error) throw error
  reask(MY_STATUS_KEY)
}

export async function setStatusAuto(on: boolean): Promise<void> {
  const { error } = await supabase.rpc('share_status_auto', { p_on: on })
  if (error) throw error
  reask(MY_STATUS_KEY)
}

/** The Focus round on this device (until + task), or null when it is over. Best effort: a miss only means the words are late. */
export function sendFocus(until: Date | null, taskId: string | null): void {
  void supabase.rpc('share_status_focus', { p_until: until ? until.toISOString() : null, p_task: taskId }).then(({ error }) => { if (!error) reask(MY_STATUS_KEY) })
}

// ── her status ──

/** What one person says next to their name: null for anything but a live status you may see. */
export function usePartnerStatus(partnerId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [PARTNER_STATUS_KEY, partnerId],
    enabled: !!partnerId && enabled,
    staleTime: 20_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Status | null> => {
      const { data, error } = await supabase.rpc('share_status_of', { p_owner: partnerId })
      if (error) throw error
      return (data ?? null) as Status | null
    },
  })
}

// ── notices: the strip on Today ──

/** The notices waiting for me: released (a held one comes when quiet hours end), not dismissed, not a day old. */
export function usePartnerNotices() {
  const uid = useAuth().session?.user.id
  return useQuery({
    queryKey: NOTICES_KEY,
    enabled: !!uid,
    staleTime: 20_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<PartnerNotice[]> => {
      const now = new Date().toISOString()
      const { data, error } = await supabase.from('share_notices').select('id,circle_id,actor_id,kind,payload,n,release_at')
        .is('dismissed_at', null).lte('release_at', now).gt('expires_at', now).order('release_at', { ascending: true }).limit(20)
      if (error) throw error
      return (data ?? []) as PartnerNotice[]
    },
  })
}

export async function dismissNotices(ids: string[]): Promise<void> {
  queryClient.setQueryData<PartnerNotice[]>(NOTICES_KEY, (old) => old?.filter((n) => !ids.includes(n.id)))
  const { error } = await supabase.from('share_notices').update({ dismissed_at: new Date().toISOString() }).in('id', ids)
  if (error) { reask(NOTICES_KEY); throw error }
}
