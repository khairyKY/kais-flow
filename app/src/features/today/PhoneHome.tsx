import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import { clockText, useHour24 } from '../../lib/clock'
import type { CalendarEvent, Task } from '../../lib/types'
import { NowCard, hueVars } from '../calendar/NowCard'
import { timeText } from '../calendar/eventTime'
import type { RitualKind } from '../rituals/api'
import { isEvening, ritualFinished, ritualProgress, SHUTDOWN_FROM, type RitualState } from './dayPhase'
import { PHONE_VIEW_EVENT, readPhoneView, thenBlocks, writePhoneView, type PhoneView } from './phoneView'
import { span } from './todayLayout'
import { DAY_FROM, DAY_TO } from '../rituals/ritualLogic'
import { useMinuteNow } from './useMinuteNow'
import { useMotionEnabled } from '../../lib/motion'

// phone-today (Kai 2026-10-26): the phone Today's B · "Now + next" parts — the calendar's Now card with
// the next two blocks under it, and the Rituals panel — plus the Now / Day preference (set in Settings). Spec: design-export/
// Phone home options.html (today-looks worktree), direction B. Settings' rounded panels (.tp-pn, today.css).

/** The phone home's view (Now = B, Day = the Day bar), remembered per device (./phoneView PHONE_VIEW_KEY).
 * today-v2 (Kai 2026-10-29): the switch moved off Today into Settings → Appearance ("Phone home shows"). */
export function usePhoneView(): [PhoneView, (v: PhoneView) => void] {
  const [v, setV] = useState(readPhoneView)
  // v161: a change made elsewhere (Settings, another tab) reaches a Today that's still drawn.
  useEffect(() => {
    const on = () => setV(readPhoneView())
    window.addEventListener(PHONE_VIEW_EVENT, on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener(PHONE_VIEW_EVENT, on)
      window.removeEventListener('storage', on)
    }
  }, [])
  return [v, (next) => { setV(next); writePhoneView(next) }]
}

/** The view Today last drew, this visit to the app (null until it has drawn one). */
let drawnView: PhoneView | null = null

/**
 * v161 (Kai on v1.6.0: "the pill only animates from Now to Day, not from Day to Now"): the Now / Day change
 * plays the same way both ways — the old view fades out and the new one fades in, sliding the way the
 * Settings control's thumb went (Now ← · → Day; today.css .tp-swap). It plays when the view changes under a
 * drawn Today, and when Today comes back drawing a different view than it last did (the switch is in
 * Settings, so that's the usual case). Effects off or reduced motion: the new view, at once.
 */
export function ViewSwap({ view, render }: { view: PhoneView; render: (v: PhoneView) => ReactNode }) {
  const motion = useMotionEnabled()
  const [prev, setPrev] = useState<PhoneView | null>(() => (drawnView && drawnView !== view ? drawnView : null))
  const [shown, setShown] = useState(view)
  if (shown !== view) {
    // Set while rendering (not in an effect), so the new view's first frame is already the fade's first.
    setShown(view)
    setPrev(shown)
  }
  useEffect(() => {
    drawnView = view
  }, [view])
  const out = motion && prev && prev !== view ? prev : null
  return (
    <div className="tp-swap" data-to={view}>
      {out && <div key={`out-${out}`} className="tp-swap-out" aria-hidden inert>{render(out)}</div>}
      <div key={view} className={out ? 'tp-swap-in' : undefined} onAnimationEnd={(e) => e.target === e.currentTarget && setPrev(null)}>
        {render(view)}
      </div>
    </div>
  )
}

/** today-v2 (Kai 2026-10-29, over warning D, design-export/Over warning options.html): the Top 3 panel's title.
 * During the day it says what's planned against what's free — "Top 3 · 4h 10m planned · 3h free", the free part
 * the first to go when the line is too narrow (today.css .tp-load-l) — and, when the plan doesn't fit, a chip in
 * "Ran over"'s look under it: "1h 50m more than today can fit". A tap opens how it's counted, and the Top 3 rows
 * offer Tomorrow (TodayPage). `load` null (nothing planned yet, or the evening): the plain "· 3h 50m planned". */
