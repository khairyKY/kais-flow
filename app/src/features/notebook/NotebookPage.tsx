import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { SheetTitle } from '../../components/TimePicker'
import { BackLink, Button, Segmented } from '../../components/kit'
import { ContextMenu } from '../../components/ContextMenu'
import { EmojiText } from '../../components/EmojiText'
import { Float } from '../../components/Float'
import { Icon } from '../../components/Icon'
import { Skeleton } from '../../components/States'
import { useAuth } from '../auth/AuthProvider'
import { useTasks } from '../tasks/api'
import { todayListTasks } from '../tasks/grouping'
import { useCalendarEvents } from '../calendar/api'
import { useRoutineCompletions, useRoutines } from '../routines/api'
import { useStarEvents } from '../today/api'
import { dayTop3 } from '../today/top3Order'
import { legacyGoalId } from '../today/goalStore'
import { useMinuteNow } from '../today/useMinuteNow'
import { useRitualsFinishedToday, useSeedsFor } from '../rituals/api'
import { addDaysToKey } from '../rituals/loopDay'
import { pickPhotos } from '../paper/paperStore'
import { useAppZone } from '../../lib/appZone'
import { zoneDateKey } from '../../lib/dateShortcuts'
import { useToastStore } from '../../lib/toastStore'
import { tick } from '../../lib/haptics'
import { isCapacitorShell } from '../../lib/platform'
import { buildPage, dayNumber, headerDate, pageText, type Mark, type NotebookLayout, type PageBlock, type PageLine } from './page'
import { stampOnPaper, useNotebookLayout, useOnPaper } from './store'
import { LayoutEditor } from './LayoutEditor'
import './notebook.css'

// The Notebook page (/notebook?day=today|tomorrow) — the day laid out to copy by hand into a paper
// journal (Kai 2026-10-03; vault brainstorm §A). NO DESIGN YET: Claude Design prompt 10 was written and
// never run, so this v1 is built from existing kit parts and tokens only, plain and calm, and waits for
// that design pass. Phone: a full-height sheet with sticky actions; desktop: an A5 page with the actions
// beside it. The page stays light paper at night (it's a page); only the chrome goes dark.

type Which = 'today' | 'tomorrow'
const PAPER_SIZES = ['A5', 'A6', 'Letter'] as const
type PaperSize = (typeof PAPER_SIZES)[number]
const FLOURISH = '/ds/assets/fern/coil.png'

/** The day's page from the app's data: Today's Top 3 as Today draws it (before Plan my day, last
 * night's seeds for it), tomorrow's = the seeds Shut down planted. */
function useDayPage(day: string, isToday: boolean, now: Date, zone: string, layout: NotebookLayout) {
  const { data: tasks = [], isPending } = useTasks()
  const { data: events = [] } = useCalendarEvents()
  const { data: routines = [] } = useRoutines()
  const { data: completions = [] } = useRoutineCompletions()
  const { data: stars = [] } = useStarEvents(todayListTasks(tasks, now).filter((t) => t.completed_at || t.top3).map((t) => t.id))
  const seeds = useSeedsFor(day)
  const picks = isToday ? dayTop3(tasks, legacyGoalId(), stars, now) : []
  const top3 = picks.length ? picks : seeds
  return { blocks: buildPage(layout, { day, zone, top3, tasks, events, routines, completions }), top3, loading: isPending }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // No async clipboard (an older WebView, no permission): the selection route.
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  }
}

/** The printed page's size: one @page rule, swapped per print (the browser's / Windows' own dialog). */
function setPrintSize(size: PaperSize): void {
  let el = document.getElementById('nb-page-size')
  if (!el) {
    el = document.createElement('style')
    el.id = 'nb-page-size'
    document.head.append(el)
  }
  el.textContent = `@page { size: ${size === 'Letter' ? 'letter' : size} portrait; margin: ${size === 'A6' ? '8mm' : '14mm'}; }`
}

function readPaperSize(): PaperSize {
  try {
    const v = localStorage.getItem('kf-notebook-paper')
    return PAPER_SIZES.includes(v as PaperSize) ? (v as PaperSize) : 'A5'
  } catch {
    return 'A5'
  }
}

function MarkGlyph({ mark }: { mark: Mark | null }) {
  if (mark === '☐' || mark === '☑') return <span className={`nb-box${mark === '☑' ? ' is-done' : ''}`} aria-hidden="true">{mark === '☑' ? '✓' : ''}</span>
  return mark ? <span className="nb-mark" aria-hidden="true">{mark}</span> : null
}

