import { Suspense, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router'
import { PageFallback } from './Stub'
import { supabase } from '../lib/supabase'
import { useRealtimeSync } from '../lib/realtime'
import { useTheme } from '../lib/theme'
import { CommandBar } from '../features/command-bar/CommandBar'
import { useCommandBarStore } from '../features/command-bar/commandBarStore'
import { ChatPanel } from '../features/chat/ChatPanel'
import { SearchOverlay } from '../features/search/SearchOverlay'
import { usePendingInboxItems } from '../features/inbox/api'
import { useTasks } from '../features/tasks/api'
import { filterByList, type SmartList } from '../features/tasks/grouping'
import { useRoutines, useRoutineCompletions } from '../features/routines/api'
import { computeStreak } from '../features/routines/streaks'
import { ToastHost } from './ToastHost'
import { ShortcutOverlay } from './ShortcutOverlay'

// ── Design source of truth: Editor.dc.html option 1a (expanded, Plan open) +
// 1g (Plan folded / rail collapsed). Sidebar groups Plan (drawer) · Tend ·
// Cultivate; later surfaces (Projects, People, Activity) placed per the newer
// files' sidebars (Projects/People/Activity.dc.html). Colored dot per surface
// accent when inactive; the species PNG the design shows when active. ──

const A = '/ds/assets'

type NavItem = {
  to: string
  label: string
  dot: string // accent CSS var for the resting dot
  img?: string // always-shown species PNG (design shows Journal's fern this way)
  activeImg?: string // species PNG shown only when the row is active
  badge?: 'inbox'
}

const TEND: NavItem[] = [
  { to: '/today', label: 'Today', dot: '--acc-sage', activeImg: `${A}/clover/awake.png` },
  { to: '/inbox', label: 'Inbox', dot: '--acc-hydrangea', badge: 'inbox' },
  { to: '/tasks', label: 'Tasks', dot: '--acc-blossom', activeImg: `${A}/cherry/bloom.png` },
  { to: '/calendar', label: 'Calendar', dot: '--acc-lavender' },
  { to: '/projects', label: 'Projects', dot: '--acc-moss' },
]

const CULTIVATE: NavItem[] = [
  { to: '/routines', label: 'Routines', dot: '--acc-moss' },
  { to: '/weekly-review', label: 'Review', dot: '--acc-buttercream' },
  { to: '/journal', label: 'Journal', dot: '--acc-buttercream', img: `${A}/fern/full.png` },
  { to: '/people', label: 'People', dot: '--acc-clover' },
  { to: '/activity', label: 'Activity', dot: '--acc-gold' },
]

const smartLists: { list: SmartList; label: string }[] = [
  { list: 'today', label: 'Due Today' },
  { list: 'week', label: 'This Week' },
  { list: 'month', label: 'This Month' },
  { list: 'upcoming', label: 'Upcoming' },
]

// The Plan drawer — Editor 1a. Foldable; count keeps whispering when folded (1g).
function PlanDrawer() {
  const { data: tasks = [] } = useTasks()
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  const activeList = pathname === '/tasks' ? params.get('list') : null
  const [open, setOpen] = useState(() => localStorage.getItem('kf.planOpen') !== '0')
  useEffect(() => {
    localStorage.setItem('kf.planOpen', open ? '1' : '0')
  }, [open])

  const todayCount = filterByList(tasks, 'today').length

  const row = (to: string, label: string, active: boolean, count?: number, icon?: React.ReactNode) => (
    <Link
      key={to}
      to={to}
      className={`kf-side-row${active ? ' kf-active' : ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '6px 11px',
        borderRadius: 6,
        textDecoration: 'none',
        background: active ? 'var(--paper-parchment)' : 'none',
        border: active ? '1px solid var(--line-card)' : '1px solid transparent',
      }}
    >
      <span style={{ width: 16, flex: 'none', display: 'flex', justifyContent: 'center' }}>{icon}</span>
      <span style={{ fontSize: 13, color: active ? 'var(--ink-body)' : 'var(--ink-muted)' }}>{label}</span>
      {count != null && (
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)' }}>{count}</span>
      )}
    </Link>
  )

  return (
    <div
      className="app-smartlist"
      style={{ padding: '0 14px 12px', margin: '0 0 10px', borderBottom: '1px dashed var(--line-sidebar)', display: 'flex', flexDirection: 'column', gap: 1 }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          width: '100%',
          padding: '7px 11px',
          marginBottom: 3,
          borderRadius: 6,
          background: 'var(--paper-linen)',
          border: '1px solid var(--line-sidebar)',
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        <img src={`${A}/vine/sprouting.png`} alt="" style={{ height: 15, width: 'auto' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>Plan</span>
        <span
          aria-hidden="true"
          className="kf-plan-chevron"
          style={{ fontSize: 10, color: 'var(--ink-faint)', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform var(--dur-quick) var(--ease-spring)' }}
        >
          ›
        </span>
        {!open && todayCount > 0 && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)' }}>{todayCount}</span>
        )}
      </button>
      {open && (
        <>
          {smartLists.map(({ list, label }) => row(`/tasks?list=${list}`, label, activeList === list, filterByList(tasks, list).length))}
          <div style={{ height: 1, borderTop: '1px dashed var(--line-sidebar)', margin: '4px 11px' }} />
          {row('/tasks?list=someday', 'Someday', activeList === 'someday', filterByList(tasks, 'someday').length, (
            <img src={`${A}/fern/coil.png`} alt="" style={{ height: 14, opacity: 0.8 }} />
          ))}
          {row('/planning', 'Planning board', pathname === '/planning', undefined, (
            <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>▦</span>
          ))}
        </>
      )}
    </div>
  )
}

function NavRow({ item, pendingInbox }: { item: NavItem; pendingInbox: number }) {
  const icon = (active: boolean) => {
    if (item.img) return <img src={item.img} alt="" style={{ height: 16, opacity: 0.85 }} />
    if (active && item.activeImg) return <img src={item.activeImg} alt="" style={{ height: 16 }} />
    return <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(${item.dot})` }} />
  }
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) => `kf-side-row${isActive ? ' kf-active' : ''}`}
      style={({ isActive }) => ({
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '8px 12px',
        borderRadius: 6,
        textDecoration: 'none',
        background: isActive ? 'var(--paper-parchment)' : 'none',
        border: isActive ? '1px solid var(--line-card)' : '1px solid transparent',
        boxShadow: isActive ? 'var(--shadow-crisp)' : 'none',
        transform: isActive ? 'rotate(-0.5deg)' : 'none',
      })}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: -6,
                left: 16,
                width: 30,
                height: 9,
                background: 'rgba(138,154,126,0.5)',
                backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 3px, transparent 3px 6px)',
                transform: 'rotate(-3deg)',
                borderRadius: 1,
              }}
            />
          )}
          <span className="kf-nav-icon" style={{ width: 18, display: 'flex', justifyContent: 'center', flex: 'none' }}>{icon(isActive)}</span>
          <span className="app-nav-label" style={{ fontSize: 14, fontWeight: isActive ? 600 : 400, color: isActive ? 'var(--ink-body)' : 'var(--ink-muted)' }}>
            {item.label}
          </span>
          {item.badge === 'inbox' && pendingInbox > 0 && (
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--acc-terra)' }}>{pendingInbox}</span>
          )}
        </>
      )}
    </NavLink>
  )
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-nav-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-hairline)', padding: '12px 12px 5px' }}>
      {children}
    </div>
  )
}

