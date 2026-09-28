import { useState } from 'react'
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { useTasks, createTask, rescheduleDue, setSomeday, completeTask, undoCompletion, setProject, deleteTasksWithUndo, moveToTomorrowWithUndo } from '../tasks/api'
import { TaskRow, type BulkActions } from '../tasks/TaskRow'
import { planningColumns, type PlanningColumn, type PlanningColumnKey } from '../tasks/grouping'
import { ScheduleMenu } from '../../components/ScheduleMenu'
import { ProjectPicker } from '../../components/ProjectPicker'
import { BulkBar } from '../../components/BulkBar'
import { BackLink } from '../../components/kit'
import { useProjects } from '../projects/api'
import { useDomains } from '../domains/api'
import { dragLift, useMotionEnabled } from '../../lib/motion'
import { seedPlant } from '../../lib/seedPlant'
import { useEscapeStack } from '../../lib/overlayStack'
import { useToastStore } from '../../lib/toastStore'
import { toastUndo } from '../../lib/undo'
import { scheduleNextWeek, scheduleThisWeek, scheduleToday, scheduleTomorrow } from '../../lib/dateShortcuts'
import type { Task } from '../../lib/types'

/** The mutation a column drop (or its quick-add) applies — same setters the rest of the app
 * already uses for scheduling, per the phase's "zero new API surface" rule. */
function applyColumn(task: Task, key: PlanningColumnKey): void {
  switch (key) {
    case 'today':
      rescheduleDue(task, scheduleToday())
      break
    case 'tomorrow':
      rescheduleDue(task, scheduleTomorrow())
      break
    case 'week':
      rescheduleDue(task, scheduleThisWeek())
      break
    case 'nextWeek':
      rescheduleDue(task, scheduleNextWeek())
      break
    case 'someday':
      setSomeday(task, true)
      break
  }
}

function DraggableCard({ task, selected, onToggleSelect, bulk }: { task: Task; selected: boolean; onToggleSelect: () => void; bulk?: BulkActions }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })
  const motionOn = useMotionEnabled()
  // Motion 5b via the shared grammar (WB-1) — was a flat 0.35 opacity fade, which reads as
  // "disabled", not "picked up". dnd-kit owns the follow-the-pointer translate, so the lift's
  // scale/rotate composes onto it rather than replacing it.
  const lift = dragLift(isDragging, motionOn)
  const follow = transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : ''
  const scale = lift.transform && lift.transform !== 'none' ? String(lift.transform) : ''
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        ...lift,
        transform: `${follow} ${scale}`.trim() || undefined,
        touchAction: 'none',
        cursor: isDragging ? 'grabbing' : 'grab',
        zIndex: isDragging ? 10 : undefined,
        position: 'relative',
      }}
    >
      <TaskRow task={task} selected={selected} onToggleSelect={onToggleSelect} bulk={bulk} hideCheckbox />
    </div>
  )
}

const COLLAPSED_CAP = 4
const EXPANDED_LIST_MAX_HEIGHT = 290 // ~6 TaskRows tall — scrolls past that instead of growing further

