import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useDomains, createDomain, renameDomain, mergeDomain } from '../domains/api'
import { useProjects, createProject } from '../projects/api'
import { useTasks, createTask, setSomeday, completeTask, snoozeTask, rescheduleDue, toggleTop3, setProject, deleteTask } from './api'
import { TaskRow, type BulkActions } from './TaskRow'
import { filterByList, groupTasks, SMART_LISTS, type SmartList, type TaskGroup } from './grouping'
import { buildListBindings } from './listShortcuts'
import { useListKeys } from '../../components/useListKeys'
import { SnoozeMenu } from '../../components/SnoozeMenu'
import { ProjectPicker } from '../../components/ProjectPicker'
import { BulkBar } from '../../components/BulkBar'
import { Select } from '../../components/Select'
import { rowAnchor } from '../../lib/rowAnchor'
import { scheduleToday, scheduleTomorrow, scheduleNextWeek } from '../../lib/dateShortcuts'
import { useEscapeStack } from '../../lib/overlayStack'
import { useToastStore } from '../../lib/toastStore'
import type { Domain } from '../../lib/types'
import { useAreas, createArea, renameArea } from '../areas/api'

const LIST_META: Record<SmartList, { title: string; eyebrow: string; caption?: string; empty: string }> = {
  today: { title: 'Today', eyebrow: 'Smart list · due & overdue', empty: 'Nothing due today. Enjoy the quiet.' },
  week: { title: 'This Week', eyebrow: 'Smart list · next 7 days', empty: 'A clear week ahead.' },
  month: { title: 'This Month', eyebrow: 'Smart list · through month-end', empty: 'Nothing scheduled this month.' },
  upcoming: { title: 'Upcoming', eyebrow: 'Smart list · beyond this month', empty: 'The far horizon is empty.' },
  someday: { title: 'Someday', eyebrow: 'Smart list · unscheduled', caption: 'no dates, no guilt', empty: 'Nothing parked for someday.' },
}

function parseList(raw: string | null): SmartList | null {
  return SMART_LISTS.includes(raw as SmartList) ? (raw as SmartList) : null
}

function SectionHeader({ group }: { group: TaskGroup }) {
  const terra = group.key === 'overdue'
  const h = Math.floor(group.totalMinutes / 60)
  const m = group.totalMinutes % 60
  const time = group.totalMinutes > 0 ? [h ? `${h}H` : '', m ? `${m}M` : ''].filter(Boolean).join(' ') : null
  const color = terra ? 'var(--acc-terra)' : 'var(--text-tertiary)'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        marginTop: 26,
        marginBottom: 4,
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color,
      }}
    >
      <span>{group.label}</span>
      <span style={{ opacity: 0.6 }}>·</span>
      <span>{group.tasks.length}</span>
      {time && (
        <>
          <span style={{ opacity: 0.6 }}>·</span>
          <span style={{ color: 'var(--text-tertiary)' }}>{time}</span>
        </>
      )}
    </div>
  )
}

const FIELD_STYLE = {
  fontFamily: 'var(--font-ui)',
  fontSize: 12.5,
  background: 'var(--bg-input)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  padding: '7px 10px',
  color: 'var(--text-primary)',
  outline: 'none',
}

function Tape({ top, side, offset, tint, rotate }: { top: number; side: 'left' | 'right'; offset: number; tint: string; rotate: number }) {
  return (
    <span
      style={{
        position: 'absolute',
        top,
        [side]: offset,
        width: 44,
        height: 13,
        background: tint,
        backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 3px, transparent 3px 6px)',
        transform: `rotate(${rotate}deg)`,
        borderRadius: 1,
      }}
    />
  )
}

