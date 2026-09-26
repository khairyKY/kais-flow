import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { del } from 'idb-keyval'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { OUTBOX_KEY, DEAD_KEY, flushOutbox } from '../../lib/outbox'
// Imported here (eagerly) so recovery.ts reads a password-reset link at boot — see that file.
import { forgetRecovery, rememberRecovery } from './recovery'

interface AuthContextValue {
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      // WA-1 punch 1/3: the query cache (and its IndexedDB copy) is keyed per device, not per
      // account. Without this, the next account to sign in on this browser hydrates the previous
      // account's rows — including a stale `app_settings.onboarded_at` that routes a brand-new
      // account straight past onboarding. Clearing on sign-out keeps the stranger flow honest.
      if (event === 'SIGNED_OUT') {
        queryClient.clear()
        void del('kais-flow-query-cache')
        forgetRecovery()
      }
      // J-11: /reset only offers the new-password form to a session that arrived this way.
      if (event === 'PASSWORD_RECOVERY') rememberRecovery()
      // The outbox is NOT cleared here: supabase-js also fires SIGNED_OUT when a refresh token
      // fails, and wiping then would silently discard writes queued before the expiry. They
      // flush when the same account signs back in; the Sign out button clears it on purpose
      // (signOut below). Audit S7's shared-device leak is closed by the owner check instead:
      // a different account must never flush the previous account's rows as its own.
      const uid = newSession?.user.id
      if (uid) {
        const owner = localStorage.getItem(OUTBOX_OWNER_KEY)
        if (owner && owner !== uid) {
          void del(OUTBOX_KEY)
          void del(DEAD_KEY)
          // J-11: an email link (password reset, sign-up confirmation) can swap accounts with
          // no SIGNED_OUT in between — so the cache clear above never ran for this switch.
          queryClient.clear()
          void del('kais-flow-query-cache')
        }
        localStorage.setItem(OUTBOX_OWNER_KEY, uid)
      }
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>
}

const OUTBOX_OWNER_KEY = 'kf-outbox-owner'

/** The Sign out button: push what's queued (best effort), then clear this device's copy of the
 * account — query cache via the SIGNED_OUT listener, outbox + dead letters here (audit S7). */
export async function signOut(): Promise<void> {
  await flushOutbox()
  await Promise.all([del(OUTBOX_KEY), del(DEAD_KEY)])
  localStorage.removeItem(OUTBOX_OWNER_KEY)
  await supabase.auth.signOut()
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
