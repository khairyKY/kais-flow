import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { writeRow } from '../../lib/outbox'
import { queryClient } from '../../lib/queryClient'
import { useDomains } from '../domains/api'
import { EmojiText } from '../../components/EmojiText'
import { localDateKey } from '../routines/streaks'
import { localTimeKey, localToIso } from '../calendar/eventTime'
import { Select } from '../../components/Select'
import {
  useProjects,
  updateProjectColor,
  reparentProject,
  addProjectMilestone,
  toggleProjectMilestone,
  removeProjectMilestone,
  renameProjectMilestone,
  setProjectMilestones,
  addProjectChecklistItem,
  toggleProjectChecklistItem,
  removeProjectChecklistItem,
  logTimeEntry,
  useTimeEntries,
  isThisMonth,
  renameProject,
} from './api'
import { useAreas, renameArea, reparentArea } from '../areas/api'
import { RenameField } from '../../components/RenameField'
import { NumberField } from '../../components/NumberField'
import { useIsMobile } from '../../components/BottomSheet'
import { TypeMenu, useChangeType, type Convertible } from './ChangeType'
import { KIND_LABEL, kindOf } from './convert'
import { resolveUpdates, UPDATE_EVENTS } from './statusLog'
import {
  useTasks,
  completeTask,
  completeTaskWithUndo,
  undoCompletion,
  createTask,
  moveTasksWithUndo,
  rescheduleTasksWithUndo,
  somedayTasksWithUndo,
  deleteTasksWithUndo,
  moveToTomorrowWithUndo,
} from '../tasks/api'
import { TaskRow, type BulkActions } from '../tasks/TaskRow'
import { BulkBar } from '../../components/BulkBar'
import { ScheduleMenu } from '../../components/ScheduleMenu'
import { MovePicker } from '../tasks/MovePicker'
import type { MoveTarget } from '../tasks/move'
import { useSelectAllKey } from '../../components/useListKeys'
import { useEscapeStack } from '../../lib/overlayStack'
import { logActivity } from '../../lib/activity'
import { toastUndo } from '../../lib/undo'
import { BackLink, SectionLabel, Checkbox } from '../../components/kit'
import { getWisteriaImage } from './ProjectsPage'
import { ConfirmCard } from './ConfirmCard'
import { useMotionEnabled } from '../../lib/motion'
import { DateField } from '../../components/DatePicker'
import './xfx.css'

