import type { CSSProperties, ReactNode } from 'react'
import { Button } from '../../components/kit'
import { EmojiText } from '../../components/EmojiText'
import type { RitualKind } from '../rituals/api'
import { seedTargetDate } from '../rituals/loopDay'
import { resumeMeta } from '../rituals/ritualLogic'
import { cairoTimeKey } from '../calendar/eventTime'
import { ritualFinished, ritualProgress, type RitualState } from './dayPhase'
import type { Day } from './useDay'

// deviation(2026-09-26 daily cycle): the Day card. Today.dc.html 1a/1b pin two ritual cards
// (Morning 2/4 · Evening 0/2) under the date; docs/DAILY-CYCLE.md replaces them with ONE card that
// always says the next move — Plan your day → Now → Shut down the day → Day closed (./dayPhase).
// No new look: it is the pinned ritual card's shell (parchment, line-card border, 3px radius,
// crisp shadow, sun/moon glyph, thin progress bar, mono count) with kit Buttons for its actions.
// Either ritual stays one tap away from the links along its foot, in every state.
// On a phone the same state drives the ritual card (RitualCard, Today Phone ruling 2) instead.

interface DayCardProps {
  day: Day
  inboxCount: number
  overdueCount: number
  onOpenRitual: (kind: RitualKind) => void
}

export function DayCard({ day, inboxCount, overdueCount, onOpenRitual }: DayCardProps) {
  const { state, morning, evening, seeds, tally } = day
  const btn: CSSProperties = { fontSize: 12.5, padding: '7px 14px' }
  const links = <RitualLinks morning={morning} evening={evening} onOpen={onOpenRitual} />

  if (state.phase === 'plan') {
    return (
      <Shell icon={<SunIcon />} links={links}
        title={<>Plan your day<Minutes>· ~5 min</Minutes></>}
        meta={[`${inboxCount} in inbox`, `${overdueCount} overdue`, `Top 3 ${tally.picked}/3`]}
        bar={{ ritual: morning, color: 'var(--acc-sage)' }}
        actions={<Button type="button" variant="secondary" style={btn} onClick={() => onOpenRitual('morning')}>Begin</Button>}
      />
    )
  }

  if (state.phase === 'shutdown') {
    return (
      <Shell icon={<MoonIcon />} links={links}
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
      <Shell icon={<MoonIcon />} links={links}
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

  // Kai 2026-09-27: "why display the same thing twice… why a button for open and done… why does
  // that next even exist if I see the top 3 today and below it the up next?" During the day the
  // card steps aside: Top 3 and Up next show each thing as what it is (a task row: checkbox = done,
  // tap = open; an event row: tap = open; the running one reads "Now"). Start focus is in each
  // row's menu. The card returns only for the ritual moments: plan, shut down, day closed.
  return null
}

// ── The card's shell: the retired RitualCard's look, one layout for every state (desktop). ──
function Shell({ icon, caption, captionTone = 'time', title, meta, body, bar, actions, links }: {
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
      style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-crisp)', padding: '13px 16px 9px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <span style={{ flex: 'none', display: 'inline-flex' }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {caption && <Caption tone={captionTone}>{caption}</Caption>}
          <div style={{ fontSize: 14.5, color: 'var(--ink-body)', fontWeight: 500, lineHeight: 1.3, marginTop: caption ? 2 : 0 }}>{title}</div>
          {meta && meta.length > 0 && (
            <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {meta.map((m) => <span key={m}>{m}</span>)}
            </div>
          )}
          {body}
          {bar && (
            <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: 'var(--line-card)', overflow: 'hidden', maxWidth: 320 }}>
              <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: bar.color }} />
            </div>
          )}
        </div>
        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none', flexWrap: 'wrap' }}>{actions}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>{links}</div>
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

// "A small secondary link on the card opens either ritual any time" — both, with their progress.
function RitualLinks({ morning, evening, onOpen }: { morning: RitualState; evening: RitualState; onOpen: (kind: RitualKind) => void }) {
  const link: CSSProperties = { background: 'none', border: 'none', padding: '2px 0', font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', cursor: 'pointer' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button type="button" className="kf-link-terra kf-hit" style={link} onClick={() => onOpen('morning')}>Morning ritual {ritualProgress(morning)}</button>
      <span aria-hidden style={{ color: 'var(--ink-hairline)', fontSize: 'var(--fs-meta)' }}>·</span>
      <button type="button" className="kf-link-terra kf-hit" style={link} onClick={() => onOpen('evening')}>Evening ritual {ritualProgress(evening)}</button>
    </div>
  )
}

const SunIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" style={{ flex: 'none' }}><circle cx="12" cy="12" r="5" fill="var(--acc-gold-warm)" /><g stroke="var(--acc-gold-warm)" strokeWidth="1.5" strokeLinecap="round"><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" /></g></svg>
)
const MoonIcon = () => (
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

function RitualShell({ glyph, caption, title, meta, pct, action, children }: { glyph: ReactNode; caption: string; title: string; meta: string[]; pct?: number; action?: ReactNode; children?: ReactNode }) {
  return (
    <section aria-label="Your day" data-day-card className="tp-ritual">
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
