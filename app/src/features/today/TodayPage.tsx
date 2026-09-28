import { useEffect, useMemo, useRef, useState } from 'react'
import { EmojiText } from '../../components/EmojiText'
import { Link, useNavigate } from 'react-router'
import { useTasks, completeTask, completeTaskWithUndo, undoCompletion, reopenTaskWithUndo, toggleTaskWithUndo, toggleTop3, snoozeTask, rescheduleDue, setProject, setSomeday, deleteTask } from '../tasks/api'
import { checkAction } from '../tasks/completion'
import { buildListBindings } from '../tasks/listShortcuts'
import { daysOverdue, formatDuration } from '../tasks/taskDisplay'
import { todayListTasks } from '../tasks/grouping'
import { cairoDateKey, scheduleToday, scheduleTomorrow, scheduleNextWeek } from '../../lib/dateShortcuts'
import { useCalendarEvents } from '../calendar/api'
import { useProjects } from '../projects/api'
import { useDomains } from '../domains/api'
import { useRoutines, useRoutineCompletions, toggleCompletion } from '../routines/api'
import { computeStreak, localDateKey, routinesForToday, todayTally } from '../routines/streaks'
import { groupRoutinesByTime } from '../routines/routineGrouping'
import { useSlipping, markReviewed } from '../slipping/api'
import { usePendingInboxItems } from '../inbox/api'
import { usePeople, getDaysUntilBirthday } from '../people/api'
import { VoiceCaptureButton } from '../capture/VoiceCaptureButton'
import { useRitualStepsToday, type RitualKind } from '../rituals/api'
import { useRitualPins } from '../rituals/ritualPins'
import { MorningRitual } from '../rituals/MorningRitual'
import { EveningRitual } from '../rituals/EveningRitual'
import { ResurfaceCard } from '../resurfacing/ResurfaceCard'
import { useLatestResurfaced } from '../resurfacing/api'
import { useGoalStore } from './goalStore'
import { useTerrariumStore } from './terrariumStore'
import { useCommandBarStore } from '../command-bar/commandBarStore'
import { SectionLabel, Checkbox, Button } from '../../components/kit'
import { useListKeys } from '../../components/useListKeys'
import { BulkBar } from '../../components/BulkBar'
import { Skeleton } from '../../components/States'
import { SnoozeMenu } from '../../components/SnoozeMenu'
import { ScheduleMenu } from '../../components/ScheduleMenu'
import { ProjectPicker } from '../../components/ProjectPicker'
import { ContextMenu } from '../../components/ContextMenu'
import { ConfirmCard } from '../projects/ConfirmCard'
import { useEscapeStack } from '../../lib/overlayStack'
import { rowAnchor } from '../../lib/rowAnchor'
import { useToastStore } from '../../lib/toastStore'
import { toastUndo } from '../../lib/undo'
import { useMotionEnabled, staggerDelay } from '../../lib/motion'
import { wisteriaStage } from '../../lib/growthStages'
import { claimDayComplete, DAY_DONE_DWELL_MS } from './dayComplete'
import { upNextClock, upNextEvents, upNextLabel } from './upNext'
import { taskMenuItems, upNextMenuItems } from './rowMenus'
import { useStartFocus } from './startFocus'
import { useMinuteNow } from './useMinuteNow'
import { DayCard } from './DayCard'
import { useStarEvents } from './api'
import { starredIds, top3OfToday } from './top3Today'
import { filterByList } from '../tasks/grouping'
import { flushOutbox } from '../../lib/outbox'
import { queryClient } from '../../lib/queryClient'
import type { Task, CalendarEvent, Project, Routine, SlippingRow } from '../../lib/types'
import './today.css'

// ── Today — pixel contract: Today.dc.html 1a (desktop, design lines 107-221) and 1b
// (iPhone ≤767px, lines 227-306) + States.dc.html 1a/1b (empty/done). The shell owns
// the sidebar/topbar/tab-bar; this is the main content, wired to real data. ──

const A = '/ds/assets'
const TZ = 'Africa/Cairo'
const PROJECT_DOTS = ['--acc-moss', '--acc-blossom', '--acc-lavender', '--acc-hydrangea', '--acc-buttercream', '--acc-sage']
// Punch 17: Today is a glance surface — "All open" stops here; the full list lives on /tasks.
const ALL_OPEN_CAP = 50

// Punch 20: same weighted-milestone % as ProjectsPage's projectStats (a milestone counts when
// flagged complete, or when it has linked tasks and they're all done) — the slipping card's
// wisteria must show the project's REAL stage, never a hardcoded one.
function weightedMilestonePct(project: Project, tasks: Task[]): number {
  let totalWeight = 0
  let completedWeight = 0
  for (const m of project.milestones ?? []) {
    totalWeight += m.weight
    const linked = tasks.filter((t) => t.milestone_id === m.id)
    const complete = linked.length > 0 ? linked.every((t) => t.status === 'done') : m.completed
    if (complete) completedWeight += m.weight
  }
  return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0
}

function isToday(iso: string | null): boolean {
  if (!iso) return false
  return cairoDateKey(new Date(iso)) === cairoDateKey(new Date())
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
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return isMobile
}

