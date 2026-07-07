import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { useTasks } from '../tasks/api'
import { useRoutines, useRoutineCompletions } from '../routines/api'
import { computeStreak } from '../routines/streaks'
import { useSlipping, markReviewed } from '../slipping/api'
import type { Routine } from '../../lib/types'

function SectionLabel({ label, tone }: { label: string; tone: 'buttercream' | 'terra' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10.5,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: tone === 'terra' ? 'var(--acc-terra)' : 'var(--acc-buttercream-text)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
    </div>
  )
}

function challengeBadge(routine: Routine, dates: string[]): string | null {
  if (!routine.challenge_start || !routine.challenge_end) return null
  const start = new Date(routine.challenge_start)
  const end = new Date(routine.challenge_end)
  const totalDays =
    routine.cadence.weekdays.length === 7 ? Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1 : null
  const doneInRange = dates.filter((d) => d >= routine.challenge_start! && d <= routine.challenge_end!).length
  return totalDays ? `${doneInRange}/${totalDays} days` : `${doneInRange} done`
}

function FlameStreak({ current, best }: { current: number; best: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--acc-moss)' }}>
      <svg width="9" height="11" viewBox="0 0 9 11" aria-hidden="true">
        <path d="M4.5 0C6 3 9 4 8 8c-.7 2.6-3.3 3-4.8 2C1 9 0 7 1.2 4 2 5 2.5 5 3 4 3.3 2.5 4 1 4.5 0Z" fill="var(--acc-terra)" />
      </svg>
      {current} current · best {best}
    </span>
  )
}

export function WeeklyReviewPage() {
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const { data: tasks = [] } = useTasks()
  const { data: routines = [] } = useRoutines()
  const { data: completions = [] } = useRoutineCompletions()
  const { data: slipping = [] } = useSlipping()

  const activeRoutines = routines.filter((r) => r.active)

  return (
    <div style={{ maxWidth: 920 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 9 }}>
            Weekly Review · the sweep
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 44, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>
            Weekly Review
          </h1>
        </div>
        <span style={{ fontFamily: 'var(--font-hand)', fontSize: 18, color: 'var(--text-secondary)', transform: 'rotate(-1deg)', marginBottom: 6 }}>
          the frond unfurls as you sweep ↓
        </span>
      </div>

      <div style={{ height: 1, borderBottom: '1px dashed var(--border-default)', margin: '26px 0 30px' }} />

      <style>{`
        .review-columns { display: grid; grid-template-columns: 92px minmax(0, 760px); gap: 26px; align-items: stretch; }
        @media (max-width: 767px) {
          .review-columns { grid-template-columns: minmax(0, 1fr); }
          .review-frond { display: none !important; }
          .review-sweep-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div className="review-columns">
        <div className="review-frond" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', position: 'relative', paddingTop: 6 }}>
          <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 0, borderLeft: '1px dashed var(--line-dashed)' }} />
          {(['coil', 'unfurl1', 'unfurl2', 'full'] as const).map((state, i) => (
            <img
              key={state}
              src={`assets/fern/${state}.png`}
              alt=""
              style={{ position: 'relative', height: 74 + i * 11, width: 'auto', objectFit: 'contain', filter: 'var(--shadow-drop-sm)' }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
          <section>
            <SectionLabel label="Per-domain sweep" tone="buttercream" />
            {domains.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>No domains yet.</p>
            ) : (
              <div className="review-sweep-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {domains.map((d, i) => {
                  const domainProjects = projects.filter((p) => p.domain_id === d.id)
                  const openTasks = tasks.filter((t) => t.domain_id === d.id && t.status === 'todo')
                  const tapeSide = i % 2 === 0 ? { left: 18 } : { right: 22 }
                  return (
                    <div
                      key={d.id}
                      style={{
                        position: 'relative',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--line-card)',
                        boxShadow: 'var(--shadow-card)',
                        borderRadius: 'var(--radius-sharp)',
                        padding: '14px 16px',
                        transform: `rotate(${i % 2 === 0 ? -0.35 : 0.3}deg)`,
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          top: -8,
                          ...tapeSide,
                          width: 42,
                          height: 12,
                          background: 'rgba(212,199,138,0.45)',
                          backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 3px, transparent 3px 6px)',
                          transform: `rotate(${i % 2 === 0 ? -2 : 2}deg)`,
                          borderRadius: 1,
                        }}
                      />
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 'var(--fw-semibold)', color: 'var(--text-primary)' }}>{d.name}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 6 }}>
                        {domainProjects.length} project{domainProjects.length === 1 ? '' : 's'} · {openTasks.length} open task{openTasks.length === 1 ? '' : 's'}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section>
            <SectionLabel label="Slipping" tone="terra" />
            {slipping.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>Nothing slipping.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {slipping.map((row, i) => (
                  <div
                    key={`${row.entity_type}-${row.entity_id}`}
                    style={{
                      position: 'relative',
                      border: '1px solid var(--line-goal)',
                      background: 'var(--paper-goal)',
                      padding: '12px 14px',
                      transform: `rotate(${i % 2 === 0 ? 0.3 : -0.25}deg)`,
                      boxShadow: 'var(--shadow-card)',
                      borderRadius: 'var(--radius-sharp)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                    }}
                  >
                    <img src="assets/wisteria/p20.png" alt="" style={{ height: 44, width: 'auto', opacity: 0.75, flex: 'none' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, color: 'var(--text-primary)', fontWeight: 500 }}>{row.entity_name}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-gold)', marginTop: 4 }}>
                        {Math.floor(row.days_since)} days untouched
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => markReviewed(row)}
                      style={{ background: 'none', border: 'none', color: 'var(--acc-terra)', fontFamily: 'inherit', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0, flex: 'none' }}
                    >
                      reviewed
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionLabel label="Streaks" tone="buttercream" />
            {activeRoutines.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>No routines yet.</p>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {activeRoutines.map((r, i) => {
                    const dates = completions.filter((c) => c.routine_id === r.id).map((c) => c.completed_on)
                    const { current, best } = computeStreak(dates, r.cadence)
                    const badge = challengeBadge(r, dates)
                    return (
                      <div
                        key={r.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '9px 0',
                          borderBottom: i < activeRoutines.length - 1 ? '1px dashed var(--line-card)' : 'none',
                        }}
                      >
                        <span style={{ flex: 1, fontSize: 14.5, color: 'var(--text-primary)' }}>{r.name}</span>
                        {badge && (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--acc-gold)', background: 'color-mix(in oklch, var(--acc-gold-warm) 18%, var(--paper-parchment))', border: '1px solid var(--acc-gold-warm)', padding: '2px 8px', borderRadius: 999 }}>
                            {badge}
                          </span>
                        )}
                        <FlameStreak current={current} best={best} />
                      </div>
                    )
                  })}
                </div>
                <p style={{ margin: '18px 0 0', fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--text-tertiary)', transform: 'rotate(-0.6deg)' }}>
                  swept end to end — the frond is fully open ✓
                </p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
