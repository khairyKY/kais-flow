import { useEffect } from 'react'
import type { Root } from 'react-dom/client'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { persistQueryClientRestore } from '@tanstack/query-persist-client-core'
import { queryClient, idbPersister } from '../../lib/queryClient'
import { AuthProvider, useAuth } from '../auth/AuthProvider'
import { useAppZoneFromSettings } from '../../lib/settings'
import { CommandBar } from '../command-bar/CommandBar'
import { useCommandBarStore } from '../command-bar/commandBarStore'
import { native } from './native'

// tray.html?capture (./entry): the quick-capture popup (src-tauri/src/capture.rs), opened from anywhere by
// the global shortcut. It is the app's own ⌘K bar (CommandBar, floating) in a small borderless window of
// its own, so it works while the main window is hidden in the tray. Enter files through the outbox, as
// everywhere (captureTyped); Esc or a click away hide the window; a "jump" opens the main window there.

export async function mountCapture(root: Root): Promise<void> {
  try {
    await persistQueryClientRestore({ queryClient, persister: idbPersister })
  } catch {
    /* no cache yet: it loads */
  }
  root.render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <Popup />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

function Popup() {
  const { session, loading } = useAuth()
  // Rust drives the bar: `true` on every opening, `false` when the window was hidden by a click away.
  useEffect(() => {
    const w = window as unknown as { __kfCapture?: (on: boolean) => void }
    w.__kfCapture = (on) => {
      useCommandBarStore.getState().setOpen(on)
      if (on) void queryClient.refetchQueries({ type: 'active', stale: true }) // projects added meanwhile
    }
    // Closed from inside (Esc, a line filed): hide the window.
    const off = useCommandBarStore.subscribe((s, prev) => {
      if (prev.open && !s.open) void native('capture_hide')
    })
    return () => {
      delete w.__kfCapture
      off()
    }
  }, [])
  // The window follows the bar's height; the first report also says the page is ready to be shown.
  useEffect(() => {
    if (loading) return
    let told = false
    const report = () => {
      const card = document.querySelector('.kf-overlay-card')
      const height = card ? Math.ceil(card.getBoundingClientRect().height) : 0
      if (!told) {
        told = true
        void native('capture_ready', { height })
      } else if (card) void native('capture_size', { height })
    }
    const ro = new ResizeObserver(report)
    ro.observe(document.body)
    const mo = new MutationObserver(report)
    mo.observe(document.getElementById('root')!, { childList: true, subtree: true })
    report()
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [loading])
  if (loading) return null
  return session ? <SignedIn /> : <SignedOut />
}

function SignedIn() {
  useAppZoneFromSettings()
  return (
    <>
      <JumpOut />
      <CommandBar floating />
    </>
  )
}

/** The bar's "Jump to …" navigates this window's own (memory) router: send it to the main window instead. */
function JumpOut() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (pathname === '/') return
    void native('tray_open', { route: pathname + search })
    navigate('/', { replace: true })
  }, [pathname, search, navigate])
  return null
}

/** Signed out in the app (this window shares its session): nothing to file into. */
function SignedOut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && void native('capture_hide')
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="kf-overlay-card" style={{ padding: '16px 18px', fontFamily: 'var(--font-ui)', color: 'var(--ink-body)', fontSize: 'var(--fs-body-s)' }}>
      Sign in in Kai’s Flow to capture from here.{' '}
      <button type="button" style={{ color: 'var(--acc-lavender-text)', background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }} onClick={() => void native('tray_open', { route: null })}>
        Open Kai’s Flow
      </button>
    </div>
  )
}
