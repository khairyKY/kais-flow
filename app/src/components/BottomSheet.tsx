import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useEscapeStack } from '../lib/overlayStack'
import { useOverlayExit } from '../lib/motion'

// ── Overlays.dc.html §03 "Mobile sheets" — the chrome all four phone sheets share:
// a --paper-linen slab pinned to the floor with 22px top corners, the 38×4 grab
// handle, 20px gutters, and a bottom pad that clears the home indicator. Entry/exit
// are Foundation's kf-sheet / kf-sheet--out (210 in · 140 out) over the canonical
// 20% .kf-scrim; Esc goes through overlayStack like every other overlay.
//
// `children` is a render prop so a row can fire its action and *then* ask for the
// 140ms exit — closing directly would unmount before the animation ran. ──

/** The app's phone breakpoint (767px), matching the shell's `@media (max-width: 767px)`. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 767)
  useEffect(() => {
    const mq = matchMedia('(max-width: 767px)')
    const on = () => setIsMobile(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return isMobile
}

export interface BottomSheetProps {
  onClose: () => void
  /** Gap under the grab handle — 14px on the snooze sheet, 16px on More/task detail. */
  handleGap?: number
  children: (close: () => void) => ReactNode
}

export function BottomSheet({ onClose, handleGap = 14, children }: BottomSheetProps) {
  const [open, setOpen] = useState(true)
  const { mounted, closing } = useOverlayExit(open)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEscapeStack(true, () => setOpen(false))

  // `mounted` starts true, so this only ever fires once — after the 140ms exit.
  useEffect(() => {
    if (!mounted) closeRef.current()
  }, [mounted])

  const requestClose = () => setOpen(false)

  return (
    <div
      className={`kf-scrim${closing ? ' kf-scrim--out' : ''}`}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-end' }}
      onClick={requestClose}
    >
      <div
        className={`kf-sheet${closing ? ' kf-sheet--out' : ''}`}
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%',
          background: 'var(--paper-linen)',
          borderRadius: '22px 22px 0 0',
          boxShadow: '0 -10px 30px rgba(60,52,38,0.2)',
          padding: '12px 20px calc(22px + env(safe-area-inset-bottom))',
          maxHeight: '92dvh',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--line-solid)', margin: `0 auto ${handleGap}px` }} />
        {children(requestClose)}
      </div>
    </div>
  )
}

/** §03 row: 13px vertical padding (≥44px tall), hairline rule, optional leading dot + trailing meta. */
export function SheetRow({ dot, label, meta, last, onClick }: { dot?: string; label: ReactNode; meta?: ReactNode; last?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        width: '100%',
        textAlign: 'left',
        font: 'inherit',
        background: 'none',
        border: 'none',
        borderBottom: last ? 'none' : '1px dashed var(--line-dashed)',
        padding: '13px 4px',
        cursor: 'pointer',
      }}
    >
      {dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flex: 'none' }} />}
      <span style={{ flex: 1, fontSize: 14.5, color: 'var(--ink-body)' }}>{label}</span>
      {meta != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-faint)' }}>{meta}</span>}
    </button>
  )
}
