import { useState, type ReactNode } from 'react'
import { useTasks, toggleTop3 } from '../tasks/api'
import { useCalendarEvents } from '../calendar/api'
import { useRoutines, useRoutineCompletions } from '../routines/api'
import { computeStreak, localDateKey } from '../routines/streaks'
import { logActivity } from '../../lib/activity'
import { FieldLabel, RLink, CtaButton, useIsMobile } from './RitualChrome'
import { useMotionEnabled } from '../../lib/motion'

// ── The Closing Ritual — pixel contract Rituals.dc.html 2c/2d/2e (the four beats) with
// beat 1 taken from 3a's refined sun (the dv-next under t3 explicitly says this sun
// "replaces 2b's flat dial"). Turn 1's older two-step "sweep + preview" (1e/1f) is NOT
// built here: turn 2/3 rename the same surface "Closing Ritual" and give it a different
// 4-beat structure, which reads as a redesign of turn 1's evening flow rather than an
// addition to it — but that's this build's inference, not something the file states
// outright, and the brief's own option list (1a-1g) does include 1e/1f. Flagged for R4/Kai
// to confirm — a plain "roll open tasks to tomorrow" and "tomorrow's schedule at a glance"
// step from 1e/1f are unbuilt if he wants both flows. Mobile-first dusk phone sheet;
// desktop gets "the same four beats as a centered takeover" per the dv-next. ──

const A = '/ds/assets'
const BEATS = ['garden', 'line', 'seeds', 'goodnight'] as const
type Beat = (typeof BEATS)[number]
const BEAT_BG: Record<Beat, string> = {
  garden: 'linear-gradient(180deg,#2e2840,#211d30)',
  line: 'linear-gradient(180deg,#332c48,#262138)',
  seeds: 'linear-gradient(180deg,#2e2840,#211d30)',
  goodnight: 'linear-gradient(180deg,#26213a,#171422)',
}

function todayBounds(): [Date, Date] {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setHours(23, 59, 59, 999)
  return [start, end]
}

// The dusk takeover — full-bleed sheet on phone widths, centered dark card on desktop
// (the export only draws the beats as phone mockups; "Desktop gets the same four beats
// as a centered takeover" per the dv-next, so the container here is original to this build).
function DuskPanel({ bg, children }: { bg: string; children: ReactNode }) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: bg, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    )
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(20,16,28,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'relative', width: 420, height: 660, maxHeight: '90vh', borderRadius: 22, overflow: 'hidden', background: bg, boxShadow: 'var(--shadow-popover)', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  )
}

function BeatHeader({ label, onSkip }: { label: string; onSkip: () => void }) {
  return (
    <div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '28px 24px 0' }}>
      <FieldLabel color="#a89fc0">{label}</FieldLabel>
      <RLink onClick={onSkip} color="#8e88a0">skip</RLink>
    </div>
  )
}

export function EveningRitual({ onClose }: { onClose: () => void }) {
  const [beatIndex, setBeatIndex] = useState(0)
  const beat = BEATS[beatIndex]
  const { data: tasks = [] } = useTasks()
  const { data: events = [] } = useCalendarEvents()
  const { data: routines = [] } = useRoutines()
  const { data: completions = [] } = useRoutineCompletions()
  const [line, setLine] = useState('')
  const [seededIds, setSeededIds] = useState<Set<string>>(new Set())

  function next() {
    if (beatIndex < BEATS.length - 1) setBeatIndex(beatIndex + 1)
    else onClose()
  }

  return <DuskPanel bg={BEAT_BG[beat]}>{
    beat === 'garden' ? <GardenBeat tasks={tasks} events={events} routines={routines} completions={completions} onSkip={onClose} onNext={next} /> :
    beat === 'line' ? <LineBeat line={line} onChange={setLine} onSkip={onClose} onNext={() => { if (line.trim()) logActivity('journal.line_added', 'ritual', localDateKey(new Date()), { text: line.trim() }); next() }} /> :
    beat === 'seeds' ? <SeedsBeat tasks={tasks} seededIds={seededIds} onSeed={(id) => setSeededIds((s) => new Set(s).add(id))} onSkip={onClose} onNext={next} /> :
    <GoodnightBeat onDone={onClose} />
  }</DuskPanel>
}

