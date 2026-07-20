import { useState } from 'react'
import { EmojiText } from '../../components/EmojiText'
import { useDomains } from '../domains/api'
import { useProjects } from '../projects/api'
import { useTasks } from '../tasks/api'
import { useCalendarEvents } from '../calendar/api'
import { useRoutines, useRoutineCompletions } from '../routines/api'
import { computeStreak, completionRate, computeTrellisDays } from '../routines/streaks'
import { useSlipping, markReviewed } from '../slipping/api'
import { logActivity } from '../../lib/activity'
import { useMotionEnabled } from '../../lib/motion'
import { FieldLabel, useIsMobile } from './RitualChrome'
import type { CalendarEvent, Domain, Project, Routine, RoutineCompletion, Task } from '../../lib/types'

// ── Weekly Review — pixel contract Review.dc.html 1a (desktop sweep + right rail), 1b
// (iPhone), 3c (the season so far, redone — turn 3's own header says "'the season so far'
// gets a stronger trend", so 3c explicitly supersedes 2c's plainer version of the same
// widget). The Weekly Letter (2a/2b + turn 4's envelope) is DROPPED per Kai's 2026-07-19
// ruling — the page opens straight into the sweep. ──

const A = '/ds/assets'

function startOfWeek(d: Date): Date {
  const s = new Date(d)
  s.setHours(0, 0, 0, 0)
  s.setDate(s.getDate() - s.getDay())
  return s
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}
// "Hours" throughout this page means time actually blocked on the calendar (the same real
// proxy the Closing Ritual's sun dial uses) — completed-task duration_min is too sparse
// (often null) to carry a whole review page. `taskFilter` scopes to a domain/project via
// the event's linked task; omit it for a domain-agnostic total.
function eventHours(events: CalendarEvent[], tasksById: Map<string, Task>, start: Date, end: Date, taskFilter?: (t: Task) => boolean): number {
  return (
    events
      .filter((e) => !e.all_day && new Date(e.starts_at) >= start && new Date(e.starts_at) < end)
      .filter((e) => {
        if (!taskFilter) return true
        const t = e.task_id ? tasksById.get(e.task_id) : undefined
        return t ? taskFilter(t) : false
      })
      .reduce((sum, e) => sum + (new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()) / 3_600_000, 0)
  )
}
function doneCount(tasks: Task[], start: Date, end: Date): number {
  return tasks.filter((t) => t.completed_at && new Date(t.completed_at) >= start && new Date(t.completed_at) < end).length
}

