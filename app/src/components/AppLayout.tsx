import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { supabase } from '../lib/supabase'
import { useRealtimeSync } from '../lib/realtime'
import { CommandBar } from '../features/command-bar/CommandBar'
import { ChatPanel } from '../features/chat/ChatPanel'
import { SearchOverlay } from '../features/search/SearchOverlay'
import { ToastHost } from './ToastHost'

const navItems = [
  { to: '/today', label: 'Today' },
  { to: '/inbox', label: 'Inbox' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/routines', label: 'Routines' },
  { to: '/weekly-review', label: 'Review' },
  { to: '/settings', label: 'Settings' },
]

export function AppLayout() {
  useRealtimeSync()
  const [chatOpen, setChatOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [])

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <nav className="flex shrink-0 border-b md:w-48 md:flex-col md:border-b-0 md:border-r">
        <div className="hidden px-4 py-4 text-sm font-semibold md:block">Kai's Flow</div>
        <div className="flex flex-1 justify-around md:flex-col md:justify-start md:px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `px-3 py-3 text-sm md:rounded md:py-2 ${isActive ? 'font-semibold text-slate-900' : 'text-slate-500'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
          <button type="button" onClick={() => setSearchOpen(true)} className="px-3 py-3 text-left text-sm text-slate-500 md:rounded md:py-2">
            Search
          </button>
          <button type="button" onClick={() => setChatOpen(true)} className="px-3 py-3 text-left text-sm text-slate-500 md:rounded md:py-2">
            Chat
          </button>
        </div>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="hidden px-4 py-3 text-left text-sm text-slate-500 md:block"
        >
          Sign out
        </button>
      </nav>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
      <CommandBar />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
      <ToastHost />
    </div>
  )
}