// Overall streak across active routines — Editor 1a footer widget, real data.
// Vine stage by streak length: bare / sprouting / flowering / lush (growth system).
function StreakWidget() {
  const { data: routines = [] } = useRoutines()
  const { data: completions = [] } = useRoutineCompletions()

  const { current, best } = useMemo(() => {
    const byRoutine = new Map<string, string[]>()
    for (const c of completions) {
      const arr = byRoutine.get(c.routine_id) ?? []
      arr.push(c.completed_on)
      byRoutine.set(c.routine_id, arr)
    }
    let current = 0
    let best = 0
    for (const r of routines) {
      if (!r.active) continue
      const s = computeStreak(byRoutine.get(r.id) ?? [], r.cadence)
      current = Math.max(current, s.current)
      best = Math.max(best, s.best)
    }
    return { current, best }
  }, [routines, completions])

  const stage = current >= 30 ? 'lush' : current >= 7 ? 'flowering' : current >= 1 ? 'sprouting' : 'bare'

  return (
    <div
      className="app-vine"
      style={{ margin: '0 22px 12px', padding: '12px 0', borderTop: '1px dashed var(--line-sidebar)', borderBottom: '1px dashed var(--line-sidebar)', display: 'flex', alignItems: 'center', gap: 10 }}
    >
      <img src={`${A}/vine/${stage}.png`} alt="" style={{ height: 40, width: 'auto', filter: 'var(--shadow-drop-sm)' }} />
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Streak</div>
        <div style={{ fontSize: 13, color: 'var(--ink-body)', marginTop: 1 }}>
          {current} {current === 1 ? 'day' : 'days'} · best {best}
        </div>
      </div>
    </div>
  )
}

