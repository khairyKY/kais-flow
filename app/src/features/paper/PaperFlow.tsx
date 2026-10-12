import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DndContext, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { Button, Checkbox } from '../../components/kit'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/icons/kf'
import { EmojiText } from '../../components/EmojiText'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'
import { ActionSheet } from '../../components/ActionSheet'
import { ScheduleMenu } from '../../components/ScheduleMenu'
import { SelectCircle, SwipeRow } from '../tasks/SwipeRow'
import { MovePicker } from '../tasks/MovePicker'
import { placeKey } from '../tasks/move'
import { LONG_PRESS_MS } from '../tasks/swipe'
import { PRIORITY_LABELS } from '../tasks/taskMenuSpec'
import { priorityColor } from '../tasks/taskDisplay'
import { useEscapeStack } from '../../lib/overlayStack'
import { toastUndo } from '../../lib/undo'
import { useToastStore } from '../../lib/toastStore'
import { longPress } from '../../lib/haptics'
import { cairoDateKey } from '../../lib/dateShortcuts'
import { perZone } from '../../lib/appZone'
import { useProjects } from '../projects/api'
import { useTasks } from '../tasks/api'
import { openCapture } from '../command-bar/commandBarStore'
import { matchTicks } from '../notebook/ticks'
import { applyResults, markReviewed, markTicksDone, retryCapture, startReading, useCapture, usePageUrls } from './api'
import { cropFrame, DAILY_PAGES, editLines, isHeic, MAX_PAGES, movePage, needsCheck, placeEdit, toEditLine, toggleKey, type CaptureRow, type EditLine, type LineEdit, type LineType } from './paperMath'
import { pickPhotos, usePaperStore, type PageDraft, type Stage, type TicksTarget } from './paperStore'

// Paper capture's screens (Paper Capture.dc.html): a quick look 11b/11c, reading 11d, the results sheet
// 11e–11h (a centred panel on desktop, 11m), couldn't read 11i, the daily limit 11j, camera off 11k,
// and the photo itself. 11l: a photo of a Notebook page (its footer's "Bring back your ticks") opens the
// ticks review instead — ticked lines matched to that page's tasks (notebook/ticks.ts), "Mark N done".

const TYPE_LABEL: Record<LineType, string> = { task: 'Task', event: 'Event', note: 'Note', journal: 'Journal' }
const TYPE_HINT: Record<LineType, string> = { task: 'to do', event: 'on the calendar', note: 'to Inbox', journal: 'to today’s entry' } // 11f

const store = () => usePaperStore.getState()

/** Full screen on a phone, a centred panel on desktop. Esc closes. Each screen's bottom bar (.pp-foot)
 * carries data-sheet-footer, so a phone toast docks just above it — never over the ✕ / Rotate header. */
