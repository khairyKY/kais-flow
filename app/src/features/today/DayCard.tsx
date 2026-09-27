import type { CSSProperties, ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/kit'
import { EmojiText } from '../../components/EmojiText'
import { cairoDateKey } from '../../lib/dateShortcuts'
import { completeTaskWithUndo } from '../tasks/api'
import { RITUAL_STEP_COUNT, useRitualsFinishedToday, useSeedsFor, type RitualKind } from '../rituals/api'
import { seedTargetDate } from '../rituals/loopDay'
import { NOW_SOON_MIN, dayPhase, eveningState, morningState, ritualFinished, type RitualState } from './dayPhase'
import { top3Tally } from './top3Today'
import { upNextClock, upNextEvents, isInProgress } from './upNext'
import { useMinuteNow } from './useMinuteNow'
import { useStartFocus } from './startFocus'
import type { CalendarEvent, Task } from '../../lib/types'

// deviation(2026-09-26 daily cycle): the Day card. Today.dc.html 1a/1b pin two ritual cards
// (Morning 2/4 · Evening 0/2) under the date; docs/DAILY-CYCLE.md replaces them with ONE card that
// always says the next move — Plan your day → Now → Shut down the day → Day closed (./dayPhase).
// No new look: it is the pinned ritual card's shell (parchment, line-card border, 3px radius,
// crisp shadow, sun/moon glyph, thin progress bar, mono count) with kit Buttons for its actions.
// Either ritual stays one tap away from the links along its foot, in every state.

const A = '/ds/assets'

interface DayCardProps {
  events: CalendarEvent[]
  tasks: Task[]
  /** Today's Top 3, finished picks included, goal first (./top3Today). */
  top3: Task[]
  inboxCount: number
  overdueCount: number
  ritualSteps: Record<RitualKind, ReadonlySet<string>>
  /** R4-5a pins: which rituals the card may prompt. */
  prompts: Record<RitualKind, boolean>
  compact: boolean
  onOpenRitual: (kind: RitualKind) => void
}

export function DayCard({ events, tasks, top3, inboxCount, overdueCount, ritualSteps, prompts, compact, onOpenRitual }: DayCardProps) {
  const now = useMinuteNow()
  const navigate = useNavigate()
  const startFocus = useStartFocus()

  const taskById = new Map(tasks.map((t) => [t.id, t] as const))
  const today = cairoDateKey(now)
  const hasTaskBlockToday = events.some((e) => !!e.task_id && !e.all_day && cairoDateKey(new Date(e.starts_at)) === today)
  // Loop B's contract: a ritual walked past its last step logs `ritual.finished` for the Cairo loop
  // day (04:00 rollover), so a 00:30 shutdown still reads as tonight's. Step counts stay a fallback.
  const finishedToday = useRitualsFinishedToday(now)
  const m = morningState(ritualSteps.morning, RITUAL_STEP_COUNT.morning, hasTaskBlockToday)
  const e = eveningState(ritualSteps.evening, RITUAL_STEP_COUNT.evening)
  const morning: RitualState = { ...m, finished: finishedToday.morning || ritualFinished(m) }
  const evening: RitualState = { ...e, finished: finishedToday.evening || ritualFinished(e) }
  // What the evening seeded for the coming morning (ritual.seeded rows, still open tasks).
  const seeds = useSeedsFor(seedTargetDate(now))
  const tally = top3Tally(top3)
  const openTop3 = top3.filter((t) => !t.completed_at)
  // "The running or next item": Up next's own list, minus blocks whose task is already done.
  const nextUp = upNextEvents(events, now).find((e) => !(e.task_id && taskById.get(e.task_id)?.status === 'done')) ?? null
  // An event running or starting within NOW_SOON_MIN is the move; further off, an open Top 3 is.
  const nextUpSoon = !!nextUp && new Date(nextUp.starts_at).getTime() - now.getTime() <= NOW_SOON_MIN * 60_000
  const state = dayPhase({ now, morning, evening, top3: tally, nextUp, nextUpSoon, firstOpenTop3: openTop3[0] ?? null, prompts })

  const btn: CSSProperties = { fontSize: 12.5, padding: '7px 14px', ...(compact ? { minHeight: 44 } : null) }
  const links = <RitualLinks morning={morning} evening={evening} onOpen={onOpenRitual} />

  if (state.phase === 'plan') {
    return (
      <Shell compact={compact} icon={<SunIcon />} links={links}
        title={<>Plan your day<Minutes>· ~5 min</Minutes></>}
        meta={[`${inboxCount} in inbox`, `${overdueCount} overdue`, `Top 3 ${tally.picked}/3`]}
        bar={{ ritual: morning, color: 'var(--acc-sage)' }}
        actions={<Button type="button" variant="secondary" style={btn} onClick={() => onOpenRitual('morning')}>Begin</Button>}
      />
    )
  }

  if (state.phase === 'shutdown') {
    return (
      <Shell compact={compact} icon={<MoonIcon />} links={links}
        title={<>Shut down the day<Minutes>· ~3 min</Minutes></>}
        meta={tally.picked > 0 ? [`Top 3 ${tally.done}/${tally.picked} done`] : ['close the loops · seed tomorrow']}
        bar={{ ritual: evening, color: 'var(--acc-lavender)' }}
        actions={<Button type="button" variant="secondary" style={btn} onClick={() => onOpenRitual('evening')}>Begin</Button>}
      />
    )
  }

  if (state.phase === 'closed') {
    // Tomorrow's seeds = what the evening's seeds beat planted for the coming loop day — exactly
    // what the morning ritual's Top-3 step will pre-select (rituals/loopDay.ts).
    return (
      <Shell compact={compact} icon={<MoonIcon />} links={links}
        title="Day closed ✿"
        body={seeds.length > 0 ? (
          <div style={{ marginTop: 5 }}>
            <Caption>Tomorrow's seeds</Caption>
            <div style={{ marginTop: 3, fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.45 }}>
              {seeds.map((t, i) => (
                <span key={t.id}>{i > 0 && <span style={{ color: 'var(--ink-hairline)' }}> · </span>}<EmojiText text={t.title} /></span>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 3, fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--ink-hand, #7a745f)' }}>The garden's closed. See you in the morning ✿</div>
        )}
      />
    )
  }

  // Now — the running or next item, else the first unfinished Top 3, else a clear stretch.
  const item = state.item
  if (!item) {
    return (
      <Shell compact={compact} icon={<img src={`${A}/daisy/midday.png`} alt="" style={{ height: 26, flex: 'none' }} />} links={links}
        caption="Now"
        title="Nothing on the clock"
        meta={tally.picked > 0 ? [`Top 3 ${tally.done}/${tally.picked} done`] : ['a clear stretch — pick the next thing']}
        actions={<Button type="button" variant="ghost" style={btn} onClick={() => navigate('/calendar')}>Open calendar</Button>}
      />
    )
  }
  const task = item.kind === 'task' ? item.task : item.event.task_id ? taskById.get(item.event.task_id) : undefined
  const title = item.kind === 'task' ? item.task.title : item.event.title
  const running = item.kind === 'event' && isInProgress(item.event.starts_at, item.event.ends_at, now)
  const caption = item.kind === 'task' ? 'Next · Top 3' : running ? 'Now' : `Next · ${upNextClock(item.event.starts_at)}`
  const meta = item.kind === 'event'
    ? [`${upNextClock(item.event.starts_at)}–${upNextClock(item.event.ends_at)}`]
    : [
        item.task.duration_min != null ? `${item.task.duration_min}m` : null,
        tally.picked > 0 ? `Top 3 ${tally.done}/${tally.picked} done` : null,
        nextUp ? `then ${upNextClock(nextUp.starts_at)} · ${nextUp.title}` : null,
      ].filter((m): m is string => !!m)
  const open = () => navigate(task ? `/tasks/${task.id}` : '/calendar')
  return (
    <Shell compact={compact} icon={<img src={`${A}/daisy/midday.png`} alt="" style={{ height: 26, flex: 'none' }} />} links={links}
      caption={caption} captionTone={running ? 'now' : 'time'}
      title={<EmojiText text={title} />}
      meta={meta}
      actions={
        <>
          {task && (
            <Button type="button" variant="secondary" style={btn} onClick={() => startFocus(task)}
              icon={<svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1.2v7.6L8.6 5Z" fill="currentColor" /></svg>}>
              Start focus
            </Button>
          )}
          {task && <Button type="button" variant="ghost" style={btn} onClick={() => completeTaskWithUndo(task)}>Done</Button>}
          <Button type="button" variant="ghost" style={btn} onClick={open}>Open</Button>
        </>
      }
    />
  )
}

// ── The card's shell: the retired RitualCard's look, one layout for every state. ──
function Shell({ compact, icon, caption, captionTone = 'time', title, meta, body, bar, actions, links }: {
  compact: boolean
  icon: ReactNode
  caption?: string
  captionTone?: 'now' | 'time'
  title: ReactNode
  meta?: string[]
  body?: ReactNode
  bar?: { ritual: RitualState; color: string }
  actions?: ReactNode
  links: ReactNode
}) {
  const pct = bar && bar.ritual.total > 0 ? Math.round((Math.min(bar.ritual.done, bar.ritual.total) / bar.ritual.total) * 100) : 0
  return (
    <section
      aria-label="Your day"
      data-day-card
      style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-crisp)', padding: compact ? '10px 12px 8px' : '13px 16px 9px' }}
    >
      <div style={{ display: 'flex', alignItems: compact ? 'flex-start' : 'center', gap: compact ? 10 : 13, flexWrap: compact ? 'wrap' : 'nowrap' }}>
        <span style={{ flex: 'none', display: 'inline-flex', marginTop: compact ? 2 : 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {caption && <Caption tone={captionTone}>{caption}</Caption>}
          <div style={{ fontSize: compact ? 13.5 : 14.5, color: 'var(--ink-body)', fontWeight: 500, lineHeight: 1.3, marginTop: caption ? 2 : 0 }}>{title}</div>
          {meta && meta.length > 0 && (
            <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: compact ? 9 : 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'flex', gap: compact ? 8 : 12, flexWrap: 'wrap' }}>
              {meta.map((m) => <span key={m}>{m}</span>)}
            </div>
          )}
          {body}
          {bar && (
            <div style={{ marginTop: 6, height: compact ? 3 : 4, borderRadius: 2, background: 'var(--line-card)', overflow: 'hidden', maxWidth: 320 }}>
              <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: bar.color }} />
            </div>
          )}
        </div>
        {actions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: compact ? '1 0 100%' : 'none', flexWrap: 'wrap', paddingLeft: compact ? 36 : 0 }}>{actions}</div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: compact ? 4 : 6 }}>{links}</div>
    </section>
  )
}

