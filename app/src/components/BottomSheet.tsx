import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useEscapeStack } from '../lib/overlayStack'
import { usePrefersReducedMotion } from '../lib/motion'
import { uiZoom } from '../lib/uiScale'

// ── MK Bottom Sheet (DS-CHANGELOG §3): --paper-parchment, top radius --sheet-radius, --shadow-sheet;
// handle 32×4 (--ink-hairline) in a 120×48 hit that drags; detents medium 60% / full 100% − 48
// (header gains ✕), tapping the handle toggles; swipe down past 30% or a fling closes; scrim
// --scrim, tap = close; enter 300ms emphasized-decel / exit 200ms emphasized-accel, translateY
// only (reduced motion: cross-fade); the sheet's bottom rides the IME top (visualViewport) so the
// focused field stays visible; Esc/Back close it through overlayStack. Portalled to <body>, and
// it locks the real scroller (.app-main-content), not <body>.
//
// `children` is a render prop so a row can fire its action and *then* ask for the exit —
// closing directly would unmount before the animation ran. ──

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

export type SheetDetent = 'medium' | 'full' | 'content'

export interface BottomSheetProps {
  /**
   * Fires once the sheet has finished leaving — ✕, scrim tap, Esc/Back, a swipe down or fling,
   * or the `close` handed to `children`. **Closing never discards.** It is a dismiss, not a
   * cancel: the sheet blurs the focused field first so its onBlur commit still runs, and it holds
   * no state of its own, so whatever the caller keeps (a draft, a half-typed title) is still
   * there when the sheet opens again. Throwing edits away is an explicit action the caller puts
   * inside the sheet, never a side effect of dismissing it.
   */
  onClose: () => void
  /** Gap under the handle row when there's no header — 14px on the snooze sheet, 16px on task detail. */
  handleGap?: number
  /**
   * Resting height: 'medium' 60% · 'full' 100% − 48 · 'content' (default) sized to its content,
   * up to full — what every pre-kit sheet relied on. Tapping the handle, or dragging it up,
   * toggles full ↔ rest (a 'full' sheet rests at full and toggles down to medium).
   */
  detent?: SheetDetent
  /** Header title (Source Serif 20). At full height the header gains ✕. */
  title?: ReactNode
  /** Pinned under the scrolling body (§3 footer: 16 side padding, 12 top, 28 bottom, dashed top rule). */
  footer?: (close: () => void) => ReactNode
  children: (close: () => void) => ReactNode
}

const EXIT_MS = 200 // --dur-sheet-exit
/** px/ms — a flick faster than this closes (down) or opens full (up), whatever the distance. */
const FLING = 0.5

/** Where a released handle drag lands. `dy` and `height` in the same screen px, `velocity` in px/ms. Pure. */
export function sheetRelease(dy: number, velocity: number, height: number): 'close' | 'up' | 'down' | 'stay' {
  if (dy > height * 0.3 || velocity > FLING) return 'close'
  if (dy < -48 || velocity < -FLING) return 'up'
  if (dy > 48) return 'down'
  return 'stay'
}

// Reference-counted so a sheet opened from a sheet doesn't unlock the page when it closes.
let locks = 0
let savedOverflow = ''
function useMainScrollLock() {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('.app-main-content')
    if (!el) return
    if (locks++ === 0) {
      savedOverflow = el.style.overflowY
      el.style.overflowY = 'hidden'
    }
    return () => {
      if (--locks === 0) el.style.overflowY = savedOverflow
    }
  }, [])
}

/** Screen px the on-screen keyboard covers at the bottom of the layout viewport (0 when closed). */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    // ponytail: a pinch-zoom also shrinks the visual viewport and reads as a keyboard here —
    // gate on vv.scale if pinching an open sheet ever matters.
    const on = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    on()
    vv.addEventListener('resize', on)
    vv.addEventListener('scroll', on)
    return () => {
      vv.removeEventListener('resize', on)
      vv.removeEventListener('scroll', on)
    }
  }, [])
  return inset
}