function Frame({ label, onClose, wide, children }: { label: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  useEscapeStack(true, onClose)
  return createPortal(
    <div className="pp-scrim" onClick={onClose}>
      <div className={`pp-frame${wide ? ' is-wide' : ''}`} role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  )
}

function TopBar({ title, onClose, right }: { title?: ReactNode; onClose: () => void; right?: ReactNode }) {
  return (
    <div className="pp-top">
      <button type="button" className="pp-icon" aria-label="Close" onClick={onClose}>
        <Icon name="close" size={24} />
      </button>
      <div className="pp-top-title">{title}</div>
      {right ?? <span className="pp-icon" aria-hidden="true" />}
    </div>
  )
}

export function PaperFlow() {
  const stage = usePaperStore((s) => s.stage)
  const ticksFor = usePaperStore((s) => s.ticksFor)
  const isMobile = useIsMobile()
  if (!stage) return null
  switch (stage.kind) {
    case 'look':
      return <QuickLook />
    case 'reading':
      return <Reading stage={stage} />
    case 'results':
      if (ticksFor[stage.captureId] && !stage.only) return <TicksReview id={stage.captureId} target={ticksFor[stage.captureId]} />
      return isMobile ? <PhoneResults id={stage.captureId} only={stage.only} /> : <DesktopResults id={stage.captureId} only={stage.only} />
    case 'photo':
      return <PhotoView stage={stage} />
    default:
      return <StateScreen stage={stage} />
  }
}

// ── 11b / 11c · a quick look ──
function QuickLook() {
  const pages = usePaperStore((s) => s.pages)
  const active = usePaperStore((s) => s.active)
  const page = pages[active]
  if (!page) return null
  const quarter = page.rotation % 180 !== 0
  const several = pages.length > 1

  const rotate = () => usePaperStore.setState((s) => ({ pages: s.pages.map((p, i) => (i === s.active ? { ...p, rotation: (p.rotation + 90) % 360 } : p)) }))
  const retake = () => {
    const rest = pages.filter((_, i) => i !== active)
    usePaperStore.setState({ pages: rest, active: Math.max(0, Math.min(active, rest.length - 1)) })
    if (!rest.length) store().close()
    void pickPhotos('camera')
  }
  // The browser couldn't draw this page (a HEIC outside Safari, a broken file): it leaves the look —
  // alone, as 11i with the way out; one of several, with a toast and the rest kept.
  const unopenable = (id: string) => {
    const s = store()
    const bad = s.pages.find((p) => p.id === id)
    if (!bad) return // the photo and its thumbnail both fail; the first one handles it
    const rest = s.pages.filter((p) => p.id !== id)
    const heic = isHeic({ type: bad.file.type, name: (bad.file as File).name })
    usePaperStore.setState({ pages: rest, active: Math.max(0, Math.min(s.active, rest.length - 1)) })
    if (!rest.length) s.show({ kind: 'unreadable', heic, ticks: s.stage?.kind === 'look' ? s.stage.ticks : undefined })
    else useToastStore.getState().push({ message: heic ? 'An iPhone photo (HEIC) this browser can’t open was left out — convert it to JPEG first.' : 'A photo this browser can’t open was left out.' })
  }

  return (
    <Frame label="A quick look" onClose={() => store().close()}>
      <TopBar
        title="A quick look"
        onClose={() => store().close()}
        right={
          <button type="button" className="pp-icon" aria-label="Rotate the page" onClick={rotate}>
            <Icon name="rotate" size={24} />
          </button>
        }
      />
      <div className="pp-mat">
        <img className={`pp-photo${quarter ? ' is-quarter' : ''}`} src={page.url} alt={`Page ${active + 1}`} style={{ transform: `rotate(${page.rotation}deg)` }} onError={() => unopenable(page.id)} />
      </div>
      {several && <PageStrip onBroken={unopenable} />}
      <div data-sheet-footer className="pp-foot is-row">
        {several ? (
          <Button variant="secondary" onClick={retake}>
            Retake
          </Button>
        ) : (
          <Button variant="secondary" icon={<Icon name="plus" size={18} />} onClick={() => void pickPhotos('camera')}>
            Add page
          </Button>
        )}
        <Button variant="cta" onClick={() => void startReading()}>
          {several ? `Read ${pages.length} pages` : 'Read'}
        </Button>
      </div>
    </Frame>
  )
}

/** 11c's page strip: tap a page to see it; hold one (touch) or drag it (mouse) onto another's place to
 * reorder — the order they're read in. ⌥← / ⌥→ move the focused page too. */
function PageStrip({ onBroken }: { onBroken: (id: string) => void }) {
  const pages = usePaperStore((s) => s.pages)
  const active = usePaperStore((s) => s.active)
  const isMobile = useIsMobile()
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: LONG_PRESS_MS, tolerance: 8 } }))
  const move = (from: number, to: number) => usePaperStore.setState((s) => movePage(s.pages, s.active, from, to))
  const at = (id: unknown) => pages.findIndex((p) => p.id === id)
  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    if (over) move(at(a.id), at(over.id))
  }
  return (
    <div className="pp-strip">
      <div className="pp-strip-head">
        <span>
          {pages.length} pages · page {active + 1}
        </span>
        <span>{isMobile ? 'hold to reorder' : 'drag to reorder'}</span>
      </div>
      <DndContext sensors={sensors} onDragStart={() => longPress()} onDragEnd={onDragEnd}>
        <div className="pp-strip-row">
          {pages.map((p, i) => (
            <StripThumb key={p.id} page={p} i={i} current={i === active} onBroken={onBroken} onMove={(d) => move(i, i + d)} />
          ))}
          {pages.length < MAX_PAGES && (
            <button type="button" className="pp-strip-add" onClick={() => void pickPhotos('gallery')}>
              <Icon name="plus" size={20} />
              Add
            </button>
          )}
        </div>
      </DndContext>
    </div>
  )
}

function StripThumb({ page, i, current, onBroken, onMove }: { page: PageDraft; i: number; current: boolean; onBroken: (id: string) => void; onMove: (delta: -1 | 1) => void }) {
  const drag = useDraggable({ id: page.id })
  const drop = useDroppable({ id: page.id })
  const t = drag.transform
  return (
    <button
      ref={(el) => {
        drag.setNodeRef(el)
        drop.setNodeRef(el)
      }}
      type="button"
      className={`pp-strip-thumb${drag.isDragging ? ' is-lifted' : ''}${drop.isOver && !drag.isDragging ? ' is-over' : ''}`}
      aria-label={`Page ${i + 1}`}
      aria-current={current || undefined}
      aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
      style={t ? { transform: `translate3d(${t.x}px, ${t.y}px, 0)` } : undefined}
      {...drag.listeners}
      onClick={() => usePaperStore.setState({ active: i })}
      onKeyDown={(e) => {
        if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
        e.preventDefault()
        onMove(e.key === 'ArrowLeft' ? -1 : 1)
      }}
    >
      {/* draggable=false: a native image drag would carry 'Files' and light the drop overlay */}
      <img src={page.url} alt="" draggable={false} style={{ transform: `rotate(${page.rotation}deg)` }} onError={() => onBroken(page.id)} />
      {/* The photo keeps its own colours at night (11n), so its number keeps the day ink. */}
      <span data-theme="day">{i + 1}</span>
    </button>
  )
}