export function TodayPage() {
  // J-10: `isPending` (no data yet), not `isLoading` — while the IndexedDB cache is still being
  // restored the query is pending but not fetching, so isLoading is false and the empty states lied.
  const { data: tasks = [], isPending: tasksPending } = useTasks()
  const { data: events = [], isPending: eventsPending } = useCalendarEvents()
  const { data: projects = [] } = useProjects()
  const { data: routines = [] } = useRoutines()
  const { data: completions = [] } = useRoutineCompletions()
  const { data: ritualSteps = { morning: new Set<string>(), evening: new Set<string>() } } = useRitualStepsToday()
  const ritualPins = useRitualPins()
  const { data: slipping = [] } = useSlipping()
  const { data: domains = [] } = useDomains()
  const { data: pendingInbox = [] } = usePendingInboxItems()
  const { data: people = [] } = usePeople()
  // Punch 2: the heading must not outlive its card — same source the card guards on.
  const { data: resurfacedRow } = useLatestResurfaced()
  const [dismissedBdays, setDismissedBdays] = useState(() => {
    const s = new Set()
    if (typeof window !== 'undefined') {
      try {
        const curY = new Date().getFullYear()
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith('dismissed_bday_') && key.endsWith(`_${curY}`)) {
            if (localStorage.getItem(key) === '1') {
              const pid = key.split('_')[2]
              s.add(pid)
            }
          }
        }
      } catch (e) {
        console.error(e)
      }
    }
    return s
  })
  const { goalTaskId } = useGoalStore()
  const terrariumOn = useTerrariumStore((s) => s.on)
  const setCommandBarOpen = useCommandBarStore((s) => s.setOpen)
  const isMobile = useIsMobile()

  const [morningOpen, setMorningOpen] = useState(false)
  const [eveningOpen, setEveningOpen] = useState(false)
  const [celebrate, setCelebrate] = useState(false)

  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name] as const)), [projects])
  const projectDot = (id: string | null) => {
    if (!id) return 'var(--acc-moss)'
    const idx = projects.findIndex((p) => p.id === id)
    return `var(${PROJECT_DOTS[idx >= 0 ? idx % PROJECT_DOTS.length : 0]})`
  }

  // A3 (2026-07-18 audit): tasks completed *today* stay visible struck-through in their
  // sections instead of vanishing; done rows sort after open ones within each section.
  const doneAfterOpen = (a: Task, b: Task) => Number(!!a.completed_at) - Number(!!b.completed_at)
  // One rule for this page and the sidebar badge (Polish F1): grouping.ts `todayListTasks`.
  const visible = todayListTasks(tasks)
  const open = visible.filter((t) => !t.completed_at)
  // Loop A (2026-09-26 daily cycle): completing clears `top3` (completion.ts), so a finished pick
  // used to drop out of this section into "All open" — and the Day card couldn't tell "all three
  // done" from "none picked". Today's Top 3 now also holds the tasks finished today while starred,
  // read back from the star log (./top3Today) — struck through, as A3/R4 always intended.
  const { data: starEvents = [] } = useStarEvents(visible.filter((t) => t.completed_at).map((t) => t.id))
  const dayTop3 = top3OfToday(visible, starredIds(starEvents))
  const top3Ids = new Set(dayTop3.map((t) => t.id))
  const top3 = [...dayTop3].sort(doneAfterOpen)
  // R4 (2026-07-20 audit): "when the goal of the day is finished it should still be displayed,
  // just crossed out." The card already strikes a done goal through — but the *selection* moved:
  // `top3` sorts done-after-open, so once the goal was checked `top3[0]` became a different,
  // still-open task and the finished one silently lost the title. Fall back to the first top-3
  // in unsorted order so today's goal stays today's goal after it's completed.
  const goal = top3.find((t) => t.id === goalTaskId) ?? dayTop3[0]
  const restTop3 = top3.filter((t) => t.id !== goal?.id)
  const allOpen = visible.filter((t) => !top3Ids.has(t.id)).sort(doneAfterOpen)
  const openCount = allOpen.filter((t) => !t.completed_at).length
  const doneToday = tasks.filter((t) => isToday(t.completed_at)).length
  const nothingPlanned = !tasksPending && open.length === 0 && doneToday === 0
  const allDone = !tasksPending && open.length === 0 && doneToday > 0

  // X1 Effects 2d (+ Motion 1b) — the last check of the day earns a 5-petal fall and a
  // handwritten banner over the Top-3 section. Punch 23: the once-per-day gate lives in
  // ./dayComplete (single key, 3s dwell) — the one implementation for the whole app.
  const motion = useMotionEnabled()
  const wasAllDone = useRef(allDone)
  useEffect(() => {
    const was = wasAllDone.current
    wasAllDone.current = allDone
    if (was || !allDone || !motion) return
    if (!claimDayComplete()) return
    setCelebrate(true)
    const t = setTimeout(() => setCelebrate(false), DAY_DONE_DWELL_MS)
    return () => clearTimeout(t)
  }, [allDone, motion])

  // A2 (2026-07-18 audit): the Tasks selection pattern on Today — checkbox toggle,
  // Ctrl+A via useListKeys, BulkBar. Done rows aren't selectable (bulk acts on open tasks).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const selectable = [...restTop3, ...allOpen].filter((t) => !t.completed_at)
  const selectedTasks = selectable.filter((t) => selected.has(t.id))
  // Kai 2026-07-21 (clarified): the visible per-row select SQUARES go, but selectability
  // stays — Ctrl/Cmd+click toggles a row, Ctrl+A still selects all, the BulkBar still rides
  // a selection, and every row has a right-click menu.
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function clearSelection() {
    setSelected(new Set())
  }
  useEscapeStack(selected.size > 0, clearSelection)

  // Punch 19: click-away deselects. A click on empty page space clears the multi-select;
  // clicks that land on a task row, the BulkBar, any menu/popover, or an overlay card/scrim
  // keep it (Ctrl-click toggling and Esc behave as before). Document-level so "empty space"
  // includes the shell around the page, not just this component's box.
  const hasSelection = selected.size > 0
  useEffect(() => {
    if (!hasSelection) return
    function onDocClick(e: MouseEvent) {
      const t = e.target as Element | null
      if (t?.closest('[id^="task-"], [role="toolbar"], [role="menu"], [role="dialog"], .kf-overlay-card, .kf-overlay-scrim')) return
      setSelected(new Set())
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [hasSelection])

  const [bulkSnoozePos, setBulkSnoozePos] = useState<{ x: number; y: number } | null>(null)
  const [bulkSchedulePos, setBulkSchedulePos] = useState<{ x: number; y: number } | null>(null)
  const [bulkProjectPos, setBulkProjectPos] = useState<{ x: number; y: number } | null>(null)
  // Punch 14: in-app ConfirmCard replaces the native confirm popup (bulk delete + keyboard delete)
  const [confirm, setConfirm] = useState<{ title: string; body: string; onConfirm: () => void } | null>(null)

  const bulkToast = (verb: string) =>
    useToastStore.getState().push({ message: `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} ${verb}.` })
  // Punch 6 (Polish D): completing gets the same Undo as a single check — see completeTaskWithUndo.
  function bulkComplete() {
    const undos = selectedTasks.map((t) => completeTask(t))
    toastUndo(`${undos.length} task${undos.length === 1 ? '' : 's'} completed.`, () => undos.forEach(undoCompletion))
    clearSelection()
  }
  function bulkSnooze(until: string) { selectedTasks.forEach((t) => snoozeTask(t, until)); bulkToast('snoozed'); clearSelection() }
  function bulkSchedule(iso: string) { selectedTasks.forEach((t) => rescheduleDue(t, iso)); bulkToast('scheduled'); clearSelection() }
  function bulkMove(projectId: string | null, domainId: string | null) { selectedTasks.forEach((t) => setProject(t, projectId, domainId)); bulkToast('moved'); clearSelection() }
  function bulkSomeday() { selectedTasks.forEach((t) => setSomeday(t, true)); bulkToast('parked for someday'); clearSelection() }
  function bulkDelete() {
    setConfirm({
      title: `Delete ${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'}?`,
      body: '',
      onConfirm: () => {
        setConfirm(null)
        selectedTasks.forEach(deleteTask)
        bulkToast('deleted')
        clearSelection()
      },
    })
  }

  // F3 (punch 12/22/29): Today's list keyboard was an empty bindings array — dead keys on the
  // app's primary surface. Wired to the same handlers its context menu already uses.
  // WB-4 (punch 12): s/p were still unwired here while the `?` cheatsheet advertised them for
  // "Task list" — same row-menu pattern as TasksPage now, so both surfaces match the overlay.
  const [kbSnoozeId, setKbSnoozeId] = useState<string | null>(null)
  const [kbProjectId, setKbProjectId] = useState<string | null>(null)
  const kbSnoozeTask = kbSnoozeId ? selectable.find((t) => t.id === kbSnoozeId) : null
  const kbProjectTask = kbProjectId ? selectable.find((t) => t.id === kbProjectId) : null
  const listNavigate = useNavigate()
  const listBindings = buildListBindings({
    complete: (t) => completeTaskWithUndo(t),
    open: (t) => listNavigate(`/tasks/${t.id}`),
    snooze: (t) => setKbSnoozeId(t.id),
    today: (t) => rescheduleDue(t, scheduleToday()),
    tomorrow: (t) => rescheduleDue(t, scheduleTomorrow()),
    nextWeek: (t) => rescheduleDue(t, scheduleNextWeek()),
    top3: (t) => toggleTop3(t),
    project: (t) => setKbProjectId(t.id),
    toggleSelect: (t) => toggleSelected(t.id),
    delete: (t) => {
      setConfirm({ title: `Delete "${t.title}"?`, body: '', onConfirm: () => { setConfirm(null); deleteTask(t) } })
    },
  })
  const { focusedId } = useListKeys(selectable, listBindings, {
    active: !morningOpen && !eveningOpen && !bulkSnoozePos && !bulkSchedulePos && !bulkProjectPos && !confirm && !kbSnoozeId && !kbProjectId,
    sectionLabel: 'Lists',
    onSelectAll: () => setSelected(new Set(selectable.map((t) => t.id))),
  })

  // Polish D (2026-09-26 audit): the rail counted and listed EVERY active routine — a Sunday-only
  // "Plan the week" on a Saturday, "1/5" where Routines said "1 of 3". The count and the rows now
  // both come from the Routines page's own definition of today (streaks.ts todayTally /
  // routinesForToday: scheduled today, or already checked off today), so the two pages agree.
  const routineGroups = groupRoutinesByTime(routinesForToday(routines, completions))
  const doneKeys = useMemo(() => {
    const today = localDateKey(new Date())
    return new Set(completions.filter((c) => c.completed_on === today).map((c) => c.routine_id))
  }, [completions])
  const { due: routinesTotal, done: routinesDone } = todayTally(routines, completions)
  const hasActiveRoutines = routines.some((r) => r.active)

  // R4-D1 (Kai's 2026-07-20 ruling (a)): a ritual's progress is its own steps walked today,
  // never a count of `time_of_day`-tagged routines — those are a separate surface entirely.
  // Loop A: the Day card reads them (./dayPhase morningState / eveningState).
  //
  // A ritual logs its steps through the outbox into activity_log, which realtime doesn't sync and
  // the outbox's optimistic write doesn't reach (only the exact ['activity_log'] key). So when a
  // ritual closes, let the queue land, then re-read the log — the Day card turns without a reload.
  function openRitual(kind: RitualKind) {
    if (kind === 'morning') setMorningOpen(true)
    else setEveningOpen(true)
  }
  function closeRitual(kind: RitualKind) {
    if (kind === 'morning') setMorningOpen(false)
    else setEveningOpen(false)
    void flushOutbox().then(() => queryClient.invalidateQueries({ queryKey: ['activity_log'] }))
  }
  const overdueCount = filterByList(tasks, 'overdue').length

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

  const upcomingBirthdays = useMemo(() => {
    return people
      .filter((p) => {
        if (dismissedBdays.has(p.id)) return false
        const bdayFact = p.facts?.find((f: any) => f.label === 'Birthday')
        if (!bdayFact) return false
        const days = getDaysUntilBirthday(bdayFact.date || bdayFact.value)
        return days === 0 || days === 1
      })
      .map((p) => {
        const bdayFact = p.facts?.find((f: any) => f.label === 'Birthday')
        const days = getDaysUntilBirthday(bdayFact?.date || bdayFact?.value)!
        return { person: p, days }
      })
  }, [people, dismissedBdays])

  const handleDismissBday = (personId: string) => {
    const curY = new Date().getFullYear()
    const key = `dismissed_bday_${personId}_${curY}`
    try {
      localStorage.setItem(key, '1')
    } catch (e) {
      console.error(e)
    }
    setDismissedBdays((prev) => {
      const next = new Set(prev)
      next.add(personId)
      return next
    })
  }

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ })
  const dateLabelShort = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: TZ })
  const hyd = pendingInbox.length === 0 ? 'zero' : pendingInbox.length < 5 ? 'light' : pendingInbox.length < 20 ? 'medium' : 'heavy'
  const vine = streak >= 30 ? 'lush' : streak >= 7 ? 'flowering' : streak >= 1 ? 'sprouting' : 'bare'

  const header = isMobile ? (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
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
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta-l)', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>Today</div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 42, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--ink-body)' }}>{dateLabel}</h1>
      </div>
      <VoiceCaptureButton />
    </div>
  )

  const terrarium = terrariumOn && (isMobile ? (
    <div style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-crisp)', padding: '9px 13px', display: 'flex', alignItems: 'center', gap: 11, marginTop: 14, transform: 'rotate(-0.4deg)' }}>
      <span aria-hidden style={{ position: 'absolute', top: -7, left: 20, width: 40, height: 12, background: 'color-mix(in srgb, var(--acc-sage) 40%, transparent)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.3) 0 3px,transparent 3px 6px)', transform: 'rotate(-2deg)', borderRadius: 1 }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <img src={`${A}/hydrangea/${hyd}.png`} alt="Inbox" style={{ height: 30 }} />
        <img src={`${A}/vine/${vine}.png`} alt="Routines" style={{ height: 28 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-hand)', fontSize: 14, color: 'var(--ink-hand, #7a745f)', lineHeight: 1.2 }}>pressed &amp; kept, one day at a time</div>
      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-faint)', lineHeight: 1.6 }}>
        <div>{doneToday} of {open.length + doneToday} done</div>
        <div style={{ color: 'var(--acc-sage-text)' }}>{streak}-day streak</div>
      </div>
    </div>
  ) : (
    <div style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 26, marginBottom: 26, transform: 'rotate(-0.3deg)' }}>
      <span aria-hidden style={{ position: 'absolute', top: -9, left: 44, width: 66, height: 16, background: 'color-mix(in srgb, var(--acc-sage) 36%, transparent)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.3) 0 4px,transparent 4px 8px)', transform: 'rotate(-2deg)', borderRadius: 1, boxShadow: 'var(--shadow-crisp)' }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18 }}>
        <img src={`${A}/cherry/${cherryStage(open.length, doneToday)}.png`} alt="Tasks" style={{ height: 58, filter: 'var(--shadow-drop-sm)' }} />
        <img src={`${A}/hydrangea/${hyd}.png`} alt="Inbox" style={{ height: 56, filter: 'var(--shadow-drop-sm)' }} />
        <img src={`${A}/vine/${vine}.png`} alt="Routines" style={{ height: 54, filter: 'var(--shadow-drop-sm)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>The terrarium</div>
        <div style={{ fontFamily: 'var(--font-hand)', fontSize: 19, color: 'var(--ink-hand, #7a745f)', marginTop: 2 }}>pressed &amp; kept, one day at a time</div>
      </div>
      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', lineHeight: 1.7 }}>
        <div>{pendingInbox.length} in inbox</div>
        <div>{doneToday} of {open.length + doneToday} done</div>
        <div style={{ color: 'var(--acc-sage-text)' }}>{streak}-day streak</div>
      </div>
    </div>
  ))

  // Loop A (2026-09-26 daily cycle, DAILY-CYCLE.md §Today): Day card → Top 3 → Up next → Routines
  // lead; the lists that don't drive the next move rest under one quiet "More for today" fold.
  // Desktop keeps its rail (Routines first, then Slipping / From a while ago — already peripheral);
  // the phone's single column gets Routines before the fold and everything else inside it.
  const showAllOpen = !tasksPending && !nothingPlanned && !allDone
  const resurfacing = resurfacedRow?.action === 'pending'
  const allOpenSection = showAllOpen && (
    <section className={motion ? 'kf-stagger-item' : undefined} style={motion ? staggerDelay(2) : undefined}>
      <SectionLabel style={{ marginBottom: 6 }}>{`All open · ${openCount}`}</SectionLabel>
      {/* X1 Effects 2g — focus dim on the resting list (kf-dim, AppLayout shell CSS). */}
      <div className="kf-dim">
        {allOpen.slice(0, ALL_OPEN_CAP).map((t, i) => (
          <div key={t.id} className={motion ? 'kf-stagger-item' : undefined} style={motion ? staggerDelay(i) : undefined}>
            <TaskRow task={t} projectName={projectName.get(t.project_id ?? '')} dot={projectDot(t.project_id)} hollow border={i > 0} selected={selected.has(t.id)} onToggleSelect={() => toggleSelected(t.id)} highlighted={t.id === focusedId} />
          </div>
        ))}
      </div>
      {/* Punch 17: the rest lives on the Tasks "All" tab (built in parallel — link regardless). */}
      {allOpen.length > ALL_OPEN_CAP && (
        <Link to="/tasks?list=all" className="kf-link-terra" style={{ ...linkStyle, display: 'inline-block', marginTop: 10 }}>
          View all →
        </Link>
      )}
    </section>
  )
  const slippingSection = slipping.length > 0 && (
    <section>
      <SectionLabel style={{ marginBottom: 12 }}><span style={{ color: 'var(--acc-terra)' }}>Slipping</span></SectionLabel>
      {/* Punch 20: multiple slipping items stack as multiple cards (TODAY_BEHAVIOR §A). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {slipping.map((row) => {
          const project = row.entity_type === 'project' ? projects.find((p) => p.id === row.entity_id) : undefined
          // Non-project rows (domain/area) have no milestone % — p0 is the least-claiming stage.
          const stage = wisteriaStage(project ? weightedMilestonePct(project, tasks) : 0)
          return <SlippingCard key={`${row.entity_type}:${row.entity_id}`} row={row} stage={stage} />
        })}
      </div>
    </section>
  )
  // Punch 2: with no routines this was a heading reading "· 0/0" above nothing.
  // The section now either carries content or offers the one designed way in.
  const routinesSection = (
    <section>
      <SectionLabel style={{ marginBottom: 10 }}>{routinesTotal > 0 ? `Routines · ${routinesDone}/${routinesTotal}` : 'Routines'}</SectionLabel>
      {routinesTotal === 0 && (
        <Link to="/routines" style={{ display: 'block', fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--ink-hand, #7a745f)', textDecoration: 'none' }}>
          {/* Polish D: routines exist but every one rests today — say so, don't invite planting. */}
          {hasActiveRoutines ? 'nothing on repeat today ✿' : 'nothing on repeat yet — plant one ✿'}
        </Link>
      )}
      {routineGroups.filter((g) => g.items.length > 0).map((g) => (
        <div key={g.key}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-hairline)', margin: '2px 0 5px' }}>{g.label}</div>
          {g.items.map((r) => (
            <RoutineRow key={r.id} routine={r} done={doneKeys.has(r.id)} />
          ))}
        </div>
      ))}
    </section>
  )
  // Punch 2: ResurfaceCard returns null when nothing has resurfaced, so this was a
  // bare heading. The heading now only appears with a card under it.
  const resurfaceSection = resurfacing && (
    <section>
      <SectionLabel style={{ marginBottom: 12 }}>From a while ago</SectionLabel>
      <ResurfaceCard />
    </section>
  )
  const moreSummary = [
    showAllOpen && openCount > 0 ? `${openCount} open` : null,
    isMobile && slipping.length > 0 ? `${slipping.length} slipping` : null,
    isMobile && resurfacing ? 'a memory' : null,
  ].filter(Boolean).join(' · ')
  const moreForToday = (showAllOpen || (isMobile && (slipping.length > 0 || resurfacing))) && (
    <MoreForToday summary={moreSummary}>
      {allOpenSection}
      {isMobile && slippingSection}
      {isMobile && resurfaceSection}
    </MoreForToday>
  )

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

      {/* deviation(2026-09-26 daily cycle): ONE Day card with the next move replaces the two
          pinned ritual cards (./DayCard, ./dayPhase). Pins now decide which ritual it prompts. */}
      <div className="kf-daycard-slot" style={{ marginTop: isMobile ? 12 : 20 }}>
        <DayCard
          events={events}
          tasks={tasks}
          top3={goal ? [goal, ...restTop3] : restTop3}
          inboxCount={pendingInbox.length}
          overdueCount={overdueCount}
          ritualSteps={ritualSteps}
          prompts={ritualPins}
          compact={isMobile}
          onOpenRitual={openRitual}
        />
      </div>

      {!isMobile && <div style={{ height: 1, borderBottom: '1px dashed var(--line-solid)', margin: '26px 0 28px' }} />}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'minmax(0,1fr) 264px', gap: isMobile ? 30 : 44, alignItems: 'start' }}>
        <div className="kf-bulk-anchor" style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 26 : 34 }}>
          {upcomingBirthdays.map(({ person, days }) => {
            const text = days === 0 
              ? `${person.name}'s birthday is today!` 
              : `${person.name}'s birthday is tomorrow.`
              
            return (
              <div key={person.id} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--acc-clover-text)' }}>
                    A moment coming
                  </span>
                  <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
                </div>
                <div
                  style={{
                    position: 'relative',
                    background: 'var(--paper-parchment)',
                    border: '1px solid var(--line-card)',
                    borderRadius: 3,
                    boxShadow: 'var(--shadow-crisp)',
                    padding: '13px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 13
                  }}
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" style={{ flex: 'none' }}>
                    <g fill="var(--acc-sage)">
                      <ellipse cx="12" cy="6.8" rx="3" ry="4.2" />
                      <ellipse cx="6.8" cy="13.8" rx="3" ry="4.2" transform="rotate(-70 6.8 13.8)" />
                      <ellipse cx="17.2" cy="13.8" rx="3" ry="4.2" transform="rotate(70 17.2 13.8)" />
                    </g>
                    <circle cx="12" cy="12" r="4" fill="var(--acc-blossom)" />
                    <circle cx="12" cy="12" r="1.8" fill="var(--acc-gold-warm)" />
                  </svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', color: 'var(--ink-body)' }}>{text}</div>
                  </div>
                  <span
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('prefill-command-bar', { detail: `task: for ${person.name}'s birthday` }))
                      setCommandBarOpen(true)
                    }}
                    style={{ fontSize: '12.5px', color: 'var(--ink-muted)', textDecoration: 'underline', cursor: 'pointer', flex: 'none' }}
                  >
                    Plan something →
                  </span>
                  <span
                    onClick={() => handleDismissBday(person.id)}
                    style={{ fontSize: '12px', color: 'var(--ink-hairline)', cursor: 'pointer', flex: 'none', paddingLeft: 2 }}
                  >
                    ✕
                  </span>
                </div>
              </div>
            )
          })}
          <section className={motion ? 'kf-stagger-item' : undefined} style={{ position: 'relative', ...(motion ? staggerDelay(0) : null) }}>
            {celebrate && <DayCompleteBurst />}
            <SectionLabel style={{ marginTop: isMobile ? 16 : 0, marginBottom: isMobile ? 8 : 14 }}>{isMobile ? 'Top 3 today' : 'Top 3 for today'}</SectionLabel>
            {tasksPending ? (
              <>
                <Skeleton variant="card" />
                <Skeleton rows={2} />
              </>
            ) : nothingPlanned ? (
              <EmptyTodayCard onPlan={() => setCommandBarOpen(true)} />
            ) : allDone ? (
              <DoneTodayCard />
            ) : (
              <>
                {goal && <GoalCard task={goal} projectName={projectName.get(goal.project_id ?? '')} dot={projectDot(goal.project_id)} compact={isMobile} />}
                {restTop3.map((t) => (
                  <TaskRow key={t.id} task={t} projectName={projectName.get(t.project_id ?? '')} dot={projectDot(t.project_id)} border compact={isMobile} selected={selected.has(t.id)} onToggleSelect={() => toggleSelected(t.id)} highlighted={t.id === focusedId} />
                ))}
                {top3.length === 0 && <Empty line="Nothing starred for today yet." />}
              </>
            )}
          </section>

          <section className={motion ? 'kf-stagger-item' : undefined} style={motion ? staggerDelay(1) : undefined}>
            <SectionLabel action={!isMobile && <Link to="/calendar" className="kf-link-terra" style={linkStyle}>Open calendar →</Link>} style={{ marginBottom: isMobile ? 6 : 12 }}>Up next</SectionLabel>
            <UpNextList events={events} eventsPending={eventsPending} tasks={tasks} compact={isMobile} />
          </section>

          {isMobile && routinesSection}
          {moreForToday}
        </div>

        {!isMobile && <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          {routinesSection}
          {slippingSection}
          {resurfaceSection}
        </div>}
      </div>

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          onComplete={bulkComplete}
          onSnooze={(e) => setBulkSnoozePos({ x: e.clientX, y: e.clientY })}
          onSchedule={(e) => setBulkSchedulePos({ x: e.clientX, y: e.clientY })}
          onMoveToProject={(e) => setBulkProjectPos({ x: e.clientX, y: e.clientY })}
          onDelete={bulkDelete}
          onClear={clearSelection}
        />
      )}
      {bulkSnoozePos && <SnoozeMenu position={bulkSnoozePos} onClose={() => setBulkSnoozePos(null)} onSnooze={bulkSnooze} onSomeday={bulkSomeday} />}
      {bulkSchedulePos && <ScheduleMenu position={bulkSchedulePos} onClose={() => setBulkSchedulePos(null)} onSchedule={bulkSchedule} />}
      {bulkProjectPos && <ProjectPicker position={bulkProjectPos} projects={projects} domains={domains} currentProjectId={null} onSelect={bulkMove} onClose={() => setBulkProjectPos(null)} />}
      {kbSnoozeTask && (
        <SnoozeMenu position={rowAnchor('task-', kbSnoozeTask.id)} title={kbSnoozeTask.title} onClose={() => setKbSnoozeId(null)} onSnooze={(until) => snoozeTask(kbSnoozeTask, until)} onSomeday={() => setSomeday(kbSnoozeTask, true)} />
      )}
      {kbProjectTask && (
        <ProjectPicker position={rowAnchor('task-', kbProjectTask.id)} projects={projects} domains={domains} currentProjectId={kbProjectTask.project_id} onSelect={(projectId, domainId) => setProject(kbProjectTask, projectId, domainId)} onClose={() => setKbProjectId(null)} />
      )}
      {confirm && <ConfirmCard {...confirm} confirmLabel="Delete" onCancel={() => setConfirm(null)} />}

      {morningOpen && <MorningRitual onClose={() => closeRitual('morning')} />}
      {eveningOpen && <EveningRitual onClose={() => closeRitual('evening')} />}
    </div>
  )
}

