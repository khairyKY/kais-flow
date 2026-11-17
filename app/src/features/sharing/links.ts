// The no-account share link (function `share-view`, migration 0100 `share_links`): a read-only page of your day for someone
// who won't make an account. Made here, shown once, only its SHA-256 saved (as calendar_feed_links, 0096), awaited writes
// so a link is never shown before it is stored. Busy or Titles; 30 days; renewable in one tap; stopped at once.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { authLinkOrigin } from '../../lib/platform'
import { newCaptureKey, sha256Hex } from '../settings/captureKey'
import { useAuth } from '../auth/AuthProvider'
import { LINKS_KEY } from './api'

export type LinkLevel = 'busy' | 'titles'

export interface ShareLinkRow {
  id: string
  level: LinkLevel
  expires_at: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export const SHARE_VIEW_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/share-view`
export const LINK_DAYS = 30

/** What a person pastes or taps: the app's own page, which asks the function. */
export const viewLinkUrl = (token: string): string => `${authLinkOrigin()}/v/${token}`

/** The token in a /v/<token> address, if it is shaped like one. */
export const TOKEN_RE = /^kf_v_[A-Za-z0-9_-]{43}$/

export function useShareLinks() {
  const uid = useAuth().session?.user.id
  return useQuery({
    queryKey: LINKS_KEY,
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from('share_links').select('id, level, expires_at, last_used_at, revoked_at, created_at').is('revoked_at', null).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ShareLinkRow[]
    },
  })
}

const refresh = () => queryClient.invalidateQueries({ queryKey: LINKS_KEY })

/** Makes a link and resolves to its address: the only time it is ever readable. `kf_v_` + 43 base64url characters. */
export async function createShareLink(level: LinkLevel): Promise<string> {
  const token = newCaptureKey('kf_v_')
  const { error } = await supabase.from('share_links').insert({ id: crypto.randomUUID(), token_hash: await sha256Hex(token), level })
  if (error) throw error
  await refresh()
  return viewLinkUrl(token)
}

/** Stop sharing: the page says "turned off" from its next load. */
export async function stopShareLink(id: string): Promise<void> {
  const { error } = await supabase.from('share_links').update({ revoked_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
  await refresh()
}

/** Renew: 30 days from now, in one tap (the server never goes past that). */
export async function renewShareLink(id: string): Promise<void> {
  const { error } = await supabase.from('share_links').update({ expires_at: new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString() }).eq('id', id)
  if (error) throw error
  await refresh()
}

/** "Runs out in 9 days" · "Ran out 2 days ago" · "Runs out today". */
export function expiryWords(expires: string, now = new Date()): string {
  const days = Math.ceil((Date.parse(expires) - now.getTime()) / 86_400_000)
  if (days < 0) return `Ran out ${-days === 1 ? 'yesterday' : `${-days} days ago`}`
  if (days === 0) return 'Runs out today'
  return days === 1 ? 'Runs out tomorrow' : `Runs out in ${days} days`
}
