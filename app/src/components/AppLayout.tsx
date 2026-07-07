import { useEffect, useState, type CSSProperties } from 'react'
import { NavLink, Outlet } from 'react-router'
import { supabase } from '../lib/supabase'
import { useRealtimeSync } from '../lib/realtime'
import { CommandBar } from '../features/command-bar/CommandBar'
import { ChatPanel } from '../features/chat/ChatPanel'
import { SearchOverlay } from '../features/search/SearchOverlay'
import { usePendingInboxItems } from '../features/inbox/api'
import { useTerrariumStore } from '../features/today/terrariumStore'
import { ToastHost } from './ToastHost'
import {
  CalendarIcon,
  ChatIcon,
  InboxIcon,
  MiniCloverIcon,
  ReviewIcon,
  RoutinesIcon,
  SettingsIcon,
  TasksIcon,
  TodayIcon,
} from './icons/NavIcons'

const navItems = [
  { to: '/today', label: 'Today', Icon: TodayIcon },
  { to: '/inbox', label: 'Inbox', Icon: InboxIcon, badge: 'inbox' as const },
  { to: '/tasks', label: 'Tasks', Icon: TasksIcon },
  { to: '/calendar', label: 'Calendar', Icon: CalendarIcon },
  { to: '/routines', label: 'Routines', Icon: RoutinesIcon, badge: 'routinesGarden' as const },
  { to: '/weekly-review', label: 'Review', Icon: ReviewIcon },
]

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])
  return online
}

function TopBar() {
  const online = useOnline()
  const today = new Date()
  const dateLabel = today.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' })

  return (
    <div
      className="app-topbar"
      style={{
        minHeight: 44,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '0 34px',
        borderBottom: '1px dashed var(--border-default)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--fs-mono)',
        letterSpacing: 'var(--ls-mono)',
        textTransform: 'uppercase',
        color: 'var(--text-tertiary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        <span>Kai's Flow</span>
        <span>·</span>
        <span>{dateLabel}</span>
        <span>·</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {online ? 'Synced' : 'Offline'}
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: online ? 'var(--acc-sage)' : 'var(--text-tertiary)',
              display: 'inline-block',
              flex: 'none',
            }}
          />
        </span>
      </div>
      <div style={{ flex: 'none' }}>Africa/Cairo</div>
    </div>
  )
}

function SettingsPopover({ onClose }: { onClose: () => void }) {
  const { on, inToday, toggleOn, toggleInToday } = useTerrariumStore()

  const track = (active: boolean, disabled: boolean): CSSProperties => ({
    position: 'relative',
    width: 38,
    height: 22,
    borderRadius: 'var(--radius-pill)',
    flex: 'none',
    cursor: disabled ? 'default' : 'pointer',
    background: active ? 'var(--acc-sage)' : 'var(--border-default)',
    opacity: disabled ? 0.4 : 1,
    transition: 'background 0.2s',
  })
  const knob = (active: boolean): CSSProperties => ({
    position: 'absolute',
    top: 2,
    left: active ? 18 : 2,
    width: 18,
    height: 18,
    borderRadius: '50%',
    background: 'var(--bg-surface)',
    boxShadow: '0 1px 3px rgba(60,52,38,0.3)',
    transition: 'left 0.2s',
  })

  let hint: string
  if (!on) hint = 'the terrarium is resting — your streak is pressed safely between the pages.'
  else if (inToday) hint = 'the garden greets you at the top of today.'
  else hint = 'the garden lives in the routines panel — today stays compact.'

  return (
    <div
      style={{
        position: 'absolute',
        left: 226,
        top: 310,
        width: 300,
        background: 'var(--bg-surface)',
        border: '1px solid var(--line-card)',
        borderRadius: 'var(--radius-sharp)',
        boxShadow: 'var(--shadow-popover)',
        padding: '18px 18px 16px',
        zIndex: 60,
        transform: 'rotate(0.4deg)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--fs-mono-s)',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
          }}
        >
          Settings · Garden
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)', fontSize: 14, cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}
        >
          ✕
        </button>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 'var(--fw-semibold)', color: 'var(--text-primary)', margin: '6px 0 14px' }}>
        The Terrarium
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px dashed var(--border-dashed)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-body-s)', color: 'var(--text-primary)' }}>Enable The Terrarium</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 2, lineHeight: 1.35 }}>
            Grow a living garden from your activity.
          </div>
        </div>
        <div onClick={toggleOn} style={track(on, false)}>
          <div style={knob(on)} />
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 0',
          borderTop: '1px dashed var(--border-dashed)',
          borderBottom: '1px dashed var(--border-dashed)',
          marginBottom: 10,
          opacity: on ? 1 : 0.45,
          transition: 'opacity 0.2s',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--fs-body-s)', color: 'var(--text-primary)' }}>Show in Today view</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 2, lineHeight: 1.35 }}>
            Off — the garden lives in Routines instead.
          </div>
        </div>
        <div onClick={toggleInToday} style={track(on && inToday, !on)}>
          <div style={knob(on && inToday)} />
        </div>
      </div>

      <div style={{ borderTop: '1px dashed var(--border-dashed)', paddingTop: 10, fontFamily: 'var(--font-hand)', fontSize: 'var(--fs-hand)', color: 'var(--text-secondary)', lineHeight: 'var(--lh-snug)' }}>
        {hint}
      </div>
    </div>
  )
}

