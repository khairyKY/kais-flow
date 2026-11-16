// Your own calendar link (function `calendar-feed`, migration 0096): a private ICS link pasted into Apple Calendar,
// Outlook or Google Calendar. Same rules as the Widget links (./widgetLinks): made here, shown once, only its
// SHA-256 saved — with awaited writes, not the outbox, so a link is never shown before it's stored.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { newCaptureKey, sha256Hex } from './captureKey'

export interface CalendarFeedLinkRow {
  id: string
  label: string
  /** "Include scheduled tasks". */
  include_tasks: boolean
  /** "Show titles": off = every entry reads "Busy". */
  titles: boolean
  created_at: string
  last_used_at: string | null
}

export const CALENDAR_FEED_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/calendar-feed`

/** The two ways to paste it: `https://` for Google and Outlook, `webcal://` for Apple Calendar (opens its Subscribe). */
export const calendarFeedLinks = (token: string): { https: string; webcal: string } => {
  const https = `${CALENDAR_FEED_URL}?t=${token}`
  return { https, webcal: https.replace(/^https?:\/\//, 'webcal://') }
}

export function useCalendarFeedLinks() {
  return useQuery({
    queryKey: ['calendar_feed_links'],
    queryFn: async () => {
      const { data, error } = await supabase.from('calendar_feed_links').select('id, label, include_tasks, titles, created_at, last_used_at').is('revoked_at', null).order('created_at')
      if (error) throw error
      return (data ?? []) as CalendarFeedLinkRow[]
    },
  })
}

const refresh = () => queryClient.invalidateQueries({ queryKey: ['calendar_feed_links'] })

/** Makes a link; resolves to it — the only time it is ever readable. `kf_c_` + 43 base64url characters
 * (the function's TOKEN pattern). */
export async function createCalendarFeedLink(label: string, includeTasks: boolean, titles: boolean): Promise<{ https: string; webcal: string }> {
  const token = newCaptureKey('kf_c_')
  const { error } = await supabase.from('calendar_feed_links').insert({
    id: crypto.randomUUID(),
    token_hash: await sha256Hex(token),
    label: label.trim().slice(0, 60) || 'Calendar',
    include_tasks: includeTasks,
    titles,
  })
  if (error) throw error
  await refresh()
  return calendarFeedLinks(token)
}

/** The calendar app using it gets 401 from its next refresh. */
export async function revokeCalendarFeedLink(id: string): Promise<void> {
  const { error } = await supabase.from('calendar_feed_links').update({ revoked_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
  await refresh()
}
