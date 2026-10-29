import { uiZoom } from '../lib/uiScale'
import { isQuietScroll } from '../lib/quietScroll'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useEscapeStack } from '../lib/overlayStack'
import { Float } from './Float'
import { KeyCombo } from './kit'
import { splitKeyCombo } from '../lib/shortcuts'

export interface ContextMenuItem {
  label: string
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  icon?: React.ReactNode
  /** Overrides the label's text color (e.g. a priority level's own red/gold/blue) — ignored when `danger` is set. */
  labelColor?: string
  /** Right-aligned keycap hint (e.g. `"E"`, `"#"`, `"⌃click"`) — the row's own keyboard shortcut, when it has one. */
  shortcut?: string
  /** Right-aligned value before the ▸ — "2h", a project's dot, a check on the current choice. */
  hint?: React.ReactNode
  /** A hairline above the row. Unset: one is drawn where danger rows start (the old rule). */
  divider?: boolean
  /** Quiet content between the divider and the row (the block menu's "From task" caption). */
  before?: React.ReactNode
  /** Renders a child popover beside this item — opens on hover (short intent delay) or click,
   *  parent stays open. `onClose` collapses just this submenu (Escape/outside-click, so Escape
   *  closes child-first); wrap action callbacks with `closeAll` so picking something inside the
   *  child collapses the whole menu stack. */
  submenu?: (ctx: { position: { x: number; y: number }; onClose: () => void; closeAll: () => void }) => React.ReactNode
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  position: { x: number; y: number }
  onClose: () => void
  /** Above the rows, with a hairline under it when rows follow (the block menu's title). */
  header?: React.ReactNode
  /** A fixed width instead of growing from 180px. */
  width?: number
  /** The menu's accessible name. */
  label?: string
  /** M2 (2026-10-22): the 100ms way out — the caller keeps it mounted meanwhile (lib/motion useOverlayExit). */
  closing?: boolean
}

const SUBMENU_OPEN_DELAY = 150
// Kai 2026-10-06 ("I can't move it to a project"): heading diagonally from "Move to project…"
// into its list, the pointer crosses Priority / Repeat, and switching on the first touch swapped
// the project list for Repeat's under the cursor. With a submenu open, a sibling only takes over
// once the pointer rests on it; reaching the submenu first cancels the switch.
const SUBMENU_SWITCH_DELAY = 300
const SUBMENU_WIDTH = 220