function BoardColumn({
  column,
  expanded,
  onToggleExpanded,
  selected,
  onToggleSelect,
  bulk,
}: {
  column: PlanningColumn
  expanded: boolean
  onToggleExpanded: () => void
  selected: Set<string>
  onToggleSelect: (id: string) => void
  bulk?: BulkActions
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key })
  const [quickAdd, setQuickAdd] = useState('')
  const motionOn = useMotionEnabled()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const title = quickAdd.trim()
    if (!title) return
    applyColumn(createTask({ title }), column.key)
    seedPlant(e.currentTarget as HTMLElement, motionOn) // Motion 5f
    setQuickAdd('')
  }

  const visibleTasks = expanded ? column.tasks : column.tasks.slice(0, COLLAPSED_CAP)
  const showMore = !expanded && column.tasks.length > COLLAPSED_CAP

  return (
    <div
      ref={setNodeRef}
      style={{
        flex: '0 0 260px',
        background: isOver ? 'color-mix(in oklch, var(--acc-lavender) 8%, var(--bg-surface))' : 'var(--bg-surface)',
        border: '1px solid var(--line-card)',
        borderRadius: 'var(--radius-sharp)',
        boxShadow: 'var(--shadow-card)',
        padding: '12px 12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'background 120ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta-l)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
        <span>{column.label}</span>
        <span style={{ opacity: 0.6 }}>·</span>
        <span>{column.tasks.length}</span>
      </div>

      <form onSubmit={submit}>
        <input
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          placeholder="Quick add…"
          style={{
            width: '100%',
            fontFamily: 'var(--font-ui)',
            fontSize: 12.5,
            background: 'var(--bg-input)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-input)',
            padding: '6px 9px',
            outline: 'none',
            color: 'var(--text-primary)',
          }}
        />
      </form>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          minHeight: 60,
          maxHeight: expanded ? EXPANDED_LIST_MAX_HEIGHT : undefined,
          overflowY: expanded ? 'auto' : undefined,
        }}
      >
        {column.tasks.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic', margin: '6px 0' }}>Drop a task here.</p>
        ) : (
          visibleTasks.map((t) => (
            <DraggableCard key={t.id} task={t} selected={selected.has(t.id)} onToggleSelect={() => onToggleSelect(t.id)} bulk={bulk} />
          ))
        )}
      </div>

      {(showMore || expanded) && column.tasks.length > COLLAPSED_CAP && (
        <button
          type="button"
          onClick={onToggleExpanded}
          style={{
            alignSelf: 'flex-start',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--fs-meta-l)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--acc-sage)',
            background: 'none',
            border: '1px solid var(--acc-sage)',
            borderRadius: 'var(--radius-pill)',
            padding: '3px 10px',
            cursor: 'pointer',
          }}
        >
          {expanded ? 'Show less' : `More (${column.tasks.length - COLLAPSED_CAP})`}
        </button>
      )}
    </div>
  )
}

/** Akiflow's "Upcoming" board, reachable from the Upcoming smart list and the Calendar rail —
 * same task engine (`planningColumns`, `tasks/api.ts` setters), no new data model. Tasks-family
 * surface (cherry/blossom): the columns are grouped task rows, just laid out by time instead of
 * by list. Drag needs a pointer; every card's own ContextMenu (Schedule/Snooze) reaches the same
 * re-date actions without one, so nothing here is drag-only. */
