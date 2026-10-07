import { useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../../components/kit'
import { Icon } from '../../components/Icon'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'
import { SwipeRow } from '../tasks/SwipeRow'
import { useEscapeStack } from '../../lib/overlayStack'
import { toastUndo } from '../../lib/undo'
import { cairoDateKey } from '../../lib/dateShortcuts'
import { perZone } from '../../lib/appZone'
import { useProjects } from '../projects/api'
import { openCapture } from '../command-bar/commandBarStore'
import { applyResults, markReviewed, retryCapture, startReading, useCapture, usePageUrls } from './api'
import { cropFrame, DAILY_PAGES, MAX_PAGES, needsCheck, toEditLine, type CaptureRow, type EditLine, type LineType } from './paperMath'
import { pickPhotos, usePaperStore, type Stage } from './paperStore'

// Paper capture's screens (Paper Capture.dc.html): a quick look 11b/11c, reading 11d, the results sheet
// 11e–11h (a centred panel on desktop, 11m), couldn't read 11i, the daily limit 11j, camera off 11k,
// and the photo itself. 11l (the Notebook page's ticks) waits for the Notebook page.

const TYPE_LABEL: Record<LineType, string> = { task: 'Task', event: 'Event', note: 'Note', journal: 'Journal' }
const TYPE_HINT: Record<LineType, string> = { task: 'to do', event: 'on the calendar', note: 'to the Inbox', journal: "today's journal" }

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
  const isMobile = useIsMobile()
  if (!stage) return null
  switch (stage.kind) {
    case 'look':
      return <QuickLook />
    case 'reading':
      return <Reading stage={stage} />
    case 'results':
      return isMobile ? <PhoneResults id={stage.captureId} /> : <DesktopResults id={stage.captureId} />
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
        <img className={`pp-photo${quarter ? ' is-quarter' : ''}`} src={page.url} alt={`Page ${active + 1}`} style={{ transform: `rotate(${page.rotation}deg)` }} />
      </div>
      {several && (
        <div className="pp-strip">
          <div className="pp-strip-head">
            <span>
              {pages.length} pages · page {active + 1}
            </span>
          </div>
          <div className="pp-strip-row">
            {pages.map((p, i) => (
              <button key={p.id} type="button" className="pp-strip-thumb" aria-label={`Page ${i + 1}`} aria-current={i === active || undefined} onClick={() => usePaperStore.setState({ active: i })}>
                <img src={p.url} alt="" style={{ transform: `rotate(${p.rotation}deg)` }} />
                <span>{i + 1}</span>
              </button>
            ))}
            {pages.length < MAX_PAGES && (
              <button type="button" className="pp-strip-add" onClick={() => void pickPhotos('gallery')}>
                <Icon name="plus" size={20} />
                Add
              </button>
            )}
          </div>
        </div>
      )}
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

type Edit = { text?: string; type?: LineType; dropped?: boolean }

/** The capture's lines as the user has them: read against their projects, with their edits and drops. */
function useLines(capture: CaptureRow | null) {
  const { data: projects = [] } = useProjects()
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const read = useMemo(() => {
    if (!capture) return []
    const live = projects.filter((p) => !p.deleted_at)
    return capture.items.map((it, i) => toEditLine(it, i, live, new Date(capture.created_at)))
  }, [capture, projects])
  const lines = read.map((l) => ({ ...l, ...edits[l.key] })).filter((l) => !edits[l.key]?.dropped)
  const edit = (key: string, patch: Edit) => setEdits((e) => ({ ...e, [key]: { ...e[key], ...patch } }))
  const drop = (key: string) => {
    edit(key, { dropped: true })
    toastUndo('Line dropped', () => edit(key, { dropped: false }))
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

function ResultRow({ line, url, onEdit, onDrop, onHover }: { line: EditLine; url?: string; onEdit: (patch: Edit) => void; onDrop: () => void; onHover?: (on: boolean) => void }) {
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const check = needsCheck(line)
  const at = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.bottom + 4 }
  }
  const typeMenu = (el: HTMLElement) =>
    setMenu({
      ...at(el),
      items: (Object.keys(TYPE_LABEL) as LineType[]).map((t) => ({
        label: `${TYPE_LABEL[t]} — ${TYPE_HINT[t]}`,
        icon: <span className={`pp-type-dot is-${t}`} />,
        onClick: () => onEdit({ type: t }),
      })),
    })
  return (
    <SwipeRow
      actions={{ delete: onDrop, deleteLabel: 'Drop' }}
      tomorrowHint=""
      className="pp-row"
      contentClassName={`pp-row-fg${check ? ' is-check' : ''}`}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      overlay={menu && <ContextMenu items={menu.items} position={menu} onClose={() => setMenu(null)} />}
    >
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
              setEditing(false)
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
          <button type="button" className="pp-row-text" dir="auto" onClick={() => setEditing(true)}>
            {line.text}
          </button>
        )}
        <div className="pp-chips">
          <button type="button" className={`pp-type is-${line.type}`} aria-haspopup="menu" aria-label={`Type: ${TYPE_LABEL[line.type]}`} onClick={(e) => typeMenu(e.currentTarget)}>
            {TYPE_LABEL[line.type]}
            <Icon name="chevdown" size={14} />
          </button>
          {line.dueAt && (line.type === 'task' || line.type === 'event') && (
            <span className="pp-chip">
              <Icon name={line.timed ? 'clock' : 'calendar'} size={14} />
              {dateChip(line.dueAt, line.timed)}
            </span>
          )}
          {line.projectLabel && (
            <span className="pp-chip">
              <span className="pp-dot" aria-hidden="true" />
              {line.projectLabel}
            </span>
          )}
        </div>
        {check && (
          <div className="pp-check">
            <Crop url={url} box={line.box} />
            <span className="pp-check-label">✎ Check this</span>
          </div>
        )}
      </div>
      <button
        type="button"
        className="pp-icon pp-row-more"
        aria-label={`More for “${line.text}”`}
        aria-haspopup="menu"
        onClick={(e) => setMenu({ ...at(e.currentTarget), items: [{ label: 'Edit the text', onClick: () => setEditing(true) }, { label: 'Drop this line', danger: true, onClick: onDrop }] })}
      >
        <Icon name="more" size={24} />
      </button>
    </SwipeRow>
  )
}

