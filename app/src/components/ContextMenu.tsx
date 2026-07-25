import { uiZoom } from '../lib/uiScale'
import { useEffect, useRef, useState } from 'react'
import { useEscapeStack } from '../lib/overlayStack'

export interface ContextMenuItem {
  label: string
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  icon?: React.ReactNode
  /** Overrides the label's text color (e.g. a priority level's own red/gold/blue) — ignored when `danger` is set. */
  labelColor?: string
  /** Right-aligned mono hint (e.g. `"E"`, `"#"`) — the row's own keyboard shortcut, when it has one. */
  shortcut?: string
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
}

const SUBMENU_OPEN_DELAY = 150
const SUBMENU_WIDTH = 220

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const openTimer = useRef<number | null>(null)
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  useEscapeStack(true, onClose)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
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
    if (openIndex !== null && openIndex !== i) setOpenIndex(null)
    if (!hasSubmenu || openIndex === i) return
    openTimer.current = window.setTimeout(() => setOpenIndex(i), SUBMENU_OPEN_DELAY)
  }

  // Pointer coords and rects are VISUAL px; fixed left/top are LAYOUT px (see uiZoom). Divide
  // once here and every clamp below keeps working in one consistent space.
  const z = uiZoom()

  function submenuPosition(i: number): { x: number; y: number } {
    const el = itemRefs.current[i]
    if (!el) return { x: position.x / z, y: position.y / z }
    const rect = el.getBoundingClientRect()
    const flip = rect.right + SUBMENU_WIDTH * z > window.innerWidth
    return { x: flip ? Math.max(8, rect.left / z - SUBMENU_WIDTH) : rect.right / z, y: rect.top / z }
  }

  const itemHeight = 34
  const maxY = window.innerHeight / z - 12
  const left = Math.min(position.x / z, window.innerWidth / z - 220)
  const top = Math.min(position.y / z, maxY - items.length * itemHeight)

  const openItem = openIndex !== null ? items[openIndex] : null

  return (
    // Plain wrapper (no transform of its own) so the submenu's `position: fixed` popover anchors to
    // the viewport, not to this menu's box — a `transform` on any ancestor turns it into the
    // containing block for fixed descendants (same class of bug Select.tsx's portal works around).
    <div ref={ref}>
      {/* kf-fade (opacity only) — kfOverlayIn's transform would make this menu the
          containing block for its fixed submenu while animating. */}
      <div
        role="menu"
        className="kf-fade"
        style={{
          position: 'fixed',
          top: Math.max(12, top),
          left: Math.max(8, left),
          zIndex: 1000,
          background: 'var(--paper-parchment)',
          border: '1px solid var(--line-card)',
          boxShadow: 'var(--shadow-popover)',
          borderRadius: 5,
          padding: 6,
          minWidth: 180,
        }}
      >
        {items.map((item, i) => (
          <div key={i}>
            {i > 0 && items[i - 1].danger !== item.danger && (
              <div style={{ margin: '2px 10px', borderTop: '1px dashed var(--line-dashed)' }} />
            )}
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
                borderRadius: 5,
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
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.shortcut && !item.submenu && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-hairline)' }}>{item.shortcut}</span>
              )}
              {item.submenu && <span aria-hidden="true" style={{ color: 'var(--ink-faint)', fontSize: 11 }}>▸</span>}
            </button>
          </div>
        ))}
      </div>
      {openItem?.submenu?.({
        position: submenuPosition(openIndex as number),
        onClose: () => setOpenIndex(null),
        closeAll,
      })}
    </div>
  )
}
