import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { uiZoom } from '../../lib/uiScale'
import { useEscapeStack } from '../../lib/overlayStack'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { finishDraft, markOutsidePress, readTitle, useDraft, type DraftKind } from './createDraft'

const KIND_WORD: Record<DraftKind, string> = { event: 'Event', task: 'Task', block: 'Time block' }

/** The title of a block being added, typed where the block sits (the desktop grid's selection mirror and the
 * phone grid's draft block both draw it). Mounted = the draft is open: Enter saves, Esc and Back discard, a
 * press anywhere else saves a titled draft and drops an empty one (createDraft). The kind it will be shows
 * beside the time, so a "t " or a trailing "task" is never a surprise. */
export function DraftTitle({ time }: { time: string }) {
  const text = useDraft((s) => s.text)
  const preset = useDraft((s) => s.draft?.kind ?? 'event')
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const ctx = useRef({ domains, projects })
  ctx.current = { domains, projects }

  useEscapeStack(true, () => finishDraft('escape', ctx.current))
  // What's typed here is the title's: FullCalendar's own key handling on the block (Space and Enter click it) and the
  // app's hotkeys never see it, and Enter saves. A native listener, since theirs sit under React's root and a React
  // handler would come too late. Esc goes on to the overlay stack.
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = field.current
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return
      e.stopPropagation()
      if (e.key !== 'Enter' || e.isComposing) return
      e.preventDefault()
      finishDraft('enter', ctx.current)
    }
    el?.addEventListener('keydown', key)
    return () => el?.removeEventListener('keydown', key)
  }, [])
  useEffect(() => {
    const press = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.('.kf-draft')) return
      if (finishDraft('outside', ctx.current)) markOutsidePress()
    }
    // capture: before anything the press lands on can act (or stop it)
    document.addEventListener('pointerdown', press, true)
    return () => {
      document.removeEventListener('pointerdown', press, true)
      // Gone without a verdict (the selection was dropped, the page left) and not drawn again a moment later: the draft goes too.
      window.setTimeout(() => { if (!document.querySelector('.kf-draft')) useDraft.getState().close() }, 100)
    }
  }, [])

  return (
    <div className="kf-draft">
      <input
        ref={field}
        className="kf-draft-input"
        autoFocus
        aria-label="Title"
        placeholder="Title"
        enterKeyHint="done"
        autoComplete="off"
        value={text}
        onChange={(e) => useDraft.getState().setText(e.target.value)}
      />
      <span className="fc-event-time kf-draft-time">{time ? `${time} · ` : ''}{KIND_WORD[readTitle(text, preset).kind]}</span>
    </div>
  )
}

/** What the desktop grid's selection mirror holds: the draft's title while one is open, else the preview it shows
 * while a range is dragged. Subscribes itself — FullCalendar doesn't redraw the mirror when the draft opens. */
export function MirrorBody({ time, body }: { time: string; body: ReactNode }) {
  const open = useDraft((s) => !!s.draft)
  return open ? <DraftTitle time={time} /> : body
}

/** An all-day draft has no mirror (FullCalendar draws a highlight on the day cells and nothing in it), so its title is
 * typed over that highlight. Fixed to the highlight's place when the draft opens; the band doesn't scroll. */
export function AllDayDraft({ wrap }: { wrap: RefObject<HTMLElement | null> }) {
  const draft = useDraft((s) => s.draft)
  const on = !!draft?.allDay
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    if (!on) return setBox(null)
    // the highlight is drawn a beat after FullCalendar selects
    const raf = requestAnimationFrame(() => {
      const r = wrap.current?.querySelector<HTMLElement>('.fc-highlight')?.getBoundingClientRect()
      const z = uiZoom()
      setBox(r ? { left: r.left / z, top: r.top / z, width: r.width / z, height: r.height / z } : null)
    })
    return () => cancelAnimationFrame(raf)
  }, [on, draft?.start, draft?.end, wrap])
  if (!on || !box) return null
  return createPortal( // ds-ok: a title field over FullCalendar's highlight, not a floating panel
    <div className="kf-draft-band" style={box}>
      <DraftTitle time="" />
    </div>,
    document.body,
  )
}
