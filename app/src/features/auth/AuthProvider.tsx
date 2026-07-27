import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { del } from 'idb-keyval'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'

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
      }
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