const linkStyle = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--ink-faint)', textDecoration: 'none' }

function metaRow(projectName: string | undefined, dot: string, duration: number | null, extra?: React.ReactNode) {
  return (
    <div style={{ marginTop: 5, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      {projectName && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot }} />
          {projectName}
        </span>
      )}
      {duration != null && <span>{formatDuration(duration)}</span>}
      {extra}
    </div>
  )
}

// X1 Effects 2d — day complete: 5 petals fall over the finished Top-3 and a handwritten
// banner rises once. Reuses the petalFall keyframe (tokens/motion.css) + itemFadeIn.
function DayCompleteBurst() {
  const petals = [12, 30, 50, 68, 84] // left %
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 5 }}>
      {petals.map((left, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            top: 8,
            left: `${left}%`,
            width: 11,
            height: 9,
            background: 'linear-gradient(135deg,#E8C4CC,#D4A8B0)',
            borderRadius: i % 2 ? '60% 40% 70% 30%' : '70% 30% 60% 40%',
            animation: `petalFall 900ms var(--ease-out) ${i * 90}ms both`,
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '100%',
          marginTop: 6,
          textAlign: 'center',
          fontFamily: 'var(--font-hand)',
          fontSize: 17,
          color: 'var(--ink-hand, #7a745f)',
          animation: 'itemFadeIn 400ms var(--ease-out) 500ms both',
        }}
      >
        that's the day, gently done ✿
      </div>
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
        <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, height: 30, borderRadius: '4px 4px 7px 7px', background: 'linear-gradient(180deg,var(--sky-horizon,#b9a98a),var(--sky-panel-strong,#a3937a))', boxShadow: 'inset 0 3px 5px rgba(var(--kf-shadow-rgb, 60,52,38),0.25)' }} />
        <img src={`${A}/clover/seedling.png`} alt="" style={{ position: 'absolute', left: '50%', bottom: 34, height: 52, transform: 'translateX(-50%)', filter: 'var(--shadow-drop-sm)' }} />
      </div>
      <div style={{ marginTop: 22, fontFamily: 'var(--font-hand)', fontSize: 19, color: 'var(--ink-hand, #7a745f)', textAlign: 'center' }}>Nothing planted for today yet.</div>
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
      <div style={{ marginTop: 20, fontFamily: 'var(--font-hand)', fontSize: 19, color: 'var(--ink-hand, #7a745f)', textAlign: 'center' }}>All done. The garden can rest.</div>
    </div>
  )
}

