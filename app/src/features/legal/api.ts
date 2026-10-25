import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { writeRow } from '../../lib/outbox'
import { signOut } from '../auth/AuthProvider'
import { CURRENT, outdated, type LegalDoc } from '../../../../supabase/functions/_shared/legal.ts'

// Terms of Use + Privacy Policy (docs/LEGAL.md): where they are, who agreed to which version (0083
// `consents`), and leaving — Delete account. The versions live in supabase/functions/_shared/legal.ts;
// the links and sign-up's metadata in ./LegalLinks (light, for the sign-in page).

export interface Consent {
  id: string
  document: LegalDoc
  version: string
  accepted_at: string
}

export function useConsents() {
  return useQuery({
    queryKey: ['consents'],
    queryFn: async () => {
      const { data, error } = await supabase.from('consents').select('id, document, version, accepted_at')
      if (error) throw error
      return data as Consent[]
    },
  })
}

/** The documents to agree to; null while that isn't known (loading, offline with nothing cached, an
 * error) — the app never blocks on not knowing. */
export function useOutdated(): LegalDoc[] | null {
  const { data } = useConsents()
  // The mock build (`--mode mock`, the browser harnesses' fake backend) answers every table with no rows,
  // so the notice would cover every page there; it shows only when a harness asks (kf-mock-legal).
  if (import.meta.env.MODE === 'mock' && !mockAsks()) return null
  return data ? outdated(data) : null
}

function mockAsks(): boolean {
  try { return localStorage.getItem('kf-mock-legal') === '1' } catch { return false }
}

/** "I agree": one row per document, at its current version. */
export function agreeToCurrent(docs: readonly LegalDoc[]): void {
  const accepted_at = new Date().toISOString()
  for (const document of docs) writeRow('consents', { id: crypto.randomUUID(), document, version: CURRENT[document], accepted_at })
}

/** Deletes the account for good (function `delete-account`), then this device's copy of it. Google
 * first, best effort, so the busy events it wrote leave the person's Google Calendar too. (Settings'
 * api loads only then: the notice that offers this sits in the app shell.) */
export async function deleteAccount(): Promise<void> {
  const { data: google } = await supabase.from('integrations').select('provider').eq('provider', 'google')
  if (google?.length) {
    const { disconnectGoogle } = await import('../settings/api')
    await disconnectGoogle().catch(() => undefined)
  }
  const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } })
  if (error) throw error
  await signOut({ discardUnsynced: true })
}