function Line({ line }: { line: PageLine }) {
  switch (line.kind) {
    case 'item':
      return (
        <div className={`nb-line${line.done ? ' is-done' : ''}${line.text ? '' : ' is-blank'}`}>
          <MarkGlyph mark={line.mark} />
          {line.goal && <span className="nb-goal" title="Goal of the day">✶</span>}
          {line.time && <span className="nb-time">{line.time}</span>}
          <span className="nb-text">{line.text && <EmojiText text={line.text} />}</span>
        </div>
      )
    case 'row':
      return (
        <div className="nb-line nb-row">
          {line.items.map((it, i) => (
            <span key={i} className={`nb-row-item${it.done ? ' is-done' : ''}`}>
              <MarkGlyph mark={it.mark} />
              <EmojiText text={it.text} />
            </span>
          ))}
        </div>
      )
    case 'sub':
      return <div className="nb-sub">{line.text}</div>
    case 'more':
      return <div className="nb-more">{line.text}</div>
    case 'rule':
      return (
        <div className="nb-rule">
          <MarkGlyph mark={line.mark} />
        </div>
      )
    case 'prompt':
      return (
        <div className="nb-line nb-prompt">
          <span className="nb-mark">{line.mark}</span>
          <span className="nb-text">{line.text}</span>
        </div>
      )
  }
}

/** The page itself — the same blocks on screen, in print and in "Copy as text". */
function Paper({ blocks, dayN, onPaper }: { blocks: PageBlock[]; dayN: number | null; onPaper?: boolean }) {
  return (
    <article className="nb-paper" data-theme="day" aria-label="Notebook page">
      {blocks.map((b) =>
        b.id === 'header' ? (
          <header key={b.id} className="nb-head">
            <h2 className="nb-date">{b.title}</h2>
            {b.aside && <span className="nb-aside">{b.aside}</span>}
          </header>
        ) : (
          <section key={b.id} className={`nb-block is-${b.id}`}>
            {b.title && <h3 className="nb-label">{b.title}</h3>}
            {b.lines.map((l, i) => (
              <Line key={i} line={l} />
            ))}
          </section>
        ),
      )}
      <footer className="nb-foot-line">
        <span className="nb-hand">{dayN ? `Day ${dayN} · written by hand ✿` : 'written by hand ✿'}</span>
        {onPaper && <span className="nb-stamp">✎ on paper</span>}
      </footer>
      <img className="nb-flourish" src={FLOURISH} alt="" />
    </article>
  )
}