export function PlanningBoard() {
  const { data: tasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: domains = [] } = useDomains()
  const columns = planningColumns(tasks)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [expandedCols, setExpandedCols] = useState<Set<PlanningColumnKey>>(new Set())
  const allExpanded = columns.length > 0 && columns.every((c) => expandedCols.has(c.key))

  function handleDragEnd(e: DragEndEvent) {
    const columnKey = e.over?.id as PlanningColumnKey | undefined
    if (!columnKey) return
    const task = tasks.find((t) => t.id === e.active.id)
    if (task) applyColumn(task, columnKey)
  }

  function toggleColumn(key: PlanningColumnKey) {
    setExpandedCols((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAll() {
    setExpandedCols(allExpanded ? new Set() : new Set(columns.map((c) => c.key)))
  }

  // Selection for bulk actions — no visible checkbox here (per Kai's ask); right-clicking (or
  // opening the ⋯ menu on) an unselected card selects it, same mechanism the Tasks page uses.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const selectedTasks = tasks.filter((t) => selected.has(t.id))
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function clearSelection() {
    setSelected(new Set())
  }
  useEscapeStack(selected.size > 0, clearSelection)

  const [bulkSchedulePos, setBulkSchedulePos] = useState<{ x: number; y: number } | null>(null)
  const [bulkProjectPos, setBulkProjectPos] = useState<{ x: number; y: number } | null>(null)

  // Polish F2a: bulk complete carries the same Undo as Today's and Tasks' — undoCompletion also
  // takes back each repeat's spawned next occurrence. (A single card's check is TaskRow's own
  // completeTaskWithUndo.)
  function bulkComplete() {
    const undos = selectedTasks.map((t) => completeTask(t))
    toastUndo(`${undos.length} task${undos.length === 1 ? '' : 's'} completed.`, () => undos.forEach(undoCompletion))
    clearSelection()
  }
  function bulkTomorrow() {
    moveToTomorrowWithUndo(selectedTasks)
    clearSelection()
  }
  function bulkSomeday() {
    selectedTasks.forEach((t) => setSomeday(t, true))
    useToastStore.getState().push({ message: `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} parked for someday.` })
    clearSelection()
  }
  function bulkSchedule(iso: string, when = '') {
    selectedTasks.forEach((t) => rescheduleDue(t, iso))
    useToastStore.getState().push({ message: `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} scheduled${when ? ' ' + when : ''}.` })
    clearSelection()
  }
  function bulkMove(projectId: string | null, domainId: string | null) {
    selectedTasks.forEach((t) => setProject(t, projectId, domainId))
    useToastStore.getState().push({ message: `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} moved.` })
    clearSelection()
  }
  // Flow Audit §4: delete = Trash + Undo, no confirm.
  function bulkDelete() {
    deleteTasksWithUndo(selectedTasks)
    clearSelection()
  }

  const bulkActions: BulkActions | undefined =
    selected.size > 1
      ? { count: selected.size, onTomorrow: bulkTomorrow, onSomeday: bulkSomeday, onSchedule: bulkSchedule, onMove: bulkMove, onDelete: bulkDelete }
      : undefined

  return (
    <div style={{ maxWidth: 1400 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <BackLink to="/tasks?list=upcoming" style={{ marginBottom: 9 }}>Upcoming</BackLink>
          <h1 style={{ margin: '4px 0 0', fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 44, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>Planning board</h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: 'rotate(1deg)' }}>
          <img src="/ds/assets/cherry/bloom.png" alt="" style={{ height: 70, width: 'auto', objectFit: 'contain', filter: 'var(--shadow-drop-sm)' }} />
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--text-secondary)', marginTop: 4 }}>drag a petal into place</span>
        </div>
      </div>

      <div style={{ height: 1, borderBottom: '1px dashed var(--border-default)', margin: '26px 0 24px' }} />

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, paddingBottom: 8 }}>
          {columns.map((column) => (
            <BoardColumn
              key={column.key}
              column={column}
              expanded={expandedCols.has(column.key)}
              onToggleExpanded={() => toggleColumn(column.key)}
              selected={selected}
              onToggleSelect={toggleSelect}
              bulk={bulkActions}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={toggleAll}
          title={allExpanded ? 'Collapse all columns' : 'Expand all columns to 6 tasks'}
          aria-label={allExpanded ? 'Collapse all columns' : 'Expand all columns to 6 tasks'}
          className="kf-collapse-btn"
          style={{
            display: 'flex',
            margin: '14px auto 0',
            width: 24,
            height: 24,
            borderRadius: '50%',
            border: '1px solid var(--line-card)',
            background: 'var(--bg-surface)',
            boxShadow: 'var(--shadow-card)',
            color: 'var(--text-tertiary)',
            fontSize: 12,
            cursor: 'pointer',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {allExpanded ? '⌃' : '⌄'}
        </button>
      </DndContext>

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
      {bulkSchedulePos && (
        <ScheduleMenu
          position={bulkSchedulePos}
          onClose={() => setBulkSchedulePos(null)}
          onSchedule={(iso) => bulkSchedule(iso)}
          onSomeday={bulkSomeday}
        />
      )}
      {bulkProjectPos && (
        <ProjectPicker
          position={bulkProjectPos}
          projects={projects}
          domains={domains}
          currentProjectId={null}
          onSelect={bulkMove}
          onClose={() => setBulkProjectPos(null)}
        />
      )}
    </div>
  )
}
