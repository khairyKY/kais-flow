import { useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import { clockText, useHour24 } from '../../lib/clock'
import { zoneDateKey } from '../../lib/dateShortcuts'
import { motionOnNow, reducedMotionNow } from '../../lib/motion'
import { useAppSettings } from '../../lib/settings'
import { uiZoom } from '../../lib/uiScale'
import type { CalendarEvent, Task } from '../../lib/types'
import { hueVars } from '../calendar/NowCard'
import { timeText } from '../calendar/eventTime'
import { countdown, pickNowNext } from '../calendar/nowNext'
import { lockAxis, SETTLE_MS } from '../tasks/swipe'
import { BarDropContext } from './barDrop'
import { BAR_FROM as FROM, BAR_TO as TO, dayStep } from './dayBarMath'
import { SHUTDOWN_FROM } from './dayPhase'
import { dayBlocks, dayBounds } from './dayView'
import { barLanes } from './phoneView'
import { useMinuteNow } from './useMinuteNow'

// phone-today: the phone Today's Day view — Kai's pick 2026-10-26, Day view 4 "Day bar" (design-export/Day strip
// options.html in the daystrip-looks worktree). The whole day, 7 AM to 11 PM, in one bar: blocks as pills in
// palette C (an overlap on a thin second lane), the goal underlined in gold, the rituals as a sun and a moon, a
// lavender tick for now; "Next" under it. It takes the Now card's place; the rest of the page is B. Tapping the
// bar opens the calendar's own Day column for today (/calendar?date=…&view=day) — the calendar's code, not a copy.

const AXIS = [8, 12, 16, 20]

const hm = (s: string | undefined) => {
  const m = s?.match(/^(\d{1,2}):(\d{2})/)
  return m ? Number(m[1]) + Number(m[2]) / 60 : null
}

/** F1: a bar that left by a swipe tells the next one (a new page when the day is today's, this one when not)
 * where to enter from. ponytail: module state, since today ↔ another day remounts the page; one second's grace. */
let enterFrom: { px: number; at: number } | null = null

export function DayStripView({ events, tasks, goalId, onOpen, day, always, onStep }: {
  /** The calendar's events (occurrences expanded); the shown day's timed ones are drawn. */
  events: CalendarEvent[]
  tasks: Task[]
  /** The goal of the day's task: its pill is underlined in gold. */
  goalId?: string
  /** A pill or the Next line: the task's sheet, or the event on the calendar. */
  onOpen: (e: CalendarEvent) => void
  /** The day shown (YYYY-MM-DD); today when omitted. The now tick and the Next line are today's only. */
  day?: string
  /** Drawn even when nothing is on the day: a day to plan, with the bar to drop a task on (Today's own empty day shows none). */
  always?: boolean
  /** A swipe on the bar: a day on (+1) or back (-1). */
  onStep?: (n: -1 | 1) => void
}) {
  const now = useMinuteNow()
  const h24 = useHour24()
  const navigate = useNavigate()
  const { data: settings } = useAppSettings()
  const today = zoneDateKey(now)
  const key = day ?? today
  const isToday = key === today
  const drop = useContext(BarDropContext)
  const start = dayBounds(key).start.getTime()
  const hour = (ms: number) => (ms - start) / 3_600_000
  const pct = (h: number) => `${((Math.min(TO, Math.max(FROM, h)) - FROM) / (TO - FROM)) * 100}%`
  const done = new Set(tasks.filter((t) => t.status === 'done' || t.completed_at).map((t) => t.id))
  const lanes = barLanes(dayBlocks(events, key).filter((e) => hour(Date.parse(e.ends_at)) > FROM && hour(Date.parse(e.starts_at)) < TO))
  const pick = pickNowNext(events, now, (e) => !!e.task_id && done.has(e.task_id))
  const item = !isToday ? null : pick.state === 'on' || pick.state === 'soon' ? pick.main : pick.state === 'far' ? pick.next : null
  const sun = hm(settings?.morning_digest_at) ?? 7.5
  const label = (h: number) => (h24 ? `${h}:00` : `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`)
  const openColumn = () => navigate(`/calendar?date=${key}&view=day`)
  const swipe = useBarSwipe(key, onStep)
  // Kai 2026-11-03: an empty bar and "Nothing else today" on a day with nothing scheduled is noise - no bar then.
  // (F1: unless a task is lifted, or the day is one to plan - then the bar is where it goes.)
  if (lanes.length === 0 && !item && !always && !drop?.lifting) return null
  const at = drop?.at
  return (
    <section aria-label="The day" className="tp-nn tp-dbar-card">
      <div ref={drop?.barRef} className="tp-dbar" data-dropping={drop?.lifting || undefined} role="button" tabIndex={0} aria-label={isToday ? 'Open today on the calendar' : 'Open this day on the calendar'} onClick={openColumn} onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), openColumn())} {...swipe}>
        <span className="tp-dbar-rail" aria-hidden />
        {lanes.map(({ e, lane }) => {
          const a = hour(Date.parse(e.starts_at))
          const b = hour(Date.parse(e.ends_at))
          const style = { ...hueVars(e), left: pct(a), width: `calc(${pct(b)} - ${pct(a)})` } as CSSProperties
          const cls = `tp-dbar-sg${lane ? ' is-l1' : ''}${Date.parse(e.ends_at) <= now.getTime() ? ' is-past' : ''}${goalId && e.task_id === goalId ? ' is-goal' : ''}${at?.slotId === e.id ? ' is-drop' : ''}`
          return <span key={e.id} className={cls} style={style} title={e.title} onClick={(ev) => { ev.stopPropagation(); onOpen(e) }} />
        })}
        <span className="tp-dbar-rd is-sun" style={{ left: pct(sun) }} aria-hidden>☀</span>
        <span className="tp-dbar-rd is-moon" style={{ left: pct(SHUTDOWN_FROM / 60) }} aria-hidden>☾</span>
        {isToday && <span className="tp-dbar-now" style={{ left: pct(hour(now.getTime())) }} aria-hidden />}
        {at && (
          <>
            <span className="tp-dbar-drop" style={{ left: pct(at.minute / 60) }} aria-hidden />
            <span className="tp-dbar-bub" data-edge={at.minute < 9 * 60 ? 'l' : at.minute > 21 * 60 ? 'r' : undefined} style={{ left: pct(at.minute / 60) }} aria-hidden>
              {clockText(`${String(Math.floor(at.minute / 60)).padStart(2, '0')}:${String(at.minute % 60).padStart(2, '0')}`, h24)}
            </span>
          </>
        )}
        <span className="tp-dbar-ax" aria-hidden>{AXIS.map((h) => <span key={h} style={{ left: pct(h) }}>{label(h)}</span>)}</span>
      </div>
      {isToday && <div className="tp-dnext">
        {item ? (
          <button type="button" className="tp-dnext-btn" style={hueVars(item)} onClick={() => onOpen(item)}>
            <span className="tp-dnext-k">{pick.state === 'on' ? 'Now' : 'Next'}</span>
            <span className="tp-dnext-tm">{timeText(new Date(item.starts_at))}</span>
            <span className="tp-dnext-t" dir="auto"><EmojiText text={item.title} /></span>
            <span className="tp-dnext-cd">{countdown(item, now)}</span>
          </button>
        ) : (
          <span className="tp-dnext-quiet">Nothing else today</span>
        )}
        <button type="button" className="tp-dnext-open" aria-label="Open today on the calendar" onClick={openColumn}>
          <Icon name="chevdown" size={16} />
        </button>
      </div>}
    </section>
  )
}

