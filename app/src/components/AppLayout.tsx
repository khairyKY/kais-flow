import { NavLink, Outlet } from 'react-router'
import { supabase } from '../lib/supabase'

const navItems = [
  { to: '/today', label: 'Today' },
  { to: '/inbox', label: 'Inbox' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/settings', label: 'Settings' },
]

export function AppLayout() {
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
    </div>
  )
}