function DomainsPanel() {
  const { data: domains = [] } = useDomains()
  const [name, setName] = useState('')
  const [mergeFrom, setMergeFrom] = useState('')
  const [mergeInto, setMergeInto] = useState('')

  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--bg-surface)',
        border: '1px solid var(--line-card)',
        boxShadow: 'var(--shadow-card)',
        borderRadius: 'var(--radius-sharp)',
        padding: '14px 16px',
        transform: 'rotate(-0.35deg)',
      }}
    >
      <Tape top={-8} side="left" offset={18} tint="rgba(138,154,126,0.36)" rotate={-2} />
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 10 }}>
        Domains
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {domains.map((d) => (
          <input
            key={d.id}
            defaultValue={d.name}
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== d.name) renameDomain(d, e.target.value.trim())
            }}
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              color: 'var(--text-primary)',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px dashed var(--border-dashed)',
              padding: '4px 2px',
              outline: 'none',
            }}
          />
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) createDomain(name.trim())
          setName('')
        }}
        style={{ display: 'flex', gap: 8, marginTop: 12 }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New domain"
          style={{ ...FIELD_STYLE, flex: 1, minWidth: 0 }}
        />
        <button type="submit" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 12.5, padding: '7px 14px', borderRadius: 999, cursor: 'pointer' }}>
          Add
        </button>
      </form>
      {domains.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 11.5, color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
          <span>merge</span>
          <Select
            value={mergeFrom}
            onChange={setMergeFrom}
            ariaLabel="Merge from domain"
            style={FIELD_STYLE}
            options={[{ value: '', label: '…' }, ...domains.map((d) => ({ value: d.id, label: d.name }))]}
          />
          <span>into</span>
          <Select
            value={mergeInto}
            onChange={setMergeInto}
            ariaLabel="Merge into domain"
            style={FIELD_STYLE}
            options={[{ value: '', label: '…' }, ...domains.map((d) => ({ value: d.id, label: d.name }))]}
          />
          <button
            type="button"
            disabled={!mergeFrom || !mergeInto || mergeFrom === mergeInto}
            onClick={() => {
              mergeDomain(mergeFrom, mergeInto)
              setMergeFrom('')
              setMergeInto('')
            }}
            style={{ border: 'none', background: 'none', color: 'var(--acc-terra)', fontFamily: 'inherit', fontSize: 11.5, textDecoration: 'underline', cursor: 'pointer', padding: 0, opacity: !mergeFrom || !mergeInto || mergeFrom === mergeInto ? 0.4 : 1 }}
          >
            Merge
          </button>
        </div>
      )}
    </div>
  )
}

function AreasPanel({ domains }: { domains: Domain[] }) {
  const { data: areas = [] } = useAreas()
  const [name, setName] = useState('')
  const [domainId, setDomainId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--bg-surface)',
        border: '1px solid var(--line-card)',
        boxShadow: 'var(--shadow-card)',
        borderRadius: 'var(--radius-sharp)',
        padding: '14px 16px',
        transform: 'rotate(-0.2deg)',
      }}
    >
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 10 }}>
        Areas
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {areas.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No areas yet</span>
        )}
        {areas.map((a) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {editingId === a.id ? (
              <form
                onSubmit={(e) => { e.preventDefault(); if (editName.trim()) renameArea(a, editName.trim()); setEditingId(null) }}
                style={{ display: 'flex', gap: 4, flex: 1 }}
              >
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                  style={{ flex: 1, border: '1px solid var(--border-default)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 12.5, padding: '3px 6px', borderRadius: 'var(--radius-input)' }}
                />
                <button type="submit" style={{ border: 'none', background: 'none', color: 'var(--acc-sage)', fontSize: 11.5, cursor: 'pointer', padding: 0 }}>save</button>
                <button type="button" onClick={() => setEditingId(null)} style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)', fontSize: 11.5, cursor: 'pointer', padding: 0 }}>x</button>
              </form>
            ) : (
              <>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: a.color || 'var(--ink-hairline)', flex: 'none' }} />
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text-primary)', flex: 1 }}>{a.name}</span>
                <span style={{ fontSize: 11, color: 'var(--ink-hairline)' }}>{domains.find((d) => d.id === a.domain_id)?.name ?? ''}</span>
                <button
                  onClick={() => { setEditingId(a.id); setEditName(a.name) }}
                  style={{ border: 'none', background: 'none', color: 'var(--acc-terra)', fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                >
                  rename
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) createArea(name.trim(), domainId || null)
          setName('')
        }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New area"
          style={{ border: '1px solid var(--border-default)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 12.5, padding: '7px 10px', borderRadius: 'var(--radius-input)', flex: 1, minWidth: 120 }}
        />
        <Select
          value={domainId}
          onChange={setDomainId}
          ariaLabel="Area domain"
          style={{ fontSize: 12.5, padding: '7px 10px' }}
          options={[{ value: '', label: 'no domain' }, ...domains.map((d) => ({ value: d.id, label: d.name }))]}
        />
        <button type="submit" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 12.5, padding: '7px 14px', borderRadius: 999, cursor: 'pointer' }}>
          Add
        </button>
      </form>
    </div>
  )
}