// Holds a bloomed checkbox on screen for the length of Motion 5a before the row settles into
// its done treatment. Without it the swap to DoneCheck is instant and nothing animates.
// Polish F2a: the held box stays checked, so a second click on it used to run the completion
// again ("Done" twice). A click on a checked box now reopens the task, with Undo (checkAction).
function useBloomCheck(task: Task) {
  const [checking, setChecking] = useState(false)
  const done = !!task.completed_at
  const wasDone = useRef(done)
  useEffect(() => {
    if (wasDone.current && !done) setChecking(false) // reopened — drop the stale checked look
    wasDone.current = done
  }, [done])
  return {
    checking,
    toggle: () => {
      if (checkAction(done, checking) === 'reopen') {
        setChecking(false)
        reopenTaskWithUndo(task) // "Reopened" toast + Undo (puts the check back exactly)
        return
      }
      setChecking(true)
      completeTaskWithUndo(task) // punch 6: "Done" toast + Undo; the reopen effect above drops the bloom
    },
  }
}

function GoalCard({ task, projectName, dot, compact }: { task: Task; projectName?: string; dot: string; compact?: boolean }) {
  const done = !!task.completed_at // A3 — a completed goal stays on its card, struck through
  const bloom = useBloomCheck(task)
  const navigate = useNavigate()
  const startFocus = useStartFocus()
  const openDetail = () => navigate(`/tasks/${task.id}`) // J-8
  // Loop A (2026-09-26 daily cycle): the goal is a Top 3 row too — same right-click menu and
  // ▶ Start focus as the rows under it ("every row that shows a task behaves like a task").
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const onMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }
  const menuNode = menu && <ContextMenu items={taskMenuItems(task, { open: openDetail, startFocus })} position={menu} onClose={() => setMenu(null)} />
  if (compact) {
    return (
      <div id={`task-${task.id}`} onContextMenu={onMenu} style={{ position: 'relative', background: 'var(--paper-goal)', border: '1px solid var(--line-goal)', boxShadow: 'var(--shadow-goal)', borderRadius: 3, padding: '11px 13px', display: 'flex', alignItems: 'flex-start', gap: 10, transform: 'rotate(-0.4deg)' }}>
        {menuNode}
        <span aria-hidden style={{ position: 'absolute', top: -7, left: '50%', marginLeft: -26, width: 52, height: 13, background: 'color-mix(in srgb, var(--acc-gold-warm) 42%, transparent)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 3px,transparent 3px 6px)', transform: 'rotate(-1.5deg)', borderRadius: 1 }} />
        <span style={{ marginTop: 12 }}>{done && !bloom.checking ? <DoneCheck task={task} size={16} /> : <Checkbox label={task.title} checked={bloom.checking} size={16} bloom onChange={bloom.toggle} style={{ borderColor: 'var(--acc-gold)', background: 'color-mix(in srgb, var(--paper-parchment) 50%, transparent)' }} />}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--acc-gold)' }}>✶ Goal of the day</span>
          <div onClick={openDetail} style={{ fontFamily: 'var(--font-display)', fontSize: 15.5, fontWeight: 600, color: done ? 'var(--ink-hairline)' : 'var(--ink-body)', textDecoration: done ? 'line-through' : 'none', lineHeight: 1.25, marginTop: 3, cursor: 'pointer' }}><EmojiText text={task.title} /></div>
        </div>
        <img src={`${A}/clover/four_leaf.png`} alt="" style={{ width: 26, flex: 'none', filter: 'var(--shadow-drop-sm)' }} />
      </div>
    )
  }
  return (
    <div id={`task-${task.id}`} onContextMenu={onMenu} style={{ position: 'relative', background: 'var(--paper-goal)', border: '1px solid var(--line-goal)', boxShadow: 'var(--shadow-goal)', padding: '17px 18px 16px', display: 'flex', alignItems: 'flex-start', gap: 14, transform: 'rotate(-0.4deg)', borderRadius: 3, marginBottom: 8 }}>
      {menuNode}
      <span aria-hidden style={{ position: 'absolute', top: -9, left: '50%', width: 78, height: 18, marginLeft: -39, background: 'color-mix(in srgb, var(--acc-gold-warm) 42%, transparent)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.32) 0 4px,transparent 4px 8px)', transform: 'rotate(-1.5deg)', borderRadius: 1, boxShadow: 'var(--shadow-crisp)' }} />
      <span style={{ marginTop: 16 }}>{done && !bloom.checking ? <DoneCheck task={task} size={19} /> : <Checkbox label={task.title} checked={bloom.checking} size={19} bloom onChange={bloom.toggle} style={{ borderColor: 'var(--acc-gold)', background: 'color-mix(in srgb, var(--paper-parchment) 50%, transparent)' }} />}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--acc-gold)' }}>✶ Goal of the day</span>
        <div onClick={openDetail} style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600, color: done ? 'var(--ink-hairline)' : 'var(--ink-body)', textDecoration: done ? 'line-through' : 'none', lineHeight: 1.3, marginTop: 5, cursor: 'pointer' }}><EmojiText text={task.title} /></div>
        {metaRow(projectName, dot, task.duration_min, <span>{done ? 'Done today' : 'Due today'}</span>)}
      </div>
      <div style={{ textAlign: 'center', flex: 'none' }}>
        <img src={`${A}/clover/four_leaf.png`} alt="" style={{ width: 34, filter: 'var(--shadow-drop-sm)' }} />
        <div style={{ fontFamily: 'var(--font-hand)', fontSize: 13, color: 'var(--acc-gold)', marginTop: -2 }}>for luck</div>
      </div>
    </div>
  )
}

