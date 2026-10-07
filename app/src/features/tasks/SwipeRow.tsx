import { useCallback, useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/icons/kf'
import { uiZoom } from '../../lib/uiScale'
import { LONG_PRESS_MS, lockAxis, pastCommit, REST_X, settleSwipe, SETTLE_MS, type Axis } from './swipe'
import './TaskRow.css'
import { longPress, tick } from '../../lib/haptics'

// ── The task-row gesture layer (DS-CHANGELOG §3 "Swipe row" + "Selection mode", Flow Audit §4):
// swipe right reveals Tomorrow · Pick date · Project and, past --swipe-commit, commits Tomorrow;
// swipe left reveals Delete and, past the line, sends the task to Trash; hold 400ms selects.
// Touch only — a mouse never swipes (J-1/J-9); desktop has right-click and ⋯ for the same actions.
// Tasks' TaskRow and Today's Top 3 / goal card / Up next rows all wrap their content in this. ──


export interface SwipeActions {
  /** Without it there is no right swipe (Paper capture's results rows only drop, to the left). */
  tomorrow?: () => void
  /** Without these two the right swipe is Tomorrow alone: past the line commits, short of it springs back. */
  pickDate?: (at: { x: number; y: number }) => void
  project?: (at: { x: number; y: number }) => void
  /** Without it there is no left swipe (Shut down's Sweep: nothing on that screen deletes). */
  delete?: () => void
  /** The left action's word — "Delete" unless the row says otherwise ("Drop"). */
  deleteLabel?: string
}

// One row open at a time: opening (or starting to drag) a row closes the last one.
let closeOpenRow: (() => void) | null = null

interface SwipeRowProps extends HTMLAttributes<HTMLDivElement> {
  /** Omit for a row that doesn't swipe (done rows). */
  actions?: SwipeActions
  /** "Mon 09:00" — shown once a right swipe passes the commit line. */
  tomorrowHint: string
  /** Hold 400ms (touch): enter selection mode with this row selected. */
  onLongPress?: () => void
  /** Phone selection mode: no swipes, and every tap on the row toggles it (onSelectTap). */
  selecting?: boolean
  onSelectTap?: () => void
  /** The moving layer — the row as drawn. */
  contentClassName?: string
  contentStyle?: CSSProperties
  /** Menus and sheets: rendered after the row so their events never feed the gesture or open the row. */
  overlay?: ReactNode
}

export function SwipeRow({ actions, tomorrowHint, onLongPress, selecting, onSelectTap, contentClassName, contentStyle, overlay, children, className, onContextMenuCapture, ...rest }: SwipeRowProps) {
  const [x, setX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const g = useRef({ id: -1, sx: 0, sy: 0, x0: 0, cur: 0, axis: null as Axis | null, lastX: 0, lastT: 0, v: 0, width: 360, past: false, timer: 0, swallow: false, touch: false })
  const close = useCallback(() => setX(0), [])

  const open = x !== 0
  useEffect(() => {
    if (!open) return
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow()
    closeOpenRow = close
    return () => {
      if (closeOpenRow === close) closeOpenRow = null
    }
  }, [open, close])
  useEffect(() => () => window.clearTimeout(g.current.timer), [])

  const swipes = !!actions && !selecting

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const s = g.current
    s.touch = e.pointerType === 'touch'
    s.swallow = false
    if (!s.touch || !e.isPrimary) return
    Object.assign(s, { id: e.pointerId, sx: e.clientX, sy: e.clientY, x0: x, cur: x, axis: null, lastX: e.clientX, lastT: e.timeStamp, v: 0, past: false })
    s.width = (rowRef.current?.getBoundingClientRect().width ?? 360 * uiZoom()) / uiZoom()
    window.clearTimeout(s.timer)
    if (onLongPress) {
      s.timer = window.setTimeout(() => {
        s.id = -1
        s.swallow = true // the hold was the action; its release is not a tap
        longPress()
        onLongPress()
      }, LONG_PRESS_MS)
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const s = g.current
    if (e.pointerId !== s.id) return
    // Pointer coordinates are zoomed px; the row is laid out in CSS px (lib/uiScale uiZoom).
    const z = uiZoom()
    const dx = (e.clientX - s.sx) / z
    if (!s.axis) {
      s.axis = lockAxis(dx, (e.clientY - s.sy) / z)
      if (!s.axis) return
      window.clearTimeout(s.timer) // moving is not holding
      if (s.axis === 'y' || !swipes) {
        s.id = -1 // a scroll: the page keeps it
        return
      }
      e.currentTarget.setPointerCapture?.(e.pointerId)
      setDragging(true)
    }
    const dt = e.timeStamp - s.lastT
    if (dt > 0) s.v = (e.clientX - s.lastX) / z / dt
    s.lastX = e.clientX
    s.lastT = e.timeStamp
    s.cur = Math.max(actions?.delete ? -s.width : 0, Math.min(actions?.tomorrow ? s.width : 0, s.x0 + dx))
    const past = pastCommit(s.cur, s.width)
    if (past && !s.past) tick() // one tick as the line is crossed, not on the way back
    s.past = past
    setX(s.cur)
  }

  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    const s = g.current
    window.clearTimeout(s.timer)
    if (e.pointerId !== s.id) return
    s.id = -1
    if (s.axis !== 'x') return
    s.swallow = true // a drag's release is not a tap
    setDragging(false)
    // A finger that stopped before lifting (or a cancelled gesture) is not a flick.
    const v = e.type === 'pointercancel' || e.timeStamp - s.lastT > 100 ? 0 : s.v
    const end = settleSwipe(s.cur, v, s.width)
    if (end === 'tomorrow' || end === 'delete') {
      // The row flies off, then the action runs: Tomorrow puts it back (the list re-sorts it),
      // Delete leaves it gone while the row collapses (tasks/api deleteTask).
      setX(end === 'tomorrow' ? s.width : -s.width)
      window.setTimeout(() => {
        if (end === 'tomorrow') {
          actions?.tomorrow?.()
          setX(0)
        } else actions?.delete?.()
      }, SETTLE_MS)
    } else setX(end === 'open-right' && !actions?.pickDate ? 0 : REST_X[end])
  }

  const at = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.bottom }
  }
  const act = (icon: IconName, label: string, run: (el: HTMLElement) => void) => (
    <button
      type="button"
      className="kf-swipe-act"
      onClick={(e) => {
        e.stopPropagation() // the row's own click opens the task
        run(e.currentTarget)
        close()
      }}
    >
      <Icon name={icon} size={24} />
      <span>{label}</span>
    </button>
  )
  const past = pastCommit(x, g.current.width)

  // `overlay` sits after the row, not in it: a menu portals to <body>, but React events still bubble
  // through the component tree, and a menu click reaching the row would also open the task.
  return (
    <>
    <div
      ref={rowRef}
      className={`kf-swipe${className ? ` ${className}` : ''}`}
      data-swiping={dragging || undefined}
      // A long press on Android also fires contextmenu; the hold selects, so the menu must not open.
      onContextMenuCapture={(e) => {
        if (g.current.touch) {
          e.preventDefault()
          e.stopPropagation()
          return
        }
        onContextMenuCapture?.(e)
      }}
      {...rest}
    >
      {x > 0 && actions?.tomorrow && (
        <div className="kf-swipe-bg is-right">
          {past ? (
            <div className="kf-swipe-commit">
              <Icon name="tomorrow" size={24} />
              <span className="kf-swipe-commit-label">Tomorrow</span>
              <span className="kf-swipe-hint">{tomorrowHint}</span>
            </div>
          ) : (
            <>
              {act('tomorrow', 'Tomorrow', () => actions.tomorrow?.())}
              {actions.pickDate && act('pickdate', 'Pick date', (el) => actions.pickDate?.(at(el)))}
              {/* Opens "Move to…" (a project, an area or a domain), so it reads Move like the bulk bar. */}
              {actions.project && act('project', 'Move', (el) => actions.project?.(at(el)))}
            </>
          )}
        </div>
      )}
      {x < 0 && actions && (
        <div className="kf-swipe-bg is-left">
          <button type="button" className="kf-swipe-act is-delete" onClick={(e) => { e.stopPropagation(); actions.delete?.() }}>
            <Icon name="delete" size={24} />
            <span>{actions.deleteLabel ?? 'Delete'}</span>
          </button>
        </div>
      )}
      <div
        className={`kf-swipe-fg${contentClassName ? ` ${contentClassName}` : ''}`}
        data-moved={open || undefined}
        style={{
          ...contentStyle,
          transform: open ? `translateX(${x}px) ${contentStyle?.transform ?? ''}` : contentStyle?.transform,
          transition: dragging ? 'none' : `transform var(--dur-swipe-settle) var(--ease-standard)`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(e) => {
          const s = g.current
          if (s.swallow) {
            s.swallow = false
          } else if (selecting && onSelectTap) {
            onSelectTap()
          } else if (open) {
            close() // a tap on an open row closes it, never opens the task underneath
          } else return
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        {children}
      </div>
    </div>
    {overlay}
    </>
  )
}

/** ⋯ on every task row — 48 hit on a phone. Opens the row's TaskMenu at the button. */
export function RowMenuButton({ title, onOpen }: { title: string; onOpen: (at: { x: number; y: number }) => void }) {
  return (
    <button
      type="button"
      className="kf-row-more"
      aria-label={`More actions for "${title}"`}
      aria-haspopup="menu"
      onClick={(e) => {
        e.stopPropagation()
        const r = e.currentTarget.getBoundingClientRect()
        onOpen({ x: r.left, y: r.bottom })
      }}
    >
      <Icon name="dots" size={24} />
    </button>
  )
}

/** Selection mode's circle (24 in a 48 hit) — replaces the checkbox while a phone is selecting.
 * The row itself toggles on tap (SwipeRow onSelectTap), so this only draws the state. */
export function SelectCircle({ on, title }: { on: boolean; title: string }) {
  return (
    <span className="kf-select-circle" role="checkbox" aria-checked={on} aria-label={`Select "${title}"`} data-on={on || undefined}>
      <span className="kf-select-dot">{on && <Icon name="check" size={16} strokeWidth={2.2} />}</span>
    </span>
  )
}
