import { useTasks } from '../tasks/api'
import { usePendingInboxItems } from '../inbox/api'
import { useProjects } from '../projects/api'
import { useRoutines, useRoutineCompletions } from '../routines/api'
import { computeStreak } from '../routines/streaks'
import { daisyAsset, hydrangeaAsset } from '../../lib/gardenAssets'
import { useTerrariumStore } from './terrariumStore'

interface TapeSpec {
  top: number
  left: number
  width: number
  height: number
  background: string
  rotate: number
}

interface Plant {
  key: string
  label: string
  src: string
  note: string
  height: number
  tapeStyle: TapeSpec
  rotate: number
}

// Hydrangea/inbox and daisy/calendar reflect real data. Chat (no message-history feature)
// and docs (no docs feature at all) have nothing to reflect yet, so they render dormant —
// the terrarium still shows all six plants (per design), just honestly at their lowest state.

function cherryAsset(top3Open: number): { src: string; note: string } {
  if (top3Open === 0) return { src: 'bud', note: 'no goals set yet' }
  return { src: 'bloom', note: `${top3Open} petal${top3Open === 1 ? '' : 's'} ready to fall` }
}

function wisteriaAsset(activeProjects: number): { src: string; note: string } {
  if (activeProjects === 0) return { src: 'p0', note: 'nothing climbing yet' }
  if (activeProjects <= 2) return { src: 'p20', note: 'just starting to climb' }
  if (activeProjects <= 4) return { src: 'p40', note: 'reaching for the trellis' }
  if (activeProjects <= 6) return { src: 'p60', note: 'mid-climb, still blooming' }
  if (activeProjects <= 8) return { src: 'p80', note: 'nearly at the top' }
  return { src: 'p100', note: 'in full climb' }
}