export function Top3Head({ load, planned, open, onToggle }: {
  load: { planned: number; free: number; over: number } | null
  /** The picks' own length (./todayLayout top3Planned), the title's note when `load` is null. */
  planned: number
  open: boolean
  onToggle: () => void
}) {
  useHour24()
  if (!load) {
    return <div className="tp-pt">Top 3{planned > 0 && <span className="tp-pt-note"> · {span(planned)} planned</span>}<Link to="/tasks" className="tp-pt-link">All tasks</Link></div>
  }
  const over = load.over > 0
  const from = clockText(hhmm(DAY_FROM))
  const to = clockText(hhmm(DAY_TO))
  return (
    <>
      <div className={`tp-pt tp-load${over ? ' is-over' : ''}`}>
        <button
          type="button"
          className="tp-load-btn"
          aria-expanded={open}
          aria-label={`Top 3: ${load.planned > 0 ? `${span(load.planned)} planned, ` : ''}${span(load.free)} free${over ? `, ${span(load.over)} more than today can fit` : ''}. ${open ? 'Hide' : 'Show'} how it’s counted and Tomorrow on each pick`}
          onClick={onToggle}
        >
          <span className="tp-load-l">
            <span>Top 3</span>
            {load.planned > 0 && <span className="tp-pt-note"> · <span className="tp-load-n">{span(load.planned)}</span> planned</span>}
            <span className="tp-pt-note tp-load-free"> · {span(load.free)} free</span>
          </span>
          <Icon name="chevdown" size={14} className="tp-load-chev" />
        </button>
        <Link to="/tasks" className="tp-pt-link">All tasks</Link>
      </div>
      {over && <div className="tp-over"><span className="tp-over-chip">{span(load.over)} more than today can fit</span></div>}
      {open && <p className="tp-load-why">Top 3 and today’s blocks, against the free time left today ({from}–{to}). Move a pick to tomorrow to make room.</p>}
    </>
  )
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** The clock time without its AM / PM ("1:30"), as the design's "Then" rows read; 24h stays as it is. */
const shortTime = (iso: string) => timeText(new Date(iso)).replace(/\s?[AP]M$/i, '')

/** One block in the calendar's own look (palette C: its accent mixed into the paper, the time in its ink). */
export function BlockLine({ event, task, goal, onOpen }: { event: CalendarEvent; task?: Task; goal?: boolean; onOpen: (e: CalendarEvent) => void }) {
  return (
    <button type="button" className={`tp-bk${goal ? ' is-goal' : ''}`} style={hueVars(event)} onClick={() => onOpen(event)} aria-label={`${event.title}, ${timeText(new Date(event.starts_at))}`}>
      <span className="tp-bk-tm">{shortTime(event.starts_at)}</span>
      {task && <span className="tp-bk-k" aria-hidden />}
      <span className="tp-bk-t" dir="auto">{goal && <span className="tp-bk-star" aria-hidden>✶ </span>}<EmojiText text={event.title} /></span>
    </button>
  )
}

/** B's top: the calendar's Now card (Up next / Ongoing, its bar and times), then the next two blocks. */
export function NowPanel({ events, tasks, goalId, onOpen }: { events: CalendarEvent[]; tasks: Task[]; goalId?: string; onOpen: (e: CalendarEvent) => void }) {
  const now = useMinuteNow()
  useHour24()
  const taskById = new Map(tasks.map((t) => [t.id, t] as const))
  const taskOf = (e: CalendarEvent) => (e.task_id ? taskById.get(e.task_id) : undefined)
  const then = thenBlocks(events, now, (e) => { const t = taskOf(e); return !!t && (t.status === 'done' || !!t.completed_at) })
  return (
    <section aria-label="Now" className="tp-nn">
      <NowCard events={events} tasks={tasks} onOpen={onOpen} variant="today" />
      {then.length > 0 && (
        <div className="tp-then">
          <div className="tp-then-lbl">Then</div>
          {then.map((e) => <BlockLine key={e.id} event={e} task={taskOf(e)} goal={!!goalId && e.task_id === goalId} onOpen={onOpen} />)}
        </div>
      )}
    </section>
  )
}

/** B's Rituals panel: Morning and Evening (Begin while it's their time — the old Plan my day card's way
 * in), and the day's routines as one row to their page. A row opens its ritual. */
export function RitualsPanel({ morning, evening, now, routines, onOpen }: {
  morning: RitualState
  evening: RitualState
  now: Date
  routines: { done: number; total: number }
  onOpen: (kind: RitualKind) => void
}) {
  const late = isEvening(now)
  const from = clockText(hhmm(SHUTDOWN_FROM))
  const row = (kind: RitualKind, name: string, r: RitualState, on: boolean, sub: string) => {
    const go = on && !ritualFinished(r) && (r.done > 0 ? 'Continue' : 'Begin')
    return (
      <button type="button" className="tp-prow" data-ritual={kind} onClick={() => onOpen(kind)} aria-label={`${name} ritual, ${sub}${go ? `, ${go}` : ''}`}>
        <span className={`tp-prow-ic is-${kind}`} aria-hidden><Icon name={kind === 'morning' ? 'today' : 'moon'} size={18} /></span>
        <span className="tp-prow-name">{name}</span>
        <span className="tp-prow-sub">{sub}</span>
        <span className="tp-prow-x">{go ? <span className="tp-pbtn">{go}</span> : <Icon name="chevright" size={16} />}</span>
      </button>
    )
  }
  return (
    <section aria-label="Rituals" data-tour="plan">
      <div className="tp-pt">Rituals</div>
      <div className="tp-pn">
        {row('morning', 'Morning', morning, !late, ritualProgress(morning))}
        {row('evening', 'Evening', evening, late, late || ritualFinished(evening) ? ritualProgress(evening) : `from ${from}`)}
        {routines.total > 0 && (
          <Link to="/routines" className="tp-prow">
            <span className="tp-prow-ic" aria-hidden><Icon name="routines" size={18} /></span>
            <span className="tp-prow-name">Routines</span>
            <span className="tp-prow-sub">{routines.done}/{routines.total}</span>
            <span className="tp-prow-x"><Icon name="chevright" size={16} /></span>
          </Link>
        )}
      </div>
    </section>
  )
}

