import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import { useHour24 } from '../../lib/clock'
import { zoneDateKey } from '../../lib/dateShortcuts'
import { useAppSettings } from '../../lib/settings'
import type { CalendarEvent, Task } from '../../lib/types'
import { hueVars } from '../calendar/NowCard'
import { timeText } from '../calendar/eventTime'
import { countdown, pickNowNext } from '../calendar/nowNext'
import { SHUTDOWN_FROM } from './dayPhase'
import { dayBlocks, dayBounds } from './dayView'
import { barLanes } from './phoneView'
import { useMinuteNow } from './useMinuteNow'

// phone-today: the phone Today's Day view — Kai's pick 2026-10-26, Day view 4 "Day bar" (design-export/Day strip
// options.html in the daystrip-looks worktree). The whole day, 7 AM to 11 PM, in one bar: blocks as pills in
// palette C (an overlap on a thin second lane), the goal underlined in gold, the rituals as a sun and a moon, a
// lavender tick for now; "Next" under it. It takes the Now card's place; the rest of the page is B. Tapping the
// bar opens the calendar's own Day column for today (/calendar?date=…&view=day) — the calendar's code, not a copy.

const FROM = 7
const TO = 23
const AXIS = [8, 12, 16, 20]

const hm = (s: string | undefined) => {
  const m = s?.match(/^(\d{1,2}):(\d{2})/)
  return m ? Number(m[1]) + Number(m[2]) / 60 : null
}

export function DayStripView({ events, tasks, goalId, onOpen }: {
  /** The calendar's events (occurrences expanded); today's timed ones are drawn. */
  events: CalendarEvent[]
  tasks: Task[]
  /** The goal of the day's task: its pill is underlined in gold. */
  goalId?: string
  /** A pill or the Next line: the task's sheet, or the event on the calendar. */
  onOpen: (e: CalendarEvent) => void
}) {
  const now = useMinuteNow()
  const h24 = useHour24()
  const navigate = useNavigate()
  const { data: settings } = useAppSettings()
  const key = zoneDateKey(now)
  const start = dayBounds(key).start.getTime()
  const hour = (ms: number) => (ms - start) / 3_600_000
  const pct = (h: number) => `${((Math.min(TO, Math.max(FROM, h)) - FROM) / (TO - FROM)) * 100}%`
  const done = new Set(tasks.filter((t) => t.status === 'done' || t.completed_at).map((t) => t.id))
  const lanes = barLanes(dayBlocks(events, key).filter((e) => hour(Date.parse(e.ends_at)) > FROM && hour(Date.parse(e.starts_at)) < TO))
  const pick = pickNowNext(events, now, (e) => !!e.task_id && done.has(e.task_id))
  const item = pick.state === 'on' || pick.state === 'soon' ? pick.main : pick.state === 'far' ? pick.next : null
  const sun = hm(settings?.morning_digest_at) ?? 7.5
  const label = (h: number) => (h24 ? `${h}:00` : `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`)
  const openColumn = () => navigate(`/calendar?date=${key}&view=day`)
  return (
    <section aria-label="The day" className="tp-nn tp-dbar-card">
      <div className="tp-dbar" role="button" tabIndex={0} aria-label="Open today on the calendar" onClick={openColumn} onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), openColumn())}>
        <span className="tp-dbar-rail" aria-hidden />
        {lanes.map(({ e, lane }) => {
          const a = hour(Date.parse(e.starts_at))
          const b = hour(Date.parse(e.ends_at))
          const style = { ...hueVars(e), left: pct(a), width: `calc(${pct(b)} - ${pct(a)})` } as CSSProperties
          const cls = `tp-dbar-sg${lane ? ' is-l1' : ''}${Date.parse(e.ends_at) <= now.getTime() ? ' is-past' : ''}${goalId && e.task_id === goalId ? ' is-goal' : ''}`
          return <span key={e.id} className={cls} style={style} title={e.title} onClick={(ev) => { ev.stopPropagation(); onOpen(e) }} />
        })}
        <span className="tp-dbar-rd is-sun" style={{ left: pct(sun) }} aria-hidden>☀</span>
        <span className="tp-dbar-rd is-moon" style={{ left: pct(SHUTDOWN_FROM / 60) }} aria-hidden>☾</span>
        <span className="tp-dbar-now" style={{ left: pct(hour(now.getTime())) }} aria-hidden />
        <span className="tp-dbar-ax" aria-hidden>{AXIS.map((h) => <span key={h} style={{ left: pct(h) }}>{label(h)}</span>)}</span>
      </div>
      <div className="tp-dnext">
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
      </div>
    </section>
  )
}
