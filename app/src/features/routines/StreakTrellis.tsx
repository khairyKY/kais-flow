import { useEscapeStack } from '../../lib/overlayStack'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { computeGraceStreak, computeTrellisDays, rainHeld, routineStartKey, routineStreak, streakOfGoal, trellisCaption, type TrellisDay } from './streaks'
import { PLANTS, plantOf, plantSrc } from './plant'
import type { Routine, RoutineCompletion } from '../../lib/types'

// ── Streak trellis — pixel contract Routines.dc.html #4a: "the vine becomes a real 14-day
// trellis: pressed leaves, a hanging droplet, an honest snap." Reached by clicking a routine's
// streak badge in RoutinesPage. The mock's 14 leaf/droplet positions were hand-placed for its
// sample week; here they're laid out evenly along the same stem path for whatever real states
// computeTrellisDays returns. Turn 3 (3a/3b) is skipped per Kai — this IS the live streak
// visual, grace mechanic included, no separate settings toggle (that's W7/Settings territory). ──

const A = '/ds/assets'
const DAYS = 14
const STEM_W = 784
const STEM_H = 96

function dayOfMonth(key: string): number {
  return Number(key.slice(8, 10))
}

function weekdayName(key: string): string {
  return new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
}

function leafX(i: number): number {
  return 8 + ((STEM_W - 40) / (DAYS - 1)) * i
}

function leafY(i: number): number {
  return 34 + 10 * Math.sin(i * 1.3 + 0.4)
}

/** A stem x (0…STEM_W) as a share of the trellis width, so the leaves sit on the stem at any width. */
const at = (x: number) => `${(x / STEM_W) * 100}%`

