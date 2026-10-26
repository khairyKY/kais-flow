import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { CaptureButton } from '../features/capture/CaptureButton'
import { useEscapeStack } from '../lib/overlayStack'
import { useMotionEnabled } from '../lib/motion'
import { Icon } from './Icon'
import type { IconName } from './icons/kf'
import './kit.css'

// Pixel contract: MK Tab Bar.dc.html + DS-CHANGELOG §3 "Tab bar" (2026-09-28 refresh — replaces the
// Navigation Reference's 9px dots and the 2026-09-27 botanical-glyph stopgap): 64 + gesture inset ·
// Today · Inbox · capture · Calendar · More · kf icons 24 · labels Inter 12/16 · the page you're on
// gets a 56×32 pill in its surface's block tint · badge 1 · 12 · 99+ · re-tap = scroll to top.
// Plus its "More" sheet. The shell owns this; feature pages never render their own copy.

/** One tab. Exported so /design-system can show each state signed-out. */
export function TabItem({ label, icon, tint, active, badge = 0, to, onClick, tour }: { label: string; icon: IconName; tint: string; active: boolean; badge?: number; to?: string; onClick?: () => void; tour?: string }) {
  const motionOn = useMotionEnabled()
  const inner = (
    <>
      <span className="kf-tab-ind" style={{ backgroundColor: active ? tint : undefined }}>
        <Icon name={icon} size={24} />
        {badge > 0 && <span className="kf-tab-badge">{badge > 99 ? '99+' : badge}</span>}
      </span>
      <span className="kf-tab-label">{label}</span>
    </>
  )
  const name = badge > 0 ? `${label}, ${badge} waiting` : undefined
  if (!to) {
    return (
      <button type="button" className="kf-tab" data-active={active || undefined} data-tour={tour} aria-label={name} aria-haspopup="dialog" onClick={onClick}>
        {inner}
      </button>
    )
  }
  return (
    <Link
      to={to}
      // Tabs swap the page rather than stack it: Back never walks through tab history.
      replace
      className="kf-tab"
      data-active={active || undefined}
      aria-current={active ? 'page' : undefined}
      aria-label={name}
      onClick={(e) => {
        if (!active) return
        // Re-tap the tab you're on = back to the top (a no-op when already there).
        e.preventDefault()
        const main = document.querySelector('.app-main-content')
        if (main && main.scrollTop > 0) main.scrollTo({ top: 0, behavior: motionOn ? 'smooth' : 'auto' })
      }}
    >
      {inner}
    </Link>
  )
}

// The sheet's rows, in polish-f1's order (Tasks and Projects lead — the tab bar has no slot for them —
// then the export's rows, then Focus, Activity and Trash). Settings build (Kai 2026-10-26, "the new icons
// didn't land on the phone version"): each row wears the sidebar's own kf line icon (AppLayout NAV,
// Sidebar options.html icons A) — no watercolour species, flower glyphs or dots left on the phone.
const MORE_ITEMS: { to: string; label: string; icon: IconName; badge?: boolean }[] = [
  { to: '/tasks', label: 'Tasks', icon: 'tasks' },
  { to: '/projects', label: 'Projects', icon: 'projects' },
  { to: '/routines', label: 'Routines', icon: 'routines' },
  { to: '/inbox', label: 'Inbox', icon: 'inbox', badge: true },
  { to: '/weekly-review', label: 'Review', icon: 'clipboard' },
  { to: '/journal', label: 'Journal', icon: 'journal' },
  { to: '/library', label: 'Library', icon: 'library' },
  { to: '/people', label: 'People', icon: 'people' },
  // Tour & help 14i: the Guide waits in More, beside Settings.
  { to: '/guide', label: 'Guide', icon: 'guide' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
  { to: '/focus', label: 'Focus', icon: 'focus' },
  { to: '/activity', label: 'Activity', icon: 'activity' },
  { to: '/trash', label: 'Trash', icon: 'delete' },
]

const footBtn = { flex: 1, minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-muted)', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' } as const

