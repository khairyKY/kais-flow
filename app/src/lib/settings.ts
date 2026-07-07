import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import { queryClient } from './queryClient'
import { writeRow } from './outbox'
import type { AppSettings } from './types'

export function useAppSettings() {
  return useQuery({
    queryKey: ['app_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('*').single()
      if (error) throw error
      return data as AppSettings
    },
  })
}

export function updateAppSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  const settings = queryClient.getQueryData<AppSettings>(['app_settings'])
  if (!settings) return
  writeRow('app_settings', { ...settings, [key]: value })
}