export function StreakTrellis({ routine, completions, onClose }: { routine: Routine; completions: RoutineCompletion[]; onClose: () => void }) {
  const isMobile = useIsMobile()
  useEscapeStack(!isMobile, onClose) // a phone's BottomSheet owns Esc/Back

  const dates = completions.filter((c) => c.routine_id === routine.id).map((c) => c.completed_on)
  // Polish B: days before the routine was planted are 'off', never rain or a break.
  const since = routineStartKey(routine.created_at, dates)
  const { current, rainedDates } = computeGraceStreak(dates, routine.cadence, new Date(), since)
  const days = computeTrellisDays(dates, routine.cadence, DAYS, new Date(), since)

  const { status } = routineStreak(dates, routine.cadence)

  // polish-f1: on a 0-day streak nothing is held up, so neither the "N rain held" chip nor the
  // "it rained — the vine held on" caption shows (streaks.ts rainHeld / trellisCaption).
  const held = rainHeld(current, rainedDates)
  const story = trellisCaption(days, current, status)
  // Routines 2: the routine's own species (0067) heads the trellis at its stage, marks the days it
  // grew (the vine presses its leaves; the others their flowering drawing) and names the caption.
  const plant = plantOf(routine)
  const noun = PLANTS[plant].label.toLowerCase()
  const grewMark = (i: number) => (plant === 'vine' ? `${A}/vine/${i % 2 === 0 ? 'leaf-right' : 'leaf-left'}.png` : plantSrc(plant, 7))
  // Never tended: the New routine form's own "Its plant" hint (#2a), not "the vine kept growing"
  // for a vine that hasn't started. Snapped before this window: the export's "Bare · start again".
  const caption =
    story.kind === 'rained'
      ? `it rained ${weekdayName(story.key)} — the ${noun} held on.`
      : story.kind === 'broke'
        ? `it broke ${weekdayName(story.key)} — the ${noun} started over.`
        : story.kind === 'new'
          ? 'starts bare, grows with the streak ✿'
          : story.kind === 'bare'
            ? 'bare for now — start again ✿'
            : `no missed days in the last 14 — the ${noun} kept growing ✿`

  function tickColor(d: TrellisDay): string {
    if (d.state === 'broke') return 'var(--acc-terra)'
    if (d.state === 'rained') return 'var(--acc-hydrangea-deep)'
    return 'var(--ink-hairline)'
  }

  const content = (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <img src={plantSrc(plant, current)} alt="" style={{ height: 42, filter: 'var(--shadow-drop-sm)' }} />
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>{routine.name} · streak</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 3 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink-body)', lineHeight: 1 }}>{streakOfGoal(current, routine.goal_days)} days</span>
                  {held.length > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--acc-hydrangea-deep)' }}>
                      <DropletIcon size={8} />
                      {held.length} rain held
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>Last {DAYS} days</span>
              {!isMobile && (
                <button type="button" aria-label="Close" className="kf-hit" onClick={onClose} style={{ width: 26, height: 26, padding: 0, font: 'inherit', borderRadius: 999, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-faint)', fontSize: 'var(--fs-caption)', cursor: 'pointer' }}>✕</button>
              )}
            </div>
          </div>

          <div style={{ position: 'relative', marginTop: 30, height: 112 }}>
            <svg viewBox={`0 0 ${STEM_W} ${STEM_H}`} preserveAspectRatio="none" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: 84, overflow: 'visible' }}>
              <path d="M8,57 C120,44 200,68 300,55 S480,42 560,58 S720,50 778,52" fill="none" stroke="var(--acc-moss)" strokeWidth={2} strokeLinecap="round" />
            </svg>
            {days.map((d, i) => {
              const x = leafX(i)
              const y = leafY(i)
              if (d.state === 'grew') {
                const right = i % 2 === 0
                const rotate = right ? 2 + (i % 3) : -2 - (i % 3)
                return <img key={d.key} src={grewMark(i)} alt="" title={d.key} style={{ position: 'absolute', left: at(x), top: y, height: 23, transform: `rotate(${rotate}deg)` }} />
              }
              if (d.state === 'rained') {
                return (
                  <svg key={d.key} width={16} height={22} viewBox="0 0 16 22" style={{ position: 'absolute', left: at(x), top: y + 18 }}>
                    <title>{d.key}</title>
                    <path d="M8 1C10.6 7 15 9.5 15 14a7 7 0 0 1-14 0C1 9.5 5.4 7 8 1Z" fill="var(--acc-hydrangea)" opacity={0.92} />
                    <path d="M8 1C10.6 7 15 9.5 15 14a7 7 0 0 1-14 0C1 9.5 5.4 7 8 1Z" fill="none" stroke="#7d99a3" strokeWidth={0.8} />
                    <circle cx={5.4} cy={13.2} r={2} fill="var(--star, #FDFBF4)" opacity={0.65} />
                  </svg>
                )
              }
              if (d.state === 'broke') {
                return (
                  <svg key={d.key} width={22} height={20} viewBox="0 0 22 20" style={{ position: 'absolute', left: at(x - 3), top: y - 12 }}>
                    <title>{d.key}</title>
                    {/* the gap in the stem: the card's own paper (the phone sheet is parchment) */}
                    <rect x={0} y={0} width={22} height={20} fill={isMobile ? 'var(--paper-parchment)' : 'var(--paper-linen)'} />
                    <path d="M0 10q3 1 5 4" fill="none" stroke="var(--acc-moss)" strokeWidth={2} strokeLinecap="round" />
                    <path d="M22 9q-3 0 -5 3" fill="none" stroke="var(--acc-moss)" strokeWidth={2} strokeLinecap="round" />
                  </svg>
                )
              }
              return null
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${DAYS}, 1fr)`, marginTop: 2, borderTop: '1px solid var(--line-dashed)', paddingTop: 7 }}>
            {days.map((d) => (
              <span key={d.key} title={d.key} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: tickColor(d), fontWeight: d.state === 'broke' ? 700 : 400 }}>
                {dayOfMonth(d.key)}
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px 14px', marginTop: 16 }}>
            <div style={{ fontSize: 'var(--fs-body-s)', color: 'var(--ink-muted)' }}>{caption}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><img src={grewMark(0)} alt="" style={{ height: 12 }} />Grew</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><DropletIcon size={8} />Rained, held</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <svg width={14} height={8} viewBox="0 0 22 10"><path d="M1 5q3 1 5 4" fill="none" stroke="var(--acc-moss)" strokeWidth={2} strokeLinecap="round" /><path d="M21 4q-3 0 -5 3" fill="none" stroke="var(--acc-moss)" strokeWidth={2} strokeLinecap="round" /></svg>
                Broke
              </span>
            </div>
          </div>
        </>
  )

  // Phone: the kit sheet over the page (an 860px modal never fit 390).
  if (isMobile) return <BottomSheet onClose={onClose}>{() => content}</BottomSheet>

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(42,36,32,0.3)', zIndex: 998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 860, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', background: 'var(--paper-linen)', border: '1px solid var(--line-card)', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-popover)', padding: '30px 38px' }}
      >
        {content}
      </div>
    </div>
  )
}

function DropletIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 1.375} viewBox="0 0 12 16">
      <path d="M6 1C8 5 11 6.5 11 10a5 5 0 0 1-10 0C1 6.5 4 5 6 1Z" fill="var(--acc-hydrangea)" />
      <circle cx={4.6} cy={9.4} r={1.3} fill="var(--star, #FDFBF4)" opacity={0.7} />
    </svg>
  )
}
