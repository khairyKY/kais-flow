import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { queryClient } from './queryClient'
import { writeRow } from './outbox'
import { flowName, workspaceName } from './owner'
import { DEFAULT_ZONE, deviceZone, isZone, useSyncAppZone } from './appZone'
import { useToastStore } from './toastStore'
import type { AppSettings } from './types'

// Singleton row (`id boolean primary key default true`) — nothing seeds it on signup, so a
// fresh account has zero rows until the first setting is ever changed. This mirrors the DB
// column defaults so reads/writes work before that row exists.
const DEFAULT_SETTINGS: AppSettings = {
  id: true as unknown as string,
  timezone: DEFAULT_ZONE,
  confidence_threshold: 0.75,
  digest_hour: 8,
  slipping_default_days: 7,
  calendar_day_count: 7,
  notifications_last_seen_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  display_name: null,
  workspace_name: 'Personal',
  seed_avatar: null,
  onboarded_at: null,
}

export function useAppSettings() {
  return useQuery({
    queryKey: ['app_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('*').maybeSingle()
      if (error) throw error
      return (data as AppSettings | null) ?? DEFAULT_SETTINGS
    },
  })
}

/** The shell's owner labels from the onboarding answers (lib/owner.ts). `pending` is true only
 * while the very first read is in flight (a persisted cache skips it) — the shell hides the text
 * meanwhile rather than flash the fallback name at someone else. A failed read, or one paused
 * because the device is offline, shows the fallback. */
export function useOwner(): { flow: string; workspace: string; pending: boolean } {
  const { data, isPending, fetchStatus } = useAppSettings()
  return {
    flow: flowName(data?.display_name),
    workspace: workspaceName(data?.workspace_name),
    pending: isPending && fetchStatus === 'fetching',
  }
}

/** The day-count views both calendars have (Settings → Calendar → Opens on). */
export type CalendarDefaultView = 'day' | '3day' | 'week'
export const CALENDAR_DEFAULT_VIEWS: readonly CalendarDefaultView[] = ['day', '3day', 'week']

/** A stored `calendar_default_view`, or null when it was never chosen (or isn't one we know). */
export function parseCalendarDefaultView(raw: unknown): CalendarDefaultView | null {
  return CALENDAR_DEFAULT_VIEWS.includes(raw as CalendarDefaultView) ? (raw as CalendarDefaultView) : null
}

/** The view a calendar opens on: the synced choice, else `platformDefault` (desktop 'week', phone
 * 'day'). `undefined` while the settings row is still loading — open on the platform default and
 * switch once this resolves (CalendarPage's DesktopCalendar shows how). */
export function useCalendarDefaultView(platformDefault: CalendarDefaultView): CalendarDefaultView | undefined {
  const { data } = useAppSettings()
  return data ? (parseCalendarDefaultView(data.calendar_default_view) ?? platformDefault) : undefined
}

export function updateAppSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  const settings = queryClient.getQueryData<AppSettings>(['app_settings']) ?? DEFAULT_SETTINGS
  writeRow('app_settings', { ...settings, [key]: value })
}

/** User time zones: keeps lib/appZone on the signed-in user's app_settings.timezone (RequireAuth
 * runs it, so the shell and the tray flyout both follow it). */
export function useAppZoneFromSettings(): void {
  const { data } = useAppSettings()
  useSyncAppZone(data?.timezone)
}

/** Offer this device's zone? Only while the account still has the default (it never chose one),
 * the device is somewhere else, and this device hasn't asked before. */
export function shouldOfferDeviceZone(stored: string, device: string, offered: boolean): boolean {
  return !offered && stored === DEFAULT_ZONE && device !== stored && isZone(device)
}

/** Once per device and account: "Your device is in Europe/London — use it?" — never a silent
 * change. Waits for the server's row (not a cached default the user already changed elsewhere). */
export function useOfferDeviceZone(uid: string | undefined): void {
  const { data, isFetching } = useAppSettings()
  useEffect(() => {
    if (!uid || !data || isFetching) return
    const key = `kf-tz-offered:${uid}`
    const device = deviceZone()
    try {
      if (!shouldOfferDeviceZone(data.timezone, device, localStorage.getItem(key) === '1')) return
      localStorage.setItem(key, '1')
    } catch {
      return // no storage: "once" can't be kept, so don't ask at all
    }
    useToastStore.getState().push({
      message: `Your device is in ${device} — use it?`,
      action: { label: 'Use it', run: () => updateAppSetting('timezone', device) },
    })
  }, [uid, data, isFetching])
}