function MoreSheet({ pendingInbox, onClose, onSearch, onChat, onSignOut }: { pendingInbox: number; onClose: () => void; onSearch: () => void; onChat: () => void; onSignOut: () => void }) {
  useEscapeStack(true, onClose)
  const { pathname } = useLocation()
  return (
    <div className="kf-scrim" style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div
        className="kf-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="More"
        style={{ width: '100%', background: 'var(--paper-parchment)', borderTop: '1px solid var(--line-card)', borderRadius: 'var(--sheet-radius) var(--sheet-radius) 0 0', boxShadow: 'var(--shadow-sheet)', padding: '18px 16px calc(18px + env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Three columns where three fit, two where they don't (the export's caption for this
            sheet says "2-column grid"; its card draws three at 500px). A fixed repeat(3, 1fr)
            overflowed: at a 125% interface size (lib/uiScale.ts; the phone default was 125% until F2b) a 390px phone lays out
            ~312 CSS px, so the right column ran past the screen edge — worse once "Projects"
            joined (polish-c). 112px is the widest row's content (icon + "Projects"/"Routines");
            the ellipsis below is only a last resort for extreme zooms. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 10 }}>
          {MORE_ITEMS.map((item) => {
            // The page you're on: the sidebar's active row (frosted at night, parchment by day), ink icon.
            const on = pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                aria-current={on ? 'page' : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, minHeight: 48, boxSizing: 'border-box', background: on ? 'var(--frost-bg, var(--paper-parchment))' : 'var(--paper-bone)', border: `1px solid ${on ? 'var(--frost-line, var(--line-control))' : 'var(--line-card)'}`, borderRadius: 'var(--radius-input)', padding: '11px 13px', textDecoration: 'none' }}
              >
                <Icon name={item.icon} size={18} style={{ color: on ? 'var(--ink-body)' : 'var(--ink-muted)' }} />
                <span style={{ fontSize: 13, fontWeight: on ? 600 : undefined, color: 'var(--ink-body)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                {item.badge && pendingInbox > 0 && (
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--acc-terra)' }}>{pendingInbox}</span>
                )}
              </Link>
            )
          })}
        </div>
        {/* 48px rows and buttons (Kai's phone review: ~40 / ~20px tall before) */}
        <div style={{ display: 'flex', gap: 16, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line-dashed)' }}>
          <button type="button" onClick={() => { onClose(); onSearch() }} style={footBtn}><Icon name="search" size={16} />Search</button>
          <button type="button" onClick={() => { onClose(); onChat() }} style={footBtn}><Icon name="chat" size={16} />Chat</button>
          <button type="button" onClick={() => { onClose(); onSignOut() }} style={{ ...footBtn, color: 'var(--ink-faint)' }}><Icon name="signout" size={16} />Sign out</button>
        </div>
      </div>
    </div>
  )
}

export function MobileTabBar({ pendingInbox, onSearch, onChat, onSignOut }: { pendingInbox: number; onSearch: () => void; onChat: () => void; onSignOut: () => void }) {
  const { pathname } = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  // The pages the More sheet leads to (Inbox has its own tab) light the More tab while you're on them.
  const onMorePage = MORE_ITEMS.some((item) => item.to !== '/inbox' && pathname.startsWith(item.to))

  return (
    <>
      <nav
        className="app-tabbar"
        aria-label="Main"
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40, background: 'var(--paper-parchment)', boxShadow: 'var(--shadow-tabbar)', padding: '0 var(--sp-1) var(--tabbar-inset)', alignItems: 'stretch' }}
      >
        <TabItem to="/today" label="Today" icon="today" tint="var(--block-sage)" active={pathname === '/today'} />
        <TabItem to="/inbox" label="Inbox" icon="inbox" tint="var(--block-hydrangea)" active={pathname === '/inbox'} badge={pendingInbox} />
        <div style={{ width: 72, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CaptureButton />
        </div>
        <TabItem to="/calendar" label="Calendar" icon="calendar" tint="var(--block-lavender)" active={pathname === '/calendar'} />
        <TabItem label="More" icon="more" tint="var(--block-buttercream)" active={moreOpen || onMorePage} onClick={() => setMoreOpen(true)} tour="more" />
      </nav>

      {moreOpen && (
        <MoreSheet pendingInbox={pendingInbox} onClose={() => setMoreOpen(false)} onSearch={onSearch} onChat={onChat} onSignOut={onSignOut} />
      )}
    </>
  )
}
