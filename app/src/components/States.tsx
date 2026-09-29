import type { CSSProperties, ReactNode } from 'react'
import { Button } from './kit'

// ── MK States (DS-CHANGELOG §3): Loading, Empty, Error, Offline.
// Loading = skeleton rows/cards, and ONLY when nothing is cached — a page with cached data shows
// it and refreshes quietly. Gate on TanStack's `isPending` (status 'pending' = no data yet), never
// `isLoading`/`isFetching`, so a skeleton can't cover data you already have. ──

const bar = (width: string, height: number, hi = false): CSSProperties => ({
  display: 'block',
  width,
  height,
  borderRadius: 2,
  background: hi ? 'var(--skeleton-hi)' : 'var(--skeleton)',
})

// Pulse 1 → 0.55; the global reduced-motion rule collapses it to one 0.01ms run, i.e. static.
const pulse: CSSProperties = { animation: 'skeletonPulse 1.6s var(--ease-natural) infinite' }

const ROW_WIDTHS: [string, string][] = [['78%', '40%'], ['64%', '30%'], ['82%', '44%'], ['55%', '36%']]

/** Loading placeholder: task-row shapes (default) or one Goal-card shape. */
export function Skeleton({ variant = 'rows', rows = 4 }: { variant?: 'rows' | 'card'; rows?: number }) {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" style={pulse}>
      {variant === 'card' ? (
        <div style={{ height: 190, borderRadius: 3, background: 'var(--skeleton-hi)', border: '1px solid var(--line-card)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, boxSizing: 'border-box' }}>
          <span style={bar('40%', 10)} />
          <span style={bar('90%', 18)} />
          <span style={bar('70%', 18)} />
          <span style={{ ...bar('100%', 2), marginTop: 14 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ ...bar('84px', 40), borderRadius: 999 }} />
            ))}
          </div>
        </div>
      ) : (
        Array.from({ length: rows }, (_, i) => {
          const [title, meta] = ROW_WIDTHS[i % ROW_WIDTHS.length]
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 16px 16px', borderBottom: '1px dashed var(--line-dashed)' }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--skeleton)', flex: 'none' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 3 }}>
                <span style={bar(title, 13)} />
                <span style={bar(meta, 10, true)} />
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

/** The surface's species at its zero stage (≈120 wide), one line, at most one secondary action. */
export function EmptyState({ image = '/ds/assets/hydrangea/zero.png', line, action }: { image?: string; line: ReactNode; action?: { label: string; onClick: () => void } }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 24px', textAlign: 'center' }}>
      <img src={image} alt="" style={{ width: 120, height: 'auto', filter: 'var(--shadow-drop-sm)' }} />
      <div style={{ fontSize: 16, lineHeight: 1.45, color: 'var(--ink-muted)', textWrap: 'pretty' }}>{line}</div>
      {action && (
        <Button variant="secondary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

/** Inline failure where the data would be. Background failures use a Retry toast instead.
 * `retryLabel` renames the one action (First Run 9b-1: "Sign in instead"). */
export function ErrorCard({ message, onRetry, retryLabel = 'Retry' }: { message: ReactNode; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 4px 4px 14px', background: 'var(--paper-parchment)', border: '1px solid var(--line-control)', borderRadius: 3 }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ink-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flex: 'none' }}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7.8v5M12 16.2v.1" />
      </svg>
      <span style={{ flex: 1, minHeight: 40, display: 'flex', alignItems: 'center', fontSize: 14, lineHeight: 1.4, color: 'var(--ink-body)' }}>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} style={{ flex: 'none', height: 48, padding: '0 12px', border: 'none', background: 'none', font: 'inherit', fontSize: 14, fontWeight: 600, color: 'var(--acc-terra-ink)', cursor: 'pointer', borderRadius: 3 }}>
          {retryLabel}
        </button>
      )}
    </div>
  )
}

/** h 32 chip under a page title while offline; rows that haven't synced carry their own pending ring.
 * A page with nothing to sync names what waits for the connection instead (First Run 9b-3). */
export function OfflineChip({ children = 'Offline — changes will sync' }: { children?: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 12px', border: '1px solid var(--sig-offline)', borderRadius: 999, fontSize: 13, color: 'var(--sig-offline)', boxSizing: 'border-box' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flex: 'none' }}>
        <path d="M7 18h9.5a3.8 3.8 0 0 0 .7-7.5A5.5 5.5 0 0 0 6.6 9.3 4.4 4.4 0 0 0 7 18z" />
        <path d="M4 4l16 16" />
      </svg>
      {children}
    </span>
  )
}
