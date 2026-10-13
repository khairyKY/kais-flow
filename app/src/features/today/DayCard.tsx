import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/kit'
import { Icon } from '../../components/Icon'
import { EmojiText } from '../../components/EmojiText'
import type { RitualKind } from '../rituals/api'
import { seedTargetDate } from '../rituals/loopDay'
import { resumeMeta } from '../rituals/ritualLogic'
import { cairoTimeKey } from '../calendar/eventTime'
import { ritualFinished } from './dayPhase'
import type { Day } from './useDay'
import { useTheme } from '../../lib/theme'
import { Moonflower } from './NightGarden'

// deviation(2026-09-26 daily cycle): the Day card — ONE next move, Plan your day → Now → Shut down
// the day → Day closed (./dayPhase). Today.dc.html 2a (2026-09-28, Kai's reviewed desktop pass) puts
// the day in one "Now" card at the top; at the ritual moments its head is the Day card's (this),
// otherwise the Now state (TodayPage NowCard). The two rituals themselves live in the rail's Rituals
// checklist (2a: "Rituals live only in the rail"), so the card's old ritual links are gone.
// On a phone the same state drives the ritual card (RitualCard, Today Phone ruling 2) instead.

/** The desktop Now card's head at a ritual moment. */
export interface CardHead {
  glyph?: ReactNode
  caption: string
  tone: 'now' | 'over' | 'done' | 'quiet'
  title: ReactNode
  sub?: ReactNode
  action?: ReactNode
}

/** The head row of the desktop Now card at Plan / Shut down / Day closed (TodayPage NowCard draws
 * the same row for the moment's states). */
export function DeskRitualHead({ kind, day, inboxCount, overdueCount, onOpenRitual }: { kind: 'plan' | 'shutdown' | 'closed'; day: Day; inboxCount: number; overdueCount: number; onOpenRitual: (kind: RitualKind) => void }) {
  const h = ritualHead(kind, day, inboxCount, overdueCount, onOpenRitual)
  return (
    <div className="td-now-head">
      <span className="td-now-glyph">{h.glyph}</span>
      <div className="td-now-text">
        <div className="td-cap" data-tone={h.tone}><span className="td-cap-dot" aria-hidden />{h.caption}</div>
        <div className="td-now-title">{h.title}</div>
        {h.sub && <div className="td-now-sub">{h.sub}</div>}
      </div>
      {h.action && <span style={{ flex: 'none' }}>{h.action}</span>}
    </div>
  )
}

function ritualHead(kind: 'plan' | 'shutdown' | 'closed', day: Day, inboxCount: number, overdueCount: number, onOpenRitual: (kind: RitualKind) => void): CardHead {
  const { tally, seeds } = day
  if (kind === 'closed') {
    // Tomorrow's seeds = what the evening's seeds beat planted for the coming loop day — exactly
    // what the morning ritual's Top-3 step will pre-select (rituals/loopDay.ts).
    return {
      glyph: <MoonIcon />,
      caption: 'Evening ✓',
      tone: 'quiet',
      title: 'Day closed ✿',
      sub: seeds.length > 0
        ? <>Tomorrow's seeds · {seeds.map((t, i) => <span key={t.id}>{i > 0 && ' · '}<EmojiText text={t.title} /></span>)}</>
        : <span className="tp-hand">The garden's closed. See you in the morning ✿</span>,
    }
  }
  const ritual: RitualKind = kind === 'plan' ? 'morning' : 'evening'
  const r = kind === 'plan' ? day.morning : day.evening
  // 6m: a ritual closed half-way — "2 of 4 done", "~1 min left · Pick your 3 next", Resume.
  const resume = r.done > 0 && !ritualFinished(r)
  const sub = resume
    ? resumeMeta(ritual, day.steps[ritual]).join(' · ')
    : kind === 'plan'
      ? `${inboxCount} in inbox · ${overdueCount} overdue · Top 3 ${tally.picked}/3`
      : tally.picked > 0 ? `Top 3 ${tally.done}/${tally.picked} done` : 'close the loops · seed tomorrow'
  return {
    glyph: kind === 'plan' ? <SunIcon /> : <MoonIcon />,
    caption: `${kind === 'plan' ? 'Morning' : 'Evening'} · ${resume ? `${r.done} of ${r.total} done` : kind === 'plan' ? '~5 min' : '~3 min'}`,
    tone: 'quiet',
    title: kind === 'plan' ? 'Plan your day' : 'Shut down the day',
    sub,
    action: <Button type="button" variant="secondary" onClick={() => onOpenRitual(ritual)}>{resume ? 'Resume' : 'Begin'}</Button>,
  }
}

const SunIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" style={{ flex: 'none' }}><circle cx="12" cy="12" r="5" fill="var(--acc-gold-warm)" /><g stroke="var(--acc-gold-warm)" strokeWidth="1.5" strokeLinecap="round"><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" /></g></svg>
)
// Night.dc.html 1a/1f: after dark the evening moment's glyph is the moonflower, which only opens at night.
const MoonIcon = () =>
  useTheme((s) => s.theme === 'night') ? (
    <Moonflower />
  ) : (
    <svg width="26" height="26" viewBox="0 0 24 24" style={{ flex: 'none' }}><path d="M20 15.5A8 8 0 0 1 9 4.5a8 8 0 1 0 11 11Z" fill="var(--acc-lavender)" /></svg>
  )

// ── Today Phone ruling 2: the ritual card copies the NOW slip's anatomy — a 44 glyph · caption,
// title, meta · one secondary action on the right — flat (no tape, no tilt), so the slip keeps its
// "running" look. Plan · Shut down · Resume (a ritual walked part-way, with its hairline); Day closed
// has no action. Shown only for the ritual moments, never beside the slip (./todayLayout topCard). ──
export function RitualCard({ kind, day, inboxCount, overdueCount, sweepCount, onOpenRitual }: {
  kind: 'plan' | 'shutdown' | 'closed'
  day: Day
  inboxCount: number
  overdueCount: number
  /** Today's open rows the evening sweep will walk. */
  sweepCount: number
  onOpenRitual: (kind: RitualKind) => void
}) {
  const clock = cairoTimeKey(day.now)
  if (kind === 'closed') {
    const n = day.seeds.length
    const weekday = new Date(`${seedTargetDate(day.now)}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
    return (
      <RitualShell glyph={<MoonIcon />} caption={`Evening ✓ · ${clock}`} title="Day closed ✿" meta={n > 0 ? [`${n} seed${n === 1 ? '' : 's'} planted for ${weekday}`] : []}>
        <div className="tp-hand" style={{ marginTop: 'var(--sp-1)' }}>The garden's closed. See you in the morning.</div>
      </RitualShell>
    )
  }
  const ritual: RitualKind = kind === 'plan' ? 'morning' : 'evening'
  const r = kind === 'plan' ? day.morning : day.evening
  const resume = r.done > 0 && !ritualFinished(r)
  // 6m: a ritual closed half-way — "Morning · 2 of 4 done", "~1 min left · Pick your 3 next", Resume.
  const meta = resume ? resumeMeta(ritual, day.steps[ritual]) : kind === 'plan' ? ['~3 min', `${inboxCount} in inbox`, `${overdueCount} overdue`] : ['~2 min', `${sweepCount} to sweep`]
  const when = resume ? `${r.done} of ${r.total} done` : kind === 'plan' ? 'not planned' : clock
  return (
    <RitualShell
      glyph={kind === 'plan' ? <SunIcon /> : <MoonIcon />}
      caption={`${kind === 'plan' ? 'Morning' : 'Evening'} · ${when}`}
      title={kind === 'plan' ? 'Plan my day' : 'Shut down the day'}
      meta={meta}
      pct={resume ? Math.round((r.done / r.total) * 100) : undefined}
      action={<Button type="button" variant="secondary" onClick={() => onOpenRitual(ritual)}>{resume ? 'Resume' : kind === 'plan' ? 'Plan' : 'Shut down'}</Button>}
    />
  )
}

/** DAILY-CYCLE step 5 on a phone: the weekly review on its day (./todayLayout reviewDue — the first
 * day of the user's weekend) until the week is closed. The ritual card's anatomy, flat; Review opens
 * the Weekly review. */
export function ReviewCard() {
  const navigate = useNavigate()
  return (
    <RitualShell
      label="Weekly review"
      glyph={<span style={{ color: 'var(--acc-buttercream-text)', display: 'inline-flex' }}><Icon name="review" size={26} /></span>}
      caption="Weekly · today"
      title="Weekly review"
      meta={['Sweep every area', 'close the week']}
      action={<Button type="button" variant="secondary" onClick={() => navigate('/weekly-review')}>Review</Button>}
    />
  )
}

function RitualShell({ label, glyph, caption, title, meta, pct, action, children }: { label?: string; glyph: ReactNode; caption: string; title: string; meta: string[]; pct?: number; action?: ReactNode; children?: ReactNode }) {
  // A `label`led card isn't the day's next move — no Day card hooks (data-day-card, the tour's "plan").
  return (
    <section aria-label={label ?? 'Your day'} data-day-card={label ? undefined : true} data-tour={label ? undefined : 'plan'} className="tp-ritual">
      <span className="tp-glyph">{glyph}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tp-caption">{caption}</div>
        <div className="tp-ritual-title">{title}</div>
        {meta.length > 0 && <div className="tp-meta">{meta.map((m) => <span key={m}>{m}</span>)}</div>}
        {children}
        {pct != null && (
          <div className="tp-hairline" style={{ marginTop: 'var(--sp-2)' }}>
            <span style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      {action && <span style={{ flex: 'none' }}>{action}</span>}
    </section>
  )
}