// ── 11d · reading, you can leave ──
function Reading({ stage }: { stage: Extract<Stage, { kind: 'reading' }> }) {
  const shown = usePageUrls(useCapture(stage.captureId))
  const drafts = usePaperStore((s) => s.pages)
  // Until the pages are resized and up, the quick look's own copies.
  const urls = shown.length ? shown : drafts.map((p) => p.url)
  const at = Math.min(stage.read, stage.total - 1)
  const leave = () => usePaperStore.setState({ away: true })
  return (
    <Frame label="Reading your page" onClose={leave}>
      <TopBar onClose={leave} />
      <div className="pp-reading" role="status" aria-live="polite">
        <div className="pp-scanpage">
          {urls[at] && <img src={urls[at]} alt="" />}
          <span className="pp-scanline" aria-hidden="true" />
        </div>
        <div className="pp-title">Reading your page…</div>
        <div className="pp-body">
          {stage.total > 1 ? `Page ${at + 1} of ${stage.total} · ` : ''}about {(stage.total - stage.read) * 10} seconds
        </div>
        {stage.total > 1 && (
          <div className="pp-ticks">
            {Array.from({ length: stage.total }, (_, i) => (
              <div key={i} className="pp-tick">
                {urls[i] ? <img src={urls[i]} alt="" /> : <span className="pp-tick-blank" />}
                <span className={`pp-tick-dot${i < stage.read ? ' is-done' : i === stage.read ? ' is-now' : ''}`} aria-label={i < stage.read ? 'read' : i === stage.read ? 'reading' : 'waiting'}>
                  {i < stage.read && <Icon name="check" size={14} />}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div data-sheet-footer className="pp-foot">
        <div className="pp-foot-note">You can leave — we’ll tell you when it’s ready.</div>
        <Button variant="secondary" onClick={leave}>
          Leave it reading
        </Button>
      </div>
    </Frame>
  )
}

// ── 11e–11h · the results ──

// The user's zone (lib/appZone.ts).
const cairoDay = perZone((timeZone) => new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }))
const cairoTime = perZone((timeZone) => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))
function dateChip(iso: string, timed: boolean): string {
  const d = new Date(iso)
  const day = cairoDateKey(d) === cairoDateKey(new Date()) ? 'Today' : cairoDay().format(d).replace(',', '')
  return timed ? `${day} · ${cairoTime().format(d)}` : day
}

/** The capture's lines as the user has them: read against their projects, with their edits and drops.
 * `only`: just these keys (what's left after a Notebook page's ticks review). */
function useLines(capture: CaptureRow | null, only?: string[]) {
  const { data: projects = [] } = useProjects()
  const [edits, setEdits] = useState<Record<string, LineEdit>>({})
  const read = useMemo(() => {
    if (!capture) return []
    const live = projects.filter((p) => !p.deleted_at)
    return capture.items.map((it, i) => toEditLine(it, i, live, new Date(capture.created_at))).filter((l) => !only || only.includes(l.key))
  }, [capture, projects, only])
  const lines = read.map((l) => ({ ...l, ...edits[l.key] })).filter((l) => !edits[l.key]?.dropped)
  const edit = (keys: Iterable<string>, patch: LineEdit) => setEdits((e) => editLines(e, keys, patch))
  const drop = (keys: string[]) => {
    edit(keys, { dropped: true })
    toastUndo(keys.length === 1 ? 'Line dropped' : `${keys.length} lines dropped`, () => edit(keys, { dropped: false }))
  }
  return { lines, edit, drop }
}

function metaLine(c: CaptureRow): string {
  const pages = `${c.pages} ${c.pages === 1 ? 'page' : 'pages'}`
  const arabic = c.items.some((i) => /[؀-ۿ]/.test(i.text)) ? ' · Arabic' : ''
  return [c.title, `${pages}${arabic}`, `read ${cairoTime().format(new Date(c.updated_at))}`].filter(Boolean).join(' · ')
}

function Crop({ url, box, height = 40, maxWidth = 290 }: { url?: string; box: EditLine['box']; height?: number; maxWidth?: number }) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  if (!url || !box) return null
  const f = nat && cropFrame(box, nat.w, nat.h, height, maxWidth)
  return (
    <span className="pp-crop" style={{ width: f?.width ?? 160, height: f?.height ?? height }}>
      <img
        src={url}
        alt=""
        onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        style={f ? { width: f.imgWidth, left: f.imgLeft, top: f.imgTop } : { opacity: 0 }}
      />
    </span>
  )
}

type At = { x: number; y: number }
type PickerKind = 'type' | 'date' | 'place' | 'priority'
const below = (el: HTMLElement): At => {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.bottom + 4 }
}

/** The pickers a line's chips open (11f) — the Inbox triage card's set: the type popover, ScheduleMenu,
 * MovePicker, and the task menu's priority list. `line` absent: a selection (nothing preselected). */
