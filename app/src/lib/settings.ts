import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { queryClient } from './queryClient'
import { writeRow } from './outbox'
import type { AppSettings } from './types'

// Singleton row (`id boolean primary key default true`) — nothing seeds it on signup, so a
// fresh account has zero rows until the first setting is ever changed. This mirrors the DB
// column defaults so reads/writes work before that row exists.
const DEFAULT_SETTINGS: AppSettings = {
  id: true as unknown as string,
  timezone: 'Africa/Cairo',
  confidence_threshold: 0.75,
  digest_hour: 8,
  slipping_default_days: 7,
  calendar_day_count: 7,
  notifications_last_seen_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
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

export function updateAppSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  const settings = queryClient.getQueryData<AppSettings>(['app_settings']) ?? DEFAULT_SETTINGS
  writeRow('app_settings', { ...settings, [key]: value })
}