function ProjectsPanel({ domains }: { domains: Domain[] }) {
  const { data: projects = [] } = useProjects()
  const [name, setName] = useState('')
  const [domainId, setDomainId] = useState('')

  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--bg-surface)',
        border: '1px solid var(--line-card)',
        boxShadow: 'var(--shadow-card)',
        borderRadius: 'var(--radius-sharp)',
        padding: '14px 16px',
        transform: 'rotate(0.3deg)',
      }}
    >
      <Tape top={-8} side="right" offset={20} tint="rgba(212,168,176,0.38)" rotate={2} />
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 10 }}>
        Projects
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {projects.map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--text-primary)' }}>{p.name}</span>
            <span style={{ fontSize: 11, color: 'var(--ink-hairline)' }}>{domains.find((d) => d.id === p.domain_id)?.name ?? 'no domain'}</span>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) createProject(name.trim(), domainId || null)
          setName('')
        }}
        style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project"
          style={{ ...FIELD_STYLE, flex: 1, minWidth: 120 }}
        />
        <Select
          value={domainId}
          onChange={setDomainId}
          ariaLabel="Project domain"
          style={FIELD_STYLE}
          options={[{ value: '', label: 'no domain' }, ...domains.map((d) => ({ value: d.id, label: d.name }))]}
        />
        <button type="submit" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 12.5, padding: '7px 14px', borderRadius: 999, cursor: 'pointer' }}>
          Add
        </button>
      </form>
    </div>
  )
}