function LinePicker({ kind, at, line, meta, onEdit, onClose }: { kind: PickerKind; at: At; line?: EditLine; meta: string; onEdit: (patch: LineEdit) => void; onClose: () => void }) {
  const isMobile = useIsMobile()
  if (kind === 'type') {
    return (
      <ContextMenu
        position={at}
        onClose={onClose}
        label="Type"
        items={(Object.keys(TYPE_LABEL) as LineType[]).map((t) => ({ label: TYPE_LABEL[t], hint: TYPE_HINT[t], icon: <span className={`pp-type-dot is-${t}`} />, onClick: () => onEdit({ type: t }) }))}
      />
    )
  }
  if (kind === 'date') {
    const pick = (patch: LineEdit) => {
      onEdit(patch)
      onClose()
    }
    return <ScheduleMenu position={at} title={meta} value={line?.dueAt} onClose={onClose} onSchedule={(iso, _min, timed) => pick({ dueAt: iso, timed: !!timed })} onClear={line?.dueAt ? () => pick({ dueAt: null, timed: false }) : undefined} />
  }
  if (kind === 'place') {
    const current = line ? placeKey({ project_id: line.projectId, area_id: line.areaId, domain_id: line.domainId }) : null
    return <MovePicker position={at} current={current} meta={meta} onPick={(to) => onEdit(placeEdit(to))} onClose={onClose} />
  }
  // The task menu's levels and colours (P1 = Critical); the chip reads P1–P3.
  const levels = [null, 3, 2, 1]
  const name = (p: number | null) => (p ? `P${p} · ${PRIORITY_LABELS[p]}` : 'None')
  return isMobile ? (
    <ActionSheet title="Priority" meta={meta} onClose={onClose} items={levels.map((p) => ({ label: name(p), selected: !!line && line.priority === p, onSelect: () => onEdit({ priority: p }) }))} />
  ) : (
    <ContextMenu position={at} onClose={onClose} label="Priority" items={levels.map((p) => ({ label: name(p), labelColor: priorityColor(p) ?? undefined, onClick: () => onEdit({ priority: p }) }))} />
  )
}

interface RowProps {
  line: EditLine
  url?: string
  /** The capture's title — its line gets the "page title" chip (11e). */
  pageTitle: string | null
  editing: boolean
  onEditing: (on: boolean) => void
  selected: boolean
  selecting: boolean
  onToggleSelect: () => void
  onEdit: (patch: LineEdit) => void
  onDrop: () => void
  onHover?: (on: boolean) => void
}

function ResultRow({ line, url, pageTitle, editing, onEditing, selected, selecting, onToggleSelect, onEdit, onDrop, onHover }: RowProps) {
  const [menu, setMenu] = useState<{ kind: PickerKind | 'more'; at: At } | null>(null)
  // A ⋯ item that opens a picker: ContextMenu runs the item, then its own onClose — which opens this.
  const then = useRef<{ kind: PickerKind; at: At } | null>(null)
  const check = needsCheck(line)
  const dated = line.type === 'task' || line.type === 'event'
  const open = (kind: PickerKind | 'more') => (e: ReactMouseEvent<HTMLElement>) => setMenu({ kind, at: below(e.currentTarget) })
  const chain = (kind: PickerKind) => () => {
    then.current = menu && { kind, at: menu.at }
  }
  const more: ContextMenuItem[] = [
    { label: 'Edit the text', onClick: () => onEditing(true) },
    ...(dated ? [{ label: line.dueAt ? 'Change the date…' : 'Add a date…', onClick: chain('date') }] : []),
    { label: line.projectLabel ? 'Move to…' : 'Add a project…', onClick: chain('place') },
    ...(line.type === 'task' ? [{ label: line.priority ? 'Change the priority…' : 'Add a priority…', onClick: chain('priority') }] : []),
    { label: 'Select', onClick: onToggleSelect },
    { label: 'Drop this line', danger: true, onClick: onDrop },
  ]
  const overlay =
    menu &&
    (menu.kind === 'more' ? (
      <ContextMenu
        items={more}
        position={menu.at}
        onClose={() => {
          setMenu(then.current)
          then.current = null
        }}
      />
    ) : (
      <LinePicker kind={menu.kind} at={menu.at} line={line} meta={line.text} onEdit={onEdit} onClose={() => setMenu(null)} />
    ))
  return (
    <SwipeRow
      actions={{ delete: onDrop, deleteLabel: 'Drop' }}
      tomorrowHint=""
      className="pp-row"
      contentClassName={`pp-row-fg${check ? ' is-check' : ''}${selected ? ' is-selected' : ''}`}
      onLongPress={onToggleSelect}
      selecting={selecting}
      onSelectTap={onToggleSelect}
      // ⌃ / ⌘-click selects on desktop, as on task rows.
      onClickCapture={(e) => {
        if (!(e.ctrlKey || e.metaKey)) return
        e.preventDefault()
        e.stopPropagation()
        onToggleSelect()
      }}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      overlay={overlay}
    >
      {selecting && (
        <span className="pp-select">
          <SelectCircle on={selected} title={line.text} />
        </span>
      )}
      <div className="pp-row-main">
        {editing ? (
          <input
            className="pp-row-input"
            dir="auto"
            autoFocus
            aria-label="Line text"
            defaultValue={line.text}
            onBlur={(e) => {
              const text = e.currentTarget.value.trim()
              if (text && text !== line.text) onEdit({ text })
              onEditing(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                e.stopPropagation()
                e.currentTarget.value = line.text
                e.currentTarget.blur()
              }
            }}
          />
        ) : (
          <button type="button" className="pp-row-text" dir="auto" onClick={() => onEditing(true)}>
            {line.text}
          </button>
        )}
        <div className="pp-chips">
          <button type="button" className={`pp-type is-${line.type}`} aria-haspopup="menu" aria-label={`Type: ${TYPE_LABEL[line.type]}`} onClick={open('type')}>
            {TYPE_LABEL[line.type]}
            <Icon name="chevdown" size={14} />
          </button>
          {line.dueAt && dated && (
            <button type="button" className="pp-chip" aria-haspopup="dialog" aria-label={`Date: ${dateChip(line.dueAt, line.timed)}`} onClick={open('date')}>
              <Icon name={line.timed ? 'clock' : 'calendar'} size={14} />
              {dateChip(line.dueAt, line.timed)}
            </button>
          )}
          {line.projectLabel && (
            <button type="button" className="pp-chip" aria-haspopup="dialog" aria-label={`Project: ${line.projectLabel}`} onClick={open('place')}>
              <span className="pp-dot" aria-hidden="true" />
              <EmojiText text={line.projectLabel} />
            </button>
          )}
          {line.priority != null && line.type === 'task' && (
            <button type="button" className="pp-chip" aria-haspopup="menu" aria-label={`Priority: P${line.priority}`} onClick={open('priority')}>
              P{line.priority}
            </button>
          )}
          {/* The heading the read took the page's title from ("OS lecture 3 — 4 Oct" → "OS lecture 3"). */}
          {pageTitle && line.type === 'note' && line.page === 0 && line.text.startsWith(pageTitle) && <span className="pp-chip">page title</span>}
        </div>
        {check && (
          <div className="pp-check">
            <Crop url={url} box={line.box} />
            <span className="pp-check-label">✎ Check this</span>
          </div>
        )}
      </div>
      {!selecting && (
        <button type="button" className="pp-icon pp-row-more" aria-label={`More for “${line.text}”`} aria-haspopup="menu" onClick={open('more')}>
          <Icon name="more" size={24} />
        </button>
      )}
    </SwipeRow>
  )
}