export function NotebookPage() {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const which: Which = params.get('day') === 'tomorrow' ? 'tomorrow' : 'today'
  const setWhich = (w: Which) => setParams((p) => (p.set('day', w), p), { replace: true })
  const now = useMinuteNow()
  const zone = useAppZone()
  const today = zoneDateKey(now, zone)
  const day = which === 'today' ? today : addDaysToKey(today, 1)
  const [layout, saveLayout] = useNotebookLayout()
  const { blocks, top3, loading } = useDayPage(day, which === 'today', now, zone, layout)
  const session = useAuth().session
  const uid = session?.user.id
  const created = session?.user.created_at
  const dayN = dayNumber(created ? zoneDateKey(new Date(created), zone) : null, day)
  const onPaper = useOnPaper(day)
  const finished = useRitualsFinishedToday(now)
  const notPlanned = which === 'today' && !loading && !finished.morning && top3.length === 0
  const [editing, setEditing] = useState(false)
  const [paper, setPaper] = useState<PaperSize>(readPaperSize)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  // The Capacitor (Android) WebView has no print; the PWA, the browser and the Windows shell do.
  const canPrint = !isCapacitorShell()
  const weekday = headerDate(day, true).split(',')[0]

  useEffect(() => () => document.getElementById('nb-page-size')?.remove(), [])

  const toast = (message: string) => useToastStore.getState().push({ message })
  async function copy() {
    if (!(await copyText(pageText(blocks)))) return toast('Couldn’t copy here — try Print instead.')
    tick()
    stampOnPaper(uid, day)
    toast('Copied — paste it anywhere')
  }
  function print(size: PaperSize) {
    setPaper(size)
    try {
      localStorage.setItem('kf-notebook-paper', size)
    } catch {
      // this print only
    }
    setPrintSize(size)
    // The print copy below re-renders for the size first; the dialog opens after the paint.
    window.setTimeout(() => {
      window.print()
      stampOnPaper(uid, day)
    }, 50)
  }
  function openPrintMenu(el: HTMLElement) {
    const r = el.getBoundingClientRect()
    setMenu({ x: r.left, y: r.bottom + 4 })
  }
  // 11l: photograph the finished page → the ticked boxes come back as done tasks.
  function bringBackTicks() {
    const tasks = blocks.flatMap((b) => b.lines.flatMap((l) => (l.kind === 'item' && l.taskId ? [{ id: l.taskId, title: l.text }] : [])))
    void pickPhotos('camera', { day, label: `${weekday}’s page`, tasks, printed: pageText(blocks).split('\n').filter(Boolean) })
  }
  function leave() {
    if ((window.history.state as { idx?: number } | null)?.idx) navigate(-1)
    else navigate('/today', { replace: true })
  }

  const daySwitch = (
    <Segmented
      value={which}
      label="Which day"
      options={[
        { value: 'today', label: 'Today' },
        { value: 'tomorrow', label: 'Tomorrow' },
      ]}
      onChange={setWhich}
    />
  )
  const planFirst = notPlanned && (
    <div className="nb-planfirst">
      Not planned yet ·{' '}
      <button type="button" className="nb-link" onClick={() => navigate('/today?ritual=morning')}>
        Plan first?
      </button>
    </div>
  )
  const page = loading ? <Skeleton variant="card" /> : <Paper blocks={blocks} dayN={dayN} onPaper={onPaper} />
  const editor = <LayoutEditor layout={layout} onChange={saveLayout} onDone={() => setEditing(false)} />
  const ticksButton = (
    <button type="button" className="nb-ticks" onClick={bringBackTicks}>
      <Icon name="camera" size={22} />
      <span>
        Bring back your ticks
        <small>photo of a done page</small>
      </span>
    </button>
  )
  const extras = (
    <>
      {/* The print copy sits on <body> (the kit's Float), so print CSS can hide every other child of it. */}
      <Float>
        <div className={`nb-print-root is-${paper}`} aria-hidden="true">
          <Paper blocks={blocks} dayN={dayN} />
        </div>
      </Float>
      {menu && (
        <ContextMenu
          position={menu}
          onClose={() => setMenu(null)}
          items={PAPER_SIZES.map((s) => ({ label: s === paper ? `${s} · last used` : s, onClick: () => print(s) }))}
        />
      )}
    </>
  )

  if (isMobile) {
    return (
      <>
        <BottomSheet
          detent="full"
          onClose={leave}
          title={<SheetTitle title="Notebook page" meta={headerDate(day, true)} />}
          footer={() => (
            <div className="nb-phone-foot">
              {ticksButton}
              <Button variant="cta" icon={<Icon name="duplicate" size={18} />} onClick={() => void copy()}>
                Copy as text
              </Button>
            </div>
          )}
        >
          {() => (
            <div className="nb-phone">
              <div className="nb-bar">
                {daySwitch}
                <span style={{ flex: 1 }} />
                {canPrint && (
                  <Button variant="ghost" onClick={(e) => openPrintMenu(e.currentTarget)}>
                    Print
                  </Button>
                )}
                <Button variant="ghost" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
                  Edit layout
                </Button>
              </div>
              {editing && editor}
              {planFirst}
              {page}
            </div>
          )}
        </BottomSheet>
        {extras}
      </>
    )
  }

  return (
    <div className="nb-desk">
      <div className="nb-desk-head">
        <BackLink onClick={leave}>Back</BackLink>
        <h1 className="nb-desk-title">Notebook page</h1>
      </div>
      <div className={`nb-desk-grid${editing ? ' is-editing' : ''}`}>
        {editing && <aside className="nb-side is-editor">{editor}</aside>}
        <div className="nb-desk-page">
          {planFirst}
          {page}
        </div>
        {!editing && (
          <aside className="nb-side" aria-label="Page actions">
            {daySwitch}
            <Button variant="cta" icon={<Icon name="duplicate" size={18} />} onClick={() => void copy()}>
              Copy as text
            </Button>
            {canPrint && (
              <Button variant="secondary" icon={<Icon name="chevdown" size={18} />} onClick={(e) => openPrintMenu(e.currentTarget)}>
                Print / Save PDF
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit layout
            </Button>
            <div className="nb-side-rule" />
            {ticksButton}
          </aside>
        )}
      </div>
      {extras}
    </div>
  )
}
