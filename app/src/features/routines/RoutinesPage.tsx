import { useEffect, useMemo, useState } from 'react'
import { useRoutines, useRoutineCompletions, archiveRoutine, toggleCompletion } from './api'
import { challengeDays, computeStreak, computeTrellisDays, localDateKey, routineStartKey, routineStreak, streakOfGoal, todayTally, type StreakStatus } from './streaks'
import { vineStage } from '../../lib/growthStages'
import { groupRoutinesByTime } from './routineGrouping'
import { NewRoutineForm } from './NewRoutineForm'
import { StreakTrellis } from './StreakTrellis'
import { MorningRitual } from '../rituals/MorningRitual'
import { EveningRitual } from '../rituals/EveningRitual'
import { useRitualPins, toggleRitualPin } from '../rituals/ritualPins'
import { PinIcon } from '../rituals/PinIcon'
import { ActionSheet } from '../../components/ActionSheet'
import { ContextMenu } from '../../components/ContextMenu'
import { Icon } from '../../components/Icon'
import type { Routine, RoutineCompletion } from '../../lib/types'

// ── Routines — pixel contract Routines.dc.html #1a (desktop, lines 379-586) and #1b (iPhone,
// lines 588-642): the rituals-by-time list + "the garden" streak grid. #2a/#2b (New routine)
// live in NewRoutineForm.tsx; #4a (14-day trellis, turn 3's Gentle Rain redrawn — turn 3 itself
// skipped per Kai) lives in StreakTrellis.tsx, opened from a row's streak cluster. The shell
// owns sidebar/topbar/tab-bar; this is the main content, wired to real data. ──