export function TasksPage() {
  const { data: domains = [] } = useDomains()
  const { data: projects = [] } = useProjects()
  const { data: tasks = [] } = useTasks()
  const [title, setTitle] = useState('')
  const [searchParams] = useSearchParams()
  const focusId = searchParams.get('focus')
  const list = parseList(searchParams.get('list'))
  const meta = list ? LIST_META[list] : null

  const now = new Date()
  const filtered = filterByList(tasks, list, now)
  const groups = groupTasks(filtered, now)
  const flatTasks = groups.flatMap((g) => g.tasks)
  const emptyMessage = meta ? meta.empty : "No tasks yet. Type one above, or press ⌘K and just say what's on your mind."

  const [kbSnoozeId, setKbSnoozeId] = useState<string | null>(null)
  const [kbProjectId, setKbProjectId] = useState<string | null>(null)
  const kbSnoozeTask = kbSnoozeId ? flatTasks.find((t) => t.id === kbSnoozeId) : null
  const kbProjectTask = kbProjectId ? flatTasks.find((t) => t.id === kbProjectId) : null

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const selectedTasks = tasks.filter((t) => selected.has(t.id))
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function clearSelection() {
    setSelected(new Set())
  }
  useEffect(() => clearSelection(), [list])
  useEscapeStack(selected.size > 0, clearSelection)

  const [bulkSnoozePos, setBulkSnoozePos] = useState<{ x: number; y: number } | null>(null)
  const [bulkProjectPos, setBulkProjectPos] = useState<{ x: number; y: number } | null>(null)

  function bulkComplete() {
    selectedTasks.forEach(completeTask)
    useToastStore.getState().push({ message: `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} completed.` })
    clearSelection()
  }
  function bulkSnooze(until: string) {
    selectedTasks.forEach((t) => snoozeTask(t, until))
    useToastStore.getState().push({ message: `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} snoozed.` })
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
  function bulkSomeday() {
    selectedTasks.forEach((t) => setSomeday(t, true))
    useToastStore.getState().push({ message: `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} parked for someday.` })
    clearSelection()
  }
  function bulkDelete() {
    if (!window.confirm(`Delete ${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'}?`)) return
    selectedTasks.forEach(deleteTask)
    useToastStore.getState().push({ message: `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} deleted.` })
    clearSelection()
  }

  // Passed into TaskRow's context menu when 2+ tasks are selected, so right-clicking any one of
  // them acts on the whole selection instead of just that row (only built above this size — a
  // solo selected row keeps the plain single-task menu, matching its pre-selection behavior).
  const bulkActions: BulkActions | undefined =
    selected.size > 1
      ? { count: selected.size, onComplete: bulkComplete, onSnooze: bulkSnooze, onSomeday: bulkSomeday, onSchedule: bulkSchedule, onMove: bulkMove, onDelete: bulkDelete }
      : undefined

  const bindings = buildListBindings({
    complete: (t) => completeTask(t),
    snooze: (t) => setKbSnoozeId(t.id),
    today: (t) => rescheduleDue(t, scheduleToday()),
    tomorrow: (t) => rescheduleDue(t, scheduleTomorrow()),
    nextWeek: (t) => rescheduleDue(t, scheduleNextWeek()),
    top3: (t) => toggleTop3(t),
    project: (t) => setKbProjectId(t.id),
    toggleSelect: (t) => toggleSelected(t.id),
    delete: (t) => {
      const message = t.scheduled_start ? `Delete "${t.title}"? This also removes its scheduled calendar block.` : `Delete "${t.title}"?`
      if (window.confirm(message)) deleteTask(t)
    },
  })
  const { focusedId: kbFocusedId } = useListKeys(flatTasks, bindings, {
    active: !kbSnoozeId && !kbProjectId,
    sectionLabel: 'Lists',
    onSelectAll: () => setSelected(new Set(flatTasks.map((t) => t.id))),
  })

  useEffect(() => {
    if (!focusId) return
    document.getElementById(`task-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusId, tasks])

  return (
    <div style={{ maxWidth: 1000 }}>
      <style>{`
        .tasks-panels { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; max-width: 760px; }
        @media (max-width: 767px) {
          .tasks-panels { grid-template-columns: 1fr; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 9 }}>
            {meta ? meta.eyebrow : 'Tasks · Prunus'}
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 44, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>
            {meta ? meta.title : 'Tasks'}
          </h1>
          {meta?.caption && (
            <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--text-secondary)', marginTop: 8, transform: 'rotate(-0.8deg)' }}>
              {meta.caption}
            </div>
          )}
          {list === 'upcoming' && (
            <Link
              to="/planning"
              style={{
                display: 'inline-block',
                marginTop: 10,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--text-tertiary)',
                textDecoration: 'underline',
              }}
            >
              → Planning board
            </Link>
          )}
        </div>
        {!list && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', transform: 'rotate(-1deg)' }}>
            <img src="assets/cherry/bloom.png" alt="Cherry blossom" style={{ height: 86, width: 'auto', objectFit: 'contain', filter: 'var(--shadow-drop-sm)' }} />
            <span
              style={{
                position: 'absolute',
                top: 40,
                left: '50%',
                width: 38,
                height: 11,
                marginLeft: -19,
                background: 'rgba(212,168,176,0.4)',
                backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 3px, transparent 3px 6px)',
                transform: 'rotate(3deg)',
                borderRadius: 1,
              }}
            />
            <span style={{ fontFamily: 'var(--font-hand)', fontSize: 15, color: 'var(--text-secondary)', marginTop: 4 }}>one petal falls per task done</span>
          </div>
        )}
      </div>

      <div style={{ height: 1, borderBottom: '1px dashed var(--border-default)', margin: '26px 0 30px' }} />

      {!list && (
        <div className="tasks-panels">
          <DomainsPanel />
          <AreasPanel domains={domains} />
          <ProjectsPanel domains={domains} />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim()) {
            const created = createTask({ title: title.trim(), dueAt: list === 'today' ? now.toISOString() : undefined })
            if (list === 'someday') setSomeday(created, true)
          }
          setTitle('')
        }}
        style={{ display: 'flex', gap: 10, margin: list ? '0 0 8px' : '24px 0 8px', maxWidth: 760 }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Quick add task…"
          style={{
            flex: 1,
            fontFamily: 'var(--font-ui)',
            fontSize: 14,
            background: 'var(--bg-surface)',
            border: '1px solid var(--line-card)',
            borderRadius: 999,
            padding: '11px 18px',
            outline: 'none',
            color: 'var(--text-primary)',
            boxShadow: 'inset 0 1px 2px rgba(60,52,38,0.08)',
          }}
        />
        <button type="submit" style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--text-on-accent)', fontFamily: 'inherit', fontSize: 13, padding: '10px 22px', borderRadius: 999, cursor: 'pointer', boxShadow: 'var(--shadow-cta)' }}>
          Add
        </button>
      </form>

      <div style={{ maxWidth: 760 }}>
        {groups.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '10px 0 0' }}>{emptyMessage}</p>
        ) : (
          groups.map((group) => (
            <div key={group.key}>
              <SectionHeader group={group} />
              {group.tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  highlighted={t.id === focusId || t.id === kbFocusedId}
                  selected={selected.has(t.id)}
                  onToggleSelect={() => toggleSelected(t.id)}
                  bulk={bulkActions}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {kbSnoozeTask && (
        <SnoozeMenu
          position={rowAnchor('task-', kbSnoozeTask.id)}
          onClose={() => setKbSnoozeId(null)}
          onSnooze={(until) => snoozeTask(kbSnoozeTask, until)}
          onSomeday={() => setSomeday(kbSnoozeTask, true)}
        />
      )}
      {kbProjectTask && (
        <ProjectPicker
          position={rowAnchor('task-', kbProjectTask.id)}
          projects={projects}
          domains={domains}
          currentProjectId={kbProjectTask.project_id}
          onSelect={(projectId, domainId) => setProject(kbProjectTask, projectId, domainId)}
          onClose={() => setKbProjectId(null)}
        />
      )}

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          onComplete={bulkComplete}
          onSnooze={(e) => setBulkSnoozePos({ x: e.clientX, y: e.clientY })}
          onToday={() => bulkSchedule(scheduleToday(), 'today')}
          onTomorrow={() => bulkSchedule(scheduleTomorrow(), 'tomorrow')}
          onMoveToProject={(e) => setBulkProjectPos({ x: e.clientX, y: e.clientY })}
          onDelete={bulkDelete}
          onClear={clearSelection}
        />
      )}
      {bulkSnoozePos && (
        <SnoozeMenu
          position={bulkSnoozePos}
          onClose={() => setBulkSnoozePos(null)}
          onSnooze={bulkSnooze}
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