export function Terrarium() {
  const { inToday } = useTerrariumStore()
  const { data: tasks = [] } = useTasks()
  const { data: pendingInbox = [] } = usePendingInboxItems()
  const { data: projects = [] } = useProjects()
  const { data: routines = [] } = useRoutines()
  const { data: completions = [] } = useRoutineCompletions()

  if (!inToday) return null

  const top3Open = tasks.filter((t) => t.top3 && t.status === 'todo').length
  const activeProjects = projects.filter((p) => p.status === 'active').length

  const hour = new Date().getHours()
  const daisy = daisyAsset(hour)
  const hydrangea = hydrangeaAsset(pendingInbox.length)
  const cherry = cherryAsset(top3Open)
  const wisteria = wisteriaAsset(activeProjects)

  // Aggregate streak: a day counts if any scheduled routine was completed on it.
  const allDays = { weekdays: [0, 1, 2, 3, 4, 5, 6] }
  const completedDays = Array.from(new Set(completions.map((c) => c.completed_on)))
  const { current: streak } = computeStreak(completedDays, allDays)

  const earliestDates = [
    ...tasks.map((t) => t.created_at),
    ...pendingInbox.map((i) => i.created_at),
    ...projects.map((p) => p.created_at),
    ...routines.map((r) => r.created_at),
  ].sort()
  const dayNumber = earliestDates.length
    ? Math.max(1, Math.round((Date.now() - new Date(earliestDates[0]).getTime()) / 86_400_000) + 1)
    : 1

  const plants: Plant[] = [
    {
      key: 'chat',
      label: 'Trifolium · Chat',
      src: 'assets/clover/resting.png',
      note: 'quiet for now',
      height: 100,
      rotate: -0.8,
      tapeStyle: { top: 80, left: 81, width: 40, height: 11, background: 'rgba(201,160,160,0.32)', rotate: -4 },
    },
    {
      key: 'inbox',
      label: 'Hydrangea · Inbox',
      src: `assets/hydrangea/${hydrangea.src}.png`,
      note: hydrangea.note,
      height: 100,
      rotate: 0.6,
      tapeStyle: { top: 81, left: 76, width: 40, height: 11, background: 'rgba(154,180,190,0.35)', rotate: 3 },
    },
    {
      key: 'calendar',
      label: 'Bellis · Calendar',
      src: `assets/daisy/${daisy.src}.png`,
      note: daisy.note,
      height: 102,
      rotate: -0.5,
      tapeStyle: { top: 65, left: 81, width: 40, height: 11, background: 'rgba(168,160,190,0.32)', rotate: -3 },
    },
    {
      key: 'tasks',
      label: 'Prunus · Tasks',
      src: `assets/cherry/${cherry.src}.png`,
      note: cherry.note,
      height: 96,
      rotate: 0.7,
      tapeStyle: { top: 79, left: 77, width: 49, height: 11, background: 'rgba(212,168,176,0.38)', rotate: 4 },
    },
    {
      key: 'projects',
      label: 'Wisteria · Projects',
      src: `assets/wisteria/${wisteria.src}.png`,
      note: wisteria.note,
      height: 108,
      rotate: -0.6,
      tapeStyle: { top: 4, left: 90, width: 44, height: 8, background: 'rgba(168,160,190,0.35)', rotate: 2 },
    },
    {
      key: 'docs',
      label: 'Osmunda · Docs',
      src: 'assets/fern/coil.png',
      note: 'not started yet',
      height: 104,
      rotate: 0.5,
      tapeStyle: { top: 79, left: 78, width: 38, height: 10, background: 'rgba(212,199,138,0.4)', rotate: 15 },
    },
  ]

  return (
    <section
      style={{
        position: 'relative',
        borderRadius: 4,
        background: 'var(--bg-surface)',
        border: '1px solid var(--line-card)',
        boxShadow: '0 1px 2px rgba(60,52,38,0.14), 0 10px 26px rgba(60,52,38,0.1)',
        marginBottom: 34,
        padding: '22px 28px 18px',
        transform: 'rotate(-0.25deg)',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: -9,
          left: 38,
          width: 72,
          height: 18,
          background: 'rgba(138,154,126,0.38)',
          backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 4px, transparent 4px 8px)',
          transform: 'rotate(-2deg)',
          borderRadius: 1,
          boxShadow: '0 1px 2px rgba(60,52,38,0.12)',
        }}
      />
      <span
        style={{
          position: 'absolute',
          top: -9,
          right: 52,
          width: 72,
          height: 18,
          background: 'rgba(168,160,190,0.35)',
          backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 4px, transparent 4px 8px)',
          transform: 'rotate(2.5deg)',
          borderRadius: 1,
          boxShadow: '0 1px 2px rgba(60,52,38,0.12)',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            The Terrarium
          </span>
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: 18, color: 'var(--text-secondary)', transform: 'rotate(-1deg)', display: 'inline-block' }}>
            pressed &amp; kept, one day at a time
          </span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
          Day {dayNumber} · {streak}-day streak
        </span>
      </div>

      <style>{'.terrarium-plants{display:grid;grid-template-columns:repeat(6, minmax(0, 1fr));gap:18px;margin-top:18px;align-items:end}@media (max-width:767px){.terrarium-plants{display:flex;overflow-x:auto;gap:14px;padding-bottom:4px}.terrarium-plants>div{flex:0 0 84px}}'}</style>
      <div className="terrarium-plants">
        {plants.map((p) => (
          <div key={p.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative', minWidth: 0, transform: `rotate(${p.rotate}deg)` }}>
            <img
              src={p.src}
              alt={p.label}
              style={{
                height: p.height,
                width: 'auto',
                maxWidth: '100%',
                objectFit: 'contain',
                filter: 'drop-shadow(0 2px 2px rgba(60,52,38,0.18))',
                animation: p.key === 'chat' ? 'cloverSway 5s ease-in-out infinite' : undefined,
                transformOrigin: '50% 100%',
              }}
            />
            <span
              style={{
                position: 'absolute',
                top: p.tapeStyle.top,
                left: p.tapeStyle.left,
                width: p.tapeStyle.width,
                height: p.tapeStyle.height,
                marginLeft: -20,
                background: p.tapeStyle.background,
                backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 3px, transparent 3px 6px)',
                transform: `rotate(${p.tapeStyle.rotate}deg)`,
                borderRadius: 1,
              }}
            />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                {p.label}
              </div>
              <div style={{ fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--text-secondary)', marginTop: 1 }}>{p.note}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