export function AppLayout() {
  useRealtimeSync()
  const [chatOpen, setChatOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { data: pendingInbox = [] } = usePendingInboxItems()
  const { on: terrariumOn, inToday: terrariumInToday } = useTerrariumStore()

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === '/' || e.key.toLowerCase() === 'k')) {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setChatOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [])

  const showInRoutinesNav = terrariumOn && !terrariumInToday

  return (
    <div className="app-shell" style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-app)', position: 'relative' }}>
      <style>{`
        @media (max-width: 767px) {
          .app-sidebar { width: 64px !important; padding-top: 14px !important; }
          .app-sidebar-header, .app-nav-label, .app-footer-label, .app-vine { display: none !important; }
          .app-topbar { padding: 0 14px !important; }
          .app-main-content { padding: 20px 16px 40px !important; }
        }
      `}</style>
      <aside
        className="app-sidebar"
        style={{
          width: 238,
          flex: 'none',
          background: 'var(--bg-sidebar)',
          borderRight: '1px dashed var(--line-sidebar)',
          display: 'flex',
          flexDirection: 'column',
          padding: '26px 0 20px',
          position: 'relative',
          zIndex: 5,
        }}
      >
        <div className="app-sidebar-header" style={{ padding: '0 24px 24px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-display-m)', fontWeight: 'var(--fw-semibold)', letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
            Kai's Flow
          </div>
          <div style={{ marginTop: 5, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-mono-s)', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
            Personal · Cairo
          </div>
          <div style={{ marginTop: 8, fontFamily: 'var(--font-hand)', fontSize: 'var(--fs-hand)', color: 'var(--text-secondary)', transform: 'rotate(-1.2deg)' }}>
            a field journal of days ✿
          </div>
        </div>

        <nav style={{ position: 'relative', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span
            aria-hidden="true"
            className="app-vine"
            style={{ position: 'absolute', left: 37, top: 20, bottom: 20, width: 0, borderLeft: '1px dashed var(--line-sidebar)', opacity: 0.55 }}
          />
          {navItems.map(({ to, label, Icon, badge }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) =>
                isActive
                  ? {
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-input)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--line-card)',
                      boxShadow: 'var(--shadow-card)',
                      textDecoration: 'none',
                      position: 'relative',
                      transform: 'rotate(-0.5deg)',
                    }
                  : { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 'var(--radius-input)', textDecoration: 'none', position: 'relative' }
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      style={{
                        position: 'absolute',
                        top: -6,
                        right: 14,
                        width: 34,
                        height: 11,
                        background: 'rgba(181,101,74,0.32)',
                        backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.25) 0 3px, transparent 3px 6px)',
                        transform: 'rotate(3deg)',
                        borderRadius: 1,
                      }}
                    />
                  )}
                  <Icon />
                  <span className="app-nav-label" style={{ fontSize: 'var(--fs-body)', fontWeight: isActive ? 'var(--fw-semibold)' : 'var(--fw-regular)', color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {label}
                  </span>
                  {badge === 'inbox' && pendingInbox.length > 0 && (
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-mono-s)', color: 'var(--acc-terra)' }}>
                      {pendingInbox.length}
                    </span>
                  )}
                  {badge === 'routinesGarden' && showInRoutinesNav && <MiniCloverIcon />}
                </>
              )}
            </NavLink>
          ))}

          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 10px',
              borderRadius: 'var(--radius-input)',
              textDecoration: 'none',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              textAlign: 'left',
              font: 'inherit',
            }}
          >
            <SettingsIcon />
            <span className="app-nav-label" style={{ fontSize: 'var(--fs-body)', color: 'var(--text-secondary)' }}>Settings</span>
          </button>
        </nav>

        {settingsOpen && <SettingsPopover onClose={() => setSettingsOpen(false)} />}

        <div style={{ flex: 1 }} />

        <div style={{ padding: '14px 14px 0', margin: '0 14px', borderTop: '1px dashed var(--line-sidebar)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', borderRadius: 'var(--radius-input)', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
          >
            <span style={{ width: 22 }} />
            <span className="app-footer-label" style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Search</span>
            <span className="app-footer-label" style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-mono-s)', color: 'var(--text-tertiary)' }}>⌘K</span>
          </button>
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 'var(--radius-input)', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
          >
            <ChatIcon />
            <span className="app-footer-label" style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Chat</span>
            <span className="app-footer-label" style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-mono-s)', color: 'var(--text-tertiary)' }}>⌘J</span>
          </button>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', borderRadius: 'var(--radius-input)', marginTop: 2, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
          >
            <span style={{ width: 22 }} />
            <span className="app-footer-label" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Sign out</span>
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar />
        <div className="app-main-content" style={{ flex: 1, minWidth: 0, padding: '30px 40px 64px' }}>
          <Outlet />
        </div>
      </main>

      <CommandBar />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
      <ToastHost />
    </div>
  )
}
