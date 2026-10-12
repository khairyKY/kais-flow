import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ActionSheet } from '../../components/ActionSheet'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { ContextMenu } from '../../components/ContextMenu'
import { Float } from '../../components/Float'
import { Icon } from '../../components/Icon'
import { Button } from '../../components/kit'
import { SheetTitle } from '../../components/TimePicker'
import { useEscapeStack } from '../../lib/overlayStack'
import { uiZoom } from '../../lib/uiScale'
import { deleteLabelWithUndo, LABEL_COLORS, renameLabelWithUndo, setLabelColor, useLabels, type LabelInfo } from './labels'
import { RowMenuButton } from './SwipeRow'
import './labels.css'
import './TaskRow.css'

// The Labels manager (Overlays.dc.html "Labels · manage · settings"): every label with its colour
// and task count; click a name (or ⋯ → Edit) for the edit row — rename + colour + Save; ⋯ → Delete.
// Rename rewrites the label on every task (a name that already exists merges into it), Delete takes
// it off every task — each with one Undo (./labels.ts). Lives in Settings → Organize, and opens from
// the Tasks page's Label filter ("Manage labels…").
// ponytail: the drawn ⠿ handles and "drag to reorder" are left out — labels list A–Z everywhere (the
// picker, the filter); a stored order joins label_meta when the list drag-and-drop (Motion 2c/2d) lands.
// deviation(2026-10-13 labels): ＋ New is the secondary button, not the drawn terra pill — Settings'
// UI pass keeps one terra CTA per view (DomainsSettings' Add made the same call).

const NEW = '' // ＋ New's edit row — no label has an empty name
type Point = { x: number; y: number }
const tasksWord = (n: number) => (n ? `${n} task${n === 1 ? '' : 's'}` : 'no tasks')

export function LabelManager({ id, style, bare }: { id?: string; style?: CSSProperties; bare?: boolean }) {
  const isMobile = useIsMobile()
  const { labels, ready } = useLabels()
  const [editing, setEditing] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ label: LabelInfo; at: Point } | null>(null)
  const freeColor = LABEL_COLORS.find((c) => !labels.some((l) => l.color === c.value))?.value ?? LABEL_COLORS[0].value
  const items = (l: LabelInfo) => [
    { label: 'Edit', icon: 'label' as const, run: () => setEditing(l.name) },
    { label: 'Delete', icon: 'delete' as const, destructive: true, run: () => deleteLabelWithUndo(l.name) },
  ]
  return (
    <section id={id} className={bare ? 'lm-bare' : 'lm'} style={style} aria-label="Labels">
      {bare ? (
        ready && (
          <button type="button" className="lm-new" onClick={() => setEditing(NEW)}>
            ＋ New label
          </button>
        )
      ) : (
        <header className="lm-head">
          <div>
            <h2 className="lm-title">Labels</h2>
            <span className="lm-total">{labels.length} total</span>
          </div>
          {/* Colours and ＋ New need migration 0069's column; before it, rename and delete still work. */}
          {ready && (
            <Button type="button" variant="secondary" onClick={() => setEditing(NEW)}>
              ＋ New
            </Button>
          )}
        </header>
      )}
      {editing === NEW && <EditRow name="" color={freeColor} ready={ready} onDone={() => setEditing(null)} />}
      {labels.length === 0 && editing !== NEW && <div className="lm-empty">No labels yet — add one to a task (its Label chip, or *label in a quick add).</div>}
      {labels.map((l) =>
        editing === l.name ? (
          <EditRow key={l.name} name={l.name} color={l.color} ready={ready} onDone={() => setEditing(null)} />
        ) : (
          <div
            key={l.name}
            className="lm-row"
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ label: l, at: { x: e.clientX, y: e.clientY } })
            }}
          >
            <span className="lp-sq" aria-hidden style={{ background: l.color }} />
            <button type="button" className="lm-name" title="Rename" onClick={() => setEditing(l.name)}>
              {l.name}
            </button>
            <span className="lm-count">{tasksWord(l.count)}</span>
            <RowMenuButton title={l.name} onOpen={(at) => setMenu({ label: l, at })} />
          </div>
        ),
      )}
      {!bare && <div className="lm-foot">labels cut across every domain ✿</div>}
      {menu &&
        (isMobile ? (
          <ActionSheet
            title={menu.label.name}
            meta={`Label · ${tasksWord(menu.label.count)}`}
            onClose={() => setMenu(null)}
            items={items(menu.label).map((i) => ({ label: i.label, icon: <Icon name={i.icon} size={24} />, destructive: i.destructive, hint: i.destructive ? 'Undo 6s' : undefined, onSelect: i.run }))}
          />
        ) : (
          <ContextMenu position={menu.at} onClose={() => setMenu(null)} items={items(menu.label).map((i) => ({ label: i.label, danger: i.destructive, icon: <Icon name={i.icon} size={16} />, onClick: i.run }))} />
        ))}
    </section>
  )
}

