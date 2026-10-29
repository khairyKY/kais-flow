// Desktop widgets (Rainmeter skins; function `widget`, migration 0090): Widget links — a token in a URL that
// reads today's plan, pasted into a skin. Same rules as the AI key (./mcpKey): made here, shown once, only
// its SHA-256 saved — with awaited writes, not the outbox, so a link is never shown before it's stored.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { newCaptureKey, sha256Hex } from './captureKey'

export interface WidgetLinkRow {
  id: string
  label: string
  /** "Allow ticking": the link may also complete a task. */
  can_tick: boolean
  created_at: string
  last_used_at: string | null
}

export const WIDGET_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/widget`
export const widgetLink = (token: string): string => `${WIDGET_URL}?t=${token}`

export function useWidgetLinks() {
  return useQuery({
    queryKey: ['widget_links'],
    queryFn: async () => {
      const { data, error } = await supabase.from('widget_links').select('id, label, can_tick, created_at, last_used_at').is('revoked_at', null).order('created_at')
      if (error) throw error
      return (data ?? []) as WidgetLinkRow[]
    },
  })
}

const refresh = () => queryClient.invalidateQueries({ queryKey: ['widget_links'] })

/** Makes a link; resolves to it — the only time it is ever readable. `kf_w_` + 43 base64url characters
 * (the function's TOKEN pattern). */
export async function createWidgetLink(label: string, canTick: boolean): Promise<string> {
  const token = newCaptureKey('kf_w_')
  const { error } = await supabase.from('widget_links').insert({ id: crypto.randomUUID(), token_hash: await sha256Hex(token), label: label.trim().slice(0, 60) || 'Desktop', can_tick: canTick })
  if (error) throw error
  await refresh()
  return widgetLink(token)
}

export async function setWidgetTicking(id: string, on: boolean): Promise<void> {
  const { error } = await supabase.from('widget_links').update({ can_tick: on }).eq('id', id)
  if (error) throw error
  await refresh()
}

/** The skin using it gets 401 from its next fetch. */
export async function revokeWidgetLink(id: string): Promise<void> {
  const { error } = await supabase.from('widget_links').update({ revoked_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
  await refresh()
}