const CSS = `
  .kf-bs-icon { width: 48px; height: 48px; flex: none; display: flex; align-items: center; justify-content: center;
    border: none; background: none; border-radius: 50%; color: var(--ink-body); cursor: pointer; padding: 0; }
  .kf-bs-icon:active { background: var(--pressed-overlay); }
  .kf-bs-icon:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .kf-bs-handle { position: absolute; top: 0; left: 50%; z-index: 1; width: 120px; height: var(--sheet-handle-hit);
    margin-left: -60px; padding: 10px 0 0; border: none; background: none; cursor: grab; touch-action: none;
    /* a button centres its content: without this the bar sat 27px down, over a two-line title */
    display: flex; align-items: flex-start; }
  .kf-bs-handle:active { cursor: grabbing; }
  .kf-bs-handle > span { display: block; margin: 0 auto; width: var(--sheet-handle-w); height: var(--sheet-handle-h);
    border-radius: 2px; background: var(--ink-hairline); }
  .kf-bs-handle:focus-visible { outline: none; }
  .kf-bs-handle:focus-visible > span { box-shadow: var(--focus-ring); }
  @media (prefers-reduced-motion: reduce) {
    /* the cross-fade keeps its length; beats the global 0.01ms rule by specificity */
    .kf-bs-fade { animation-duration: var(--dur-sheet-enter) !important; transition-duration: var(--dur-sheet-exit) !important; }
  }
`

