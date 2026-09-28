import { useState } from 'react'
import { Checkbox, SectionLabel } from './kit'
import { BulkBar } from './BulkBar'
import { ScheduleMenu } from './ScheduleMenu'
import { ProjectPicker } from './ProjectPicker'
import { cairoDateKey, scheduleTomorrow } from '../lib/dateShortcuts'
import { animateRowRemoval } from '../lib/motion'
import { useEscapeStack } from '../lib/overlayStack'
import { toastUndo } from '../lib/undo'
import { useToastStore } from '../lib/toastStore'
import { daysOverdue, formatDuration } from '../features/tasks/taskDisplay'
import { RowMenuButton, SelectCircle, SwipeRow } from '../features/tasks/SwipeRow'
import { useRowGrammar } from '../features/tasks/useRowGrammar'
import type { TaskMenuActions } from '../features/tasks/TaskMenu'
import type { Project, Task } from '../lib/types'
import '../features/projects/xfx.css' // .kf-lift, as the app shell loads it: the rows here press like TaskRow's

// The one task-row grammar on /design-system (dev only, signed out): the real SwipeRow, ⋯ menu
// (useRowGrammar → TaskMenu) and selection bars, over local sample rows (Claude Design prompt 01).
// Every write stays in this component's state — nothing reaches the outbox.

const PROJECTS = [
  { id: 'p1', name: 'Shaheen Tasks', color: 'var(--acc-blossom)' },
  { id: 'p2', name: 'Career', color: 'var(--acc-lavender)' },
  { id: 'p3', name: 'Health', color: 'var(--acc-sage)' },
].map((p) => ({ ...p, domain_id: null, type: 'standard', status: 'active' })) as Project[]

const DAY = 86_400_000
const task = (id: string, title: string, over: Partial<Task> = {}): Task => ({
  id, title, project_id: null, domain_id: null, area_id: null, notes: null, status: 'todo', due_at: null, scheduled_start: null,
  scheduled_end: null, top3: false, snoozed_until: null, recurrence_rule: null, labels: [], priority: null, duration_min: null,
  someday: false, reminder_at: null, reminder_sent: false, completed_at: null, created_at: '', updated_at: '', ...over,
})
const SAMPLE: Task[] = [
  task('demo-1', 'Call the tyre supplier about the invoice', { project_id: 'p1', duration_min: 30, top3: true }),
  task('demo-2', 'Review Kai', { due_at: new Date(Date.now() - 64 * DAY).toISOString(), duration_min: 30 }),
  task('demo-3', 'Search for a good node.js source to study from', { project_id: 'p2', duration_min: 210 }),
  task('demo-4', 'Gym — upper body', { project_id: 'p3', duration_min: 60 }),
  task('demo-5', 'Buy milk'),
]

const metaStyle = { marginTop: 4, display: 'flex', flexWrap: 'wrap', columnGap: 12, rowGap: 2, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' } as const

function dueWord(iso: string): string {
  const key = cairoDateKey(new Date(iso))
  const day = key === cairoDateKey(new Date()) ? 'Today' : key === cairoDateKey(new Date(Date.now() + DAY)) ? 'Tomorrow' : new Date(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Africa/Cairo' })
  return `${day} ${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })}`
}

function DemoRow({ t, selected, selecting, onToggleSelect, actions, onComplete }: { t: Task; selected: boolean; selecting: boolean; onToggleSelect: () => void; actions: Partial<TaskMenuActions>; onComplete: () => void }) {
  const g = useRowGrammar(t, { projects: PROJECTS, domains: [], selected, onToggleSelect, selecting, actions })
  const project = PROJECTS.find((p) => p.id === t.project_id)
  const overdue = t.due_at ? daysOverdue(t.due_at) : 0
  return (
    <SwipeRow
      id={`task-${t.id}`}
      className="task-row kf-lift"
      onContextMenu={g.onContextMenu}
      onClickCapture={(e) => {
        if (!(e.ctrlKey || e.metaKey)) return
        e.preventDefault()
        e.stopPropagation()
        onToggleSelect()
      }}
      style={{ borderBottom: '1px dashed var(--line-dashed)', background: selected || g.menuOpen ? 'var(--select-bg)' : undefined }}
      contentStyle={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '13px 2px' }}
      {...g.swipeProps}
      overlay={g.menuNode}
    >
      <span style={{ marginTop: 2 }}>{g.selecting ? <SelectCircle on={selected} title={t.title} /> : <Checkbox checked={false} size={18} bloom={t.top3} label={t.title} onChange={onComplete} />}</span>
      <div style={{ flex: 1, minWidth: 0 }} onClick={() => useToastStore.getState().push({ message: `Opens “${t.title}”` })}>
        <div style={{ fontSize: 15, lineHeight: '20px', color: 'var(--ink-body)', textWrap: 'pretty' }}>{t.title}</div>
        <div style={metaStyle}>
          {project && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: project.color ?? undefined }} />
              {project.name}
            </span>
          )}
          {overdue > 0 ? <span style={{ color: 'var(--sig-overdue)' }}>Overdue {overdue}d</span> : t.due_at && <span>{dueWord(t.due_at)}</span>}
          {t.someday && <span>Someday</span>}
          {t.duration_min != null && <span>{formatDuration(t.duration_min)}</span>}
        </div>
      </div>
      {!g.selecting && (
        <span className="kf-hit" onClick={() => actions.top3?.()} style={{ color: t.top3 ? 'var(--star-on)' : 'var(--star-empty)', fontSize: 16, lineHeight: 1, cursor: 'pointer', marginTop: 1 }}>
          {t.top3 ? '★' : '☆'}
        </span>
      )}
      {!g.selecting && <RowMenuButton title={t.title} onOpen={g.openMenu} />}
    </SwipeRow>
  )
}

