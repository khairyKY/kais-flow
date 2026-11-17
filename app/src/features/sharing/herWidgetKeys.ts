// The her-day widget key (Rainmeter skin; function `share-widget`, migration 0104 `share_widget_links`): a key you make for ONE
// person you are connected with, pasted into the skin once. It shows only their day, at the level you both allow, and never
// anything of yours. Made here, shown once, only its SHA-256 saved (as the Widget link, ../settings/widgetLinks), awaited writes
// so a key is never shown before it is stored. Stop works at once, and a disconnect stops it for good (the server does that).
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { newCaptureKey, sha256Hex } from '../settings/captureKey'
import { useAuth } from '../auth/AuthProvider'

export interface HerWidgetKeyRow {
  id: string
  owner_id: string
  label: string
  created_at: string
  last_used_at: string | null
}

export const HER_WIDGET_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/share-widget`
export const herWidgetLink = (token: string): string => `${HER_WIDGET_URL}?t=${token}`
export const HER_KEYS = ['share_widget_links'] as const

export function useHerWidgetKeys() {
  const uid = useAuth().session?.user.id
  return useQuery({
    queryKey: HER_KEYS,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from('share_widget_links').select('id, owner_id, label, created_at, last_used_at').is('revoked_at', null).order('created_at')
      if (error) throw error
      return (data ?? []) as HerWidgetKeyRow[]
    },
  })
}

const refresh = () => queryClient.invalidateQueries({ queryKey: HER_KEYS })

/** Makes a key for `ownerId`'s day; resolves to the link to paste - the only time it is ever readable. `kf_p_` + 43 base64url characters. */
export async function createHerWidgetKey(ownerId: string, label: string): Promise<string> {
  const token = newCaptureKey('kf_p_')
  const { error } = await supabase.from('share_widget_links').insert({ id: crypto.randomUUID(), owner_id: ownerId, token_hash: await sha256Hex(token), label: label.trim().slice(0, 60) || 'Desktop' })
  if (error) throw error
  await refresh()
  return herWidgetLink(token)
}

/** Stop this key: the skin gets 410 from its next fetch and clears. It can't be turned back on. */
export async function stopHerWidgetKey(id: string): Promise<void> {
  const { error } = await supabase.from('share_widget_links').update({ revoked_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
  await refresh()
}