function useResults(id: string, only?: string[]) {
  const capture = useCapture(id)
  const urls = usePageUrls(capture)
  const { lines, edit, drop } = useLines(capture, only)
  const [editing, setEditing] = useState<string | null>(null)
  // Long-press selection (MK Selection): only lines still on the sheet count.
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const selected = lines.filter((l) => picked.has(l.key)).map((l) => l.key)
  const clear = () => setPicked(new Set())
  useEscapeStack(selected.length > 0, clear)
  const close = () => store().close()
  const apply = (mode: 'all' | 'inbox') => {
    if (!capture) return
    applyResults(capture, lines, mode)
    close()
  }
  const unsure = lines.filter(needsCheck).length
  const viewPhoto = (page = 0) => store().show({ kind: 'photo', captureId: id, page, back: { kind: 'results', captureId: id } })
  const row = (l: EditLine) => ({
    line: l,
    pageTitle: capture?.title ?? null,
    editing: editing === l.key,
    onEditing: (on: boolean) => setEditing(on ? l.key : null),
    selected: picked.has(l.key),
    selecting: selected.length > 0,
    onToggleSelect: () => setPicked((s) => toggleKey(s, l.key)),
    onEdit: (p: LineEdit) => edit([l.key], p),
    onDrop: () => drop([l.key]),
  })
  const bulk = {
    count: selected.length,
    clear,
    all: () => setPicked(new Set(lines.map((l) => l.key))),
    edit: (p: LineEdit) => {
      edit(selected, p)
      clear()
    },
    drop: () => {
      drop(selected)
      clear()
    },
  }
  return { capture, urls, lines, close, apply, unsure, editing: !!editing, viewPhoto, row, bulk }
}
type Bulk = ReturnType<typeof useResults>['bulk']

