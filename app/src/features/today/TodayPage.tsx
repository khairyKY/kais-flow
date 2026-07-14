import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useTasks, completeTask, toggleTop3 } from '../tasks/api'
import { useCalendarEvents } from '../calendar/api'
import { useProjects } from '../projects/api'
import { useRoutines, useRoutineCompletions, toggleCompletion } from '../routines/api'
import { computeStreak, localDateKey } from '../routines/streaks'
import { groupRoutinesByTime } from '../routines/routineGrouping'
import { useSlipping, markReviewed } from '../slipping/api'
import { usePendingInboxItems } from '../inbox/api'
import { VoiceCaptureButton } from '../capture/VoiceCaptureButton'
import { MorningRitual } from '../rituals/MorningRitual'
import { EveningRitual } from '../rituals/EveningRitual'
import { ResurfaceCard } from '../resurfacing/ResurfaceCard'
import { useGoalStore } from './goalStore'
import { useTerrariumStore } from './terrariumStore'
import { useCommandBarStore } from '../command-bar/commandBarStore'
import { SectionLabel, Checkbox, Button } from '../../components/kit'
import { useMotionEnabled, staggerDelay } from '../../lib/motion'
import type { Task, CalendarEvent, Routine, SlippingRow } from '../../lib/types'

// ── Today — pixel contract: Today.dc.html 1a (desktop, design lines 107-221) and 1b
// (iPhone ≤767px, lines 227-306) + States.dc.html 1a/1b (empty/done). The shell owns
// the sidebar/topbar/tab-bar; this is the main content, wired to real data. ──

const A = '/ds/assets'
const TZ = 'Africa/Cairo'
const PROJECT_DOTS = ['--acc-moss', '--acc-blossom', '--acc-lavender', '--acc-hydrangea', '--acc-buttercream', '--acc-sage']

function isToday(iso: string | null): boolean {
  if (!iso) return false
  return new Date(iso).toDateString() === new Date().toDateString()
}