const A = '/ds/assets'
const STAGE_LABEL: Record<string, string> = { bare: 'Bare', sprouting: 'Sprouting', flowering: 'Flowering', lush: 'Lush' }
// Polish B: a zero streak reads by its StreakStatus (streaks.ts). "streak lost" / "start again"
// are the export's (#1a Meditate); "no streak yet" is the export's own caption for the bare
// vine (Design System.dc.html, Vine · bare) — a routine that was never tended has lost nothing.
const ZERO_ROW_LABEL: Record<Exclude<StreakStatus, 'growing'>, string> = { new: 'no streak yet', lost: 'streak lost' }
const oneLine = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const
const ZERO_CARD_LABEL: Record<Exclude<StreakStatus, 'growing'>, string> = { new: 'Bare · no streak yet', lost: 'Bare · start again' }

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 767)
  useEffect(() => {
    const mq = matchMedia('(max-width: 767px)')
    const on = () => setIsMobile(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return isMobile
}

function FlameIcon({ size = 8 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.22} viewBox="0 0 9 11" style={{ flex: 'none' }}>
      <path d="M4.5 0C6 3 9 4 8 8c-.7 2.6-3.3 3-4.8 2C1 9 0 7 1.2 4 2 5 2.5 5 3 4 3.3 2.5 4 1 4.5 0Z" fill="var(--sig-streak)" />
    </svg>
  )
}

// Last 7 days as the trellis sees them (computeTrellisDays): 'off' — not scheduled, before the
// routine was planted, or today while it's still open — stays neutral; only a real scheduled
// miss is tinted. Polish B: a routine planted today no longer shows a week of misses.
function DayDots({ routine, completions, onOpen }: { routine: Routine; completions: RoutineCompletion[]; onOpen: () => void }) {
  const dates = completions.filter((c) => c.routine_id === routine.id).map((c) => c.completed_on)
  const cells = computeTrellisDays(dates, routine.cadence, 7, new Date(), routineStartKey(routine.created_at, dates))
  return (
    <span onClick={onOpen} title="14-day trellis" style={{ display: 'inline-flex', gap: 3, flex: 'none', cursor: 'pointer' }}>
      {cells.map((c) => (
        <span
          key={c.key}
          title={c.key}
          style={{ width: 8, height: 8, borderRadius: 2, display: 'inline-block', background: c.state === 'off' ? 'var(--line-card)' : c.state === 'grew' ? 'var(--acc-moss)' : 'color-mix(in srgb, var(--acc-terra) 40%, transparent)' }}
        />
      ))}
    </span>
  )
}

// Phone rows (Kai 2026-10-07 review): the name gets the full width, its meta (clock · streak ·
// last 7 days) a line under it — side by side at 360 the name wrapped one word per line. The check
// and the ⋯ are 48px targets; the ⋯ replaced a bare 11px "archive" link (same grammar as task rows).
function RoutineRow({ routine, completions, doneToday, isMobile, onOpenTrellis, onMenu }: { routine: Routine; completions: RoutineCompletion[]; doneToday: boolean; isMobile: boolean; onOpenTrellis: () => void; onMenu: (at: { x: number; y: number }) => void }) {
  const dates = completions.filter((c) => c.routine_id === routine.id).map((c) => c.completed_on)
  const { current, status } = routineStreak(dates, routine.cadence)

  function toggle() {
    // Kai 2026-10-07: no confirmation pop-ups for things the row already shows (the box ticks, the dots fill).
    toggleCompletion(routine)
  }

  const check = (
    <button
      type="button"
      onClick={toggle}
      aria-label={`${routine.name} done today`}
      aria-pressed={doneToday}
      // phone: a 48px hit around the 19px box, laid out at the box's own size
      style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: 'none', background: 'none', cursor: 'pointer', ...(isMobile ? { width: 48, height: 48, margin: -14.5 } : null) }}
    >
      <span
        style={{
          width: 19,
          height: 19,
          borderRadius: 6,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          color: 'var(--paper-parchment)',
          background: doneToday ? 'var(--acc-moss)' : 'transparent',
          border: doneToday ? 'none' : '1.5px solid var(--check-border)',
        }}
      >
        {doneToday ? '✓' : ''}
      </span>
    </button>
  )
  const name = <span style={{ fontSize: 15, color: doneToday ? 'var(--ink-hairline)' : 'var(--ink-body)', textDecoration: doneToday ? 'line-through' : 'none' }}>{routine.name}</span>
  const meta = (
    <>
      {routine.clock_time && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>{routine.clock_time}</span>}
      {status !== 'growing' ? (
        // Phone rows follow #1b, whose zero-streak row (Meditate) carries no label.
        !isMobile && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-hairline)' }}>{ZERO_ROW_LABEL[status]}</span>
      ) : (
        <span aria-label={routine.goal_days ? `${current} of ${routine.goal_days} days` : `${current} day streak`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--sig-streak)' }}>
          <FlameIcon />
          {streakOfGoal(current, routine.goal_days)}
        </span>
      )}
      <DayDots routine={routine} completions={completions} onOpen={onOpenTrellis} />
    </>
  )
  const more = (
    <button
      type="button"
      className="kf-hit"
      aria-label={`More for ${routine.name}`}
      aria-haspopup="menu"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        onMenu({ x: r.left, y: r.bottom })
      }}
      style={{ flex: 'none', width: isMobile ? 48 : 28, height: isMobile ? 48 : 28, padding: 0, border: 'none', borderRadius: 6, background: 'none', color: 'var(--ink-faint)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
    >
      <Icon name="dots" size={20} />
    </button>
  )

  if (isMobile) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '8px 0', borderBottom: '1px dashed var(--line-dashed)' }}>
        {check}
        <div style={{ flex: 1, minWidth: 0 }}>
          {name}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>{meta}</div>
        </div>
        {more}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 2px', borderBottom: '1px dashed var(--line-dashed)' }}>
      {check}
      <div style={{ flex: 1, minWidth: 0 }}>{name}</div>
      {meta}
      {more}
    </div>
  )
}

function GardenCard({ routine, completions, compact }: { routine: Routine; completions: RoutineCompletion[]; compact: boolean }) {
  const dates = completions.filter((c) => c.routine_id === routine.id).map((c) => c.completed_on)
  const { current, status } = routineStreak(dates, routine.cadence)
  const stage = vineStage(current)
  const sub = status !== 'growing' ? ZERO_CARD_LABEL[status] : `${STAGE_LABEL[stage]} · ${current}d`
  return (
    <div style={{ flex: compact ? 'none' : undefined, width: compact ? 88 : undefined, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: compact ? 'var(--shadow-crisp)' : 'var(--shadow-card)', padding: compact ? 9 : 12, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ height: compact ? 52 : 74, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <img src={`${A}/vine/${stage}.png`} alt="" style={{ maxHeight: compact ? 52 : 74, filter: 'var(--shadow-drop-sm)', opacity: stage === 'bare' ? 0.85 : 1 }} />
      </div>
      <div style={{ fontSize: compact ? 11 : 12.5, color: 'var(--ink-body)', marginTop: compact ? 5 : 8 }}>{routine.name}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: compact ? 7.5 : 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: stage === 'bare' ? 'var(--ink-hairline)' : 'var(--acc-sage-text)', marginTop: 2 }}>{compact ? `${current}d` : sub}</div>
    </div>
  )
}

