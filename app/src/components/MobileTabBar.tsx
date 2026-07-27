import { useState, type CSSProperties } from 'react'
import { Link, useLocation } from 'react-router'
import { VoiceCaptureButton } from '../features/capture/VoiceCaptureButton'
import { useEscapeStack } from '../lib/overlayStack'

// Pixel contract: "Kai's Flow — Universal Navigation Reference" §03 Mobile tab bar
// (canonical 5-slot bar: Today · Inbox · Capture FAB · Cal · More) + its "More" sheet.
// The shell owns this; feature pages never render their own copy.

const A = '/ds/assets'

function slotLabel(active: boolean): CSSProperties {
  return { fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', color: active ? 'var(--ink-body)' : 'var(--ink-faint)' }
}

// [K-26] punch 65: Library parked to v2 (row removed). Journal is back per D-1. Focus
// (audit-A7 addition Kai kept) appends after the designed rows instead of splitting their order.
const MORE_ITEMS: { to: string; label: string; img?: string; imgHeight?: number; dot?: string; badge?: boolean }[] = [
  { to: '/routines', label: 'Routines', img: `${A}/vine/flowering.png`, imgHeight: 20 },
  { to: '/inbox', label: 'Inbox', dot: '--acc-hydrangea', badge: true },
  { to: '/weekly-review', label: 'Review', img: `${A}/fern/unfurl2.png`, imgHeight: 18 },
  { to: '/journal', label: 'Journal', img: `${A}/fern/full.png`, imgHeight: 20 },
  { to: '/people', label: 'People', dot: '--acc-clover' },
  { to: '/settings', label: 'Settings', dot: '--acc-sage' },
  { to: '/focus', label: 'Focus', img: `${A}/daisy/midday.png`, imgHeight: 18 },
]

function MoreSheet({ pendingInbox, onClose, onSearch, onChat, onSignOut }: { pendingInbox: number; onClose: () => void; onSearch: () => void; onChat: () => void; onSignOut: () => void }) {
  useEscapeStack(true, onClose)
  return (
    <div className="kf-scrim" style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', background: 'rgba(58,50,38,0.32)' }} onClick={onClose}>
      <div
        className="kf-sheet"
        style={{ width: '100%', background: 'var(--paper-parchment)', borderTop: '1px solid var(--line-card)', borderRadius: '14px 14px 0 0', boxShadow: 'var(--shadow-card)', padding: '18px 16px calc(18px + env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {MORE_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={onClose}
              style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 8, padding: '11px 13px', textDecoration: 'none' }}
            >
              {item.img && <img src={item.img} alt="" style={{ height: item.imgHeight }} />}
              {item.dot && <span style={{ width: 9, height: 9, borderRadius: '50%', background: `var(${item.dot})`, flex: 'none' }} />}
              <span style={{ fontSize: 13, color: 'var(--ink-body)' }}>{item.label}</span>
              {item.badge && pendingInbox > 0 && (
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--acc-terra)' }}>{pendingInbox}</span>
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

  return (
    <>
      <div
        className="app-tabbar"
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40, borderTop: '1px solid var(--line-card)', background: 'var(--paper-sidebar)', padding: '9px 20px calc(4px + env(safe-area-inset-bottom))', alignItems: 'flex-start', justifyContent: 'space-between' }}
      >
        <Link to="/today" className="kf-hit" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--acc-sage)' }} />
          <span style={slotLabel(pathname === '/today')}>Today</span>
        </Link>

        <Link to="/inbox" className="kf-hit" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
          <span style={{ position: 'relative', width: 9, height: 9, borderRadius: '50%', background: 'var(--acc-hydrangea)' }}>
            {pendingInbox > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -5, width: 12, height: 12, borderRadius: '50%', background: 'var(--acc-terra)', color: '#fff', fontSize: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {pendingInbox}
              </span>
            )}
          </span>
          <span style={slotLabel(pathname === '/inbox')}>Inbox</span>
        </Link>

        <div style={{ marginTop: -3 }}>
          <VoiceCaptureButton iconOnly />
        </div>

        <Link to="/calendar" className="kf-hit" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--acc-lavender)' }} />
          <span style={slotLabel(pathname === '/calendar')}>Cal</span>
        </Link>

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="kf-hit"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}
        >
          <img src={`${A}/vine/sprouting.png`} alt="" style={{ height: 11 }} />
          <span style={slotLabel(moreOpen)}>More</span>
        </button>
      </div>

      {moreOpen && (
        <MoreSheet pendingInbox={pendingInbox} onClose={() => setMoreOpen(false)} onSearch={onSearch} onChat={onChat} onSignOut={onSignOut} />
      )}
    </>
  )
}