function cherryStage(open: number, done: number): string {
  if (open + done === 0) return 'bud'
  if (done === 0) return 'opening'
  if (open === 0) return 'fallen'
  return 'bloom'
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 767)
  useEffect(() => {
    const mq = matchMedia('(max-width: 767px)')
    const on = () => setIsMobile(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return isMobile
}

export function TodayPage() {
  const { data: tasks = [] } = useTasks()
  const { data: events = [] } = useCalendarEvents()
  const { data: projects = [] } = useProjects()
  const { data: routines = [] } = useRoutines()
  const { data: completions = [] } = useRoutineCompletions()
  const { data: slipping = [] } = useSlipping()
  const { data: pendingInbox = [] } = usePendingInboxItems()
  const { goalTaskId } = useGoalStore()
  const terrariumOn = useTerrariumStore((s) => s.on)
  const setCommandBarOpen = useCommandBarStore((s) => s.setOpen)
  const isMobile = useIsMobile()

  const [morningOpen, setMorningOpen] = useState(false)
  const [eveningOpen, setEveningOpen] = useState(false)

  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name] as const)), [projects])
  const projectDot = (id: string | null) => {
    if (!id) return 'var(--acc-moss)'
    const idx = projects.findIndex((p) => p.id === id)
    return `var(${PROJECT_DOTS[idx >= 0 ? idx % PROJECT_DOTS.length : 0]})`
  }

  const open = tasks.filter((t) => !t.completed_at && !t.someday)
  const top3 = open.filter((t) => t.top3)
  const goal = top3.find((t) => t.id === goalTaskId) ?? top3[0]
  const restTop3 = top3.filter((t) => t.id !== goal?.id)
  const allOpen = open.filter((t) => !t.top3)
  const doneToday = tasks.filter((t) => isToday(t.completed_at)).length
  const nothingPlanned = open.length === 0 && doneToday === 0
  const allDone = open.length === 0 && doneToday > 0

  const todayEvents = events
    .filter((e) => !e.all_day && isToday(e.starts_at))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  const routineGroups = groupRoutinesByTime(routines.filter((r) => r.active))
  const doneKeys = useMemo(() => {
    const today = localDateKey(new Date())
    return new Set(completions.filter((c) => c.completed_on === today).map((c) => c.routine_id))
  }, [completions])
  const routinesDone = routines.filter((r) => r.active && doneKeys.has(r.id)).length
  const routinesTotal = routines.filter((r) => r.active).length

  const ritualProgress = (keys: string[]) => {
    const items = routineGroups.filter((g) => keys.includes(g.key)).flatMap((g) => g.items)
    return { done: items.filter((r) => doneKeys.has(r.id)).length, total: items.length }
  }
  const morning = ritualProgress(['morning'])
  const evening = ritualProgress(['evening'])

  const streak = useMemo(() => {
    const byRoutine = new Map<string, string[]>()
    for (const c of completions) {
      const arr = byRoutine.get(c.routine_id) ?? []
      arr.push(c.completed_on)
      byRoutine.set(c.routine_id, arr)
    }
    let best = 0
    for (const r of routines) if (r.active) best = Math.max(best, computeStreak(byRoutine.get(r.id) ?? [], r.cadence).current)
    return best
  }, [routines, completions])

  // Ported from the retired Terrarium.tsx — day count since the earliest record, for
  // the mobile header's "Today · Day N" (1b line 243). Desktop 1a's band omits it
  // (pre-existing, deferred to the R4 exactness audit per TEARDOWN.md).
  const dayNumber = useMemo(() => {
    const earliest = [
      ...tasks.map((t) => t.created_at),
      ...pendingInbox.map((i) => i.created_at),
      ...projects.map((p) => p.created_at),
      ...routines.map((r) => r.created_at),
    ].sort()
    return earliest.length ? Math.max(1, Math.round((Date.now() - new Date(earliest[0]).getTime()) / 86_400_000) + 1) : 1
  }, [tasks, pendingInbox, projects, routines])

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ })
  const dateLabelShort = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: TZ })
  const motion = useMotionEnabled()
  const hyd = pendingInbox.length === 0 ? 'zero' : pendingInbox.length < 5 ? 'light' : pendingInbox.length < 20 ? 'medium' : 'heavy'
  const vine = streak >= 30 ? 'lush' : streak >= 7 ? 'flowering' : streak >= 1 ? 'sprouting' : 'bare'

  const header = isMobile ? (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Today · Day {dayNumber}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 27, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--ink-body)', marginTop: 2 }}>
          {dateLabelShort}
        </div>
      </div>
      <img src={`${A}/cherry/${cherryStage(open.length, doneToday)}.png`} alt="" style={{ height: 44, filter: 'var(--shadow-drop-sm)' }} />
    </div>
  ) : (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>Today</div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 42, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>{dateLabel}</h1>
      </div>
      <VoiceCaptureButton />
    </div>
  )

  const terrarium = terrariumOn && (isMobile ? (
    <div style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-crisp)', padding: '9px 13px', display: 'flex', alignItems: 'center', gap: 11, marginTop: 14, transform: 'rotate(-0.4deg)' }}>
      <span aria-hidden style={{ position: 'absolute', top: -7, left: 20, width: 40, height: 12, background: 'rgba(138,154,126,0.4)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.3) 0 3px,transparent 3px 6px)', transform: 'rotate(-2deg)', borderRadius: 1 }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <img src={`${A}/hydrangea/${hyd}.png`} alt="Inbox" style={{ height: 30 }} />
        <img src={`${A}/vine/${vine}.png`} alt="Routines" style={{ height: 28 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-hand)', fontSize: 14, color: '#7a745f', lineHeight: 1.2 }}>pressed &amp; kept, one day at a time</div>
      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', lineHeight: 1.6 }}>
        <div>{doneToday} of {open.length + doneToday} done</div>
        <div style={{ color: 'var(--acc-sage-text)' }}>{streak}-day streak</div>
      </div>
    </div>
  ) : (
    <div style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 26, marginBottom: 26, transform: 'rotate(-0.3deg)' }}>
      <span aria-hidden style={{ position: 'absolute', top: -9, left: 44, width: 66, height: 16, background: 'rgba(138,154,126,0.36)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.3) 0 4px,transparent 4px 8px)', transform: 'rotate(-2deg)', borderRadius: 1, boxShadow: 'var(--shadow-crisp)' }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18 }}>
        <img src={`${A}/cherry/${cherryStage(open.length, doneToday)}.png`} alt="Tasks" style={{ height: 58, filter: 'var(--shadow-drop-sm)' }} />
        <img src={`${A}/hydrangea/${hyd}.png`} alt="Inbox" style={{ height: 56, filter: 'var(--shadow-drop-sm)' }} />
        <img src={`${A}/vine/${vine}.png`} alt="Routines" style={{ height: 54, filter: 'var(--shadow-drop-sm)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>The terrarium</div>
        <div style={{ fontFamily: 'var(--font-hand)', fontSize: 19, color: '#7a745f', marginTop: 2 }}>pressed &amp; kept, one day at a time</div>
      </div>
      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', lineHeight: 1.7 }}>
        <div>{pendingInbox.length} in inbox</div>
        <div>{doneToday} of {open.length + doneToday} done</div>
        <div style={{ color: 'var(--acc-sage-text)' }}>{streak}-day streak</div>
      </div>
    </div>
  ))

  return (
    <div style={{ maxWidth: 1010, margin: '0 auto' }}>
      {isMobile ? (
        <>
          {header}
          {terrarium}
        </>
      ) : (
        <>
          {terrarium}
          {header}
        </>
      )}

      <div style={{ display: 'flex', gap: isMobile ? 9 : 14, marginTop: isMobile ? 12 : 20 }}>
        <RitualCard label="Morning ritual" shortLabel="Morning" done={morning.done} total={morning.total || 4} accent="var(--acc-sage)" dot="var(--acc-gold-warm)" onClick={() => setMorningOpen(true)} icon={<SunIcon />} compact={isMobile} />
        <RitualCard label="Evening ritual" shortLabel="Evening" done={evening.done} total={evening.total || 2} accent="var(--acc-lavender)" dot="var(--acc-lavender)" onClick={() => setEveningOpen(true)} icon={<MoonIcon />} compact={isMobile} />
      </div>

      {!isMobile && <div style={{ height: 1, borderBottom: '1px dashed var(--line-solid)', margin: '26px 0 28px' }} />}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) 264px', gap: isMobile ? 30 : 44, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 26 : 34 }}>
          <section>
            <SectionLabel style={{ marginTop: isMobile ? 16 : 0, marginBottom: isMobile ? 8 : 14 }}>{isMobile ? 'Top 3 today' : 'Top 3 for today'}</SectionLabel>
            {nothingPlanned ? (
              <EmptyTodayCard onPlan={() => setCommandBarOpen(true)} />
            ) : allDone ? (
              <DoneTodayCard />
            ) : (
              <>
                {goal && <GoalCard task={goal} projectName={projectName.get(goal.project_id ?? '')} dot={projectDot(goal.project_id)} compact={isMobile} />}
                {restTop3.map((t) => (
                  <TaskRow key={t.id} task={t} projectName={projectName.get(t.project_id ?? '')} dot={projectDot(t.project_id)} border compact={isMobile} />
                ))}
                {top3.length === 0 && <Empty line="Nothing starred for today yet." />}
              </>
            )}
          </section>

          <section>
            <SectionLabel action={!isMobile && <Link to="/calendar" style={linkStyle}>Open calendar →</Link>} style={{ marginBottom: isMobile ? 6 : 12 }}>Up next</SectionLabel>
            {todayEvents.length === 0 && <Empty line="A clear afternoon." />}
            {todayEvents.map((e, i) => (
              <EventRow key={e.id} event={e} first={i === 0} border={i > 0} compact={isMobile} />
            ))}
          </section>

          {!nothingPlanned && !allDone && (
            <section>
              <SectionLabel style={{ marginBottom: 6 }}>{`All open · ${allOpen.length}`}</SectionLabel>
              {allOpen.map((t, i) => (
                <div key={t.id} className={motion ? 'kf-stagger-item' : undefined} style={motion ? staggerDelay(i) : undefined}>
                  <TaskRow task={t} projectName={projectName.get(t.project_id ?? '')} dot={projectDot(t.project_id)} hollow />
                </div>
              ))}
            </section>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          {slipping.length > 0 && (
            <section>
              <SectionLabel style={{ marginBottom: 12 }}><span style={{ color: 'var(--acc-terra)' }}>Slipping</span></SectionLabel>
              <SlippingCard row={slipping[0]} />
            </section>
          )}

          <section>
            <SectionLabel style={{ marginBottom: 10 }}>{`Routines · ${routinesDone}/${routinesTotal}`}</SectionLabel>
            {routineGroups.filter((g) => g.items.length > 0).map((g) => (
              <div key={g.key}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-hairline)', margin: '2px 0 5px' }}>{g.label}</div>
                {g.items.map((r) => (
                  <RoutineRow key={r.id} routine={r} done={doneKeys.has(r.id)} />
                ))}
              </div>
            ))}
          </section>

          <section>
            <SectionLabel style={{ marginBottom: 12 }}>From a while ago</SectionLabel>
            <ResurfaceCard />
          </section>
        </div>
      </div>

      {morningOpen && <MorningRitual onClose={() => setMorningOpen(false)} />}
      {eveningOpen && <EveningRitual onClose={() => setEveningOpen(false)} />}
    </div>
  )
}