export function ContextMenu({ items, position, onClose, header, width, label, closing = false }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const openTimer = useRef<number | null>(null)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  // When the menu opened — once, on mount (callers often pass a new onClose every render).
  const openedAt = useRef(performance.now())
  const closingRef = useRef(closing)
  closingRef.current = closing

  useEscapeStack(!closing, onClose)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (closingRef.current) return
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // A fixed menu over a scrolled list detaches from the row it was opened on — close it. A
    // scroll inside the menu (a submenu's own list: the date picker's times) is not that. Scroll
    // events arrive a frame late, so one from BEFORE the menu opened (a wheel flick, or the row
    // scrolled into view by the click itself) can land just after it — not a reason to close.
    function handleScroll(e: Event) {
      if (performance.now() - openedAt.current < 120 || isQuietScroll(e)) return // cal-scroll: a re-centre moves nothing
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  useEffect(() => () => { if (openTimer.current) window.clearTimeout(openTimer.current) }, [])

  function clearOpenTimer() {
    if (openTimer.current) { window.clearTimeout(openTimer.current); openTimer.current = null }
  }

  function closeAll() {
    setOpenIndex(null)
    onClose()
  }

  function handleItemHover(i: number, hasSubmenu: boolean) {
    clearOpenTimer()
    if (openIndex === i) return
    if (openIndex !== null) {
      openTimer.current = window.setTimeout(() => setOpenIndex(hasSubmenu ? i : null), SUBMENU_SWITCH_DELAY)
      return
    }
    if (hasSubmenu) openTimer.current = window.setTimeout(() => setOpenIndex(i), SUBMENU_OPEN_DELAY)
  }

  // Pointer coords and rects are VISUAL px; fixed left/top are LAYOUT px (see uiZoom). Divide
  // once here and every clamp below keeps working in one consistent space.
  const z = uiZoom()

  // Returns VISUAL px — every position-taking popover (SnoozeMenu, ScheduleMenu,
  // ProjectPicker) divides by uiZoom() itself, so handing them layout px here would
  // double-divide and drift the submenu up-left at 125%.
  function submenuPosition(i: number): { x: number; y: number } {
    const el = itemRefs.current[i]
    if (!el) return position
    const rect = el.getBoundingClientRect()
    const flip = rect.right + SUBMENU_WIDTH * z > window.innerWidth
    return { x: flip ? Math.max(8 * z, rect.left - SUBMENU_WIDTH * z) : rect.right, y: rect.top }
  }

  // J-6: clamp to the viewport from the menu's real painted size, not an item-height guess —
  // separators and hint rows made the guess short, and the bottom rows (Delete) got clipped.
  // Layout effect = measured and nudged before first paint, so it never visibly jumps.
  const menuRef = useRef<HTMLDivElement>(null)
  const [nudge, setNudge] = useState({ x: 0, y: 0 })
  // The size is the layout box's (offset*, layout px): kf-pop's entrance is scaling the rect down right
  // now (from its top left, so the corner holds).
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const zoom = uiZoom()
    setNudge({
      x: Math.max(0, r.left + el.offsetWidth * zoom - (window.innerWidth - 8 * zoom)) / zoom,
      y: Math.max(0, r.top + el.offsetHeight * zoom - (window.innerHeight - 12 * zoom)) / zoom,
    })
  }, [])

  const openItem = openIndex !== null ? items[openIndex] : null

  return (
    <Float>
    {/* Plain wrapper (no transform of its own) so the submenu's `position: fixed` popover anchors to
        the viewport, not to this menu's box — a `transform` on any ancestor turns it into the
        containing block for fixed descendants. */}
    <div ref={ref}>
      {/* M2: the one popover recipe (kf-pop, 140ms in from the side it opened toward, 100ms out). Its
          backwards fill ends at no transform, so a fixed submenu anchors to the viewport once the menu
          has arrived. */}
      <div
        ref={menuRef}
        role="menu"
        aria-label={label}
        className={`kf-pop${closing ? ' kf-pop--out' : ''}`}
        style={{
          ['--pop-origin' as string]: `${nudge.y > 0 ? 'bottom' : 'top'} ${nudge.x > 0 ? 'right' : 'left'}`,
          position: 'fixed',
          top: Math.max(12, position.y / z - nudge.y),
          left: Math.max(8, position.x / z - nudge.x),
          zIndex: 1000,
          background: 'var(--paper-parchment)',
          border: '1px solid var(--line-card)',
          boxShadow: 'var(--shadow-popover)',
          borderRadius: 'var(--radius-card)',
          padding: 6,
          minWidth: width ?? 180,
          width,
          // cal-clicks (coordinator 2026-10-26): never taller than the window (12px clear above and below) — a long
          // menu (the block menu at 125% in an 800px window) scrolls inside itself, so Delete is always reachable.
          maxHeight: window.innerHeight / z - 24,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        {header}
        {header && items.length > 0 && <div style={{ margin: '2px 7px 4px', borderTop: '1px solid var(--line-dashed)' }} />}
        {items.map((item, i) => (
          <div key={i}>
            {i > 0 && (item.divider ?? items[i - 1].danger !== item.danger) && (
              <div style={{ margin: '2px 10px', borderTop: '1px solid var(--line-dashed)' }} />
            )}
            {item.before}
            <button
              ref={(el) => { itemRefs.current[i] = el }}
              role="menuitem"
              onClick={() => {
                if (item.submenu) { clearOpenTimer(); setOpenIndex(i); return }
                item.onClick?.()
                onClose()
              }}
              disabled={item.disabled}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                width: '100%',
                textAlign: 'left',
                fontFamily: 'var(--font-ui)',
                fontSize: 13,
                color: item.danger ? 'var(--sig-overdue)' : item.labelColor ?? 'var(--ink-body)',
                background: 'none',
                border: 'none',
                borderRadius: 'var(--radius-input)',
                padding: '7px 10px',
                cursor: item.disabled ? 'default' : 'pointer',
                opacity: item.disabled ? 0.35 : 1,
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => {
                if (item.disabled) return
                e.currentTarget.style.background = 'var(--paper-bone)'
                handleItemHover(i, !!item.submenu)
              }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              {item.icon && <span style={{ display: 'inline-flex', color: item.danger ? 'var(--sig-overdue)' : 'var(--ink-faint)' }}>{item.icon}</span>}
              <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
              {item.hint != null && <span style={{ display: 'inline-flex', alignItems: 'center', flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>{item.hint}</span>}
              {/* J-17: the hint column draws keycaps (Kai: "include them in right-click context menus"). */}
              {item.shortcut && !item.submenu && <KeyCombo keys={splitKeyCombo(item.shortcut)} size="sm" />}
              {item.submenu && <span aria-hidden="true" style={{ color: 'var(--ink-faint)', fontSize: 11 }}>▸</span>}
            </button>
          </div>
        ))}
      </div>
      {openItem?.submenu && (
        // Keyed so hopping Repeat → Remind remounts the child menu and it re-measures its clamp.
        // The pointer arriving anywhere in it cancels a pending switch to a sibling (React's
        // mouseenter fires for the fixed-position popover inside this box).
        <div key={openIndex} onMouseEnter={clearOpenTimer}>
          {openItem.submenu({
            position: submenuPosition(openIndex as number),
            onClose: () => setOpenIndex(null),
            closeAll,
          })}
        </div>
      )}
    </div>
    </Float>
  )
}