function GardenBeat({
  tasks,
  events,
  routines,
  completions,
  onSkip,
  onNext,
}: {
  tasks: ReturnType<typeof useTasks>['data']
  events: ReturnType<typeof useCalendarEvents>['data']
  routines: ReturnType<typeof useRoutines>['data']
  completions: ReturnType<typeof useRoutineCompletions>['data']
  onSkip: () => void
  onNext: () => void
}) {
  const motion = useMotionEnabled()
  const [todayStart, todayEnd] = todayBounds()
  const all = tasks ?? []
  const doneToday = all.filter((t) => t.completed_at && new Date(t.completed_at) >= todayStart && new Date(t.completed_at) <= todayEnd).length
  const todayEvents = (events ?? []).filter((e) => !e.all_day && new Date(e.starts_at) >= todayStart && new Date(e.starts_at) <= todayEnd)
  const focusedMin = todayEvents.reduce((sum, e) => sum + (new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()) / 60000, 0)
  const focusedHours = Math.min(12, focusedMin / 60)
  const todayKey = localDateKey(new Date())
  const grewToday = (completions ?? []).some((c) => c.completed_on === todayKey)

  const best = (routines ?? []).reduce((max, r) => {
    if (!r.active) return max
    const dates = (completions ?? []).filter((c) => c.routine_id === r.id).map((c) => c.completed_on)
    return Math.max(max, computeStreak(dates, r.cadence).current)
  }, 0)
  const vineStage = best >= 30 ? 'lush' : best >= 7 ? 'flowering' : best >= 1 ? 'sprouting' : 'bare'

  const circumference = 2 * Math.PI * 72
  const lit = circumference * (focusedHours / 12)

  const petals: [number, number, number, number, string, number][] = [
    [34, 6, 12, 9, '70% 30% 60% 40%', 14],
    [50, 2, 11, 8, '60% 40% 70% 30%', -32],
    [24, 0, 10, 8, '70% 30% 60% 40%', 56],
    [44, 12, 10, 7, '60% 40% 70% 30%', -8],
    [60, 8, 9, 7, '70% 30% 60% 40%', 80],
    [38, 20, 9, 7, '60% 40% 70% 30%', 120],
    [54, 18, 8, 6, '70% 30% 60% 40%', -60],
  ]

  return (
    <>
      <style>{`
        @keyframes sunTurn { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes sunBreathe { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.035) } }
      `}</style>
      <BeatHeader label="Closing · 1 of 4" onSkip={onSkip} />
      <div style={{ flex: 'none', padding: '14px 24px 0' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 26, color: '#f0ebdd', lineHeight: 1.1 }}>Today's garden</h1>
        <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#b8b0c8' }}>
          Today · {doneToday} bloom{doneToday === 1 ? '' : 's'} · {focusedHours.toFixed(1)}h focused{grewToday ? ' · vine +1' : ''}
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* X1 Effects 1c — firefly dusk: slow pulses, slower drift, <=5 flies. Reuses the
            fireflyDrift/twinkle keyframes (tokens/motion.css); dusk palette is this file's own. */}
        {motion &&
          [
            { left: '16%', top: '58%', size: 5, drift: 13, pulse: 4.5, delay: 0 },
            { left: '78%', top: '46%', size: 4, drift: 15, pulse: 5.2, delay: 1.6 },
            { left: '58%', top: '72%', size: 4, drift: 11, pulse: 4, delay: 3.1 },
          ].map((f, i) => (
            <span
              key={i}
              aria-hidden
              style={{
                position: 'absolute',
                left: f.left,
                top: f.top,
                width: f.size,
                height: f.size,
                borderRadius: '50%',
                background: '#E8D9A0',
                boxShadow: '0 0 8px 3px rgba(232,217,160,0.5)',
                animation: `fireflyDrift ${f.drift}s ease-in-out ${f.delay}s infinite, twinkle ${f.pulse}s ease-in-out ${f.delay}s infinite`,
                pointerEvents: 'none',
              }}
            />
          ))}
        <div style={{ position: 'absolute', left: '50%', top: 28, transform: 'translateX(-50%)', width: 190, height: 190 }}>
          <span style={{ position: 'absolute', inset: -26, borderRadius: '50%', background: 'radial-gradient(circle,rgba(228,195,107,0.22),rgba(228,195,107,0.07) 45%,transparent 68%)' }} />
          <svg viewBox="0 0 160 160" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
            <g fill="rgba(240,235,221,0.28)">
              {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
                const rad = (deg - 90) * (Math.PI / 180)
                return <circle key={deg} cx={80 + 72 * Math.cos(rad)} cy={80 + 72 * Math.sin(rad)} r="1.6" />
              })}
            </g>
            <circle cx="80" cy="80" r="72" fill="none" stroke="rgba(240,235,221,0.1)" strokeWidth="2.5" />
            <circle cx="80" cy="80" r="72" fill="none" stroke="#E4C36B" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${lit} ${circumference - lit}`} transform="rotate(-90 80 80)" />
            <circle cx="80" cy="8" r="3" fill="#E4C36B" />
            <circle cx="142.4" cy="44" r="3" fill="#E4C36B" />
            <g style={{ transformOrigin: '80px 80px', animation: motion ? 'sunTurn 140s linear infinite' : undefined }}>
              <g fill="#D9B65C">
                <path d="M80 30 L83 46 Q80 49 77 46 Z" /><path d="M80 130 L77 114 Q80 111 83 114 Z" />
                <path d="M30 80 L46 77 Q49 80 46 83 Z" /><path d="M130 80 L114 83 Q111 80 114 77 Z" />
              </g>
              <g fill="#C9A55A" opacity="0.85">
                <path d="M115.4 44.6 L106 58 Q102 57.5 102.5 53.5 Z" /><path d="M44.6 115.4 L54 102 Q58 102.5 57.5 106.5 Z" />
                <path d="M44.6 44.6 L58 54 Q57.5 58 53.5 57.5 Z" /><path d="M115.4 115.4 L102 106 Q102.5 102 106.5 102.5 Z" />
              </g>
              <g fill="#C9A55A" opacity="0.6">
                <path d="M97 33.2 L94.4 47 Q91 47.5 90 44 Z" /><path d="M63 126.8 L65.6 113 Q69 112.5 70 116 Z" />
                <path d="M126.8 63 L113 65.6 Q112.5 69 116 70 Z" /><path d="M33.2 97 L47 94.4 Q47.5 91 44 90 Z" />
                <path d="M126.8 97 L113 94.4 Q112.5 91 116 90 Z" /><path d="M33.2 63 L47 65.6 Q47.5 69 44 70 Z" />
                <path d="M97 126.8 L94.4 113 Q91 112.5 90 116 Z" /><path d="M63 33.2 L65.6 47 Q69 47.5 70 44 Z" />
              </g>
            </g>
            <g style={{ transformOrigin: '80px 80px', animation: motion ? 'sunBreathe 7s ease-in-out infinite' : undefined }}>
              <circle cx="80" cy="80" r="26" fill="#D9B65C" />
              <circle cx="80" cy="80" r="26" fill="url(#sunShade)" />
              <circle cx="80" cy="80" r="26" fill="none" stroke="rgba(120,84,40,0.5)" strokeWidth="1" />
              <circle cx="80" cy="80" r="21.5" fill="none" stroke="rgba(255,244,214,0.35)" strokeWidth="0.8" strokeDasharray="1.5 3" />
            </g>
            <defs>
              <radialGradient id="sunShade" cx="0.38" cy="0.32" r="0.9">
                <stop offset="0" stopColor="#F2DA96" /><stop offset="0.55" stopColor="#D9B65C" stopOpacity="0" /><stop offset="1" stopColor="#B78B44" stopOpacity="0.55" />
              </radialGradient>
            </defs>
          </svg>
          <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', textAlign: 'center', pointerEvents: 'none' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 600, color: '#4a3416', lineHeight: 1 }}>{Math.round(focusedHours)}h</div>
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 2, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a89fc0' }}>
            of sun · {Math.round(focusedHours)} of 12 waking hours
          </div>
        </div>

        <div style={{ position: 'absolute', left: 34, bottom: 88, width: 110, height: 56 }}>
          {petals.slice(0, Math.max(1, Math.min(7, doneToday))).map(([left, bottom, w, h, radius, rot], i) => (
            <span key={i} style={{ position: 'absolute', left, bottom, width: w, height: h, background: 'linear-gradient(135deg,#E8C4CC,#D4A8B0)', borderRadius: radius, transform: `rotate(${rot}deg)` }} />
          ))}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: -22, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a89fc0' }}>
            {doneToday} petal{doneToday === 1 ? '' : 's'}
          </div>
        </div>

        <div style={{ position: 'absolute', right: 30, bottom: 76, width: 120 }}>
          <img src={`${A}/vine/${vineStage}.png`} alt="" style={{ height: 84, filter: 'brightness(0.85)' }} />
          <div style={{ marginTop: 6, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a89fc0' }}>
            vine{grewToday ? ' +1 leaf' : ''}
          </div>
        </div>
        <span style={{ position: 'absolute', left: 24, right: 24, bottom: 66, borderBottom: '1.5px dashed rgba(168,159,192,0.35)' }} />
      </div>
      <div style={{ flex: 'none', padding: '0 24px 32px' }}>
        <CtaButton onClick={onNext} full>Continue</CtaButton>
      </div>
    </>
  )
}

function LineBeat({ line, onChange, onSkip, onNext }: { line: string; onChange: (v: string) => void; onSkip: () => void; onNext: () => void }) {
  return (
    <>
      <BeatHeader label="Closing · 2 of 4" onSkip={onSkip} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 24px' }}>
        <div style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: '0 18px 44px rgba(20,16,28,0.45)', padding: '26px 24px 22px', transform: 'rotate(-0.6deg)' }}>
          <input
            autoFocus
            value={line}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onNext()
            }}
            placeholder="One line about today…"
            style={{ width: '100%', border: 'none', outline: 'none', background: 'none', fontFamily: 'var(--font-hand)', fontSize: 22, color: 'var(--ink-hairline)' }}
          />
          <div style={{ marginTop: 34, borderTop: '1px dashed var(--line-dashed)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <FieldLabel color="var(--ink-hairline)">lands in the journal</FieldLabel>
            <FieldLabel>↵ continues</FieldLabel>
          </div>
        </div>
      </div>
      <div style={{ flex: 'none', padding: '0 24px 40px' }} />
    </>
  )
}

function SeedsBeat({
  tasks,
  seededIds,
  onSeed,
  onSkip,
  onNext,
}: {
  tasks: ReturnType<typeof useTasks>['data']
  seededIds: Set<string>
  onSeed: (id: string) => void
  onSkip: () => void
  onNext: () => void
}) {
  const all = tasks ?? []
  const top3 = all.filter((t) => t.top3)
  const candidates = all.filter((t) => t.status === 'todo' && !t.top3)
  const droppedIn = top3.filter((t) => seededIds.has(t.id)).length

  function toggle(t: (typeof all)[number]) {
    const wasStarred = t.top3
    toggleTop3(t)
    if (!wasStarred) onSeed(t.id)
  }

  return (
    <>
      <BeatHeader label="Closing · 3 of 4" onSkip={onSkip} />
      <div style={{ flex: 'none', padding: '12px 24px 0' }}>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 22, color: '#f0ebdd', lineHeight: 1.1 }}>Tomorrow's three</h1>
        <div style={{ marginTop: 4, fontFamily: 'var(--font-hand)', fontSize: 15, color: '#c9c0d8' }}>tap three, or fewer ✿</div>
      </div>
      <div style={{ flex: 1, padding: '12px 24px 0', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
        {top3.map((t) => (
          <div key={t.id} onClick={() => toggle(t)} style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'rgba(244,241,234,0.1)', border: '1px solid rgba(244,241,234,0.28)', borderRadius: 8, padding: '12px 13px', cursor: 'pointer' }}>
            <span style={{ color: 'var(--acc-terra)', fontSize: 13 }}>★</span>
            <span style={{ flex: 1, fontSize: 13.5, color: '#f0ebdd' }}>{t.title}</span>
          </div>
        ))}
        {candidates.map((t) => (
          <div key={t.id} onClick={() => toggle(t)} style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'rgba(244,241,234,0.05)', border: '1px solid rgba(244,241,234,0.14)', borderRadius: 8, padding: '12px 13px', cursor: 'pointer' }}>
            <span style={{ width: 14, height: 14, border: '1.5px dashed rgba(244,241,234,0.4)', borderRadius: '50%', flex: 'none' }} />
            <span style={{ flex: 1, fontSize: 13.5, color: '#c9c0d8' }}>{t.title}</span>
          </div>
        ))}
      </div>
      <div style={{ flex: 'none', padding: '14px 24px 32px' }}>
        <div style={{ position: 'relative', background: 'rgba(244,241,234,0.08)', border: '1.5px dashed rgba(201,165,90,0.5)', borderRadius: 10, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#c9b485' }}>For tomorrow</div>
            <div style={{ fontSize: 12, color: '#c9c0d8', marginTop: 2 }}>{droppedIn} seed{droppedIn === 1 ? '' : 's'} dropped in</div>
          </div>
        </div>
        <CtaButton onClick={onNext} full style={{ marginTop: 12 }}>Tuck them in</CtaButton>
      </div>
    </>
  )
}

function GoodnightBeat({ onDone }: { onDone: () => void }) {
  const motion = useMotionEnabled()
  return (
    <>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 110, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', padding: '0 30px', opacity: 0.5 }}>
        <img src={`${A}/cherry/fallen.png`} alt="" style={{ height: 70, filter: 'brightness(0.5) saturate(0.6)' }} />
        <img src={`${A}/vine/flowering.png`} alt="" style={{ height: 82, filter: 'brightness(0.5) saturate(0.6)' }} />
        <img src={`${A}/clover/resting.png`} alt="" style={{ height: 50, filter: 'brightness(0.5) saturate(0.6)' }} />
      </div>
      {motion && (
        <>
          <span style={{ position: 'absolute', left: '20%', top: '32%', width: 5, height: 5, borderRadius: '50%', background: '#E8D9A0', boxShadow: '0 0 8px 3px rgba(232,217,160,0.45)', opacity: 0.7, animation: 'twinkle 3s ease-in-out infinite' }} />
          <span style={{ position: 'absolute', left: '72%', top: '26%', width: 4, height: 4, borderRadius: '50%', background: '#E8D9A0', boxShadow: '0 0 7px 3px rgba(232,217,160,0.4)', opacity: 0.5, animation: 'twinkle 4s ease-in-out infinite' }} />
        </>
      )}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 34px', position: 'relative', zIndex: 5 }}>
        <div style={{ background: 'rgba(244,241,234,0.07)', border: '1px solid rgba(244,241,234,0.16)', borderRadius: 12, padding: '26px 28px', textAlign: 'center' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" style={{ opacity: 0.85 }}><path d="M20 15.5A8 8 0 0 1 9 4.5a8 8 0 1 0 11 11Z" fill="#C9C0D8" /></svg>
          <div style={{ marginTop: 12, fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, color: '#f0ebdd', lineHeight: 1.3 }}>The garden's closed.</div>
          <div style={{ marginTop: 4, fontFamily: 'var(--font-hand)', fontSize: 17, color: '#c9c0d8' }}>see you in the morning ✿</div>
          <button
            type="button"
            onClick={onDone}
            style={{ marginTop: 20, border: '1px solid rgba(244,241,234,0.3)', background: 'rgba(244,241,234,0.1)', color: '#f0ebdd', font: 'inherit', fontSize: 13.5, padding: '10px 34px', borderRadius: 999, cursor: 'pointer' }}
          >
            Done
          </button>
        </div>
      </div>
      <div style={{ flex: 'none', padding: '0 0 34px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8e88a0', position: 'relative', zIndex: 5 }}>
        returns to a dimmed Today · no sounds after this
      </div>
    </>
  )
}