// A3 — the design's done treatment (Today.dc.html:204, same as routine rows): filled
// --sig-done check, struck-through title. Click reopens (Polish F2a: with Undo).
function DoneCheck({ task, size }: { task: Task; size: number }) {
  return (
    <span
      onClick={() => reopenTaskWithUndo(task)}
      title="Reopen"
      className="kf-hit"
      style={{ width: size, height: size, borderRadius: 5, background: 'var(--sig-done)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--paper-parchment)', fontSize: 'var(--fs-meta)', flex: 'none', cursor: 'pointer' }}
    >
      ✓
    </span>
  )
}

function TaskRow({ task, projectName, dot, border, hollow, compact, selected, onToggleSelect, highlighted }: { task: Task; projectName?: string; dot: string; border?: boolean; hollow?: boolean; compact?: boolean; selected?: boolean; onToggleSelect?: () => void; highlighted?: boolean }) {
  const bloom = useBloomCheck(task)
  const done = !!task.completed_at
  // Punch 18 (drift T-10): the same overdue/due-today/↻ meta the Tasks TaskRow renders,
  // via the shared taskDisplay helper — same "Overdue Nd" terra treatment, same ↻ glyph.
  const dueDays = !done && !task.someday && task.due_at ? daysOverdue(task.due_at) : null
  const dueBadges = dueDays !== null || task.recurrence_rule ? (
    <>
      {dueDays !== null && dueDays > 0 && <span style={{ color: 'var(--acc-terra)' }}>Overdue {dueDays}d</span>}
      {dueDays === 0 && <span>Due today</span>}
      {task.recurrence_rule && <span>↻</span>}
    </>
  ) : null
  const rowExtra: React.CSSProperties = {
    background: selected ? 'color-mix(in oklch, var(--acc-sage) 8%, transparent)' : undefined,
    boxShadow: highlighted ? '0 0 0 3px color-mix(in srgb, var(--acc-sage) 28%, transparent)' : undefined,
    outline: 'none',
  }
  // Kai 2026-07-21: no visible select squares, but the row keeps its selection and menu
  // behaviours — Ctrl/Cmd+click toggles selection, right-click opens the actions menu.
  const navigate = useNavigate()
  const startFocus = useStartFocus()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  function rowClick(e: React.MouseEvent) {
    if ((e.ctrlKey || e.metaKey) && !done && onToggleSelect) {
      e.preventDefault()
      onToggleSelect()
    }
  }
  function rowMenu(e: React.MouseEvent) {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }
  // Loop A: the menu lives in ./rowMenus (shared with the goal card), Start focus on top.
  const menuItems = taskMenuItems(task, { open: () => navigate(`/tasks/${task.id}`), startFocus, selected, onToggleSelect })
  const menuNode = menu && <ContextMenu items={menuItems} position={menu} onClose={() => setMenu(null)} />
  // Loop A: Top 3 rows carry a ▶ Start focus beside the star; the resting "All open" list doesn't.
  if (compact) {
    return (
      <div id={`task-${task.id}`} tabIndex={highlighted ? 0 : -1} onClick={rowClick} onContextMenu={rowMenu} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '10px 2px', borderBottom: border ? '1px dashed var(--line-dashed)' : 'none', ...rowExtra }}>
        {menuNode}
        {done && !bloom.checking ? <DoneCheck task={task} size={16} /> : <span style={{ marginTop: 1 }}><Checkbox label={task.title} checked={bloom.checking} size={16} bloom={task.top3} onChange={bloom.toggle} /></span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div onClick={() => navigate(`/tasks/${task.id}`)} style={{ fontSize: 13.5, color: done ? 'var(--ink-hairline)' : 'var(--ink-body)', textDecoration: done ? 'line-through' : 'none', cursor: 'pointer' }}><EmojiText text={task.title} /></div>
          {(projectName || task.duration_min != null || dueBadges) && (
            <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(projectName || task.duration_min != null) && (
                <span>{[projectName, task.duration_min != null ? formatDuration(task.duration_min) : null].filter(Boolean).join(' · ')}</span>
              )}
              {dueBadges}
            </div>
          )}
        </div>
        
        {!done && (
          <span className="kf-hit" onClick={() => toggleTop3(task)} style={{ color: task.top3 ? 'var(--acc-terra)' : 'var(--ink-hairline)', fontSize: 14, lineHeight: 1, cursor: 'pointer' }}>
            {task.top3 ? '★' : '☆'}
          </span>
        )}
      </div>
    )
  }
  return (
    <div id={`task-${task.id}`} tabIndex={highlighted ? 0 : -1} onClick={rowClick} onContextMenu={rowMenu} style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: hollow ? '10px 2px' : '11px 2px', borderBottom: border ? '1px dashed var(--line-dashed)' : 'none', ...rowExtra }}>
      {menuNode}
      {done && !bloom.checking ? <DoneCheck task={task} size={17} /> : <span style={{ marginTop: 2 }}><Checkbox label={task.title} checked={bloom.checking} bloom={task.top3} onChange={bloom.toggle} /></span>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div onClick={() => navigate(`/tasks/${task.id}`)} style={{ fontSize: hollow ? 14.5 : 15, color: done ? 'var(--ink-hairline)' : 'var(--ink-body)', textDecoration: done ? 'line-through' : 'none', cursor: 'pointer' }}><EmojiText text={task.title} /></div>
        {metaRow(projectName, dot, task.duration_min, dueBadges)}
      </div>
      
      {!done && (
        <span className="kf-hit" onClick={() => toggleTop3(task)} style={{ color: task.top3 ? 'var(--acc-terra)' : 'var(--ink-hairline)', fontSize: 16, lineHeight: 1, cursor: 'pointer' }}>
          {task.top3 ? '★' : '☆'}
        </span>
      )}
    </div>
  )
}

