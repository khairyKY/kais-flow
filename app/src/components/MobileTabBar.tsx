import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { CaptureButton } from '../features/capture/CaptureButton'
import { useEscapeStack } from '../lib/overlayStack'
import { useMotionEnabled } from '../lib/motion'
import { Icon } from './Icon'
import type { IconName } from './icons/kf'
import { FlowerIcon, GuideGlyph, ProjectsGlyph } from './icons/NavGlyphs'
import './kit.css'

// Pixel contract: MK Tab Bar.dc.html + DS-CHANGELOG §3 "Tab bar" (2026-09-28 refresh — replaces the
// Navigation Reference's 9px dots and the 2026-09-27 botanical-glyph stopgap): 64 + gesture inset ·
// Today · Inbox · capture · Calendar · More · kf icons 24 · labels Inter 12/16 · the page you're on
// gets a 56×32 pill in its surface's block tint · badge 1 · 12 · 99+ · re-tap = scroll to top.
// Plus its "More" sheet. The shell owns this; feature pages never render their own copy.

const A = '/ds/assets'

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

// [K-26] punch 65: Library parked to v2 (row removed). Journal is back per D-1. Focus
// (audit-A7 addition Kai kept) appends after the designed rows instead of splitting their order.
// deviation(2026-09-26 audit): the export's sheet has no Tasks, Projects, Activity or Trash, so on
// a phone those four pages had no way in at all. Each carries the icon the collapsed sidebar rail
// already gives it (Tasks' blossom flower, Projects' trellis glyph, Activity's gold dot, Trash's
// hairline dot). Order (polish-f1, conductor's call): Tasks and Projects lead — they're the pages a
// phone user reaches for most and the tab bar has no slot for — then the designed rows in the
// export's order, then Focus, Activity and Trash.
const MORE_ITEMS: { to: string; label: string; img?: string; imgHeight?: number; dot?: string; glyph?: ReactNode; badge?: boolean }[] = [
  { to: '/tasks', label: 'Tasks', glyph: <FlowerIcon fill="var(--acc-blossom)" center="#C98A4B" /> },
  { to: '/projects', label: 'Projects', glyph: <ProjectsGlyph /> },
  { to: '/routines', label: 'Routines', img: `${A}/vine/flowering.png`, imgHeight: 20 },
  { to: '/inbox', label: 'Inbox', dot: '--acc-hydrangea', badge: true },
  { to: '/weekly-review', label: 'Review', img: `${A}/fern/unfurl2.png`, imgHeight: 18 },
  { to: '/journal', label: 'Journal', img: `${A}/fern/full.png`, imgHeight: 20 },
  { to: '/people', label: 'People', dot: '--acc-clover' },
  // Tour & help 14i: the Guide waits in More, beside Settings.
  { to: '/guide', label: 'Guide', glyph: <GuideGlyph size={18} /> },
  { to: '/settings', label: 'Settings', dot: '--acc-sage' },
  { to: '/focus', label: 'Focus', img: `${A}/daisy/midday.png`, imgHeight: 18 },
  { to: '/activity', label: 'Activity', dot: '--acc-gold' },
  { to: '/trash', label: 'Trash', dot: '--ink-hairline' },
]

function MoreSheet({ pendingInbox, onClose, onSearch, onChat, onSignOut }: { pendingInbox: number; onClose: () => void; onSearch: () => void; onChat: () => void; onSignOut: () => void }) {
  useEscapeStack(true, onClose)
  return (
    <div className="kf-scrim" style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div
        className="kf-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="More"
        style={{ width: '100%', background: 'var(--paper-parchment)', borderTop: '1px solid var(--line-card)', borderRadius: '14px 14px 0 0', boxShadow: 'var(--shadow-card)', padding: '18px 16px calc(18px + env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Three columns where three fit, two where they don't (the export's caption for this
            sheet says "2-column grid"; its card draws three at 500px). A fixed repeat(3, 1fr)
            overflowed: at a 125% interface size (lib/uiScale.ts; the phone default was 125% until F2b) a 390px phone lays out
            ~312 CSS px, so the right column ran past the screen edge — worse once "Projects"
            joined (polish-c). 112px is the widest row's content (icon + "Projects"/"Routines");
            the ellipsis below is only a last resort for extreme zooms. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 10 }}>
          {MORE_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={onClose}
              style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 8, padding: '11px 13px', textDecoration: 'none' }}
            >
              {item.img && <img src={item.img} alt="" style={{ height: item.imgHeight }} />}
              {item.dot && <span style={{ width: 9, height: 9, borderRadius: '50%', background: `var(${item.dot})`, flex: 'none' }} />}
              {/* Line glyphs stroke currentColor — same muted ink as the rail's resting icons. */}
              {item.glyph && <span style={{ display: 'flex', flex: 'none', color: 'var(--ink-muted)' }}>{item.glyph}</span>}
              <span style={{ fontSize: 13, color: 'var(--ink-body)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
              {item.badge && pendingInbox > 0 && (
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--acc-terra)' }}>{pendingInbox}</span>
              )}
            </Link>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--line-dashed)' }}>
          <button type="button" onClick={() => { onClose(); onSearch() }} style={{ flex: 1, textAlign: 'center', fontSize: 12.5, color: 'var(--ink-muted)', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}>⌕ Search</button>
          <button type="button" onClick={() => { onClose(); onChat() }} style={{ flex: 1, textAlign: 'center', fontSize: 12.5, color: 'var(--ink-muted)', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}>Chat</button>
          <button type="button" onClick={() => { onClose(); onSignOut() }} style={{ flex: 1, textAlign: 'center', fontSize: 12.5, color: 'var(--ink-faint)', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}>Sign out</button>
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