export function KitGesturesDemo() {
  const [tasks, setTasks] = useState(SAMPLE)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [picker, setPicker] = useState<{ kind: 'date' | 'project'; x: number; y: number } | null>(null)
  const clear = () => setSelected(new Set())
  useEscapeStack(selected.size > 0, clear)

  const patch = (ids: string[], fn: (t: Task) => Partial<Task>) => setTasks((all) => all.map((t) => (ids.includes(t.id) ? { ...t, ...fn(t) } : t)))
  // Undo: the rows as they were, back in their sample order.
  const restore = (rows: Task[]) =>
    setTasks((all) => {
      const byId = new Map([...all, ...rows].map((t) => [t.id, t]))
      return SAMPLE.filter((s) => byId.has(s.id)).map((s) => byId.get(s.id)!)
    })
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const tomorrow = (rows: Task[]) => {
    patch(rows.map((r) => r.id), () => ({ due_at: scheduleTomorrow(), someday: false }))
    toastUndo(rows.length === 1 ? 'Moved to tomorrow' : `${rows.length} tasks moved to tomorrow`, () => restore(rows))
  }
  const remove = (rows: Task[], message: string) => {
    let left = rows.length
    for (const r of rows) {
      animateRowRemoval(document.getElementById(`task-${r.id}`), () => {
        setTasks((all) => all.filter((t) => t.id !== r.id))
        if (--left === 0) toastUndo(message, () => restore(rows))
      })
    }
  }
  const trash = (rows: Task[]) => remove(rows, rows.length === 1 ? 'Moved to Trash' : `${rows.length} tasks moved to Trash`)
  const actionsFor = (t: Task): Partial<TaskMenuActions> => ({
    tomorrow: () => tomorrow([t]),
    schedule: (iso) => patch([t.id], () => ({ due_at: iso, someday: false })),
    someday: () => patch([t.id], () => ({ someday: true })),
    move: (projectId) => patch([t.id], () => ({ project_id: projectId })),
    priority: (priority) => patch([t.id], () => ({ priority })),
    repeat: (recurrence_rule) => patch([t.id], () => ({ recurrence_rule })),
    remind: (reminder_at) => patch([t.id], () => ({ reminder_at })),
    top3: () => patch([t.id], (x) => ({ top3: !x.top3 })),
    delete: () => trash([t]),
  })
  const picked = tasks.filter((t) => selected.has(t.id))
  const bulkDone = (then: (rows: Task[]) => void) => () => {
    then(picked)
    clear()
  }

  return (
    <section>
      <SectionLabel>Task row grammar</SectionLabel>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)', margin: '10px 0 6px' }}>
        touch: swipe → tomorrow · ← trash · hold 400ms to select — desktop: right-click or ⋯, ⌘/Ctrl-click selects
      </p>
      <div data-gesture-demo style={{ background: 'var(--paper-linen)', maxWidth: 560 }}>
        {tasks.map((t) => (
          <DemoRow
            key={t.id}
            t={t}
            selected={selected.has(t.id)}
            selecting={selected.size > 0}
            onToggleSelect={() => toggle(t.id)}
            actions={actionsFor(t)}
            onComplete={() => remove([t], 'Done')}
          />
        ))}
        {tasks.length < SAMPLE.length && (
          <button type="button" onClick={() => setTasks(SAMPLE)} style={{ marginTop: 10, font: 'inherit', fontSize: 13, color: 'var(--acc-terra-ink)', background: 'none', border: 'none', cursor: 'pointer' }}>
            Reset rows
          </button>
        )}
      </div>
      <style>{'.kit-reference .kf-bulkbar { left: 50%; bottom: 16px; }'}</style>
      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          onComplete={bulkDone((rows) => remove(rows, `${rows.length} done`))}
          onTomorrow={bulkDone(tomorrow)}
          onSchedule={(e) => setPicker({ kind: 'date', x: e.clientX, y: e.clientY })}
          onMoveToProject={(e) => setPicker({ kind: 'project', x: e.clientX, y: e.clientY })}
          onDelete={bulkDone(trash)}
          onClear={clear}
          onSelectAll={() => setSelected(new Set(tasks.map((t) => t.id)))}
        />
      )}
      {picker?.kind === 'date' && (
        <ScheduleMenu position={picker} onClose={() => setPicker(null)} onSchedule={(iso) => { patch([...selected], () => ({ due_at: iso })); clear() }} onSomeday={() => { patch([...selected], () => ({ someday: true })); clear() }} />
      )}
      {picker?.kind === 'project' && (
        <ProjectPicker position={picker} projects={PROJECTS} domains={[]} currentProjectId={null} onSelect={(projectId) => { patch([...selected], () => ({ project_id: projectId })); clear() }} onClose={() => setPicker(null)} />
      )}
    </section>
  )
}