export function WeeklyReviewPage() {
  const isMobile = useIsMobile()
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const { data: tasks = [] } = useTasks()
  const { data: events = [] } = useCalendarEvents()
  const { data: routines = [] } = useRoutines()
  const { data: completions = [] } = useRoutineCompletions()
  const { data: slipping = [] } = useSlipping()
  const [swept, setSwept] = useState<Set<string>>(new Set())
  const [showSeason, setShowSeason] = useState(false)

  const weekStart = startOfWeek(new Date())
  const weekEnd = addDays(weekStart, 7)
  const lastWeekStart = addDays(weekStart, -7)

  const activeRoutines = routines.filter((r) => r.active)

  const bloomsThisWeek = doneCount(tasks, weekStart, weekEnd)
  const hoursThisWeek = eventHours(events, new Map(tasks.map((t) => [t.id, t])), weekStart, weekEnd)

  function markDomainSwept(d: Domain) {
    setSwept((s) => new Set(s).add(d.id))
    logActivity('domain.swept', 'domain', d.id, {})
  }

  function projectsOpenTasks(domainId: string): Task[] {
    return tasks.filter((t) => t.domain_id === domainId && t.status === 'todo')
  }

  const allSwept = domains.length > 0 && domains.every((d) => swept.has(d.id))

  return (
    <div style={{ maxWidth: isMobile ? undefined : 1000 }}>
      <div style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: isMobile ? undefined : 'minmax(0,1fr) 280px', gap: isMobile ? 0 : 40 }}>
        <div style={{ minWidth: 0 }}>
          <SweepHeader domainsSwept={swept.size} domainsTotal={domains.length} isMobile={isMobile} />

          <div style={{ marginTop: isMobile ? 16 : 26, display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 14 }}>
            {domains.length === 0 && <p style={{ fontSize: 13, color: 'var(--ink-faint)' }}>No domains yet.</p>}
            {domains.map((d) => {
              const open = projectsOpenTasks(d.id)
              const domainProjects = projects.filter((p) => p.domain_id === d.id)
              const isSwept = swept.has(d.id)
              return (
                <DomainCard key={d.id} domain={d} projectCount={domainProjects.length} openCount={open.length} swept={isSwept} onSweep={() => markDomainSwept(d)} isMobile={isMobile} />
              )
            })}
          </div>

          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, paddingTop: 16, borderTop: '1px dashed var(--line-dashed)' }}>
              <span style={{ fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--ink-hand, #7a745f)', transform: 'rotate(-1deg)' }}>sweep all three and the frond unfurls flat ✿</span>
              <button
                type="button"
                disabled={!allSwept}
                onClick={() => logActivity('review.week_closed', 'review', weekStart.toISOString(), {})}
                style={{
                  border: '1px solid var(--line-solid)',
                  background: allSwept ? 'var(--acc-terra)' : 'var(--paper-bone)',
                  color: allSwept ? 'var(--paper-parchment)' : 'var(--ink-faint)',
                  font: 'inherit',
                  fontSize: 13,
                  padding: '10px 20px',
                  borderRadius: 999,
                  cursor: allSwept ? 'pointer' : 'default',
                }}
              >
                {allSwept ? 'Close the week ✓' : `Close the week · ${swept.size}/${domains.length}`}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowSeason((s) => !s)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              width: '100%',
              marginTop: 22,
              background: 'var(--paper-parchment)',
              border: '1px solid var(--line-card)',
              borderRadius: 4,
              boxShadow: 'var(--shadow-crisp)',
              padding: '15px 18px',
              textDecoration: 'none',
              transform: 'rotate(-0.2deg)',
              cursor: 'pointer',
              font: 'inherit',
              textAlign: 'left',
            }}
          >
            <img src={`${A}/fern/full.png`} alt="" style={{ height: 38, filter: 'var(--shadow-drop-sm)' }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--ink-body)' }}>The season so far</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginTop: 3 }}>the numbers behind the week</div>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-terra)' }}>{showSeason ? 'close ↑' : 'open →'}</span>
          </button>

          {showSeason && (
            <SeasonSoFar tasks={tasks} events={events} routines={routines} completions={completions} domains={domains} projects={projects} weekStart={weekStart} weekEnd={weekEnd} lastWeekStart={lastWeekStart} />
          )}
        </div>

        {!isMobile && (
          <RightRail slipping={slipping} onReview={markReviewed} routines={activeRoutines} completions={completions} bloomsThisWeek={bloomsThisWeek} hoursThisWeek={hoursThisWeek} />
        )}
      </div>
    </div>
  )
}

// The Weekly Letter (Review 2a/2b/t4) is DROPPED per Kai's 2026-07-19 ruling — no stub,
// no digest pipeline; the page opens straight into the sweep.

// Effects 2f "weekly flourish": the week's line draws itself left to right, one-shot on
// open, with a dot popping in per notable day (staggered 900ms) — Effects.dc.html #2f.
const WEEK_DOTS: [number, number, string][] = [
  [6, 74, 'var(--acc-blossom)'],
  [76, 44, 'var(--acc-gold-warm)'],
  [138, 60, 'var(--acc-hydrangea)'],
  [200, 30, 'var(--acc-lavender)'],
  [254, 16, 'var(--acc-moss)'],
]