// Polish F2a (2026-09-26 decision): Up next lists what's running and what's still to come today —
// an event drops off the minute it ends (upNext.ts). The list owns the minute tick, so it re-reads
// the clock without re-rendering the whole page, and its rows' "Now" flips on the same tick.
function UpNextList({ events, eventsPending, tasks, compact }: { events: CalendarEvent[]; eventsPending: boolean; tasks: Task[]; compact: boolean }) {
  const now = useMinuteNow()
  const upNext = upNextEvents(events, now)
  return (
    <>
      {!eventsPending && upNext.length === 0 && <Empty line="A clear afternoon." />}
      {upNext.map((e, i) => (
        <EventRow key={e.id} event={e} task={tasks.find((t) => t.id === e.task_id) ?? undefined} border={i > 0} compact={compact} now={now} />
      ))}
    </>
  )
}

// Kai 2026-07-21: "where are the checkboxes for the top 3 tasks and the entire task behaviour" —
// Up-next rows backed by a task now carry the task's own checkbox and strike through when done,
// same contract as the calendar block (only task-linked entries are completable; plain events
// have nothing to complete).
//
// Loop A (2026-09-26, Kai: "I can't right click what is in the up next section"): the rows were
// display-only. Now every row behaves like a task row — a click opens it (the task editor, or the
// calendar for a plain event; the calendar has no per-event deep link), right-click opens the row
// menu (./rowMenus), and a task-backed row carries ▶ Start focus.
function EventRow({ event, task, border, compact, now }: { event: CalendarEvent; task?: Task; border: boolean; compact?: boolean; now: Date }) {
  const clock = upNextClock
  const navigate = useNavigate()
  const startFocus = useStartFocus()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  // Polish D (2026-09-26 audit): "Now" was the FIRST event of the day whatever the clock said —
  // a 10:00 meeting at 08:38. It now reads "Now" only while the event runs (upNext.ts), and the
  // list's minute tick (UpNextList) flips it on time without a reload.
  const label = upNextLabel(event.starts_at, event.ends_at, now)
  const labelColor = label.tone === 'now' ? 'var(--acc-terra)' : 'var(--ink-faint)'
  const done = task?.status === 'done'
  const open = () => navigate(task ? `/tasks/${task.id}` : '/calendar')
  const onMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }
  // The checkbox and ▶ act on their own; their clicks must not also open the row.
  const own = (e: React.MouseEvent) => e.stopPropagation()
  const check = task && (
    <span onClick={own} style={{ display: 'inline-flex', flex: 'none' }}>
      <Checkbox label={task.title} checked={!!done} size={compact ? 14 : 15} onChange={() => toggleTaskWithUndo(task)} />
    </span>
  )
  // A sibling of the row, not a child: the menu portals to <body>, but React events still bubble
  // through the component tree, and a menu click reaching the row would also open it.
  const menuNode = menu && <ContextMenu items={upNextMenuItems(event, task, { open, startFocus })} position={menu} onClose={() => setMenu(null)} />
  const titleStyle = { textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--ink-hairline)' : 'var(--ink-body)' } as const
  const rowProps = { id: `upnext-${event.id}`, onClick: open, onContextMenu: onMenu, title: task ? 'Open task' : 'Open in calendar' }
  if (compact) {
    return (
      <>
        <div {...rowProps} style={{ display: 'flex', gap: 12, padding: '7px 0', alignItems: 'center', borderTop: border ? '1px dashed var(--line-dashed)' : 'none', cursor: 'pointer' }}>
          <span style={{ width: 52, flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: labelColor }}>{label.text}</span>
          {check}
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, ...titleStyle }}><EmojiText text={event.title} /></div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>{clock(event.starts_at)}–{clock(event.ends_at)}</span>
          
        </div>
        {menuNode}
      </>
    )
  }
  return (
    <>
      <div {...rowProps} style={{ display: 'flex', gap: 16, padding: '9px 0', alignItems: 'center', borderTop: border ? '1px dashed var(--line-dashed)' : 'none', cursor: 'pointer' }}>
        <span style={{ width: 88, flex: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, color: labelColor }}>{label.text}</span>
        {check}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, ...titleStyle }}><EmojiText text={event.title} /></div>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>{clock(event.starts_at)}–{clock(event.ends_at)}</span>
        
      </div>
      {menuNode}
    </>
  )
}

