import { useState } from 'react'
import { Link } from 'react-router'
import { Segmented } from '../../components/kit'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import { clockText, useHour24 } from '../../lib/clock'
import type { CalendarEvent, Task } from '../../lib/types'
import { NowCard, hueVars } from '../calendar/NowCard'
import { timeText } from '../calendar/eventTime'
import type { RitualKind } from '../rituals/api'
import { isEvening, ritualFinished, ritualProgress, SHUTDOWN_FROM, type RitualState } from './dayPhase'
import { readPhoneView, thenBlocks, writePhoneView, type PhoneView } from './phoneView'
import { useMinuteNow } from './useMinuteNow'

// phone-today (Kai 2026-10-26): the phone Today's B · "Now + next" parts — the calendar's Now card with
// the next two blocks under it, and the Rituals panel — plus the Now / Day switch. Spec: design-export/
// Phone home options.html (today-looks worktree), direction B. Settings' rounded panels (.tp-pn, today.css).

/** The Now / Day switch, remembered per device (./phoneView PHONE_VIEW_KEY). */
export function usePhoneView(): [PhoneView, (v: PhoneView) => void] {
  const [v, setV] = useState(readPhoneView)
  return [v, (next) => { setV(next); writePhoneView(next) }]
}

export function ViewSwitch({ view, onChange }: { view: PhoneView; onChange: (v: PhoneView) => void }) {
  return (
    <Segmented
      className="tp-view"
      label="Today view"
      value={view}
      onChange={onChange}
      options={[{ value: 'now', label: 'Now' }, { value: 'day', label: 'Day' }]}
    />
  )
}

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
  const from = clockText(`${String(Math.floor(SHUTDOWN_FROM / 60)).padStart(2, '0')}:${String(SHUTDOWN_FROM % 60).padStart(2, '0')}`)
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

