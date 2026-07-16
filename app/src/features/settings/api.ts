import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

// integrations.data holds provider tokens server-side only (docs/DATA_MODEL.md) — the client
// never selects it, only connection status (provider + last sync).
export interface IntegrationStatus {
  provider: 'google' | 'github'
  updated_at: string
}

export function useIntegrations() {
  return useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('integrations').select('provider, updated_at')
      if (error) throw error
      return data as IntegrationStatus[]
    },
  })
}