function SlippingCard({ row, stage }: { row: SlippingRow; stage: string }) {
  const navigate = useNavigate()
  // A4 (2026-07-18 audit): the card body opens the slipping entity itself. Projects and
  // areas both live at /projects/:id (ProjectDetailPage renders either); a domain has no
  // detail page, so it lands on the garden overview.
  const to = row.entity_type === 'domain' ? '/projects' : `/projects/${row.entity_id}`
  return (
    <div
      // Motion 3e (WB-1): markReviewed() looks the card up by this id to play the exit
      // before the stack heals. Same scheme in the Weekly Review sweep.
      id={`slipping-${row.entity_type}:${row.entity_id}`}
      className="kf-lift"
      onClick={() => navigate(to)}
      role="link"
      // deviation(punch 15, 2026-07-26): export tilts this card rotate(0.4deg); dropped — the
      // sub-degree transform blurred the title + mono caption (see QuickCreate's 07-18 deviation).
      style={{ position: 'relative', border: '1px solid var(--line-goal)', background: 'var(--paper-goal)', padding: '12px 14px', boxShadow: 'var(--shadow-card)', borderRadius: 3, cursor: 'pointer' }}
    >
      {/* punch 20: the wisteria is the entity's real growth stage, computed by the caller. */}
      <img src={`${A}/wisteria/${stage}.png`} alt="" style={{ position: 'absolute', top: 8, right: 10, height: 56, opacity: 0.7 }} />
      <div style={{ fontSize: 13.5, color: 'var(--ink-body)', fontWeight: 500, paddingRight: 40 }}>{row.entity_name}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-gold)', marginTop: 5 }}>{Math.floor(row.days_since)} days untouched</div>
      <button onClick={(e) => { e.stopPropagation(); markReviewed(row) }} style={{ marginTop: 9, background: 'none', border: 'none', color: 'var(--acc-terra)', font: 'inherit', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>reviewed</button>
    </div>
  )
}

function RoutineRow({ routine, done }: { routine: Routine; done: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
      <Checkbox label={routine.name} checked={done} size={16} onChange={() => toggleCompletion(routine)} />
      <span style={{ flex: 1, fontSize: 13, color: done ? 'var(--ink-hairline)' : 'var(--ink-body)', textDecoration: done ? 'line-through' : 'none' }}>{routine.name}</span>
    </div>
  )
}

// Loop A — the quiet fold (DAILY-CYCLE.md: "still there, not competing"). Collapsed by default,
// remembered per device; SectionLabel's look, as a button.
const MORE_OPEN_KEY = 'kf.today.more-open'

function MoreForToday({ summary, children }: { summary: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(MORE_OPEN_KEY) === '1' } catch { return false }
  })
  function toggle() {
    const next = !open
    setOpen(next)
    try { localStorage.setItem(MORE_OPEN_KEY, next ? '1' : '0') } catch { /* storage off: this visit only */ }
  }
  return (
    <section>
      <button type="button" aria-expanded={open} onClick={toggle} className="kf-hit" style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', background: 'none', border: 'none', padding: '6px 0', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta-l)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {/* ellipsis: on a phone the summary ran ~400px and pushed the whole page wider than the screen */}
          More for today{summary && <span style={{ color: 'var(--ink-hairline)' }}> · {summary}</span>}
        </span>
        <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
        <span aria-hidden style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 160ms var(--ease-out)' }}>▸</span>
      </button>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 26, marginTop: 12 }}>{children}</div>}
    </section>
  )
}

function Empty({ line }: { line: string }) {
  return <div style={{ fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--ink-hand, #7a745f)', padding: '8px 2px' }}>{line}</div>
}

