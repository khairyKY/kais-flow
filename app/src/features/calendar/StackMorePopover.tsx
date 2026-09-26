import { useEffect, useRef } from 'react'
import { Float } from '../../components/Float'
import { EmojiText } from '../../components/EmojiText'
import { useEscapeStack } from '../../lib/overlayStack'
import { uiZoom } from '../../lib/uiScale'

// CALENDAR.md §6 "stacked (3+)": the topmost shingle reads "+N more" when blocks are fully
// hidden under it. This is where they go — the same parchment popover card SnoozeMenu and the
// view options use (kf-overlay-card, --shadow-popover, 5px radius), no new look (J-13).

export interface StackMoreItem {
  id: string
  title: string
  time: string
}

interface StackMorePopoverProps {
  /** The "+N more" label's rect, VISUAL px (a raw getBoundingClientRect read). */
  anchor: { left: number; bottom: number }
  items: StackMoreItem[]
  onPick: (id: string) => void
  onClose: () => void
}

const WIDTH = 230
const ROW_H = 34

export function StackMorePopover({ anchor, items, onPick, onClose }: StackMorePopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEscapeStack(true, onClose)

  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleDown)
    // A fixed popover over a scrolled grid detaches from its block — close it (ContextMenu's rule).
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  // Visual px in, layout px out — divide by the root zoom once (see uiZoom()).
  const z = uiZoom()
  const estHeight = 30 + items.length * ROW_H
  const left = Math.max(8, Math.min(anchor.left / z, window.innerWidth / z - WIDTH - 8))
  const top = Math.max(12, Math.min(anchor.bottom / z + 4, window.innerHeight / z - estHeight - 12))

  return (
    <Float>
      <div
        ref={ref}
        role="menu"
        aria-label="Stacked blocks"
        data-kf-more-popover=""
        className="kf-overlay-card"
        style={{
          position: 'fixed',
          top,
          left,
          zIndex: 1000,
          width: WIDTH,
          background: 'var(--paper-parchment)',
          border: '1px solid var(--line-card)',
          boxShadow: 'var(--shadow-popover)',
          borderRadius: 5,
          padding: 6,
        }}
      >
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-hairline)', padding: '4px 10px 6px' }}>
          Stacked here
        </div>
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            role="menuitem"
            onClick={() => { onPick(it.id); onClose() }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--paper-bone)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            style={{ display: 'flex', alignItems: 'baseline', gap: 10, width: '100%', textAlign: 'left', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-body)', background: 'none', border: 'none', borderRadius: 5, padding: '7px 10px', cursor: 'pointer' }}
          >
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><EmojiText text={it.title} /></span>
            <span style={{ flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--ink-hairline)' }}>{it.time}</span>
          </button>
        ))}
      </div>
    </Float>
  )
}