const linkStyle = { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--ink-faint)', textDecoration: 'none' }

function metaRow(projectName: string | undefined, dot: string, duration: number | null, extra?: React.ReactNode) {
  return (
    <div style={{ marginTop: 5, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      {projectName && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot }} />
          {projectName}
        </span>
      )}
      {duration != null && <span>{duration}m</span>}
      {extra}
    </div>
  )
}

// States.dc.html 1a — Empty Today: seedling clover + one hand line + one action.
function EmptyTodayCard({ onPlan }: { onPlan: () => void }) {
  return (
    <div style={{ padding: '40px 40px 44px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
      <span aria-hidden style={{ position: 'absolute', left: '50%', top: -40, width: 260, height: 170, transform: 'translateX(-50%)', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(232,217,160,0.5), rgba(232,217,160,0) 70%)' }} />
      <div style={{ position: 'relative', width: 190, height: 130 }}>
        <div style={{ position: 'absolute', inset: 0, border: '2.5px solid rgba(107,100,85,0.45)', borderRadius: '14px 14px 10px 10px', background: 'rgba(244,241,234,0.4)' }} />
        <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, height: 30, borderRadius: '4px 4px 7px 7px', background: 'linear-gradient(180deg,#b9a98a,#a3937a)', boxShadow: 'inset 0 3px 5px rgba(60,52,38,0.25)' }} />
        <img src={`${A}/clover/seedling.png`} alt="" style={{ position: 'absolute', left: '50%', bottom: 34, height: 52, transform: 'translateX(-50%)', filter: 'var(--shadow-drop-sm)' }} />
      </div>
      <div style={{ marginTop: 22, fontFamily: 'var(--font-hand)', fontSize: 19, color: '#7a745f', textAlign: 'center' }}>Nothing planted for today yet.</div>
      <Button type="button" variant="cta" onClick={onPlan} style={{ marginTop: 18, fontSize: 13.5, padding: '10px 22px' }}>Plan today</Button>
    </div>
  )
}

// States.dc.html 1b — Done Today: petal pile, no action.
function DoneTodayCard() {
  const petals: [number, number, number, number, string][] = [
    [52, 5, 13, 10, '70% 30% 60% 40%'],
    [70, 2, 12, 9, '60% 40% 70% 30%'],
    [40, 1, 11, 8, '70% 30% 60% 40%'],
    [62, 14, 11, 8, '60% 40% 70% 30%'],
    [82, 9, 10, 7, '70% 30% 60% 40%'],
    [52, 24, 9, 7, '60% 40% 70% 30%'],
  ]
  const rotations = [14, -38, 64, -10, 96, 150]
  return (
    <div style={{ padding: '44px 40px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 150, height: 64 }}>
        <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, borderBottom: '1.5px dashed var(--line-dashed)' }} />
        {petals.map(([left, bottom, w, h, radius], i) => (
          <span
            key={i}
            aria-hidden
            style={{ position: 'absolute', left, bottom, width: w, height: h, background: 'linear-gradient(135deg,#E8C4CC,#D4A8B0)', borderRadius: radius, transform: `rotate(${rotations[i]}deg)` }}
          />
        ))}
      </div>
      <div style={{ marginTop: 20, fontFamily: 'var(--font-hand)', fontSize: 19, color: '#7a745f', textAlign: 'center' }}>All done. The garden can rest.</div>
    </div>
  )
}

function GoalCard({ task, projectName, dot, compact }: { task: Task; projectName?: string; dot: string; compact?: boolean }) {
  if (compact) {
    return (
      <div style={{ position: 'relative', background: 'var(--paper-goal)', border: '1px solid var(--line-goal)', boxShadow: 'var(--shadow-goal)', borderRadius: 3, padding: '11px 13px', display: 'flex', alignItems: 'flex-start', gap: 10, transform: 'rotate(-0.4deg)' }}>
        <span aria-hidden style={{ position: 'absolute', top: -7, left: '50%', marginLeft: -26, width: 52, height: 13, background: 'rgba(201,165,90,0.42)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 3px,transparent 3px 6px)', transform: 'rotate(-1.5deg)', borderRadius: 1 }} />
        <span style={{ marginTop: 12 }}><Checkbox checked={false} size={16} onChange={() => completeTask(task)} style={{ borderColor: 'var(--acc-gold)', background: 'rgba(255,255,255,0.5)' }} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--acc-gold)' }}>✶ Goal of the day</span>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15.5, fontWeight: 600, color: '#4a3a1e', lineHeight: 1.25, marginTop: 3 }}>{task.title}</div>
        </div>
        <img src={`${A}/clover/four_leaf.png`} alt="" style={{ width: 26, flex: 'none', filter: 'var(--shadow-drop-sm)' }} />
      </div>
    )
  }
  return (
    <div style={{ position: 'relative', background: 'var(--paper-goal)', border: '1px solid var(--line-goal)', boxShadow: 'var(--shadow-goal)', padding: '17px 18px 16px', display: 'flex', alignItems: 'flex-start', gap: 14, transform: 'rotate(-0.4deg)', borderRadius: 3, marginBottom: 8 }}>
      <span aria-hidden style={{ position: 'absolute', top: -9, left: '50%', width: 78, height: 18, marginLeft: -39, background: 'rgba(201,165,90,0.42)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 4px,transparent 4px 8px)', transform: 'rotate(-1.5deg)', borderRadius: 1, boxShadow: 'var(--shadow-crisp)' }} />
      <span style={{ marginTop: 16 }}><Checkbox checked={false} size={19} onChange={() => completeTask(task)} style={{ borderColor: 'var(--acc-gold)', background: 'rgba(255,255,255,0.5)' }} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--acc-gold)' }}>✶ Goal of the day</span>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: '#4a3a1e', lineHeight: 1.3, marginTop: 5 }}>{task.title}</div>
        {metaRow(projectName, dot, task.duration_min, <span>Due today</span>)}
      </div>
      <div style={{ textAlign: 'center', flex: 'none' }}>
        <img src={`${A}/clover/four_leaf.png`} alt="" style={{ width: 34, filter: 'var(--shadow-drop-sm)' }} />
        <div style={{ fontFamily: 'var(--font-hand)', fontSize: 13, color: 'var(--acc-gold)', marginTop: -2 }}>for luck</div>
      </div>
    </div>
  )
}