function useResults(id: string) {
  const capture = useCapture(id)
  const urls = usePageUrls(capture)
  const { lines, edit, drop } = useLines(capture)
  const close = () => store().close()
  const apply = (mode: 'all' | 'inbox') => {
    if (!capture) return
    applyResults(capture, lines, mode)
    close()
  }
  const unsure = lines.filter(needsCheck).length
  const viewPhoto = (page = 0) => store().show({ kind: 'photo', captureId: id, page, back: { kind: 'results', captureId: id } })
  return { capture, urls, lines, edit, drop, close, apply, unsure, viewPhoto }
}

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

function Banner({ unsure, touch }: { unsure: number; touch: boolean }) {
  const drop = touch ? 'Swipe left to drop a line.' : 'Use ⊞ to drop a line.'
  return (
    <div className="pp-banner">
      {unsure ? `${unsure} ${unsure === 1 ? 'line needs' : 'lines need'} a look — the handwriting is beside ${unsure === 1 ? 'it' : 'them'}. ${drop}` : drop}
    </div>
  )
}

function ResultsFoot({ count, apply }: { count: number; apply: (mode: 'all' | 'inbox') => void }) {
  return (
    <>
      <Button variant="secondary" icon={<Icon name="inbox" size={18} />} disabled={!count} onClick={() => apply('inbox')}>
        Inbox only
      </Button>
      <Button variant="cta" disabled={!count} onClick={() => apply('all')}>
        Add all {count}
      </Button>
    </>
  )
}

function PhoneResults({ id }: { id: string }) {
  const r = useResults(id)
  if (!r.capture) return null
  const capture = r.capture
  return (
    <BottomSheet detent="full" onClose={r.close} footer={(_, keyboardUp) => (keyboardUp ? null : <div className="pp-sheet-foot"><ResultsFoot count={r.lines.length} apply={r.apply} /></div>)}>
      {() => (
        <div className="pp-sheet-body">
          <ResultsHead capture={capture} urls={r.urls} count={r.lines.length} onPhoto={() => r.viewPhoto()} />
          <Banner unsure={r.unsure} touch />
          {r.lines.map((l) => (
            <ResultRow key={l.key} line={l} url={r.urls[l.page]} onEdit={(p) => r.edit(l.key, p)} onDrop={() => r.drop(l.key)} />
          ))}
        </div>
      )}
    </BottomSheet>
  )
}

function DesktopResults({ id }: { id: string }) {
  const r = useResults(id)
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
          <Banner unsure={r.unsure} touch={false} />
          <div className="pp-rows">
            {r.lines.map((l) => (
              <ResultRow
                key={l.key}
                line={l}
                url={r.urls[l.page]}
                onEdit={(p) => r.edit(l.key, p)}
                onDrop={() => r.drop(l.key)}
                onHover={(on) => {
                  setHover(on ? l : null)
                  if (on) setPage(l.page)
                }}
              />
            ))}
          </div>
          <div data-sheet-footer className="pp-foot is-row is-end">
            <ResultsFoot count={r.lines.length} apply={r.apply} />
          </div>
        </div>
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
  const capture = useCapture('captureId' in stage ? stage.captureId : null)
  const urls = usePageUrls(capture)
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
    art = (
      <div className="pp-blur">
        {urls[0] && <img src={urls[0]} alt="" />}
        <span className="pp-blur-badge">
          <Icon name="alert" size={22} />
        </span>
      </div>
    )
    title = 'Couldn’t read this one — retake?'
    body = 'It came out a little blurry, or there’s no handwriting on it. Hold steady over the page, and let it fill the frame.'
    actions = (
      <>
        <Button variant="cta" icon={<Icon name="camera" size={18} />} onClick={() => { settle(); close(); void pickPhotos('camera') }}>
          Retake
        </Button>
        <Button variant="secondary" icon={<Icon name="image" size={18} />} onClick={() => { settle(); close(); void pickPhotos('gallery') }}>
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
