import { useEffect, useRef, useState } from 'react'
import { ACTION_ROW_CSS } from '../../components/ActionSheet'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { Float } from '../../components/Float'
import { Icon } from '../../components/Icon'
import { SheetTitle } from '../../components/TimePicker'
import { useEscapeStack } from '../../lib/overlayStack'
import { uiZoom } from '../../lib/uiScale'
import { useTasks } from './api'
import { matchLabels, toggleLabel, useLabels, type LabelInfo } from './labels'
import './labels.css'

// The Label picker (Overlays.dc.html "Label picker · assign · keyboard L"): find or create, every
// label with its colour and how many tasks carry it, a check on the ones this task has. A tap
// toggles and the picker stays open — a task takes several labels. Desktop: a popover (the chips'
// Label, the row ⋯ → Labels, the L key — on a selection L acts on all of it); phone: a sheet.

export interface LabelPickerProps {
  /** The task(s) being labelled — `L` with a selection passes all of them. */
  taskIds: readonly string[]
  position: { x: number; y: number }
  onClose: () => void
  /** The phone sheet's mono line — the task's title. */
  meta?: string
  /** One task, through its surface's own setter (the sheet's "Saved"); else labels.ts toggleLabel. */
  onSet?: (labels: string[]) => void
}

type Mark = 'on' | 'some' | 'off'

function usePicker({ taskIds, onSet }: LabelPickerProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const { labels } = useLabels()
  const { data: tasks = [] } = useTasks()
  const picked = tasks.filter((t) => taskIds.includes(t.id))
  const { rows, create } = matchLabels(labels, query)
  const mark = (name: string): Mark => {
    const n = picked.filter((t) => t.labels.includes(name)).length
    return n === 0 ? 'off' : n === picked.length ? 'on' : 'some'
  }
  const toggle = (name: string) => {
    const one = picked.length === 1 ? picked[0] : null
    if (one && onSet) onSet(one.labels.includes(name) ? one.labels.filter((l) => l !== name) : [...one.labels, name])
    else toggleLabel(taskIds, name)
  }
  /** Create (and Enter): the name goes onto the task(s); the search clears for the next one. */
  const make = (name: string) => {
    toggle(name)
    setQuery('')
    setActive(0)
  }
  const keys = (e: React.KeyboardEvent) => {
    const last = rows.length + (create ? 1 : 0) - 1
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (step) {
      e.preventDefault()
      setActive((i) => Math.max(0, Math.min(last, i + step)))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // The highlighted row, or Create when that's highlighted (or nothing matches).
      const name = active < rows.length ? rows[active]?.name : create
      if (name) make(name)
    }
  }
  return {
    query,
    setQuery: (q: string) => {
      setQuery(q)
      setActive(0)
    },
    rows,
    create,
    active,
    mark,
    toggle,
    make,
    keys,
    count: picked.length,
  }
}

const Square = ({ color }: { color: string }) => <span className="lp-sq" aria-hidden style={{ background: color }} />
const MarkGlyph = ({ mark }: { mark: Mark }) => <span className="lp-mark" aria-hidden>{mark === 'on' ? <Icon name="check" size={14} /> : mark === 'some' ? '–' : null}</span>
const countText = (l: LabelInfo) => (l.count ? String(l.count) : '')

export function LabelPicker(props: LabelPickerProps) {
  return useIsMobile() ? <LabelSheet {...props} /> : <LabelPopover {...props} />
}

function LabelPopover(props: LabelPickerProps) {
  const { position, onClose } = props
  const p = usePicker(props)
  const ref = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  useEscapeStack(true, onClose)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])

  const z = uiZoom() // screen px → layout px
  const height = 360
  const left = Math.max(8, Math.min(position.x / z, window.innerWidth / z - 240))
  const top = Math.max(12, Math.min(position.y / z, window.innerHeight / z - 12 - height))
  return (
    <Float>
      <div ref={ref} role="dialog" aria-label="Labels" className="lp-pop kf-overlay-card" style={{ top, left, maxHeight: height }}>
        <label className="lp-find">
          <span aria-hidden>⌕</span>
          <input
            ref={input}
            autoFocus
            value={p.query}
            onChange={(e) => p.setQuery(e.target.value)}
            onKeyDown={p.keys}
            placeholder="Find or create…"
            aria-label="Find or create a label"
          />
        </label>
        <div className="lp-list" role="listbox" aria-multiselectable aria-label="Labels">
          {p.rows.length === 0 && !p.create && <div className="lp-empty">No labels yet — type one</div>}
          {p.rows.map((l, i) => (
            <button key={l.name} type="button" role="option" aria-selected={p.mark(l.name) === 'on'} className="lp-mi" data-active={i === p.active || undefined} onClick={() => p.toggle(l.name)}>
              <Square color={l.color} />
              <span className="lp-name">{l.name}</span>
              <span className="lp-count">{countText(l)}</span>
              <MarkGlyph mark={p.mark(l.name)} />
            </button>
          ))}
        </div>
        <div className="lp-rule" />
        <button
          type="button"
          className="lp-mi is-create"
          data-active={(p.create && p.active === p.rows.length) || undefined}
          onClick={() => (p.create ? p.make(p.create) : input.current?.focus())}
        >
          <span className="lp-plus" aria-hidden>＋</span>
          <span className="lp-name">{p.create ? `Create “${p.create}”` : 'Create new label…'}</span>
        </button>
      </div>
    </Float>
  )
}

function LabelSheet(props: LabelPickerProps) {
  const { onClose, meta } = props
  const p = usePicker(props)
  return (
    <BottomSheet onClose={onClose} title={<SheetTitle title="Labels" meta={p.count > 1 ? `${p.count} tasks` : meta} />}>
      {() => (
        <>
          <style>{ACTION_ROW_CSS}</style>
          <label className="lp-sheet-find">
            <Icon name="search" size={20} />
            <input value={p.query} onChange={(e) => p.setQuery(e.target.value)} onKeyDown={p.keys} enterKeyHint="done" placeholder="Find or create…" aria-label="Find or create a label" />
          </label>
          <div className="lp-sheet-rows" role="listbox" aria-multiselectable aria-label="Labels">
            {p.rows.map((l) => (
              <button key={l.name} type="button" role="option" aria-selected={p.mark(l.name) === 'on'} className="kf-as-row" onClick={() => p.toggle(l.name)}>
                <span className="kf-as-icon" aria-hidden><Square color={l.color} /></span>
                <span className="lp-name">{l.name}</span>
                <span className="kf-as-hint">{countText(l)}</span>
                <MarkGlyph mark={p.mark(l.name)} />
              </button>
            ))}
            {p.create && (
              <button type="button" className="kf-as-row is-create" onClick={() => p.make(p.create!)}>
                <span className="kf-as-icon" aria-hidden><Icon name="plus" size={24} /></span>
                <span className="lp-name">Create “{p.create}”</span>
              </button>
            )}
            {p.rows.length === 0 && !p.create && <div className="lp-empty" style={{ padding: '8px 20px' }}>No labels yet — type one above</div>}
          </div>
        </>
      )}
    </BottomSheet>
  )
}