function TaskRow({ task, projectName, dot, border, hollow, compact }: { task: Task; projectName?: string; dot: string; border?: boolean; hollow?: boolean; compact?: boolean }) {
  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '10px 2px', borderBottom: border ? '1px dashed var(--line-dashed)' : 'none' }}>
        <span style={{ marginTop: 1 }}><Checkbox checked={false} size={16} onChange={() => completeTask(task)} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, color: 'var(--ink-body)' }}>{task.title}</div>
          {(projectName || task.duration_min != null) && (
            <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
              {[projectName, task.duration_min != null ? `${task.duration_min}m` : null].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        <span onClick={() => toggleTop3(task)} style={{ color: task.top3 ? 'var(--acc-terra)' : '#d0c9b6', fontSize: 14, lineHeight: 1, cursor: 'pointer' }}>
          {task.top3 ? '★' : '☆'}
        </span>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: hollow ? '10px 2px' : '11px 2px', borderBottom: border ? '1px dashed var(--line-dashed)' : 'none' }}>
      <span style={{ marginTop: 2 }}><Checkbox checked={false} onChange={() => completeTask(task)} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: hollow ? 14.5 : 15, color: 'var(--ink-body)' }}>{task.title}</div>
        {metaRow(projectName, dot, task.duration_min)}
      </div>
      <span onClick={() => toggleTop3(task)} style={{ color: task.top3 ? 'var(--acc-terra)' : '#d0c9b6', fontSize: 16, lineHeight: 1, cursor: 'pointer' }}>
        {task.top3 ? '★' : '☆'}
      </span>
    </div>
  )
}