// Footer utility icons — inline verbatim from Editor 1a.
const PlusGlyph = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
)
const SearchGlyph = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="11" cy="11" r="6.4" /><path d="M19.5 19.5 16 16" /></svg>
)
const ChatGlyph = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 4.5H4a1 1 0 0 0-1 1V16a1 1 0 0 0 1 1h3v3.2L11.2 17H20a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1Z" /></svg>
)
const GearGlyph = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.1" /><path d="M12 2.6v2.4M12 19v2.4M4.4 7.2l2.1 1.2M17.5 15.6l2.1 1.2M4.4 16.8l2.1-1.2M17.5 8.4l2.1-1.2" /></svg>
)
const SignOutGlyph = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 4.5H5.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h4M15 8l4 4-4 4M19 12H9" /></svg>
)

function footerRow(icon: React.ReactNode, label: string, shortcut: string | undefined, onClick: () => void, faint = false) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="kf-side-row"
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: faint ? '6px 12px' : '7px 12px', borderRadius: 6, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
    >
      <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: faint ? 'var(--ink-faint)' : 'var(--ink-muted)' }}>{icon}</span>
      <span className="app-footer-label" style={{ fontSize: faint ? 12.5 : 13.5, color: faint ? 'var(--ink-faint)' : 'var(--ink-muted)' }}>{label}</span>
      {shortcut && <span className="app-footer-label" style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-faint)' }}>{shortcut}</span>}
    </button>
  )
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