export function BottomSheet({ onClose, handleGap = 14, detent = 'content', title, footer, children }: BottomSheetProps) {
  const reduced = usePrefersReducedMotion()
  const titleId = useId()
  const sheetRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const [closing, setClosing] = useState(false)
  const [atFull, setAtFull] = useState(detent === 'full')
  const [dragY, setDragY] = useState(0) // screen px, + = down
  const [dragH, setDragH] = useState(0) // sheet height when the drag began; 0 = not dragging
  const track = useRef<{ startY: number; lastY: number; lastT: number; v: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const kb = useKeyboardInset()
  const z = uiZoom() // screen px → layout px under the root UI zoom

  useMainScrollLock()

  const requestClose = useCallback(() => {
    const focused = document.activeElement
    if (focused instanceof HTMLElement && sheetRef.current?.contains(focused)) focused.blur() // commit, don't discard
    setClosing(true)
  }, [])
  useEscapeStack(!closing, requestClose)
  // A drag re-renders the sheet every pointermove; the caller's content only when the caller does.
  const body = useMemo(() => children(requestClose), [children, requestClose])

  useEffect(() => {
    if (!closing) return
    const t = setTimeout(() => closeRef.current(), EXIT_MS)
    return () => clearTimeout(t)
  }, [closing])

  // Focus moves into the dialog (unless a field inside already took it) and returns on close.
  useEffect(() => {
    const prev = document.activeElement
    if (!sheetRef.current?.contains(prev)) sheetRef.current?.focus({ preventScroll: true })
    return () => {
      if (prev instanceof HTMLElement && prev.isConnected) prev.focus({ preventScroll: true })
    }
  }, [])

  // Keyboard up: keep the focused field in view inside the (now shorter) sheet.
  useEffect(() => {
    const a = document.activeElement
    if (kb > 0 && a instanceof HTMLElement && sheetRef.current?.contains(a)) a.scrollIntoView({ block: 'nearest' })
  }, [kb])

  function onHandleDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (closing || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.currentTarget.setPointerCapture(e.pointerId)
    track.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, v: 0, moved: false }
    setDragY(0)
    setDragH(sheetRef.current?.getBoundingClientRect().height || 1)
  }
  function onHandleMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const t = track.current
    if (!t) return
    const dt = e.timeStamp - t.lastT
    if (dt > 0) t.v = (e.clientY - t.lastY) / dt
    t.lastY = e.clientY
    t.lastT = e.timeStamp
    const dy = e.clientY - t.startY
    if (Math.abs(dy) > 4) t.moved = true
    setDragY(dy)
  }
  function onHandleUp(e: ReactPointerEvent<HTMLButtonElement>) {
    const t = track.current
    track.current = null
    const h = dragH
    setDragH(0)
    if (!t?.moved) return setDragY(0) // a tap — onClick toggles the detent
    suppressClick.current = true
    const dy = e.clientY - t.startY
    const where = sheetRelease(dy, e.timeStamp - t.lastT > 100 ? 0 : t.v, h)
    if (where === 'close') return requestClose() // leaves from where the finger let go
    setDragY(0)
    if (where === 'up') setAtFull(true)
    else if (where === 'down') setAtFull(false)
  }
  function onHandleCancel() {
    track.current = null
    setDragH(0)
    setDragY(0)
  }

  const travel = !reduced
  const dragging = dragH > 0
  const shownY = Math.max(0, dragY)
  const height = atFull ? 'var(--sheet-h-full)' : detent === 'content' ? undefined : 'var(--sheet-h-medium)'
  const header = title != null || atFull

  return createPortal(
    // Clicks and presses stop here: React bubbles portal events up the *component* tree, so a
    // sheet rendered inside a row would otherwise hand the row its taps (long-press, swipe, open).
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ position: 'fixed', left: 0, right: 0, top: 0, bottom: kb / z, zIndex: 1000 }}
    >
      <style>{CSS}</style>
      <div
        className="kf-bs-fade"
        onClick={requestClose}
        style={{
          position: 'absolute',
          inset: `0 0 ${-kb / z}px`, // still under the keyboard; only the sheet rides above it
          background: 'var(--scrim)',
          touchAction: 'none',
          animation: 'scrimIn var(--dur-sheet-enter) var(--ease-emphasized-decel) backwards',
          opacity: closing ? 0 : dragging ? 1 - Math.min(1, shownY / dragH) : 1,
          transition: dragging ? 'none' : 'opacity var(--dur-sheet-exit) var(--ease-emphasized-accel)',
        }}
      />
      <div
        ref={sheetRef}
        className="kf-bs-fade"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title != null ? titleId : undefined}
        tabIndex={-1}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxWidth: 640,
          marginInline: 'auto',
          height,
          maxHeight: 'var(--sheet-h-full)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--paper-parchment)',
          borderRadius: 'var(--sheet-radius) var(--sheet-radius) 0 0',
          boxShadow: 'var(--shadow-sheet)',
          outline: 'none',
          animation: `${travel ? 'sheetIn' : 'scrimIn'} var(--dur-sheet-enter) var(--ease-emphasized-decel) backwards`,
          transform: closing && travel ? 'translateY(100%)' : shownY ? `translateY(${shownY / z}px)` : undefined,
          opacity: closing && !travel ? 0 : undefined,
          transition: dragging
            ? 'none'
            : closing
              ? `${travel ? 'transform' : 'opacity'} var(--dur-sheet-exit) var(--ease-emphasized-accel)`
              : 'transform var(--dur-sheet-exit) var(--ease-standard), height var(--dur-sheet-enter) var(--ease-emphasized-decel)',
        }}
      >
        <div style={{ position: 'relative', height: 24, flex: 'none' }}>
          <button
            type="button"
            className="kf-bs-handle"
            aria-label={atFull ? 'Shrink sheet' : 'Expand sheet'}
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleCancel}
            onClick={() => {
              if (suppressClick.current) suppressClick.current = false
              else setAtFull((v) => !v)
            }}
          >
            <span />
          </button>
        </div>
        {header && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 56, padding: atFull ? '0 4px' : '0 4px 0 20px', flex: 'none' }}>
            {atFull && (
              <button type="button" className="kf-bs-icon" aria-label="Close" onClick={requestClose}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            )}
            <div id={titleId} style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, lineHeight: 1.2, color: 'var(--ink-body)' }}>
              {title}
            </div>
          </div>
        )}
        <div
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            padding: `${header ? 4 : handleGap}px 20px ${footer ? '8px' : 'calc(22px + env(safe-area-inset-bottom))'}`,
          }}
        >
          {body}
        </div>
        {footer && (
          <div data-sheet-footer style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 16px max(28px, env(safe-area-inset-bottom))', borderTop: '1px dashed var(--line-dashed)' }}>
            {footer(requestClose)}
          </div>
        )}
      </div>
    </div>,
    document.body,
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