function EventRow({ event, first, border, compact }: { event: CalendarEvent; first: boolean; border: boolean; compact?: boolean }) {
  const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ })
  if (compact) {
    return (
      <div style={{ display: 'flex', gap: 12, padding: '7px 0', alignItems: 'baseline', borderTop: border ? '1px dashed var(--line-dashed)' : 'none' }}>
        <span style={{ width: 52, flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 10, color: first ? 'var(--acc-terra)' : 'var(--ink-faint)' }}>{first ? 'Now' : clock(event.starts_at)}</span>
        <div style={{ flex: 1, fontSize: 13, color: 'var(--ink-body)' }}>{event.title}</div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)' }}>{clock(event.starts_at)}–{clock(event.ends_at)}</span>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 16, padding: '9px 0', alignItems: 'baseline', borderTop: border ? '1px dashed var(--line-dashed)' : 'none' }}>
      <span style={{ width: 88, flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, color: first ? 'var(--acc-terra)' : 'var(--ink-faint)' }}>{first ? 'Now' : clock(event.starts_at)}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14.5, color: 'var(--ink-body)' }}>{event.title}</div>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)' }}>{clock(event.starts_at)}–{clock(event.ends_at)}</span>
    </div>
  )
}

function SlippingCard({ row }: { row: SlippingRow }) {
  return (
    <div style={{ position: 'relative', border: '1px solid var(--line-goal)', background: '#F8F1DC', padding: '12px 14px', transform: 'rotate(0.4deg)', boxShadow: 'var(--shadow-card)', borderRadius: 3 }}>
      <img src={`${A}/wisteria/p20.png`} alt="" style={{ position: 'absolute', top: 8, right: 10, height: 56, opacity: 0.7 }} />
      <div style={{ fontSize: 13.5, color: 'var(--ink-body)', fontWeight: 500, paddingRight: 40 }}>{row.entity_name}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-gold)', marginTop: 5 }}>{Math.floor(row.days_since)} days untouched</div>
      <button onClick={() => markReviewed(row)} style={{ marginTop: 9, background: 'none', border: 'none', color: 'var(--acc-terra)', font: 'inherit', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>reviewed</button>
    </div>
  )
}

function RoutineRow({ routine, done }: { routine: Routine; done: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
      <Checkbox checked={done} size={16} onChange={() => toggleCompletion(routine)} />
      <span style={{ flex: 1, fontSize: 13, color: done ? 'var(--ink-hairline)' : 'var(--ink-body)', textDecoration: done ? 'line-through' : 'none' }}>{routine.name}</span>
    </div>
  )
}

function RitualCard({ label, shortLabel, done, total, accent, dot, onClick, icon, compact }: { label: string; shortLabel: string; done: number; total: number; accent: string; dot: string; onClick: () => void; icon: React.ReactNode; compact?: boolean }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  if (compact) {
    return (
      <button onClick={onClick} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-crisp)', padding: '9px 11px', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot, flex: 'none' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: 'var(--ink-body)' }}>{shortLabel}</div>
          <div style={{ marginTop: 4, height: 3, borderRadius: 2, background: 'var(--line-card)', overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: accent }} />
          </div>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--ink-faint)' }}>{done}/{total}</span>
      </button>
    )
  }
  return (
    <button onClick={onClick} style={{ position: 'relative', flex: 1, background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-crisp)', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 13, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
      <span style={{ position: 'absolute', top: 9, right: 11, fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-hairline)' }}>◧ pinned</span>
      {icon}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, color: 'var(--ink-body)', fontWeight: 500 }}>{label}</div>
        <div style={{ marginTop: 5, height: 4, borderRadius: 2, background: 'var(--line-card)', overflow: 'hidden' }}>
          <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: accent }} />
        </div>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)' }}>{done}/{total}</span>
    </button>
  )
}

function Empty({ line }: { line: string }) {
  return <div style={{ fontFamily: 'var(--font-hand)', fontSize: 17, color: '#7a745f', padding: '8px 2px' }}>{line}</div>
}

const SunIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" style={{ flex: 'none' }}><circle cx="12" cy="12" r="5" fill="#D9B65C" /><g stroke="#C9A55A" strokeWidth="1.5" strokeLinecap="round"><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" /></g></svg>
)
const MoonIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" style={{ flex: 'none' }}><path d="M20 15.5A8 8 0 0 1 9 4.5a8 8 0 1 0 11 11Z" fill="#A8A0BE" /></svg>
)