function Caption({ children, tone = 'time' }: { children: ReactNode; tone?: 'now' | 'time' }) {
  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: tone === 'now' ? 'var(--acc-terra)' : 'var(--ink-faint)' }}>{children}</div>
  )
}

function Minutes({ children }: { children: ReactNode }) {
  return <span style={{ marginLeft: 6, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', fontWeight: 400, letterSpacing: '0.06em', color: 'var(--ink-faint)' }}>{children}</span>
}

// "A small secondary link on the card opens either ritual any time" — both, with the step count
// the old pinned cards showed, or ✓ once finished (the count is per calendar date, the finish per
// loop day — so after midnight a closed evening would otherwise read 0/5).
const progress = (r: RitualState) => (ritualFinished(r) ? '✓' : `${r.done}/${r.total}`)
function RitualLinks({ morning, evening, onOpen }: { morning: RitualState; evening: RitualState; onOpen: (kind: RitualKind) => void }) {
  const link: CSSProperties = { background: 'none', border: 'none', padding: '2px 0', font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', cursor: 'pointer' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button type="button" className="kf-link-terra kf-hit" style={link} onClick={() => onOpen('morning')}>Morning ritual {progress(morning)}</button>
      <span aria-hidden style={{ color: 'var(--ink-hairline)', fontSize: 'var(--fs-meta)' }}>·</span>
      <button type="button" className="kf-link-terra kf-hit" style={link} onClick={() => onOpen('evening')}>Evening ritual {progress(evening)}</button>
    </div>
  )
}

const SunIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" style={{ flex: 'none' }}><circle cx="12" cy="12" r="5" fill="#D9B65C" /><g stroke="var(--acc-gold-warm)" strokeWidth="1.5" strokeLinecap="round"><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" /></g></svg>
)
const MoonIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" style={{ flex: 'none' }}><path d="M20 15.5A8 8 0 0 1 9 4.5a8 8 0 1 0 11 11Z" fill="var(--acc-lavender)" /></svg>
)