// Topbar sync strip — States.dc.html 2a. Synced ● (sage) / Offline ◌.
// ponytail: live "Syncing ↻ N" / "N saved here" needs a reactive outbox pending
// count the queue doesn't yet expose; wired in the States pass (X5).
function TopBar() {
  const online = useOnline()
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' })
  return (
    <div
      className="app-topbar"
      style={{ height: 42, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 40px', borderBottom: '1px dashed var(--line-solid)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        <span>Kai's Flow · {dateLabel} · {online ? 'Synced' : 'Offline'}</span>
        {online ? (
          <span style={{ color: 'var(--acc-sage)' }}>●</span>
        ) : (
          <span style={{ color: 'var(--ink-faint)' }}>◌</span>
        )}
      </div>
      <div style={{ flex: 'none' }}>Africa/Cairo</div>
    </div>
  )
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export function AppLayout() {
  useRealtimeSync()
  const { pathname } = useLocation()
  const [chatOpen, setChatOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('kf.sidebarCollapsed') === '1')
  useEffect(() => {
    localStorage.setItem('kf.sidebarCollapsed', collapsed ? '1' : '0')
  }, [collapsed])

  const setCommandBarOpen = useCommandBarStore((s) => s.setOpen)
  const { data: pendingInbox = [] } = usePendingInboxItems()
  const theme = useTheme((s) => s.theme)
  const toggleTheme = useTheme((s) => s.toggle)

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setChatOpen((v) => !v)
      }
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'n') {
        e.preventDefault()
        setCommandBarOpen(true)
      }
      if (e.key === '?') {
        e.preventDefault()
        setShortcutsOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [setCommandBarOpen])

  return (
    <div className="app-shell" style={{ minHeight: '100vh', display: 'flex', background: 'var(--paper-linen)', position: 'relative' }}>
      <style>{`
        @media (max-width: 767px) {
          .app-sidebar { width: 64px !important; padding-top: 14px !important; }
          .app-sidebar-header, .app-nav-label, .app-footer-label, .app-vine, .app-smartlist { display: none !important; }
          .app-topbar { padding: 0 16px !important; }
          .app-main-content { padding: 20px 16px 40px !important; }
        }
        .app-sidebar.collapsed { width: 64px !important; }
        .app-sidebar.collapsed .app-sidebar-header,
        .app-sidebar.collapsed .app-nav-label,
        .app-sidebar.collapsed .app-footer-label,
        .app-sidebar.collapsed .app-vine,
        .app-sidebar.collapsed .app-smartlist { display: none !important; }

        .kf-side-row {
          transition: transform var(--dur-quick) var(--ease-spring),
                      background-color var(--dur-normal) var(--ease-natural),
                      color var(--dur-normal) var(--ease-natural);
        }
        .kf-side-row:hover { background: var(--paper-bone) !important; transform: translateX(3px); }
        .kf-side-row:active { transform: translateX(1px); }
        .kf-side-row.kf-active:hover { background: var(--paper-parchment) !important; }
        .kf-side-row:hover .kf-nav-icon { animation: cloverSway 1.6s var(--ease-natural) infinite; transform-origin: 50% 100%; }

        .kf-collapse-btn {
          transition: transform var(--dur-quick) var(--ease-spring),
                      color var(--dur-normal) var(--ease-natural);
        }
        .kf-collapse-btn:hover { transform: scale(1.15); color: var(--ink-muted); }
        .kf-collapse-btn:active { transform: scale(0.97); }
      `}</style>

      <aside
        className={`app-sidebar${collapsed ? ' collapsed' : ''}`}
        style={{ width: 242, flex: 'none', background: 'var(--paper-sidebar)', borderRight: '1px solid var(--line-sidebar)', display: 'flex', flexDirection: 'column', padding: '24px 0 18px', position: 'relative', zIndex: 5 }}
      >
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="kf-collapse-btn"
          style={{ position: 'absolute', top: 20, right: -12, width: 24, height: 24, borderRadius: '50%', border: '1px solid var(--line-card)', background: 'var(--paper-parchment)', boxShadow: 'var(--shadow-crisp)', color: 'var(--ink-faint)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 45 }}
        >
          {collapsed ? '›' : '‹'}
        </button>

        <div className="app-sidebar-header" style={{ padding: '0 22px 14px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink-body)' }}>Kai's Flow</div>
          <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Personal · Cairo</div>
          <div style={{ marginTop: 7, fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-muted)', transform: 'rotate(-1.2deg)' }}>a field journal of days ✿</div>
        </div>

        <PlanDrawer />

        <nav style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <GroupLabel>Tend</GroupLabel>
          {TEND.map((item) => (
            <NavRow key={item.to} item={item} pendingInbox={pendingInbox.length} />
          ))}
          <GroupLabel>Cultivate</GroupLabel>
          {CULTIVATE.map((item) => (
            <NavRow key={item.to} item={item} pendingInbox={pendingInbox.length} />
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        <StreakWidget />

        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {footerRow(PlusGlyph, 'Capture', '⌘K', () => setCommandBarOpen(true))}
          {footerRow(SearchGlyph, 'Search', '⌘/', () => setSearchOpen(true))}
          {footerRow(ChatGlyph, 'Chat', '⌘J', () => setChatOpen(true))}
          <NavLink
            to="/settings"
            className="kf-side-row"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 6, textDecoration: 'none' }}
          >
            <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: 'var(--ink-muted)' }}>{GearGlyph}</span>
            <span className="app-footer-label" style={{ fontSize: 13.5, color: 'var(--ink-muted)' }}>Settings</span>
          </NavLink>
          {footerRow(theme === 'night' ? SunGlyph : MoonGlyph, theme === 'night' ? 'Day' : 'Night', undefined, toggleTheme, true)}
          {footerRow(SignOutGlyph, 'Sign out', undefined, () => void supabase.auth.signOut(), true)}
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar />
        <div className="app-main-content" style={{ flex: 1, minWidth: 0, padding: '30px 40px 64px' }}>
          <Suspense fallback={<PageFallback />}>
            <div key={pathname} className="kf-route">
              <Outlet />
            </div>
          </Suspense>
        </div>
      </main>

      <CommandBar />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
      <ShortcutOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ToastHost />
    </div>
  )
}

// Day/Night toggle glyphs (footer). ponytail: interim home; W7 Settings appearance
// gets the canonical control per the export — both bind the same useTheme store.
const MoonGlyph = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.2 6.2 0 0 0 10.5 10.5Z" /></svg>
)
const SunGlyph = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></svg>
)