// Local query hook to retrieve activity log for a specific project/area
function useActivityLog(entityId: string) {
  return useQuery({
    queryKey: ['activity_log', entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  // Search deep-link: /projects/:id?focus=<taskId> — scroll to the row and ring it.
  const [searchParams] = useSearchParams()
  const focusTaskId = searchParams.get('focus')
  useEffect(() => {
    if (!focusTaskId) return
    document.getElementById(`task-${focusTaskId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusTaskId])
  const motion = useMotionEnabled()
  const isMobile = useIsMobile()

  // Queries
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const { data: areas = [] } = useAreas()
  const { data: tasks = [] } = useTasks()
  const { data: timeEntries = [] } = useTimeEntries()
  const { data: activityLogs = [] } = useActivityLog(id || '')

  // Find the entity
  const project = useMemo(() => projects.find((p) => p.id === id), [projects, id])
  const area = useMemo(() => areas.find((a) => a.id === id), [areas, id])

  // Form states
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('')
  const [newMilestoneWeight, setNewMilestoneWeight] = useState(1)
  // punch 40: the `edit` chip used to call removeProjectMilestone — it deleted. It now opens
  // this inline rename; deletion moved to its own ✕, guarded by ConfirmCard + undo.
  const [editingMilestone, setEditingMilestone] = useState<{ id: string; title: string } | null>(null)
  // Kai 2026-10-06: "we can't edit the name of an area, project or a retainer from inside the item".
  const [renamingTitle, setRenamingTitle] = useState(false)
  // The status-update / work log row whose note is being edited in place.
  const [editingLog, setEditingLog] = useState<string | null>(null)
  // Kai 2026-10-06: change its type from inside the page — the new thing's page opens; Undo comes back.
  const [typeMenuAt, setTypeMenuAt] = useState<{ x: number; y: number } | null>(null)
  const changeType = useChangeType({
    after: (created) => {
      if (created?.kind === 'area' || created?.kind === 'project') navigate(`/projects/${created.id}`)
      else if (created?.kind === 'domain') navigate('/projects')
    },
    onUndone: (thing) => navigate(`/projects/${thing.row.id}`),
  })
  const [newChecklistTitle, setNewChecklistTitle] = useState('')
  const [newChecklistType, setNewChecklistType] = useState<'one-shot' | 'task-linked'>('one-shot')
  const [newAddTaskTitle, setNewAddTaskTitle] = useState('')
  const [showAddTask, setShowAddTask] = useState(false)

  // Time logging states
  const [logMode, setLogMode] = useState<'work' | 'update'>('work')
  const [workNote, setWorkNote] = useState('')
  const [workDuration, setWorkDuration] = useState('1h30m')
  const [workDate, setWorkDate] = useState(() => localDateKey(new Date()))

  // E2 (2026-07-18 audit): in-app confirm replaces window.confirm
  const [confirm, setConfirm] = useState<{ title: string; body: string; confirmLabel: string; onConfirm: () => void } | null>(null)

  // E7 (2026-07-18 audit): ALL hooks must run before any early return — these useMemos
  // previously lived inside the project/area branches after the `!project && !area`
  // return, crashing cold loads of /projects/:id with "Rendered more hooks".
  const pTimeEntries = useMemo(
    () => (project ? timeEntries.filter((e) => e.project_id === project.id) : []),
    [timeEntries, project]
  )

  // Logged Work Feed (project detail)
  const mergedLogs = useMemo(() => {
    const logs: Array<{ id: string; date: string; type: 'work' | 'update'; note: string; duration?: number }> = []

    // 1. Time entries (work)
    for (const entry of pTimeEntries) {
      logs.push({
        id: entry.id,
        date: entry.started_at,
        type: 'work',
        note: entry.note || '',
        duration: entry.duration_min,
      })
    }

    // 2. Status updates — the log's edits and deletes applied (./statusLog.ts)
    for (const u of resolveUpdates(activityLogs)) {
      logs.push({ id: u.id, date: u.created_at, type: 'update', note: u.note })
    }

    // Sort by date descending
    return logs.sort((a, b) => b.date.localeCompare(a.date))
  }, [pTimeEntries, activityLogs])

  // Tended-weeks cadence (area detail)
  const tendedWeeks = useMemo(() => {
    const weeks = [false, false, false, false, false]
    if (!area) return weeks
    const now = Date.now()
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000

    const markWeek = (dateStr: string) => {
      const date = new Date(dateStr).getTime()
      const diff = now - date
      if (diff >= 0 && diff < 5 * oneWeekMs) {
        const weekIdx = Math.floor(diff / oneWeekMs)
        if (weekIdx >= 0 && weekIdx < 5) {
          weeks[weekIdx] = true
        }
      }
    }

    for (const log of activityLogs.filter((l) => l.entity_id === area.id)) {
      if (log.created_at) markWeek(log.created_at)
    }
    for (const t of tasks.filter((t) => t.area_id === area.id && t.status === 'done')) {
      if (t.completed_at) markWeek(t.completed_at)
    }

    return weeks
  }, [area, activityLogs, tasks])

  // punch 42: a project's / area's open tasks get the Tasks page's affordances — multi-select +
  // BulkBar, right-click ContextMenu, schedule/snooze — by rendering the SAME TaskRow and the same
  // shared overlays. No fork: every action below is the tasks feature's own mutation, looped.
  // Hoisted above the project/area early returns (E7 — hooks must not sit inside a branch).
  const [milestoneBloom, setMilestoneBloom] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkSchedulePos, setBulkSchedulePos] = useState<{ x: number; y: number } | null>(null)
  const [bulkProjectPos, setBulkProjectPos] = useState<{ x: number; y: number } | null>(null)
  const selectedTasks = tasks.filter((t) => selected.has(t.id))
  const clearSelection = () => setSelected(new Set())
  useEscapeStack(selected.size > 0, clearSelection)
  const toggleSelected = (taskId: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })

  const plural = (n: number) => `${n} task${n === 1 ? '' : 's'}`

  const bulkComplete = () => {
    const batch = selectedTasks
    // Polish D: undoCompletion also takes back each recurring task's spawned next occurrence.
    const undos = batch.map((t) => completeTask(t))
    toastUndo(`${plural(batch.length)} completed.`, () => undos.forEach(undoCompletion))
    clearSelection()
  }
  const bulkTomorrow = () => {
    moveToTomorrowWithUndo(selectedTasks)
    clearSelection()
  }
  const bulkSomeday = () => {
    somedayTasksWithUndo(selectedTasks)
    clearSelection()
  }
  const bulkSchedule = (iso: string) => {
    rescheduleTasksWithUndo(selectedTasks, iso)
    clearSelection()
  }
  const bulkMove = (to: MoveTarget) => {
    moveTasksWithUndo(selectedTasks, to)
    clearSelection()
  }
  // Kai 2026-10-07: Ctrl/Cmd+A selects this page's open tasks too (it only worked on Tasks/Today/Inbox).
  // `id` is a project or an area, never both, so one filter serves both pages.
  useSelectAllKey(() => setSelected(new Set(tasks.filter((t) => t.status === 'todo' && (t.project_id === id || t.area_id === id)).map((t) => t.id))), !bulkSchedulePos && !bulkProjectPos)
  // Flow Audit §4: delete = Trash + Undo, no confirm (their calendar blocks go and come back too).
  const bulkDelete = () => {
    deleteTasksWithUndo(selectedTasks)
    clearSelection()
  }

  const bulkActions: BulkActions | undefined =
    selected.size > 1
      ? { count: selected.size, onTomorrow: bulkTomorrow, onSomeday: bulkSomeday, onSchedule: bulkSchedule, onMove: bulkMove, onDelete: bulkDelete }
      : undefined

  // Rendered by both the project and the area branch.
  const taskOverlays = (
    <>
      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          onComplete={bulkComplete}
          onTomorrow={bulkTomorrow}
          onSchedule={(e) => setBulkSchedulePos({ x: e.clientX, y: e.clientY })}
          onMoveToProject={(e) => setBulkProjectPos({ x: e.clientX, y: e.clientY })}
          onDelete={bulkDelete}
          onClear={clearSelection}
        />
      )}
      {bulkSchedulePos && <ScheduleMenu position={bulkSchedulePos} onClose={() => setBulkSchedulePos(null)} onSchedule={(iso) => bulkSchedule(iso)} onSomeday={bulkSomeday} />}
      {bulkProjectPos && <MovePicker position={bulkProjectPos} current={null} onPick={bulkMove} onClose={() => setBulkProjectPos(null)} />}
    </>
  )

  /** The page's name (project, retainer or area): click / tap / Enter to rename in place; Enter or
   * leaving the field saves through the outbox (+ logActivity), Esc keeps the old name. */
  const titleNode = (name: string, rename: (next: string) => void) =>
    renamingTitle ? (
      <RenameField
        value={name}
        ariaLabel="Name"
        onDone={(next) => {
          setRenamingTitle(false)
          if (next && next !== name) rename(next)
        }}
      />
    ) : (
      <span
        role="button"
        tabIndex={0}
        title="Rename"
        aria-label={`Rename ${name}`}
        onClick={() => setRenamingTitle(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); setRenamingTitle(true) }
        }}
        style={{ cursor: 'text' }}
      >
        <EmojiText text={name} />
      </span>
    )

  const thing: Convertible | null = project ? { table: 'projects', row: project } : area ? { table: 'areas', row: area } : null
  // The footer's "Change type…" (project ↔ retainer ↔ area, area → project / domain) + its layers.
  const typeLink = thing && (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        onClick={(e) => setTypeMenuAt({ x: e.clientX, y: e.clientY })}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          const r = e.currentTarget.getBoundingClientRect()
          setTypeMenuAt({ x: r.left, y: r.bottom })
        }}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}
      >
        Change type… <span style={{ color: 'var(--ink-faint)' }}>· {KIND_LABEL[kindOf(thing.row, thing.table)]}</span>
      </span>
      {typeMenuAt && <TypeMenu thing={thing} at={typeMenuAt} onPick={(to) => changeType.ask(thing, to)} onClose={() => setTypeMenuAt(null)} />}
      {changeType.node}
    </>
  )

  if (!project && !area) {
    return (
      <div style={{ padding: 40, color: 'var(--ink-muted)' }}>
        <div>Entity not found.</div>
        <BackLink to="/projects">All projects</BackLink>
      </div>
    )
  }

  // Parse duration string like "1h30m" into minutes
  function parseDuration(d: string): number {
    const hoursMatch = d.match(/(\d+)h/)
    const minsMatch = d.match(/(\d+)m/)
    let total = 0
    if (hoursMatch) total += parseInt(hoursMatch[1]) * 60
    if (minsMatch) total += parseInt(minsMatch[1])
    if (!hoursMatch && !minsMatch) {
      const plainNum = parseInt(d)
      if (!isNaN(plainNum)) total = plainNum
    }
    return total || 60 // Default to 60m if parsing fails
  }

  const handleToggleMilestone = (milestoneId: string) => {
    if (!project || !project.milestones) return
    const m = project.milestones.find((x) => x.id === milestoneId)
    if (!m) return

    const linkedTasks = tasks.filter((t) => t.milestone_id === milestoneId)
    const nextCompleted = !m.completed

    if (linkedTasks.length > 0) {
      for (const t of linkedTasks) {
        if (t.status !== (nextCompleted ? 'done' : 'todo')) {
          writeRow('tasks', {
            ...t,
            status: nextCompleted ? 'done' : 'todo',
            completed_at: nextCompleted ? new Date().toISOString() : null,
            top3: false,
          })
          logActivity(nextCompleted ? 'task.completed' : 'task.reopened', 'task', t.id, {})
        }
      }
    }

    toggleProjectMilestone(project, milestoneId)
    // Effects 2e (WB-1) — completing a milestone grows the wisteria a stage (milestonePct
    // already drives the image); this is the short bloom that marks the moment. Counter, not
    // boolean: it doubles as the React key that replays the one-shot on every completion.
    if (nextCompleted) setMilestoneBloom((n) => n + 1)
  }

  const commitMilestoneEdit = () => {
    if (!project || !editingMilestone) return
    const title = editingMilestone.title.trim()
    const prior = project.milestones?.find((m) => m.id === editingMilestone.id)
    if (title && prior && title !== prior.title) renameProjectMilestone(project, editingMilestone.id, title)
    setEditingMilestone(null)
  }

  const askRemoveMilestone = (m: { id: string; title: string }) => {
    if (!project) return
    const prior = project.milestones ?? []
    setConfirm({
      title: `Delete "${m.title}"?`,
      body: 'The milestone goes. Tasks linked to it stay where they are.',
      confirmLabel: 'Delete',
      onConfirm: () => {
        setConfirm(null)
        removeProjectMilestone(project, m.id)
        toastUndo('Milestone deleted', () => setProjectMilestones(project, prior))
      },
    })
  }

  const handleAddMilestoneClick = () => {
    if (!project || !newMilestoneTitle.trim()) return
    addProjectMilestone(project, newMilestoneTitle.trim(), newMilestoneWeight)
    setNewMilestoneTitle('')
    setNewMilestoneWeight(1)
  }

  const handleAddChecklistItemClick = () => {
    if (!project || !newChecklistTitle.trim()) return

    if (newChecklistType === 'task-linked') {
      // Create a task first
      const task = createTask({
        title: newChecklistTitle.trim(),
        projectId: project.id,
        domainId: project.domain_id,
      })
      addProjectChecklistItem(project, newChecklistTitle.trim(), 'task-linked', task.id)
    } else {
      addProjectChecklistItem(project, newChecklistTitle.trim(), 'one-shot')
    }
    setNewChecklistTitle('')
  }

  const handleAddProjectTask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!project || !newAddTaskTitle.trim()) return
    createTask({
      title: newAddTaskTitle.trim(),
      projectId: project.id,
      domainId: project.domain_id,
    })
    setNewAddTaskTitle('')
    setShowAddTask(false)
  }

  // E8 (2026-07-18 audit): was calling createTask twice — one task per submit
  const handleAddAreaTask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!area || !newAddTaskTitle.trim()) return
    const t = createTask({ title: newAddTaskTitle.trim(), domainId: area.domain_id })
    writeRow('tasks', { ...t, area_id: area.id })
    setNewAddTaskTitle('')
    setShowAddTask(false)
  }

  const handleLogActivity = () => {
    if (!workNote.trim()) return
    // Logged work lands on the chosen day at the current wall-clock time; a future date is
    // blocked by the input’s max, so this can only ever be now or backdated.
    const now = new Date()
    const startedAt = localToIso(workDate, localTimeKey(now))

    if (logMode === 'work') {
      const dur = parseDuration(workDuration)
      const entry = logTimeEntry(project?.id || null, null, workNote.trim(), dur, startedAt)
      queryClient.setQueryData<any[]>(['activity_log', id || ''], (old) => {
        const newLog = {
          id: entry.id,
          event_type: 'project.work_logged',
          entity_type: 'project',
          entity_id: project?.id || '',
          payload: { note: workNote.trim(), duration_min: dur },
          created_at: startedAt,
        }
        return [newLog, ...(old ?? [])]
      })
    } else {
      // The feed shows the very row that was logged (it used to draw a copy under another id, so a
      // fresh update couldn't be edited or deleted until the next fetch).
      logUpdateEvent(UPDATE_EVENTS.logged, { note: workNote.trim() })
    }
    setWorkNote('')
  }

  // Kai 2026-10-06: status updates are edited in place and deleted with Undo. The log is append-only,
  // so both are events of their own (./statusLog.ts), shown at once through this page's cache.
  const logUpdateEvent = (event: string, payload: Record<string, unknown>) => {
    const row = logActivity(event, 'project', project?.id || id || '', payload)
    queryClient.setQueryData<any[]>(['activity_log', id || ''], (old) => [{ ...row, created_at: new Date().toISOString() }, ...(old ?? [])])
  }
  const editLog = (log: { id: string; type: 'work' | 'update'; note: string }, note: string) => {
    if (log.type === 'update') {
      logUpdateEvent(UPDATE_EVENTS.edited, { update_id: log.id, note })
      return
    }
    const entry = pTimeEntries.find((e) => e.id === log.id)
    if (!entry) return
    writeRow('time_entries', { ...entry, note })
    logActivity('project.work_edited', 'project', entry.project_id ?? id ?? '', { time_entry_id: entry.id, note })
  }
  const deleteLog = (log: { id: string; type: 'work' | 'update' }) => {
    if (log.type === 'update') {
      logUpdateEvent(UPDATE_EVENTS.deleted, { update_id: log.id })
      toastUndo('Update deleted', () => logUpdateEvent(UPDATE_EVENTS.restored, { update_id: log.id }))
      return
    }
    const entry = pTimeEntries.find((e) => e.id === log.id)
    if (!entry) return
    writeRow('time_entries', entry, 'delete')
    logActivity('project.work_deleted', 'project', entry.project_id ?? id ?? '', { time_entry_id: entry.id, duration_min: entry.duration_min })
    toastUndo('Work entry deleted', () => {
      writeRow('time_entries', entry)
      logActivity('project.work_restored', 'project', entry.project_id ?? id ?? '', { time_entry_id: entry.id })
    })
  }

  const colorPalette = [
    'var(--acc-terra)',
    'var(--acc-moss)',
    'var(--acc-lavender-deep)',
    'var(--acc-gold)',
    'var(--acc-hydrangea)',
    'var(--acc-sage)',
    '#7a4a52',
    '#8b8471',
  ]

  // ============================================
  // PROJECT DETAIL RENDER
  // ============================================
  if (project) {
    // Project tasks
    const projectTasks = tasks.filter((t) => t.project_id === project.id)
    const openTasks = projectTasks.filter((t) => t.status === 'todo')

    // Sum project hours (pTimeEntries hoisted above the early return — E7)
    const totalMinutes = pTimeEntries.reduce((acc, curr) => acc + curr.duration_min, 0)
    const totalHours = Math.round((totalMinutes / 60) * 10) / 10

    // Milestones
    const milestones = project.milestones ?? []
    let totalWeight = 0
    let completedWeight = 0

    const resolvedMilestones = milestones.map((m) => {
      totalWeight += m.weight
      // Check linked tasks
      const linkedTasks = tasks.filter((t) => t.milestone_id === m.id)
      const isComplete =
        linkedTasks.length > 0 ? linkedTasks.every((t) => t.status === 'done') : m.completed
      if (isComplete) {
        completedWeight += m.weight
      }
      return { ...m, resolvedCompleted: isComplete }
    })

    const milestonePct = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0
    const wisteriaImg = getWisteriaImage(milestonePct)

    return (
      // deviation(2026-07-18 audit): export caps at 820px; Kai wants full width
      <div style={{ background: 'var(--paper-linen)', border: '1px solid var(--line-solid)', borderRadius: 5, boxShadow: 'var(--shadow-card)', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.5 }} />

        <div style={{ display: 'flex', position: 'relative', zIndex: 10 }}>
          {/* left vine spine */}
          <div style={{ width: 34, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '34px 0 30px', borderRight: '1px dashed var(--line-dashed)' }}>
            <img src="/ds/assets/wisteria/p0.png" alt="" style={{ height: 26, opacity: 0.6 }} title="p0 — where it started" />
            <span style={{ flex: 1, width: 0, borderLeft: '1px dashed var(--acc-moss)', opacity: 0.6, margin: '8px 0' }}></span>
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              {/* Effects 1e — bloom glow: one gold breath, looping, while the project sits at 100% */}
              {motion && milestonePct === 100 && <span className="kf-bloom" style={{ inset: -10 }} />}
              {/* Effects 2e — milestone bloom: a single breath as the plant crosses a stage. */}
              {motion && milestonePct < 100 && milestoneBloom > 0 && (
                <span key={milestoneBloom} className="kf-bloom kf-bloom-once" style={{ inset: -10 }} />
              )}
              <img src={wisteriaImg} alt="" className={motion ? 'kf-sway' : undefined} style={{ height: 26, position: 'relative' }} title={`p${milestonePct}`} />
            </span>
            <span style={{ flex: 1, width: 0, borderLeft: '1px dashed var(--line-dashed)', margin: '8px 0' }}></span>
            <img src="/ds/assets/wisteria/p100.png" alt="" style={{ height: 22, opacity: 0.45 }} title="p100" />
          </div>

          <div className="kf-bulk-anchor" style={{ flex: 1, minWidth: 0, padding: '30px 36px 36px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <BackLink to="/projects">All projects</BackLink>
              <span className="fhelp" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', color: 'var(--ink-hairline)' }}>
                {project.engagement_model || 'Standard'} · started {new Date(project.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: 20 }}>
              <span style={{ width: 15, height: 15, borderRadius: '50%', background: project.color || 'var(--acc-terra)', flex: 'none' }} />
              <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 32, lineHeight: 1.1, color: 'var(--ink-body)', flex: 1, minWidth: 0 }}>{titleNode(project.name, (next) => renameProject(project, next))}</h1>
              <span className="mchip" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', textAlign: 'right' }}>
                target<br />
                <span style={{ fontSize: 12, color: 'var(--ink-body)', letterSpacing: 0, textTransform: 'none' }}>
                  {project.target_date ? new Date(project.target_date).toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' }) : 'no date'}
                </span>
              </span>
            </div>

            {/* Color picker */}
            <div className="flabel" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '20px 0 8px' }}>Color</div>
            <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              {colorPalette.map((c) => (
                <span
                  key={c}
                  onClick={() => updateProjectColor(project, c)}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: c,
                    cursor: 'pointer',
                    outline: project.color === c ? '1.5px solid var(--paper-linen)' : 'none',
                    boxShadow: project.color === c ? `0 0 0 3px ${c}` : 'none',
                  }}
                />
              ))}
            </div>

            {/* Domain — R4-17: reparent an existing project (the API had this all along) */}
            <div className="flabel" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '20px 0 8px' }}>Domain</div>
            <Select
              value={project.domain_id ?? ''}
              onChange={(v) => reparentProject(project, v || null, domains.find((d) => d.id === v)?.name)}
              options={[{ value: '', label: '— no domain' }, ...domains.map((d) => ({ value: d.id, label: d.name }))]}
              ariaLabel="Project domain"
              style={{ fontSize: 12.5, padding: '8px 10px', width: '100%', minHeight: isMobile ? 48 : undefined }}
            />

            {/* Hours + Milestones */}
            {/* On a phone the two stack: side by side, the milestones column ran off the card (its
                add row and the weight's −/+ were clipped out of reach). */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : '150px minmax(0, 1fr)', gap: 26, marginTop: 24 }}>
              <div>
                <div className="flabel" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>Hours</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 46, fontWeight: 500, lineHeight: 1, color: 'var(--ink-body)' }}>{totalHours}</div>
                <div className="fhelp" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', color: 'var(--ink-hairline)', marginTop: 4 }}>
                  logged across {pTimeEntries.length} sessions
                </div>
              </div>

              <div>
                <SectionLabel style={{ marginBottom: 8 }}>
                  <span>Milestones</span>
                  <span className="chip" style={{ background: 'color-mix(in oklch, var(--acc-terra) 14%, transparent)', color: 'var(--acc-terra)', marginLeft: 8, fontSize: 'var(--fs-meta)', padding: '2px 6px' }}>{milestonePct}%</span>
                </SectionLabel>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {resolvedMilestones.map((m) => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '7px 2px', borderBottom: '1px dashed var(--line-dashed)' }}>
                      {/* R4-24: milestones keep the bloom — Kai's one exception alongside Top-3/Goal */}
                      <Checkbox checked={m.resolvedCompleted} onChange={() => handleToggleMilestone(m.id)} size={15} bloom />
                      {editingMilestone?.id === m.id ? (
                        <input
                          autoFocus
                          value={editingMilestone.title}
                          onChange={(e) => setEditingMilestone({ id: m.id, title: e.target.value })}
                          onBlur={commitMilestoneEdit}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); commitMilestoneEdit() }
                            if (e.key === 'Escape') { e.preventDefault(); setEditingMilestone(null) }
                          }}
                          style={{ flex: 1, font: 'inherit', fontSize: 13, background: 'transparent', border: 'none', borderBottom: '1px dashed var(--ink-hairline)', outline: 'none', color: 'var(--ink-body)', padding: 0 }}
                        />
                      ) : (
                        <span style={{ fontSize: 13, color: m.resolvedCompleted ? 'var(--ink-hairline)' : 'var(--ink-body)', textDecoration: m.resolvedCompleted ? 'line-through' : 'none', flex: 1 }}>{m.title}</span>
                      )}
                      <span className="mchip" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>weight {m.weight}</span>
                      <span onClick={() => setEditingMilestone({ id: m.id, title: m.title })} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-muted)', cursor: 'pointer', marginLeft: 8 }}>edit</span>
                      <span onClick={() => askRemoveMilestone(m)} title="Delete milestone" style={{ cursor: 'pointer', fontSize: 12, color: 'var(--acc-terra)', marginLeft: 8 }}>✕</span>
                    </div>
                  ))}
                </div>

                {/* Quick Add Milestone */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 2px' }}>
                  <span style={{ width: 15, height: 15, border: '1.5px dashed var(--ink-hairline)', borderRadius: 4, flex: 'none', opacity: 0.6 }}></span>
                  <input
                    value={newMilestoneTitle}
                    onChange={(e) => setNewMilestoneTitle(e.target.value)}
                    placeholder="Add milestone…"
                    style={{ flex: 1, minWidth: 0, font: 'inherit', fontSize: 12.5, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink-body)' }}
                  />
                  <NumberField value={newMilestoneWeight} onChange={setNewMilestoneWeight} min={1} max={100} ariaLabel="Milestone weight" style={{ fontSize: 12.5 }} />
                  <button
                    onClick={handleAddMilestoneClick}
                    style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontSize: 11, padding: '6px 12px', borderRadius: 999, cursor: 'pointer' }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* Open tasks */}
            <SectionLabel style={{ margin: '24px 0 6px' }} action={<span onClick={() => setShowAddTask(!showAddTask)} style={{ border: '1px dashed var(--ink-hairline)', color: 'var(--ink-faint)', cursor: 'pointer', padding: '2px 8px', borderRadius: 999, fontSize: 'var(--fs-meta)' }}>+ add task</span>}>
              <span>Open tasks · {openTasks.length}</span>
            </SectionLabel>

            {showAddTask && (
              <form onSubmit={handleAddProjectTask} style={{ display: 'flex', gap: 8, padding: '8px 0' }}>
                <input
                  autoFocus
                  value={newAddTaskTitle}
                  onChange={(e) => setNewAddTaskTitle(e.target.value)}
                  placeholder="Task title…"
                  style={{ flex: 1, font: 'inherit', fontSize: 13, background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 6, padding: '6px 10px', outline: 'none', color: 'var(--ink-body)' }}
                />
                <button type="submit" style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>Add</button>
              </form>
            )}

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {openTasks.map((t, i) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  highlighted={focusTaskId === t.id}
                  selected={selected.has(t.id)}
                  onToggleSelect={() => toggleSelected(t.id)}
                  bulk={bulkActions}
                  border={i < openTasks.length - 1}
                />
              ))}
            </div>

            {/* Checklist */}
            <SectionLabel style={{ margin: '24px 0 6px' }}>
              <span>Checklist</span>
            </SectionLabel>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {(project.checklist ?? []).map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 2px', borderBottom: '1px dashed var(--line-dashed)' }}>
                  <Checkbox checked={item.completed} onChange={() => toggleProjectChecklistItem(project, item.id)} size={15} />
                  <span style={{ fontSize: 13, color: item.completed ? 'var(--ink-hairline)' : 'var(--ink-body)', textDecoration: item.completed ? 'line-through' : 'none', flex: 1 }}>{item.title}</span>
                  <span className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', fontSize: 'var(--fs-meta)', padding: '3px 8px', borderRadius: 3 }}>
                    {item.type}
                  </span>
                  <span onClick={() => removeProjectChecklistItem(project, item.id)} style={{ cursor: 'pointer', fontSize: 12, color: 'var(--acc-terra)', marginLeft: 8 }}>✕</span>
                </div>
              ))}

              {/* Add checklist item */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 2px' }}>
                <span style={{ width: 15, height: 15, border: '1.5px dashed var(--ink-hairline)', borderRadius: 4, flex: 'none', opacity: 0.6 }}></span>
                <input
                  value={newChecklistTitle}
                  onChange={(e) => setNewChecklistTitle(e.target.value)}
                  placeholder="Add a checklist item — sub-steps too small for a task…"
                  style={{ flex: 1, minWidth: 0, font: 'inherit', fontSize: 12.5, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink-body)' }}
                />
                <Select
                  value={newChecklistType}
                  onChange={(v) => setNewChecklistType(v as 'one-shot' | 'task-linked')}
                  options={[{ value: 'one-shot', label: 'one-shot' }, { value: 'task-linked', label: 'task-linked' }]}
                  ariaLabel="Checklist item type"
                  style={{ fontSize: 11, padding: '4px 8px' }}
                />
                <button
                  onClick={handleAddChecklistItemClick}
                  style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontSize: 11, padding: '6px 12px', borderRadius: 999, cursor: 'pointer' }}
                >
                  Add
                </button>
              </div>
            </div>

            {/* Activity log — E6: seg toggle passed via `action` so it sits far right after the dashed rule (Projects.dc.html:583) */}
            <SectionLabel
              style={{ margin: '24px 0 8px' }}
              action={
              <span className="seg" style={{ display: 'inline-flex', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 7, padding: 2, gap: 2 }}>
                <span
                  onClick={() => setLogMode('work')}
                  className={logMode === 'work' ? 'on' : ''}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    cursor: 'pointer',
                    borderRadius: 5,
                    background: logMode === 'work' ? 'var(--paper-parchment)' : 'transparent',
                    border: logMode === 'work' ? '1px solid var(--line-card)' : '1px solid transparent',
                    boxShadow: logMode === 'work' ? 'var(--shadow-crisp)' : 'none',
                    fontWeight: logMode === 'work' ? 600 : 400,
                    color: 'var(--ink-body)',
                  }}
                >
                  Work
                </span>
                <span
                  onClick={() => setLogMode('update')}
                  className={logMode === 'update' ? 'on' : ''}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    cursor: 'pointer',
                    borderRadius: 5,
                    background: logMode === 'update' ? 'var(--paper-parchment)' : 'transparent',
                    border: logMode === 'update' ? '1px solid var(--line-card)' : '1px solid transparent',
                    boxShadow: logMode === 'update' ? 'var(--shadow-crisp)' : 'none',
                    fontWeight: logMode === 'update' ? 600 : 400,
                    color: 'var(--ink-body)',
                  }}
                >
                  📌 Update
                </span>
              </span>
              }
            >
              <span>Activity · {mergedLogs.length}</span>
            </SectionLabel>

            {/* Log form */}
            {/* Wraps on a phone: one unbreakable row pushed the whole card's content sideways. */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 9, padding: '2px 0 12px' }}>
              <input
                value={workNote}
                onChange={(e) => setWorkNote(e.target.value)}
                placeholder={logMode === 'work' ? "What did you work on?" : "Post a status update note…"}
                style={{ flex: '1 1 180px', minWidth: 0, font: 'inherit', fontSize: 12.5, color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 11px', outline: 'none' }}
              />
              {logMode === 'work' && (
                <>
                  <input
                    value={workDuration}
                    onChange={(e) => setWorkDuration(e.target.value)}
                    placeholder="1h30m"
                    style={{ width: 75, font: 'inherit', fontSize: 12.5, color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 10px', textAlign: 'center', outline: 'none' }}
                  />
                  <DateField
                    value={workDate}
                    max={localDateKey(new Date())}
                    clearable={false}
                    onChange={(v) => { if (v && v <= localDateKey(new Date())) setWorkDate(v) }}
                    title="Worked on"
                    ariaLabel="Date this work happened"
                    style={{ font: 'inherit', fontSize: 12.5, color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 10px', outline: 'none' }}
                  />
                </>
              )}
              <button
                onClick={handleLogActivity}
                style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', fontFamily: 'inherit', fontSize: 12, padding: '8px 15px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}
              >
                Log
              </button>
            </div>

            {/* Logs List */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {mergedLogs.map((log) => {
                const dateLabel = new Date(log.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
                return (
                  <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '9px 2px', borderBottom: '1px dashed var(--line-dashed)' }}>
                    <span className="fhelp" style={{ width: 76, flex: 'none', paddingTop: 3, color: 'var(--ink-hairline)', fontSize: 11 }}>{dateLabel}</span>
                    <span style={{ fontSize: 13, color: 'var(--ink-body)', lineHeight: 1.5, flex: 1 }}>
                      {log.type === 'update' && (
                        <span className="chip" style={{ background: 'color-mix(in oklch, var(--acc-buttercream) 25%, transparent)', color: 'var(--acc-buttercream-text)', fontSize: 'var(--fs-meta)', padding: '2px 6px', marginRight: 6, borderRadius: 3 }}>
                          update
                        </span>
                      )}
                      {/* Click the note to edit it in place; ✕ deletes with Undo (Kai 2026-10-06). */}
                      {editingLog === log.id ? (
                        <RenameField
                          value={log.note}
                          ariaLabel={log.type === 'update' ? 'Edit update' : 'Edit work note'}
                          style={{ width: 'calc(100% - 60px)', margin: '-3px 0' }}
                          onDone={(next) => {
                            setEditingLog(null)
                            if (next && next !== log.note) editLog(log, next)
                          }}
                        />
                      ) : (
                        <span role="button" tabIndex={0} title="Edit" aria-label={`Edit ${log.type}: ${log.note}`} onClick={() => setEditingLog(log.id)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setEditingLog(log.id) } }} style={{ cursor: 'text' }}>
                          {log.note}
                        </span>
                      )}
                    </span>
                    {log.type === 'work' && log.duration && (
                      <span className="chip" style={{ background: 'color-mix(in oklch, var(--acc-moss) 18%, transparent)', color: 'var(--acc-sage-text)', fontSize: 'var(--fs-meta)', padding: '3px 8px', borderRadius: 999 }}>
                        {Math.floor(log.duration / 60) > 0 ? `${Math.floor(log.duration / 60)}h ` : ''}
                        {log.duration % 60 > 0 ? `${log.duration % 60}m` : ''}
                      </span>
                    )}
                    {log.type === 'work' && <span className="mchip" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginLeft: 8 }}>manual</span>}
                    <button type="button" className="kf-hit" onClick={() => deleteLog(log)} title="Delete" aria-label={`Delete ${log.type}: ${log.note}`} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'var(--acc-terra)', marginLeft: 8, flex: 'none' }}>✕</button>
                  </div>
                )
              })}
            </div>

            {/* Archive / Change type action footer */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 18px', marginTop: 24, paddingTop: 14, borderTop: '1px dashed var(--line-dashed)' }}>
              <span
                onClick={() =>
                  // E2: in-app ConfirmCard instead of window.confirm
                  setConfirm({
                    title: `Archive "${project.name}"?`,
                    body: 'It moves to the Herbarium as a pressed specimen — you can restore it any time.',
                    confirmLabel: 'Archive',
                    onConfirm: () => {
                      setConfirm(null)
                      // Punch 51: do NOT archive here — the pressing ceremony performs the
                      // archive when it finishes, so the specimen is pressed *then* filed.
                      navigate(`/herbarium?press=${project.id}`)
                    },
                  })
                }
                style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}
              >
                Archive project…
              </span>
              {typeLink}
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--ink-muted)', transform: 'rotate(-1deg)' }}>
                100% milestones → the wisteria's full cascade ✿
              </span>
            </div>
          </div>
        </div>
        {taskOverlays}
        {confirm && <ConfirmCard {...confirm} onCancel={() => setConfirm(null)} />}
      </div>
    )
  }

  // ============================================
  // AREA DETAIL RENDER
  // ============================================
  if (area) {
    const areaTasks = tasks.filter((t) => t.area_id === area.id)
    const openTasks = areaTasks.filter((t) => t.status === 'todo')
    // punch 42: "This month" counted every task ever closed in this area. Window it to the
    // current calendar month, so the number actually resets when the month rolls over.
    const closedThisMonth = areaTasks.filter((t) => t.status === 'done' && isThisMonth(t.completed_at))

    // Find repeating tasks
    const repeatingTasks = areaTasks.filter((t) => t.recurrence_rule && t.status === 'todo')

    const domain = domains.find((d) => d.id === area.domain_id)

    // Recent activity log list
    const areaRecentLogs = activityLogs.filter((log) => log.entity_id === area.id)

    // tendedWeeks hoisted above the early return — E7
    const tendedCount = tendedWeeks.filter(Boolean).length

    return (
      // deviation(2026-07-18 audit): export caps at 760px; Kai wants full width
      <div style={{ background: 'var(--paper-linen)', border: '1px solid var(--line-solid)', borderRadius: 5, boxShadow: 'var(--shadow-card)', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40, backgroundImage: 'var(--noise-url)', mixBlendMode: 'multiply', opacity: 0.5 }} />

        <div style={{ padding: '30px 40px 36px', position: 'relative', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <BackLink to="/projects">All projects</BackLink>
            <span className="fhelp" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', color: 'var(--ink-hairline)' }}>
              {domain?.name || 'Personal'} · ongoing since {new Date(area.created_at).toLocaleDateString('en-US', { month: 'short' })}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 20 }}>
            <span style={{ width: 15, height: 15, borderRadius: '50%', background: area.color || 'var(--acc-buttercream)', flex: 'none' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--acc-buttercream-text)' }}>Area · ongoing</div>
              <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 32, lineHeight: 1.1, color: 'var(--ink-body)' }}>{titleNode(area.name, (next) => renameArea(area, next))}</h1>
            </div>
            <span className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', fontSize: 'var(--fs-meta)', padding: '4px 9px', borderRadius: 3 }}>
              area, not a project
            </span>
          </div>

          {/* Kai 2026-10-07: an area's domain, set or changed here (its tasks follow; Undo in the toast) — the project page's own field. */}
          <div className="flabel" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '20px 0 8px' }}>Domain</div>
          <Select
            value={area.domain_id ?? ''}
            onChange={(v) => reparentArea(area, v || null, domains.find((d) => d.id === v)?.name ?? '')}
            options={[{ value: '', label: '— no domain' }, ...domains.map((d) => ({ value: d.id, label: d.name }))]}
            ariaLabel="Area domain"
            style={{ fontSize: 12.5, padding: '8px 10px', width: '100%', minHeight: isMobile ? 48 : undefined }}
          />

          {/* Cadence health cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 22 }}>
            <div style={{ background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 9, padding: '14px 16px' }}>
              <div className="flabel" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>Cadence</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 30,
                    fontWeight: 500,
                    color: tendedCount >= 3 ? 'var(--acc-sage-text)' : tendedCount >= 1 ? 'var(--acc-terra)' : 'var(--ink-muted)',
                    lineHeight: 1,
                  }}
                >
                  {tendedCount >= 3 ? 'Healthy' : tendedCount >= 1 ? 'Slipping' : 'Neglected'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 11 }}>
                {tendedWeeks.map((tended, i) => {
                  const opacities = [0.9, 0.75, 0.6, 0.4, 0.25]
                  return (
                    <span
                      key={i}
                      style={{
                        flex: 1,
                        height: 22,
                        borderRadius: 3,
                        background: tended ? 'var(--acc-moss)' : 'color-mix(in oklch, var(--ink-body) 8%, transparent)',
                        opacity: tended ? opacities[i] : 1,
                      }}
                    />
                  )
                })}
              </div>
              <div className="fhelp" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-hairline)', marginTop: 8 }}>
                tended {tendedCount} of the last 5 weeks
              </div>
            </div>

            <div style={{ background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 9, padding: '14px 16px' }}>
              <div className="flabel" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>This month</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 500, color: 'var(--ink-body)', lineHeight: 1 }}>
                  {closedThisMonth.length}
                </span>
                <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>tasks closed</span>
              </div>
              <div className="fhelp" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-hairline)', marginTop: 11 }}>no target — areas just keep going</div>
              <div className="fhelp" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-hairline)', marginTop: 6 }}>{openTasks.length} open right now</div>
            </div>
          </div>

          {/* Open tasks */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 6px' }}>
            <span className="flabel" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Open · {openTasks.length}</span>
            <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
            <span onClick={() => setShowAddTask(!showAddTask)} className="chip" style={{ border: '1px dashed var(--ink-hairline)', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: 'var(--fs-meta)', padding: '3px 8px', borderRadius: 999 }}>
              + add task
            </span>
          </div>

          {showAddTask && (
            <form onSubmit={handleAddAreaTask} style={{ display: 'flex', gap: 8, padding: '8px 0' }}>
              <input
                autoFocus
                value={newAddTaskTitle}
                onChange={(e) => setNewAddTaskTitle(e.target.value)}
                placeholder="Task title…"
                style={{ flex: 1, font: 'inherit', fontSize: 13, background: 'var(--paper-bone)', border: '1px solid var(--line-solid)', borderRadius: 6, padding: '6px 10px', outline: 'none', color: 'var(--ink-body)' }}
              />
              <button type="submit" style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>Add</button>
            </form>
          )}

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {openTasks.map((t, i) => (
              <TaskRow
                key={t.id}
                task={t}
                highlighted={focusTaskId === t.id}
                selected={selected.has(t.id)}
                onToggleSelect={() => toggleSelected(t.id)}
                bulk={bulkActions}
                border={i < openTasks.length - 1}
              />
            ))}
          </div>

          {/* Keeps coming back routines */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 6px' }}>
            <span className="flabel" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Keeps coming back</span>
            <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {repeatingTasks.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 2px', borderBottom: '1px dashed var(--line-dashed)' }}>
                <Checkbox checked={false} onChange={() => completeTaskWithUndo(t)} size={15} />
                <span style={{ fontSize: 13, color: 'var(--ink-body)', flex: 1 }}><EmojiText text={t.title} /></span>
                <span className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', fontSize: 'var(--fs-meta)', padding: '3px 8px', borderRadius: 3 }}>
                  ↻ repeats
                </span>
              </div>
            ))}
            {repeatingTasks.length === 0 && (
              <div style={{ color: 'var(--ink-faint)', fontSize: 12.5, fontStyle: 'italic', padding: '6px 2px' }}>
                No repeating tasks in this area yet.
              </div>
            )}
          </div>

          {/* Recent activities */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 8px' }}>
            <span className="flabel" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Recent</span>
            <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {areaRecentLogs.slice(0, 5).map((log) => {
              const dateLabel = new Date(log.created_at).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
              return (
                <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '9px 2px', borderBottom: '1px dashed var(--line-dashed)' }}>
                  <span className="fhelp" style={{ width: 76, flex: 'none', paddingTop: 3, color: 'var(--ink-hairline)', fontSize: 11 }}>{dateLabel}</span>
                  <span style={{ fontSize: 13, color: 'var(--ink-body)', lineHeight: 1.5, flex: 1 }}>
                    {log.event_type === 'task.completed' ? "Completed a task" : "Updated area"}
                  </span>
                </div>
              )
            })}
            {areaRecentLogs.length === 0 && (
              <div style={{ color: 'var(--ink-faint)', fontSize: 12.5, fontStyle: 'italic', padding: '6px 2px' }}>
                No recent activity logged.
              </div>
            )}
          </div>

          {/* Actions footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, paddingTop: 14, borderTop: '1px dashed var(--line-dashed)' }}>
            {typeLink}
            <span style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--ink-muted)', transform: 'rotate(-1deg)' }}>
              an area is a garden bed — never done, just kept ✿
            </span>
          </div>
        </div>
        {taskOverlays}
        {confirm && <ConfirmCard {...confirm} onCancel={() => setConfirm(null)} />}
      </div>
    )
  }

  return null
}
