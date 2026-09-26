import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { del } from 'idb-keyval'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { OUTBOX_KEY, DEAD_KEY, flushOutbox, rescueEmptyUserIdWrites, unsyncedChanges } from '../../lib/outbox'
import { dropThisDevicePush } from '../notifications/api'
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
        // Only this account's own dead letters — a different owner's were just deleted above.
        if (!owner || owner === uid) void rescueEmptyUserIdWrites()
      }
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>
}

const OUTBOX_OWNER_KEY = 'kf-outbox-owner'

/** The Sign out button (every one of them goes through `useSignOut`). Pushes what's queued
 * first. If changes are still waiting after that — offline, or the server couldn't be reached —
 * it does NOT sign out: it resolves to how many, so the caller can ask. P0-B (audit 2026-09-26):
 * this used to delete them silently and then fail to sign out offline, leaving the user signed in.
 * With an empty queue, or `discardUnsynced` (the user chose to), it clears this device's copy of
 * the account — query cache via the SIGNED_OUT listener, outbox + dead letters here (audit S7) —
 * and signs out, offline included. A real sign-out also stops this device's push notifications
 * for the account (best-effort, time-boxed, while the session can still delete its row).
 * Resolves to 0 once signed out. */
export async function signOut({ discardUnsynced = false } = {}): Promise<number> {
  await flushOutbox()
  if (!discardUnsynced) {
    const waiting = await unsyncedChanges()
    if (waiting > 0) return waiting
  }
  await dropThisDevicePush()
  await Promise.all([del(OUTBOX_KEY), del(DEAD_KEY)])
  localStorage.removeItem(OUTBOX_OWNER_KEY)
  await endSession()
  return 0
}

/** Revokes the session on the server when it can, and always ends it on this device. */
async function endSession(): Promise<void> {
  if (navigator.onLine) {
    try {
      if (!(await supabase.auth.signOut()).error) return
    } catch {
      /* fall through to the local sign-out below */
    }
  }
  // supabase-js 2.110 keeps the stored session when /logout can't be reached, and
  // `scope: 'local'` calls that same endpoint, so it fails offline too (verified, see the P0-B
  // handoff). Drop the stored session first: signOut then has no token to send, so it clears
  // the rest locally and fires SIGNED_OUT. The server-side session can't be revoked offline,
  // but this device no longer holds its tokens.
  const key = (supabase.auth as unknown as { storageKey?: string }).storageKey
  if (key) localStorage.removeItem(key)
  await supabase.auth.signOut({ scope: 'local' })
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
