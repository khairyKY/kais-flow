import { useEffect, useRef } from 'react'

export interface ContextMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  position: { x: number; y: number }
  onClose: () => void
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const itemHeight = 34
  const maxY = window.innerHeight - 12
  const left = Math.min(position.x, window.innerWidth - 220)
  const top = Math.min(position.y, maxY - items.length * itemHeight)

  return (
    <div
      ref={ref}
      role="menu"
      style={{
        position: 'fixed',
        top: Math.max(12, top),
        left: Math.max(8, left),
        zIndex: 1000,
        background: 'var(--bg-surface)',
        border: '1px solid var(--line-card)',
        boxShadow: 'var(--shadow-popover)',
        borderRadius: 'var(--radius-sharp)',
        padding: '4px 0',
        minWidth: 180,
        transform: 'rotate(-0.3deg)',
      }}
    >
      {items.map((item, i) => (
        <div key={i}>
          {i > 0 && items[i - 1].danger !== item.danger && (
            <div style={{ margin: '2px 10px', borderTop: '1px dashed var(--line-dashed)' }} />
          )}
          <button
            role="menuitem"
            onClick={() => { item.onClick(); onClose() }}
            disabled={item.disabled}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              fontFamily: 'var(--font-ui)',
              fontSize: 13,
              color: item.danger ? 'var(--sig-overdue)' : 'var(--text-primary)',
              background: 'none',
              border: 'none',
              padding: '6px 16px',
              cursor: item.disabled ? 'default' : 'pointer',
              opacity: item.disabled ? 0.35 : 1,
              transition: 'background 0.12s',
            }}
            onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.background = 'var(--bg-input)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  )
}