function SweepHeader({ domainsSwept, domainsTotal, isMobile }: { domainsSwept: number; domainsTotal: number; isMobile: boolean }) {
  const motion = useMotionEnabled()
  const weekNumber = Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 604_800_000)
  return (
    <div style={{ display: 'flex', alignItems: isMobile ? 'center' : 'flex-end', justifyContent: 'space-between', gap: 20 }}>
      <style>{`
        @keyframes weekLine { from { stroke-dashoffset: 220 } to { stroke-dashoffset: 0 } }
        @keyframes weekDot { 0%, 60% { transform: scale(0); opacity: 0 } 80% { transform: scale(1.3); opacity: 1 } 100% { transform: scale(1); opacity: 1 } }
        /* X1 Effects 2i — ink bleed, review prose only: text sharpens from a soft blur. */
        @keyframes kfInkBleed { from { opacity: 0; filter: blur(4px) } to { opacity: 1; filter: none } }
        .motion-on .kf-ink { animation: kfInkBleed 480ms var(--ease-out) both; }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 11 : 14 }}>
        <img src={`${A}/fern/unfurl2.png`} alt="" style={{ height: isMobile ? 38 : 54, filter: 'var(--shadow-drop-sm)' }} />
        <div>
          <FieldLabel>Weekly Review · week {weekNumber}</FieldLabel>
          <h1 style={{ margin: '3px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: isMobile ? 24 : 40, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>The sweep</h1>
        </div>
      </div>
      {!isMobile && motion && (
        <svg viewBox="0 0 260 96" style={{ width: 130, height: 48, overflow: 'visible' }}>
          <path d="M6,74 C36,70 48,40 76,44 C104,48 112,66 138,60 C164,54 172,26 200,30 C222,33 236,20 254,16" fill="none" stroke="var(--acc-moss)" strokeWidth="1.5" strokeDasharray="220" style={{ animation: 'weekLine 2.2s ease-in-out' }} />
          {WEEK_DOTS.map(([cx, cy, fill], i) => (
            <circle key={i} cx={cx} cy={cy} r="3.5" fill={fill} style={{ transformOrigin: `${cx}px ${cy}px`, animation: `weekDot 200ms ease-out ${i * 0.9}s both` }} />
          ))}
        </svg>
      )}
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-buttercream-text)' }}>{domainsSwept} of {domainsTotal} domains swept</span>
      </div>
    </div>
  )
}

function DomainCard({
  domain,
  projectCount,
  openCount,
  swept,
  onSweep,
  isMobile,
}: {
  domain: Domain
  projectCount: number
  openCount: number
  swept: boolean
  onSweep: () => void
  isMobile: boolean
}) {
  if (swept) {
    return (
      <div style={{ background: 'var(--paper-bone)', border: '1px dashed var(--line-solid)', borderRadius: 3, padding: '14px 17px', opacity: 0.85, display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 17, height: 17, borderRadius: 5, background: 'var(--sig-done)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <span style={{ color: 'var(--paper-parchment)', fontSize: 9 }}>✓</span>
        </span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--ink-muted)' }}>{domain.name}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--acc-sage-text)' }}>swept</span>
      </div>
    )
  }
  return (
    <div style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: isMobile ? 14 : '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 17, height: 17, border: '1.5px solid #bfb8a3', borderRadius: 5, flex: 'none' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 17 : 18, fontWeight: 600, color: 'var(--ink-body)' }}>{domain.name}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', color: 'var(--ink-hairline)' }}>
          {projectCount} project{projectCount === 1 ? '' : 's'} · {openCount} open
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" onClick={onSweep} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', font: 'inherit', fontSize: 12.5, padding: '8px 16px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}>
          Mark {domain.name} swept
        </button>
      </div>
    </div>
  )
}

function RightRail({
  slipping,
  onReview,
  routines,
  completions,
  bloomsThisWeek,
  hoursThisWeek,
}: {
  slipping: ReturnType<typeof useSlipping>['data']
  onReview: (row: NonNullable<ReturnType<typeof useSlipping>['data']>[number]) => void
  routines: Routine[]
  completions: RoutineCompletion[]
  bloomsThisWeek: number
  hoursThisWeek: number
}) {
  const rows = slipping ?? []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 8 }}>
      <div>
        <RailLabel label="Slipping" color="var(--acc-terra)" count={rows.length} />
        {rows.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', marginTop: 8 }}>Nothing slipping.</p>
        ) : (
          rows.slice(0, 3).map((row) => (
            <div key={`${row.entity_type}-${row.entity_id}`} style={{ marginTop: 8, background: 'rgba(181,101,74,0.08)', border: '1px solid rgba(181,101,74,0.25)', borderRadius: 3, padding: '12px 14px' }}>
              <div style={{ fontSize: 13.5, color: 'var(--ink-body)' }}>{row.entity_name}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--ink-hairline)' }}>{Math.floor(row.days_since)} days untouched</span>
                <button type="button" onClick={() => onReview(row)} style={{ border: 'none', background: 'none', font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer', padding: 0 }}>
                  reviewed
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div>
        <RailLabel label="Streaks" />
        {routines.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', marginTop: 8 }}>No routines yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
            {routines.slice(0, 3).map((r, i) => {
              const dates = completions.filter((c) => c.routine_id === r.id).map((c) => c.completed_on)
              const { current: c, best: b } = computeStreak(dates, r.cadence)
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderBottom: i < 2 ? '1px dashed var(--line-dashed)' : 'none' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-body)' }}>{r.name}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--sig-streak)' }}>🔥 {c} · best {b}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <RailLabel label="Week in petals" />
        <div style={{ marginTop: 10, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-crisp)', padding: '13px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 500, color: 'var(--ink-body)' }}>{bloomsThisWeek}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', color: 'var(--ink-hairline)' }}>tasks done</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 500, color: 'var(--ink-body)' }}>
              {Math.round(hoursThisWeek)}<span style={{ fontSize: 15, color: 'var(--ink-faint)' }}>h</span>
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', color: 'var(--ink-hairline)', marginTop: 4 }}>petals fallen · hours blocked &amp; kept</div>
        </div>
        <div className="kf-ink" style={{ marginTop: 10, fontFamily: 'var(--font-hand)', fontSize: 15.5, lineHeight: 1.45, color: 'var(--ink-hand, #7a745f)', transform: 'rotate(-0.8deg)' }}>no numbers to chase — just look once, honestly, then close the week</div>
      </div>
    </div>
  )
}

function RailLabel({ label, color, count }: { label: string; color?: string; count?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
      <span style={{ color: color ?? 'var(--ink-faint)' }}>{label}</span>
      <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
      {count != null && <span style={{ color: 'var(--ink-hairline)' }}>{count}</span>}
    </div>
  )
}

// ── "The season so far", redone (3c) — supersedes 2c's plainer trend chart. ──
function SeasonSoFar({
  tasks,
  events,
  routines,
  completions,
  domains,
  projects,
  weekStart,
  weekEnd,
  lastWeekStart,
}: {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  completions: RoutineCompletion[]
  domains: Domain[]
  projects: Project[]
  weekStart: Date
  weekEnd: Date
  lastWeekStart: Date
}) {
  const tasksById = new Map(tasks.map((t) => [t.id, t]))
  const hoursByDomain = domains.map((d) => ({
    name: d.name,
    thisWeek: eventHours(events, tasksById, weekStart, weekEnd, (t) => t.domain_id === d.id),
    lastWeek: eventHours(events, tasksById, lastWeekStart, weekStart, (t) => t.domain_id === d.id),
  }))
  const maxScale = Math.max(20, ...hoursByDomain.map((h) => h.thisWeek))

  const hoursByProject = projects
    .map((p) => ({ name: p.name, hours: eventHours(events, tasksById, weekStart, weekEnd, (t) => t.project_id === p.id) }))
    .filter((p) => p.hours > 0)
    .sort((a, b) => b.hours - a.hours)
  const totalProjectHours = hoursByProject.reduce((s, p) => s + p.hours, 0)
  const topProjects = hoursByProject.slice(0, 5)
  const restHours = totalProjectHours - topProjects.reduce((s, p) => s + p.hours, 0)

  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(weekStart, -7 * (7 - i))
    const end = addDays(start, 7)
    const weekNo = Math.ceil((start.getTime() - new Date(start.getFullYear(), 0, 1).getTime()) / 604_800_000) + 1
    return { label: `W${weekNo}`, hours: eventHours(events, tasksById, start, end) }
  })
  const maxTrend = Math.max(20, ...weeks.map((w) => w.hours))
  const pathPoints = weeks.map((w, i) => ({ x: 18 + i * 32, y: 82 - (w.hours / maxTrend) * 66 }))
  const linePath = pathPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y.toFixed(1)}`).join(' ')
  const lastPoint = pathPoints[pathPoints.length - 1]

  const bloomsThisWeek = doneCount(tasks, weekStart, weekEnd)
  const bloomsLastWeek = doneCount(tasks, lastWeekStart, weekStart)

  const topRoutines = routines.filter((r) => r.active).slice(0, 3)

  return (
    <div style={{ marginTop: 22, background: 'var(--paper-linen)', border: '1px solid var(--line-card)', borderRadius: 3, padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <img src={`${A}/fern/full.png`} alt="" style={{ height: 30, filter: 'var(--shadow-drop-sm)' }} />
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, color: 'var(--ink-body)' }}>The season so far</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 18 }}>
        <div style={{ background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-crisp)', padding: '16px 18px' }}>
          <FieldLabel>Hours by area</FieldLabel>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>
            {hoursByDomain.length === 0 && <p style={{ fontSize: 12, color: 'var(--ink-faint)', margin: 0 }}>No domains yet.</p>}
            {hoursByDomain.map((h) => (
              <div key={h.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{h.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)' }}>
                    {Math.round(h.thisWeek)}H {h.thisWeek !== h.lastWeek && <span style={{ color: h.thisWeek > h.lastWeek ? 'var(--acc-sage-text)' : 'var(--ink-hairline)' }}>({h.thisWeek > h.lastWeek ? '+' : ''}{Math.round(h.thisWeek - h.lastWeek)})</span>}
                  </span>
                </div>
                <div style={{ position: 'relative', height: 9 }}>
                  <span style={{ position: 'absolute', left: 0, top: 2, bottom: 2, width: `${Math.min(100, (h.lastWeek / maxScale) * 100)}%`, border: '1px dashed var(--ink-hairline)', borderRadius: 2, opacity: 0.5 }} />
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, (h.thisWeek / maxScale) * 100)}%`, background: 'var(--acc-sage)', borderRadius: 2, opacity: 0.85 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-crisp)', padding: '16px 18px' }}>
          <FieldLabel>Focus trend · last 8 weeks</FieldLabel>
          <div style={{ position: 'relative', marginTop: 12, height: 104 }}>
            <img src={`${A}/fern/coil.png`} alt="" style={{ position: 'absolute', left: 4, bottom: 12, height: 26, opacity: 0.72, transform: 'rotate(-6deg)' }} />
            <svg viewBox="0 0 268 104" preserveAspectRatio="none" style={{ position: 'absolute', left: 22, right: 6, top: 0, width: 'calc(100% - 28px)', height: '100%', overflow: 'visible' }}>
              <line x1="6" y1="84" x2="262" y2="84" stroke="var(--line-dashed)" strokeWidth="1" strokeDasharray="2 3" />
              <path d={`${linePath} L${lastPoint.x},84 L18,84 Z`} fill="rgba(122,148,110,0.13)" />
              <path d={linePath} fill="none" stroke="var(--acc-sage)" strokeWidth="2.2" strokeLinecap="round" />
              {pathPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="2.4" fill="var(--acc-sage)" />
              ))}
            </svg>
            <img src={`${A}/cherry/half-right.png`} alt="" style={{ position: 'absolute', right: -2, top: Math.max(-8, lastPoint.y - 30), height: 38, filter: 'var(--shadow-drop-sm)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px 0 22px', fontFamily: 'var(--font-mono)', fontSize: 7.5, letterSpacing: '0.04em', color: 'var(--ink-hairline)' }}>
            {weeks.map((w, i) => (
              <span key={w.label} style={i === weeks.length - 1 ? { color: 'var(--acc-terra)' } : undefined}>{w.label}</span>
            ))}
          </div>
          <div style={{ fontFamily: 'var(--font-hand)', fontSize: 14, color: 'var(--ink-hand, #7a745f)', marginTop: 6, transform: 'rotate(-0.4deg)' }}>
            this week's {weeks[7].hours >= 20 ? 'in full bloom' : 'a bud'} — {Math.round(weeks[7].hours)}h in, still opening ✿
          </div>
        </div>

        <div style={{ background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-crisp)', padding: '16px 18px' }}>
          <FieldLabel>Routine consistency · last 30 days</FieldLabel>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {topRoutines.length === 0 && <p style={{ fontSize: 12, color: 'var(--ink-faint)', margin: 0 }}>No routines yet.</p>}
            {topRoutines.map((r) => {
              const dates = completions.filter((c) => c.routine_id === r.id).map((c) => c.completed_on)
              const days = computeTrellisDays(dates, r.cadence, 30)
              const rate = completionRate(dates, r.cadence, 30)
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 62, fontSize: 12, color: 'var(--ink-muted)', flex: 'none' }}>{r.name}</span>
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(30,1fr)', gap: 2 }}>
                    {days.map((d) => (
                      <span
                        key={d.key}
                        style={{
                          aspectRatio: '1',
                          borderRadius: 1.5,
                          background: d.state === 'grew' ? 'var(--acc-sage)' : d.state === 'rained' ? 'var(--acc-buttercream)' : d.state === 'broke' ? 'var(--line-card)' : 'transparent',
                        }}
                      />
                    ))}
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', flex: 'none' }}>{rate}%</span>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-crisp)', padding: '16px 18px', display: 'flex', flexDirection: 'column' }}>
          <FieldLabel>Blooms this week</FieldLabel>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 16, paddingTop: 8 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 58, fontWeight: 500, color: 'var(--ink-body)', lineHeight: 1 }}>{bloomsThisWeek}</div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>last week · {bloomsLastWeek}</div>
              <div style={{ marginTop: 4, fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--ink-hand, #7a745f)' }}>
                {bloomsThisWeek === bloomsLastWeek ? 'holding steady ✿' : bloomsThisWeek > bloomsLastWeek ? `${bloomsThisWeek - bloomsLastWeek} more petals down ✿` : `${bloomsLastWeek - bloomsThisWeek} fewer this week`}
              </div>
            </div>
          </div>
        </div>
      </div>

      {topProjects.length > 0 && (
        <div style={{ background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-crisp)', padding: '16px 18px', marginTop: 16 }}>
          <FieldLabel>Hours per project · this week · {Math.round(totalProjectHours)}h total</FieldLabel>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
            {topProjects.map((p) => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 150, fontSize: 12.5, color: 'var(--ink-muted)', flex: 'none' }}><EmojiText text={p.name} /></span>
                <div style={{ flex: 1, height: 11, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, (p.hours / totalProjectHours) * 100)}%`, background: 'var(--acc-lavender-deep)', borderRadius: 2, opacity: 0.8 }} />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', width: 34, textAlign: 'right', flex: 'none' }}>{Math.round(p.hours)}H</span>
              </div>
            ))}
            {restHours > 0.1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: 0.55 }}>
                <span style={{ width: 150, fontSize: 12.5, color: 'var(--ink-faint)', flex: 'none' }}>everything else</span>
                <div style={{ flex: 1, height: 11, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, (restHours / totalProjectHours) * 100)}%`, background: 'var(--ink-hairline)', borderRadius: 2, opacity: 0.6 }} />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)', width: 34, textAlign: 'right', flex: 'none' }}>{Math.round(restHours)}H</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
