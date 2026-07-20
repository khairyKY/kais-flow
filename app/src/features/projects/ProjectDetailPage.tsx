import { useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
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
  addProjectChecklistItem,
  toggleProjectChecklistItem,
  removeProjectChecklistItem,
  logTimeEntry,
  useTimeEntries,
  createProject,
  archiveProject,
} from './api'
import { useAreas } from '../areas/api'
import { useTasks, completeTask, createTask } from '../tasks/api'
import { logActivity } from '../../lib/activity'
import { SectionLabel, Checkbox } from '../../components/kit'
import { getWisteriaImage } from './ProjectsPage'
import { ConfirmCard } from './ConfirmCard'
import { useMotionEnabled } from '../../lib/motion'
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
  const motion = useMotionEnabled()

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

    // 2. Activity logs (updates)
    const updateLogs = activityLogs.filter((log) => log.event_type === 'project.update_logged')
    for (const log of updateLogs) {
      logs.push({
        id: log.id,
        date: log.created_at,
        type: 'update',
        note: (log.payload?.note as string) || '',
      })
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

  if (!project && !area) {
    return (
      <div style={{ padding: 40, color: 'var(--ink-muted)' }}>
        <div>Entity not found.</div>
        <Link to="/projects" style={{ color: 'var(--acc-terra)' }}>← Go back</Link>
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

  // Convert area to project helper — E2: in-app ConfirmCard instead of window.confirm
  const handleConvertAreaToProject = () => {
    if (!area) return
    setConfirm({
      title: `Convert "${area.name}" to a project?`,
      body: 'All open tasks in this area will be moved to the new project.',
      confirmLabel: 'Convert',
      onConfirm: () => {
        setConfirm(null)
        doConvertAreaToProject()
      },
    })
  }

  const doConvertAreaToProject = () => {
    if (!area) return
    // 1. Create a project
    const newProj = createProject(
      area.name,
      area.domain_id,
      'standard',
      'Personal',
      null,
      area.color || 'var(--acc-terra)'
    )

    // 2. Reparent open tasks from area to new project
    const areaTasks = tasks.filter((t) => t.area_id === area.id)
    for (const t of areaTasks) {
      writeRow('tasks', { ...t, area_id: null, project_id: newProj.id })
    }

    // 3. Delete the area
    writeRow('areas', area, 'delete')
    logActivity('area.converted', 'area', area.id, { new_project_id: newProj.id, name: area.name })

    // 4. Redirect
    navigate(`/projects/${newProj.id}`)
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
      logActivity('project.update_logged', 'project', project?.id || id || '', { note: workNote.trim() })
      queryClient.setQueryData<any[]>(['activity_log', id || ''], (old) => {
        const newLog = {
          id: crypto.randomUUID(),
          event_type: 'project.update_logged',
          entity_type: 'project',
          entity_id: project?.id || id || '',
          payload: { note: workNote.trim() },
          created_at: startedAt,
        }
        return [newLog, ...(old ?? [])]
      })
    }
    setWorkNote('')
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
              {/* Effects 1e — bloom glow: one gold breath when milestones hit 100% */}
              {motion && milestonePct === 100 && <span className="kf-bloom" style={{ inset: -10 }} />}
              <img src={wisteriaImg} alt="" className={motion ? 'kf-sway' : undefined} style={{ height: 26, position: 'relative' }} title={`p${milestonePct}`} />
            </span>
            <span style={{ flex: 1, width: 0, borderLeft: '1px dashed var(--line-dashed)', margin: '8px 0' }}></span>
            <img src="/ds/assets/wisteria/p100.png" alt="" style={{ height: 22, opacity: 0.45 }} title="p100" />
          </div>

          <div style={{ flex: 1, minWidth: 0, padding: '30px 36px 36px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Link to="/projects" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-muted)', textDecoration: 'none' }}>
                ← All projects
              </Link>
              <span className="fhelp" style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', color: 'var(--ink-hairline)' }}>
                {project.engagement_model || 'Standard'} · started {new Date(project.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: 20 }}>
              <span style={{ width: 15, height: 15, borderRadius: '50%', background: project.color || 'var(--acc-terra)', flex: 'none' }} />
              <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 32, lineHeight: 1.1, color: 'var(--ink-body)', flex: 1 }}><EmojiText text={project.name} /></h1>
              <span className="mchip" style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', textAlign: 'right' }}>
                target<br />
                <span style={{ fontSize: 12, color: 'var(--ink-body)', letterSpacing: 0, textTransform: 'none' }}>
                  {project.target_date ? new Date(project.target_date).toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' }) : 'no date'}
                </span>
              </span>
            </div>

            {/* Color picker */}
            <div className="flabel" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '20px 0 8px' }}>Color</div>
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
            <div className="flabel" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', margin: '20px 0 8px' }}>Domain</div>
            <Select
              value={project.domain_id ?? ''}
              onChange={(v) => reparentProject(project, v || null)}
              options={[{ value: '', label: '— no domain' }, ...domains.map((d) => ({ value: d.id, label: d.name }))]}
              ariaLabel="Project domain"
              style={{ fontSize: 12.5, padding: '8px 10px', width: '100%' }}
            />

            {/* Hours + Milestones */}
            <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 26, marginTop: 24 }}>
              <div>
                <div className="flabel" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 6 }}>Hours</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 46, fontWeight: 500, lineHeight: 1, color: 'var(--ink-body)' }}>{totalHours}</div>
                <div className="fhelp" style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', color: 'var(--ink-hairline)', marginTop: 4 }}>
                  logged across {pTimeEntries.length} sessions
                </div>
              </div>

              <div>
                <SectionLabel style={{ marginBottom: 8 }}>
                  <span>Milestones</span>
                  <span className="chip" style={{ background: 'color-mix(in oklch, var(--acc-terra) 14%, transparent)', color: 'var(--acc-terra)', marginLeft: 8, fontSize: 9, padding: '2px 6px' }}>{milestonePct}%</span>
                </SectionLabel>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {resolvedMilestones.map((m) => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '7px 2px', borderBottom: '1px dashed var(--line-dashed)' }}>
                      {/* R4-24: milestones keep the bloom — Kai's one exception alongside Top-3/Goal */}
                      <Checkbox checked={m.resolvedCompleted} onChange={() => handleToggleMilestone(m.id)} size={15} bloom />
                      <span style={{ fontSize: 13, color: m.resolvedCompleted ? 'var(--ink-hairline)' : 'var(--ink-body)', textDecoration: m.resolvedCompleted ? 'line-through' : 'none', flex: 1 }}>{m.title}</span>
                      <span className="mchip" style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>weight {m.weight}</span>
                      <span onClick={() => removeProjectMilestone(project, m.id)} style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-muted)', cursor: 'pointer', marginLeft: 8 }}>edit</span>
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
                    style={{ flex: 1, font: 'inherit', fontSize: 12.5, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink-body)' }}
                  />
                  <input
                    type="number"
                    value={newMilestoneWeight}
                    onChange={(e) => setNewMilestoneWeight(parseInt(e.target.value) || 1)}
                    min="1"
                    className="kf-num"
                    style={{ width: 45, font: 'inherit', fontSize: 12.5, background: 'transparent', border: '1px solid var(--line-solid)', borderRadius: 4, padding: '2px 4px', textAlign: 'center', outline: 'none', color: 'var(--ink-body)' }}
                  />
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
            <SectionLabel style={{ margin: '24px 0 6px' }} action={<span onClick={() => setShowAddTask(!showAddTask)} style={{ border: '1px dashed var(--ink-hairline)', color: 'var(--ink-faint)', cursor: 'pointer', padding: '2px 8px', borderRadius: 999, fontSize: 10 }}>+ add task</span>}>
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
              {openTasks.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 2px', borderBottom: '1px dashed var(--line-dashed)' }}>
                  <Checkbox checked={t.status === 'done'} onChange={() => completeTask(t)} size={16} />
                  <span style={{ fontSize: 13.5, color: 'var(--ink-body)', flex: 1 }}><EmojiText text={t.title} /></span>
                  {t.due_at && (
                    <span className="chip" style={{ background: 'color-mix(in oklch, var(--acc-lavender) 22%, transparent)', color: 'var(--acc-lavender-text)', fontSize: 9.5, padding: '4px 9px', borderRadius: 999 }}>
                      {new Date(t.due_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                  {t.top3 && <span style={{ color: 'var(--acc-terra)', fontSize: 14 }}>★</span>}
                </div>
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
                  <span className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', fontSize: 9, padding: '3px 8px', borderRadius: 3 }}>
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
                  style={{ flex: 1, font: 'inherit', fontSize: 12.5, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink-body)' }}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 0 12px' }}>
              <input
                value={workNote}
                onChange={(e) => setWorkNote(e.target.value)}
                placeholder={logMode === 'work' ? "What did you work on?" : "Post a status update note…"}
                style={{ flex: 1, font: 'inherit', fontSize: 12.5, color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 11px', outline: 'none' }}
              />
              {logMode === 'work' && (
                <>
                  <input
                    value={workDuration}
                    onChange={(e) => setWorkDuration(e.target.value)}
                    placeholder="1h30m"
                    style={{ width: 75, font: 'inherit', fontSize: 12.5, color: 'var(--ink-body)', background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '8px 10px', textAlign: 'center', outline: 'none' }}
                  />
                  <input
                    type="date"
                    value={workDate}
                    max={localDateKey(new Date())}
                    onChange={(e) => { if (e.target.value && e.target.value <= localDateKey(new Date())) setWorkDate(e.target.value) }}
                    aria-label="Date this work happened"
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
                        <span className="chip" style={{ background: 'color-mix(in oklch, var(--acc-buttercream) 25%, transparent)', color: 'var(--acc-buttercream-text)', fontSize: 9, padding: '2px 6px', marginRight: 6, borderRadius: 3 }}>
                          update
                        </span>
                      )}
                      {log.note}
                    </span>
                    {log.type === 'work' && log.duration && (
                      <span className="chip" style={{ background: 'color-mix(in oklch, var(--acc-moss) 18%, transparent)', color: 'var(--acc-sage-text)', fontSize: 9.5, padding: '3px 8px', borderRadius: 999 }}>
                        {Math.floor(log.duration / 60) > 0 ? `${Math.floor(log.duration / 60)}h ` : ''}
                        {log.duration % 60 > 0 ? `${log.duration % 60}m` : ''}
                      </span>
                    )}
                    {log.type === 'work' && <span className="mchip" style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginLeft: 8 }}>manual</span>}
                  </div>
                )
              })}
            </div>

            {/* Archive / Convert action footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, paddingTop: 14, borderTop: '1px dashed var(--line-dashed)' }}>
              <span
                onClick={() =>
                  // E2: in-app ConfirmCard instead of window.confirm
                  setConfirm({
                    title: `Archive "${project.name}"?`,
                    body: 'It moves to the Herbarium as a pressed specimen — you can restore it any time.',
                    confirmLabel: 'Archive',
                    onConfirm: () => {
                      setConfirm(null)
                      archiveProject(project)
                      navigate(`/herbarium?press=${project.id}`)
                    },
                  })
                }
                style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}
              >
                Archive project…
              </span>
              <span style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--ink-muted)', transform: 'rotate(-1deg)' }}>
                100% milestones → the wisteria's full cascade ✿
              </span>
            </div>
          </div>
        </div>
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
    const completedTasks = areaTasks.filter((t) => t.status === 'done')

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
            <Link to="/projects" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-muted)', textDecoration: 'none' }}>
              ← All projects
            </Link>
            <span className="fhelp" style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, letterSpacing: '0.06em', color: 'var(--ink-hairline)' }}>
              {domain?.name || 'Personal'} · ongoing since {new Date(area.created_at).toLocaleDateString('en-US', { month: 'short' })}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 20 }}>
            <span style={{ width: 15, height: 15, borderRadius: '50%', background: area.color || 'var(--acc-buttercream)', flex: 'none' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--acc-buttercream-text)' }}>Area · ongoing</div>
              <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 32, lineHeight: 1.1, color: 'var(--ink-body)' }}><EmojiText text={area.name} /></h1>
            </div>
            <span className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', fontSize: 9, padding: '4px 9px', borderRadius: 3 }}>
              area, not a project
            </span>
          </div>

          {/* Cadence health cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 22 }}>
            <div style={{ background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 9, padding: '14px 16px' }}>
              <div className="flabel" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>Cadence</div>
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
              <div className="fhelp" style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--ink-hairline)', marginTop: 8 }}>
                tended {tendedCount} of the last 5 weeks
              </div>
            </div>

            <div style={{ background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 9, padding: '14px 16px' }}>
              <div className="flabel" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 8 }}>This month</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 500, color: 'var(--ink-body)', lineHeight: 1 }}>
                  {completedTasks.length}
                </span>
                <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>tasks closed</span>
              </div>
              <div className="fhelp" style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--ink-hairline)', marginTop: 11 }}>no target — areas just keep going</div>
              <div className="fhelp" style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, color: 'var(--ink-hairline)', marginTop: 6 }}>{openTasks.length} open right now</div>
            </div>
          </div>

          {/* Open tasks */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 6px' }}>
            <span className="flabel" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Open · {openTasks.length}</span>
            <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
            <span onClick={() => setShowAddTask(!showAddTask)} className="chip" style={{ border: '1px dashed var(--ink-hairline)', color: 'var(--ink-faint)', cursor: 'pointer', fontSize: 9, padding: '3px 8px', borderRadius: 999 }}>
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
            {openTasks.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 2px', borderBottom: '1px dashed var(--line-dashed)' }}>
                <Checkbox checked={t.status === 'done'} onChange={() => completeTask(t)} size={16} />
                <span style={{ fontSize: 13.5, color: 'var(--ink-body)', flex: 1 }}><EmojiText text={t.title} /></span>
                {t.due_at && (
                  <span className="chip" style={{ background: 'color-mix(in oklch, var(--acc-terra) 12%, transparent)', color: 'var(--acc-terra)', fontSize: 9, padding: '3px 8px', borderRadius: 999 }}>
                    {new Date(t.due_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Keeps coming back routines */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 6px' }}>
            <span className="flabel" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Keeps coming back</span>
            <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }}></span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {repeatingTasks.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 2px', borderBottom: '1px dashed var(--line-dashed)' }}>
                <Checkbox checked={false} onChange={() => completeTask(t)} size={15} />
                <span style={{ fontSize: 13, color: 'var(--ink-body)', flex: 1 }}><EmojiText text={t.title} /></span>
                <span className="chip" style={{ border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', fontSize: 9, padding: '3px 8px', borderRadius: 3 }}>
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
            <span className="flabel" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Recent</span>
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
            <span
              onClick={handleConvertAreaToProject}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}
            >
              Convert to project…
            </span>
            <span style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--ink-muted)', transform: 'rotate(-1deg)' }}>
              an area is a garden bed — never done, just kept ✿
            </span>
          </div>
        </div>
        {confirm && <ConfirmCard {...confirm} onCancel={() => setConfirm(null)} />}
      </div>
    )
  }

  return null
}
