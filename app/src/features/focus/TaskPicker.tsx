import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { EmojiText } from '../../components/EmojiText'
import { Float } from '../../components/Float'
import { placeSelect } from '../../components/selectPlacement'
import { useEscapeStack } from '../../lib/overlayStack'
import { uiZoom } from '../../lib/uiScale'
import type { Task } from '../../lib/types'

/** The tasks the Focus picker offers for `query`: open ones whose title holds every typed word
 * (any order, any case), in the order given. */
export function filterFocusTasks<T extends Pick<Task, 'title' | 'status'>>(tasks: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return tasks.filter((t) => t.status === 'todo' && words.every((w) => t.title.toLowerCase().includes(w)))
}

/** Focus → "Select a task to focus on" (Kai 2026-10-03: the long list had no search and ran past
 * the window). Type to filter, ↑/↓ to move, Enter picks (the first match until you move), Esc
 * closes. Drawn on <body> beside its trigger and kept inside the window (placeSelect). */
export function TaskPicker({ tasks, anchorRef, onPick, onClose }: { tasks: Task[]; anchorRef: RefObject<HTMLElement | null>; onPick: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [place, setPlace] = useState<ReturnType<typeof placeSelect> | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const matches = filterFocusTasks(tasks, query)
  useEscapeStack(true, onClose)

  useLayoutEffect(() => {
    const el = anchorRef.current
    if (!el) return
    const z = uiZoom()
    const r = el.getBoundingClientRect()
    // Rows ~34px + the search field: ask for room for up to 9 rows; the list scrolls past that.
    setPlace(placeSelect({ left: r.left / z, top: r.top / z, bottom: r.bottom / z, width: r.width / z }, { width: window.innerWidth / z, height: window.innerHeight / z }, 11, false))
  }, [anchorRef])

  useEffect(() => {
    const away = (e: MouseEvent) => {
      const t = e.target as Node
      if (!panelRef.current?.contains(t) && !anchorRef.current?.contains(t)) onClose()
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [anchorRef, onClose])

  useEffect(() => {
    panelRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!place) return null
  const width = Math.min(340, place.maxWidth)
  return (
    <Float>
      <div
        ref={panelRef}
        className="kf-fade"
        style={{ position: 'fixed', left: place.left, top: place.top, bottom: place.bottom, width, maxHeight: place.maxHeight, zIndex: 1000, display: 'flex', flexDirection: 'column', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 5, boxShadow: 'var(--shadow-popover)' }}
      >
        <div style={{ padding: '8px 10px', borderBottom: '1px dashed var(--line-dashed)' }}>
          <input
            autoFocus
            value={query}
            role="combobox"
            aria-expanded
            aria-controls="kf-focus-picker-list"
            aria-activedescendant={matches[active] ? `kf-focus-pick-${matches[active].id}` : undefined}
            aria-label="Search tasks to focus on"
            placeholder="Select a task to focus on…"
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                if (matches.length) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length)
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const t = matches[active]
                if (t) onPick(t.id)
              }
            }}
            style={{ width: '100%', boxSizing: 'border-box', font: 'inherit', fontSize: 13, color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '7px 10px', outline: 'none' }}
          />
        </div>
        <div id="kf-focus-picker-list" role="listbox" aria-label="Open tasks" style={{ overflowY: 'auto', padding: '4px 0', minHeight: 0 }}>
          {matches.map((t, i) => (
            <div
              key={t.id}
              id={`kf-focus-pick-${t.id}`}
              data-i={i}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => onPick(t.id)}
              style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-body)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: i === active ? 'var(--paper-bone)' : 'none' }}
            >
              <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}><EmojiText text={t.title} /></span>
              {t.top3 && <span style={{ color: 'var(--acc-terra)', flex: 'none' }}>★</span>}
            </div>
          ))}
          {matches.length === 0 && (
            // States t1 voice — hand line, no alarm, never "error"
            <div style={{ padding: '12px', fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-muted)', textAlign: 'center' }}>
              {query.trim() ? 'nothing open by that name ✿' : 'all clear — nothing waiting ✿'}
            </div>
          )}
        </div>
      </div>
    </Float>
  )
}