/** The drawn edit state: the name in a field, the six swatches (once colours can be saved), Save.
 * Enter saves, Esc leaves it as it was. `name` '' = ＋ New. */
function EditRow({ name, color, ready, onDone }: { name: string; color: string; ready: boolean; onDone: () => void }) {
  const [text, setText] = useState(name)
  const [pick, setPick] = useState(color)
  const save = () => {
    onDone()
    const next = text.trim()
    if (!next) return
    if (!name) return setLabelColor(next, pick)
    if (next !== name) return renameLabelWithUndo(name, next, pick !== color ? pick : undefined)
    if (pick !== color) setLabelColor(name, pick)
  }
  return (
    <div className="lm-edit">
      <input
        className="lm-input"
        autoFocus
        value={text}
        placeholder="Label name"
        aria-label={name ? `Rename ${name}` : 'New label name'}
        enterKeyHint="done"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            save()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation() // leaves the edit row, not the panel it sits in
            onDone()
          }
        }}
      />
      <div className="lm-swatches">
        {ready &&
          LABEL_COLORS.map((c) => (
            <button key={c.value} type="button" className="lm-swatch" aria-label={c.name} aria-pressed={pick === c.value} style={{ background: c.value, color: c.value }} onClick={() => setPick(c.value)} />
          ))}
        <button type="button" className="lm-save" onClick={save}>
          Save
        </button>
      </div>
    </div>
  )
}

/** "Manage labels…" from the Tasks page's Label filter: the panel under the filter on a computer,
 * a sheet on a phone. */
export function LabelManagerOverlay({ at, onClose }: { at: Point; onClose: () => void }) {
  const isMobile = useIsMobile()
  const { labels } = useLabels()
  const ref = useRef<HTMLDivElement>(null)
  useEscapeStack(!isMobile, onClose)
  useEffect(() => {
    if (isMobile) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    // Next tick: the Label filter (Select) picks on mousedown, and that same event must not close it.
    const t = setTimeout(() => document.addEventListener('mousedown', onDown))
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDown)
    }
  }, [isMobile, onClose])
  if (isMobile) {
    return (
      <BottomSheet onClose={onClose} title={<SheetTitle title="Labels" meta={`${labels.length} total`} />}>
        {() => <LabelManager bare />}
      </BottomSheet>
    )
  }
  const z = uiZoom()
  const width = 344
  const left = Math.max(8, Math.min(at.x / z, window.innerWidth / z - width - 8))
  const top = Math.max(12, at.y / z)
  return (
    <Float>
      <div ref={ref} role="dialog" aria-label="Labels" className="kf-overlay-card" style={{ position: 'fixed', zIndex: 1000, top, left, width, maxHeight: window.innerHeight / z - top - 12, overflowY: 'auto' }}>
        <LabelManager />
      </div>
    </Float>
  )
}