/** F1: the bar swipes to another day. The bar follows the finger; 48px or a flick takes it off the way it went
 * and the next day's comes in from the other side (the calendar's day slide: SETTLE_MS, ease-standard); short of
 * that it springs back. Touch only, sideways only: a vertical drag is the page's scroll (touch-action: pan-y), and a
 * tap still opens the column. Reduced motion or Effects off: the day just changes. */
function useBarSwipe(key: string, onStep: ((n: -1 | 1) => void) | undefined) {
  const g = useRef({ id: -1, sx: 0, sy: 0, dx: 0, lastX: 0, lastT: 0, v: 0, locked: false, swallow: false, w: 320 })
  const [shift, setShift] = useState({ x: 0, ms: 0 })
  const timer = useRef(0)
  const instant = () => reducedMotionNow() || !motionOnNow()

  // The bar that arrives after a swipe starts on the side it came from and settles in.
  useLayoutEffect(() => {
    const from = enterFrom
    if (!from || Date.now() - from.at > 1000 || instant()) return
    setShift({ x: from.px, ms: 0 })
    // Cleared on the settle, not here: StrictMode runs this twice and the second run must still find it.
    const r = requestAnimationFrame(() => requestAnimationFrame(() => {
      enterFrom = null
      setShift({ x: 0, ms: SETTLE_MS })
    }))
    return () => cancelAnimationFrame(r)
  }, [key])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  if (!onStep) return {}
  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = g.current
    if (e.pointerId !== s.id) return
    s.id = -1
    if (!s.locked) return
    s.swallow = true // a drag's release is not a tap
    // A finger that stopped before lifting (or a cancelled gesture) is not a flick.
    const v = e.type === 'pointercancel' || e.timeStamp - s.lastT > 100 ? 0 : s.v
    const step = e.type === 'pointercancel' ? 0 : dayStep(s.dx, v)
    if (!step) return setShift({ x: 0, ms: SETTLE_MS })
    const go = () => {
      enterFrom = { px: step * s.w, at: Date.now() }
      onStep(step)
    }
    if (instant()) return (setShift({ x: 0, ms: 0 }), go())
    setShift({ x: -step * s.w, ms: SETTLE_MS })
    timer.current = window.setTimeout(go, SETTLE_MS)
  }
  return {
    style: { transform: shift.x ? `translateX(${shift.x}px)` : undefined, transition: shift.ms ? `transform ${shift.ms}ms var(--ease-standard)` : 'none' } as CSSProperties,
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      const s = g.current
      s.swallow = false
      if (e.pointerType !== 'touch' || !e.isPrimary) return
      window.clearTimeout(timer.current)
      Object.assign(s, { id: e.pointerId, sx: e.clientX, sy: e.clientY, dx: 0, lastX: e.clientX, lastT: e.timeStamp, v: 0, locked: false, w: e.currentTarget.getBoundingClientRect().width / uiZoom() })
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      const s = g.current
      if (e.pointerId !== s.id) return
      const z = uiZoom()
      const dx = (e.clientX - s.sx) / z
      if (!s.locked) {
        const axis = lockAxis(dx, (e.clientY - s.sy) / z)
        if (!axis) return
        if (axis === 'y') return void (s.id = -1) // a scroll: the page keeps it
        s.locked = true
        e.currentTarget.setPointerCapture?.(e.pointerId)
      }
      const dt = e.timeStamp - s.lastT
      if (dt > 0) s.v = (e.clientX - s.lastX) / z / dt
      s.lastX = e.clientX
      s.lastT = e.timeStamp
      s.dx = dx
      setShift({ x: dx, ms: 0 })
    },
    onPointerUp: end,
    onPointerCancel: end,
    onClickCapture: (e: ReactMouseEvent) => {
      if (!g.current.swallow) return
      g.current.swallow = false
      e.preventDefault()
      e.stopPropagation()
    },
  }
}