export function RoutinesPage() {
  // R4-5b (2026-07-20 audit): "they should be accessible from the [routines] window" — the
  // guided rituals are reachable here whether or not they are pinned to Today, and this is
  // where an unpinned one gets pinned back.
  const ritualPins = useRitualPins()
  const [openRitual, setOpenRitual] = useState<'morning' | 'evening' | null>(null)
  const { data: routines = [] } = useRoutines()
  const { data: completions = [] } = useRoutineCompletions()
  const isMobile = useIsMobile()
  const [formOpen, setFormOpen] = useState<null | { challenge: boolean }>(null)
  const [trellisRoutine, setTrellisRoutine] = useState<Routine | null>(null)
  const [menu, setMenu] = useState<{ routine: Routine; x: number; y: number } | null>(null)

  const active = routines.filter((r) => r.active)
  const todayKey = localDateKey(new Date())
  const doneKeys = useMemo(() => new Set(completions.filter((c) => c.completed_on === todayKey).map((c) => c.routine_id)), [completions, todayKey])
  // Polish B: "N of M tended" counts only routines whose day it is (todayTally) — one resting
  // today (a Mon/Wed/Fri routine on a Saturday) is neither due nor "left before the day's done".
  const { due, done: doneToday, remaining } = todayTally(active, completions)

  const bestStreak = useMemo(() => {
    let best = 0
    for (const r of active) best = Math.max(best, computeStreak(completions.filter((c) => c.routine_id === r.id).map((c) => c.completed_on), r.cadence).current)
    return best
  }, [active, completions])

  const groups = groupRoutinesByTime(active)
    .filter((g) => g.items.length > 0)
    .map((g) => ({ ...g, tally: todayTally(g.items, completions) }))

  const activeChallenge = active.find((r) => r.challenge_start && r.challenge_end && todayKey >= r.challenge_start && todayKey <= r.challenge_end)

  const heroCaption = remaining === 0 ? (active.length > 0 ? 'all tended for today ✿' : 'plant your first routine ✿') : remaining === 1 ? 'one left before the day\'s done' : `${remaining} left before the day's done`

  const garden = (
    <div>
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? 9 : 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>The garden</div>
        {!isMobile && <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--ink-hand, #7a745f)', marginTop: 2 }}>each habit grows with its streak</div>}
      </div>
      {isMobile ? (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', marginTop: 10, paddingBottom: 4 }}>
          {active.map((r) => (
            <GardenCard key={r.id} routine={r} completions={completions} compact />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
          {active.map((r) => (
            <GardenCard key={r.id} routine={r} completions={completions} compact={false} />
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: isMobile ? undefined : 'minmax(0,1fr) 320px', minHeight: '100%' }}>
      {/* Phone: the shell's 16px gutter is the page's (Today's), not 16 + 20 of its own. */}
      <div style={{ minWidth: 0, padding: isMobile ? 0 : '36px 44px 48px', maxWidth: isMobile ? undefined : 720 }}>
        <div style={{ display: 'flex', alignItems: isMobile ? 'center' : 'flex-end', justifyContent: 'space-between', gap: isMobile ? 0 : 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 11 : 14 }}>
            <img src={`${A}/vine/lush.png`} alt="" style={{ height: isMobile ? 44 : 58, filter: 'var(--shadow-drop-sm)' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? 9 : 10.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Routines</div>
              <h1 style={{ margin: isMobile ? '2px 0 0' : '3px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: isMobile ? 26 : 40, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>Daily rituals</h1>
            </div>
          </div>
          {!isMobile && (
            <button type="button" onClick={() => setFormOpen({ challenge: false })} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', font: 'inherit', fontSize: 13, padding: '10px 17px', borderRadius: 999, cursor: 'pointer', boxShadow: 'var(--shadow-cta)' }}>
              ＋ New routine
            </button>
          )}
        </div>

        {/* R4-5b: the two guided rituals, always reachable from Routines. Phone (Kai 2026-10-07):
            side by side at 390 the "📌 PINNED" label left each title ~70px and the subtitles wrapped
            a word per line, so the cards stack and the pin is its icon alone (a 48px target). */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 8 : 12, marginTop: isMobile ? 14 : 18 }}>
          {(['morning', 'evening'] as const).map((kind) => (
            <div
              key={kind}
              data-ritual={kind}
              style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-crisp)', padding: isMobile ? '0 0 0 12px' : '10px 12px' }}
            >
              <button
                type="button"
                onClick={() => setOpenRitual(kind)}
                style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: isMobile ? '8px 0' : 0, font: 'inherit', fontSize: 13.5, color: 'var(--ink-body)', cursor: 'pointer' }}
              >
                <span data-ritual-title style={{ display: 'block', ...(isMobile ? oneLine : null) }}>{kind === 'morning' ? 'Morning ritual' : 'Evening ritual'}</span>
                <span data-ritual-sub style={{ display: 'block', ...(isMobile ? oneLine : null), fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-hairline)', marginTop: 3 }}>
                  {kind === 'morning' ? 'plan the day' : 'close its loops'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => toggleRitualPin(kind)}
                title={ritualPins[kind] ? 'Unpin from Today' : 'Pin to Today'}
                aria-label={ritualPins[kind] ? 'Unpin this ritual from Today' : 'Pin this ritual to Today'}
                aria-pressed={ritualPins[kind]}
                className="kf-hit"
                style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: 'none', border: 'none', padding: isMobile ? 0 : '4px 2px', width: isMobile ? 48 : undefined, height: isMobile ? 48 : undefined, font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', color: ritualPins[kind] ? 'var(--acc-terra)' : 'var(--ink-hairline)' }}
              >
                <PinIcon size={isMobile ? 16 : 10} filled={ritualPins[kind]} />
                {!isMobile && (ritualPins[kind] ? 'pinned' : 'pin')}
              </button>
            </div>
          ))}
        </div>

        <div style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: isMobile ? 'var(--shadow-crisp)' : 'var(--shadow-card)', padding: isMobile ? '13px 15px' : '16px 20px', marginTop: isMobile ? 16 : 22, display: 'flex', alignItems: 'center', gap: isMobile ? 14 : 18, transform: isMobile ? undefined : 'rotate(-0.3deg)' }}>
          {!isMobile && (
            <span style={{ position: 'absolute', top: -9, left: 38, width: 60, height: 16, background: 'color-mix(in srgb, var(--acc-moss) 40%, transparent)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.3) 0 4px,transparent 4px 8px)', transform: 'rotate(-2deg)', borderRadius: 1, boxShadow: 'var(--shadow-crisp)' }} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 18 : 24, fontWeight: 600, color: 'var(--ink-body)' }}>{doneToday} of {due} tended</span>
              {!isMobile && <span style={{ fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--ink-hand, #7a745f)' }}>{heroCaption}</span>}
            </div>
            <div style={{ marginTop: isMobile ? 8 : 10, height: isMobile ? 6 : 7, borderRadius: 4, background: 'var(--line-card)', overflow: 'hidden' }}>
              <span style={{ display: 'block', width: due ? `${Math.round((doneToday / due) * 100)}%` : '0%', height: '100%', background: 'var(--acc-moss)' }} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 8, paddingLeft: isMobile ? 12 : 18, borderLeft: '1px dashed var(--line-dashed)' }}>
            <FlameIcon size={isMobile ? 12 : 13} />
            {isMobile ? (
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: 'var(--ink-body)' }}>{bestStreak}</span>
            ) : (
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--ink-body)', lineHeight: 1 }}>{bestStreak}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>day streak</div>
              </div>
            )}
          </div>
        </div>

        {isMobile && (
          <button type="button" onClick={() => setFormOpen({ challenge: false })} style={{ width: '100%', minHeight: 48, marginTop: 14, border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', font: 'inherit', fontSize: 13.5, padding: '11px', borderRadius: 999, cursor: 'pointer', boxShadow: 'var(--shadow-cta)' }}>
            ＋ New routine
          </button>
        )}

        {/* X5 States t1 — the surface's own species as sprout + one hand line; the page's
            "New routine" CTA above is the one action, so the vignette adds none. */}
        {active.length === 0 && (
          <div style={{ padding: '36px 20px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <img src={`${A}/vine/bare.png`} alt="" style={{ height: 56, filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ marginTop: 16, fontFamily: 'var(--font-hand)', fontSize: 19, color: 'var(--ink-hand, #7a745f)', textAlign: 'center' }}>Nothing planted yet.</div>
          </div>
        )}

        {groups.map((g) => (
          <div key={g.key} style={{ marginTop: isMobile ? 20 : 30 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? 9.5 : 10.5, letterSpacing: isMobile ? '0.16em' : '0.18em', textTransform: 'uppercase', color: 'var(--acc-sage-text)', whiteSpace: 'nowrap' }}>
                {/* a group with nothing due today carries no "0/0" count — it's resting, not behind */}
                {isMobile && g.tally.due > 0 ? `${g.label} · ${g.tally.done}/${g.tally.due}` : g.label}
              </span>
              <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
              {!isMobile && g.tally.due > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>{g.tally.done} / {g.tally.due}</span>}
            </div>
            {g.items.map((r) => (
              <RoutineRow key={r.id} routine={r} completions={completions} doneToday={doneKeys.has(r.id)} isMobile={isMobile} onOpenTrellis={() => setTrellisRoutine(r)} onMenu={(at) => setMenu({ routine: r, ...at })} />
            ))}
          </div>
        ))}

        {isMobile && active.length > 0 && <div style={{ marginTop: 20 }}>{garden}</div>}
      </div>

      {!isMobile && (
        <div style={{ borderLeft: '1px dashed var(--line-solid)', padding: '36px 26px', display: 'flex', flexDirection: 'column', gap: 24, background: 'color-mix(in srgb, var(--paper-sidebar) 40%, transparent)' }}>
          {garden}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Challenge</span>
              <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
            </div>
            {activeChallenge && (
              <ChallengeCard routine={activeChallenge} completions={completions} />
            )}
            <div onClick={() => setFormOpen({ challenge: true })} style={{ marginTop: activeChallenge ? 12 : 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}>
              ＋ Start a challenge
            </div>
          </div>
        </div>
      )}

      {formOpen && <NewRoutineForm onClose={() => setFormOpen(null)} initialChallenge={formOpen.challenge} />}
      {/* R4-5b: the same guided flows Today launches, reachable here regardless of pin state */}
      {openRitual === 'morning' && <MorningRitual onClose={() => setOpenRitual(null)} />}
      {openRitual === 'evening' && <EveningRitual onClose={() => setOpenRitual(null)} />}
      {trellisRoutine && <StreakTrellis routine={trellisRoutine} completions={completions} onClose={() => setTrellisRoutine(null)} />}
      {/* A routine row's ⋯: the kit action sheet on a phone, the context menu on a computer. No
          edit form exists for a routine yet, so it's the trellis and Archive (Undo in the toast). */}
      {menu &&
        (isMobile ? (
          <ActionSheet
            title={menu.routine.name}
            meta="Routine"
            onClose={() => setMenu(null)}
            items={[
              { label: 'Streak trellis', onSelect: () => setTrellisRoutine(menu.routine) },
              { label: 'Archive', onSelect: () => archiveRoutine(menu.routine) },
            ]}
          />
        ) : (
          <ContextMenu
            position={{ x: menu.x, y: menu.y }}
            onClose={() => setMenu(null)}
            items={[
              { label: 'Streak trellis', onClick: () => setTrellisRoutine(menu.routine) },
              { label: 'Archive', onClick: () => archiveRoutine(menu.routine) },
            ]}
          />
        ))}
    </div>
  )
}

function ChallengeCard({ routine, completions }: { routine: Routine; completions: RoutineCompletion[] }) {
  const start = routine.challenge_start!
  const end = routine.challenge_end!
  const dates = completions.filter((c) => c.routine_id === routine.id).map((c) => c.completed_on)
  const { current } = computeStreak(dates, routine.cadence)
  const totalDays = routine.goal_days ?? challengeDays(start, end)
  const doneInRange = dates.filter((d) => d >= start && d <= end).length
  const pct = totalDays > 0 ? Math.min(100, Math.round((doneInRange / totalDays) * 100)) : 0
  const endLabel = new Date(`${end}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div style={{ position: 'relative', background: 'var(--paper-goal)', border: '1px solid var(--line-goal)', borderRadius: 3, boxShadow: 'var(--shadow-goal)', padding: '14px 16px', transform: 'rotate(0.4deg)' }}>
      <span style={{ position: 'absolute', top: -9, right: 20, width: 52, height: 16, background: 'color-mix(in srgb, var(--acc-gold-warm) 42%, transparent)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.3) 0 4px,transparent 4px 8px)', transform: 'rotate(2deg)', borderRadius: 1 }} />
      <div style={{ fontSize: 14, color: '#4a3a1e', fontWeight: 500 }}>{routine.name}</div>
      <div style={{ marginTop: 9, height: 6, borderRadius: 4, background: 'color-mix(in srgb, var(--acc-gold) 20%, transparent)', overflow: 'hidden' }}>
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: 'var(--acc-gold)' }} />
      </div>
      <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--acc-gold)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <FlameIcon size={10} />
          <span style={{ color: 'var(--sig-streak)' }}>{current}</span>
        </span>
        / {totalDays} days · ends {endLabel}
      </div>
    </div>
  )
}