function ResultsHead({ capture, urls, count, onPhoto }: { capture: CaptureRow; urls: string[]; count: number; onPhoto: () => void }) {
  return (
    <div className="pp-rhead">
      {urls[0] && (
        <button type="button" className="pp-thumb" aria-label="See the photo" onClick={onPhoto}>
          <img src={urls[0]} alt="" />
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="pp-rtitle">
          From your page · {count} {count === 1 ? 'thing' : 'things'}
        </div>
        <div className="pp-meta">{metaLine(capture)}</div>
      </div>
    </div>
  )
}

/** The line under the head (11e), "Editing 1 line" while one is open (11f) — or, selecting, the
 * selection's own bar: ✕ · N selected · Select all (MK Selection's app bar). */
function Banner({ unsure, touch, editing, bulk }: { unsure: number; touch: boolean; editing: boolean; bulk: Bulk }) {
  if (bulk.count) {
    return (
      <div className="pp-banner pp-selhead" role="toolbar" aria-label="Selection">
        <button type="button" className="pp-icon" aria-label="Clear selection" onClick={bulk.clear}>
          <Icon name="close" size={24} />
        </button>
        <span className="pp-selcount">{bulk.count} selected</span>
        <button type="button" className="pp-link" onClick={bulk.all}>
          Select all
        </button>
      </div>
    )
  }
  if (editing) return <div className="pp-banner">Editing 1 line</div>
  const drop = touch ? 'Swipe left to drop a line.' : 'Use ⊞ to drop a line.'
  return (
    <div className="pp-banner">
      {unsure ? `${unsure} ${unsure === 1 ? 'line needs' : 'lines need'} a look — the handwriting is beside ${unsure === 1 ? 'it' : 'them'}. ${drop}` : drop}
    </div>
  )
}

/** Add all / Inbox only — or, selecting, what the selection can do: Type · Date · Project · Drop (the
 * bulk bar's grammar, inside the sheet: the tab bar isn't under a sheet to be replaced). */
function ResultsFoot({ count, apply, bulk }: { count: number; apply: (mode: 'all' | 'inbox') => void; bulk: Bulk }) {
  const [menu, setMenu] = useState<{ kind: PickerKind; at: At; meta: string } | null>(null)
  const act = (kind: PickerKind, icon: IconName, label: string) => (
    <button type="button" className="pp-selbtn" aria-haspopup="dialog" onClick={(e) => setMenu({ kind, at: below(e.currentTarget), meta: `${bulk.count} selected` })}>
      <Icon name={icon} size={24} />
      {label}
    </button>
  )
  return (
    <>
      {bulk.count ? (
        <div className="pp-selfoot" role="toolbar" aria-label="Selected lines">
          {act('type', 'tasks', 'Type')}
          {act('date', 'pickdate', 'Date')}
          {act('place', 'project', 'Project')}
          <button type="button" className="pp-selbtn is-destructive" onClick={bulk.drop}>
            <Icon name="delete" size={24} />
            Drop
          </button>
        </div>
      ) : (
        <>
          <Button variant="secondary" icon={<Icon name="inbox" size={18} />} disabled={!count} onClick={() => apply('inbox')}>
            Inbox only
          </Button>
          <Button variant="cta" disabled={!count} onClick={() => apply('all')}>
            Add all {count}
          </Button>
        </>
      )}
      {/* Outside the branch: a pick clears the selection, and the picker must outlive that to close. */}
      {menu && <LinePicker kind={menu.kind} at={menu.at} meta={menu.meta} onEdit={bulk.edit} onClose={() => setMenu(null)} />}
    </>
  )
}

function PhoneResults({ id, only }: { id: string; only?: string[] }) {
  const r = useResults(id, only)
  if (!r.capture) return null
  const capture = r.capture
  return (
    <BottomSheet detent="full" onClose={r.close} footer={(_, keyboardUp) => (keyboardUp ? null : <div className="pp-sheet-foot"><ResultsFoot count={r.lines.length} apply={r.apply} bulk={r.bulk} /></div>)}>
      {() => (
        <div className="pp-sheet-body">
          <ResultsHead capture={capture} urls={r.urls} count={r.lines.length} onPhoto={() => r.viewPhoto()} />
          <Banner unsure={r.unsure} touch editing={r.editing} bulk={r.bulk} />
          {r.lines.map((l) => (
            <ResultRow key={l.key} url={r.urls[l.page]} {...r.row(l)} />
          ))}
        </div>
      )}
    </BottomSheet>
  )
}

function DesktopResults({ id, only }: { id: string; only?: string[] }) {
  const r = useResults(id, only)
  const [page, setPage] = useState(0)
  const [hover, setHover] = useState<EditLine | null>(null)
  if (!r.capture) return null
  const box = hover?.page === page ? hover.box : null
  return (
    <Frame label="From your page" onClose={r.close} wide>
      <div className="pp-split">
        <div className="pp-side">
          <div className="pp-side-page">
            {r.urls[page] && <img src={r.urls[page]} alt={`Page ${page + 1}`} />}
            {box && <span className="pp-box" style={{ left: `${box[0] * 100}%`, top: `${box[1] * 100}%`, width: `${box[2] * 100}%`, height: `${box[3] * 100}%` }} />}
          </div>
          {r.capture.pages > 1 && (
            <div className="pp-side-pages">
              {Array.from({ length: r.capture.pages }, (_, i) => (
                <button key={i} type="button" className="pp-chip" aria-current={i === page || undefined} onClick={() => setPage(i)}>
                  Page {i + 1}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="pp-link" onClick={() => r.viewPhoto(page)}>
            View full size
          </button>
          <div className="pp-meta" style={{ textAlign: 'center' }}>hover a line to see where it came from</div>
        </div>
        <div className="pp-main-col">
          <div className="pp-rhead-row">
            <ResultsHead capture={r.capture} urls={[]} count={r.lines.length} onPhoto={() => r.viewPhoto(page)} />
            <button type="button" className="pp-icon" aria-label="Close" onClick={r.close}>
              <Icon name="close" size={24} />
            </button>
          </div>
          <Banner unsure={r.unsure} touch={false} editing={r.editing} bulk={r.bulk} />
          <div className="pp-rows">
            {r.lines.map((l) => (
              <ResultRow
                key={l.key}
                url={r.urls[l.page]}
                {...r.row(l)}
                onHover={(on) => {
                  setHover(on ? l : null)
                  if (on) setPage(l.page)
                }}
              />
            ))}
          </div>
          <div data-sheet-footer className="pp-foot is-row is-end">
            <ResultsFoot count={r.lines.length} apply={r.apply} bulk={r.bulk} />
          </div>
        </div>
      </div>
    </Frame>
  )
}

// ── 11l · a Notebook page's ticks: "5 ticked on paper → mark done?" ──
function TicksReview({ id, target }: { id: string; target: TicksTarget }) {
  const capture = useCapture(id)
  const urls = usePageUrls(capture)
  const { data: tasks = [] } = useTasks()
  // The page's tasks as they are now: one finished since the page was written isn't offered again.
  const open = useMemo(() => new Set(tasks.filter((t) => t.status === 'todo').map((t) => t.id)), [tasks])
  const result = useMemo(() => {
    const lines = (capture?.items ?? []).map((it, i) => ({ key: `${it.page}:${i}`, text: it.text, checked: it.checked ?? null, item: it }))
    return matchTicks(lines, target.tasks.filter((t) => open.has(t.id)), target.printed)
  }, [capture, target, open])
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const close = () => store().close()
  if (!capture) return null
  const chosen = result.ticked.filter((m) => !skipped.has(m.task.id))
  const fresh = result.fresh.map((l) => l.key)
  const itemOf = (key: string) => capture.items[Number(key.split(':')[1])]
  const toggle = (taskId: string) =>
    setSkipped((s) => {
      const next = new Set(s)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  // New scribbles go on to the usual results (only them); otherwise the photo is done with.
  const next = () => (fresh.length ? store().show({ kind: 'results', captureId: id, only: fresh }) : close())
  const markDone = () => {
    markTicksDone(capture, chosen.map((m) => m.task.id), !fresh.length)
    next()
  }
  const n = chosen.length
  return (
    <Frame label="Bring back your ticks" onClose={close}>
      <TopBar title="Bring back your ticks" onClose={close} />
      <div className="pp-rows">
        <div className="pp-rhead">
          {urls[0] && (
            <button type="button" className="pp-thumb" aria-label="See the photo" onClick={() => store().show({ kind: 'photo', captureId: id, page: 0, back: { kind: 'results', captureId: id } })}>
              <img src={urls[0]} alt="" />
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pp-rtitle">{result.ticked.length ? `${result.ticked.length} ticked on paper → mark done?` : 'No ticks found on this page'}</div>
            <div className="pp-meta">Matched to {target.label}</div>
          </div>
        </div>
        {!result.ticked.length && <div className="pp-banner">None of the ticked boxes matched a task still open on {target.label}. Hold the camera square over the page and try again — or keep the lines as notes.</div>}
        {result.ticked.map((m) => {
          const item = itemOf(m.line.key)
          return (
            <div key={m.task.id} className="pp-row">
              <div className="pp-row-fg pp-tickrow">
                <span className="pp-tickhit">
                  <Checkbox checked={!skipped.has(m.task.id)} label={m.task.title} onChange={() => toggle(m.task.id)} />
                </span>
                <div className="pp-row-main">
                  <div className="pp-row-text">
                    <EmojiText text={m.task.title} />
                  </div>
                  <div className="pp-check">
                    <Crop url={urls[item?.page ?? 0]} box={item?.box ?? null} height={32} maxWidth={220} />
                    <span className="pp-meta" dir="auto">☑ {m.line.text}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        {result.open.length > 0 && <div className="pp-banner">{result.open.length} still open on paper · left as they are</div>}
        {fresh.length > 0 && <div className="pp-banner">New on the page · {fresh.length} — you’ll see {fresh.length === 1 ? 'it' : 'them'} next, like any page.</div>}
      </div>
      <div data-sheet-footer className="pp-foot is-row">
        <Button variant="secondary" onClick={close}>
          Not now
        </Button>
        {n > 0 ? (
          <Button variant="cta" onClick={markDone}>
            Mark {n} done
          </Button>
        ) : (
          fresh.length > 0 && (
            <Button variant="cta" onClick={next}>
              Review the lines
            </Button>
          )
        )}
      </div>
    </Frame>
  )
}

// ── the photo itself (from the results, an Inbox row or a task) ──
function PhotoView({ stage }: { stage: Extract<Stage, { kind: 'photo' }> }) {
  const capture = useCapture(stage.captureId)
  const urls = usePageUrls(capture)
  const back = () => store().show(stage.back ?? null)
  const gone = capture && !capture.storage_paths.length
  return (
    <Frame label="Your page" onClose={back} wide>
      <TopBar title={capture?.title ?? 'Your page'} onClose={back} />
      <div className="pp-mat">
        {gone ? (
          <div className="pp-body">This photo was deleted — photos are kept 7 days.</div>
        ) : (
          urls[stage.page] && <img className="pp-photo" src={urls[stage.page]} alt={`Page ${stage.page + 1}`} />
        )}
      </div>
      {capture && capture.pages > 1 && (
        <div data-sheet-footer className="pp-foot is-row">
          {Array.from({ length: capture.pages }, (_, i) => (
            <button key={i} type="button" className="pp-chip" aria-current={i === stage.page || undefined} onClick={() => store().show({ ...stage, page: i })}>
              Page {i + 1}
            </button>
          ))}
        </div>
      )}
    </Frame>
  )
}

// ── 11i couldn't read · failed · 11j the daily limit · 11k camera off ──
function StateScreen({ stage }: { stage: Extract<Stage, { kind: 'unreadable' | 'failed' | 'limit' | 'denied' }> }) {
  const capture = useCapture(('captureId' in stage && stage.captureId) || null)
  const urls = usePageUrls(capture)
  // A retake of a Notebook page is still a Notebook page (11l).
  const ticks = usePaperStore((s) => (stage.kind === 'unreadable' && stage.ticks) || ('captureId' in stage && stage.captureId ? s.ticksFor[stage.captureId] : undefined))
  const close = () => store().close()
  // Couldn't read: the photo goes (it's of nothing useful), and the flow starts over.
  const settle = () => capture && !capture.reviewed_at && markReviewed(capture, true)
  let art: ReactNode
  let title: string
  let body: string
  let actions: ReactNode
  let onClose = close
  if (stage.kind === 'unreadable') {
    onClose = () => {
      settle()
      close()
    }
    const badge = (
      <span className="pp-blur-badge">
        <Icon name="alert" size={22} />
      </span>
    )
    // A HEIC this browser can't open has no picture to blur: the photo glyph stands in.
    art = stage.heic ? (
      <span className="pp-roundel">
        <Icon name="image" size={40} />
        {badge}
      </span>
    ) : (
      <div className="pp-blur">
        {urls[0] && <img src={urls[0]} alt="" />}
        {badge}
      </div>
    )
    title = 'Couldn’t read this one — retake?'
    body = stage.heic
      ? 'It’s an iPhone photo (HEIC), and this browser can’t open those. Convert it to JPEG first, then pick it again.'
      : 'It came out a little blurry, or there’s no handwriting on it. Hold steady over the page, and let it fill the frame.'
    actions = (
      <>
        <Button variant="cta" icon={<Icon name="camera" size={18} />} onClick={() => { settle(); close(); void pickPhotos('camera', ticks) }}>
          Retake
        </Button>
        <Button variant="secondary" icon={<Icon name="image" size={18} />} onClick={() => { settle(); close(); void pickPhotos('gallery', ticks) }}>
          Pick another photo
        </Button>
      </>
    )
  } else if (stage.kind === 'failed') {
    art = <span className="pp-roundel"><Icon name="alert" size={40} /></span>
    title = 'We couldn’t read it just now'
    body = 'The photo is saved. Try again, or come back to it from the Inbox.'
    actions = (
      <>
        <Button variant="cta" disabled={!capture} onClick={() => capture && retryCapture(capture)}>
          Try again
        </Button>
        <Button variant="secondary" onClick={close}>
          Later
        </Button>
      </>
    )
  } else if (stage.kind === 'limit') {
    art = <img src="/ds/assets/clover/resting.png" alt="" className="pp-art" />
    title = `That’s ${DAILY_PAGES} pages today.`
    body = 'Reading resets at midnight. This photo is kept, and it’s read first thing tomorrow.'
    actions = (
      <>
        <Button variant="cta" onClick={() => { close(); openCapture() }}>
          Type them in
        </Button>
        <Button variant="secondary" onClick={close}>
          Read it tomorrow
        </Button>
      </>
    )
  } else {
    art = (
      <span className="pp-roundel">
        <Icon name="camera" size={40} />
        <span className="pp-roundel-slash" />
      </span>
    )
    title = 'The camera is switched off for Kai’s Flow'
    body = 'You can turn it on in your phone’s settings, or use a photo you’ve already taken.'
    actions = (
      <Button variant="cta" icon={<Icon name="image" size={18} />} onClick={() => { close(); void pickPhotos('gallery') }}>
        Pick from gallery instead
      </Button>
    )
  }
  return (
    <Frame label={title} onClose={onClose}>
      <TopBar onClose={onClose} />
      <div className="pp-state">
        {art}
        <div className="pp-title">{title}</div>
        <div className="pp-body">{body}</div>
        {stage.kind === 'limit' && (
          <div className="pp-meter" aria-label={`Scans today: ${DAILY_PAGES} of ${DAILY_PAGES}`}>
            <span>Scans today</span>
            <span className="pp-meter-bar">
              <span style={{ width: '100%' }} />
            </span>
            <span>
              {DAILY_PAGES} / {DAILY_PAGES}
            </span>
          </div>
        )}
      </div>
      <div data-sheet-footer className="pp-foot">{actions}</div>
    </Frame>
  )
}
