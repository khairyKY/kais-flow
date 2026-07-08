import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useDomains, createDomain, renameDomain, mergeDomain } from '../domains/api'
import { useProjects, createProject } from '../projects/api'
import {
  useTasks,
  createTask,
  completeTask,
  uncompleteTask,
  toggleTop3,
  snoozeTask,
  deleteTask,
  setRecurrence,
  setReminder,
} from './api'
import type { Domain, Task } from '../../lib/types'
import { useAreas, createArea, renameArea } from '../areas/api'

function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
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
          <select value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)} style={FIELD_STYLE}>
            <option value="">…</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <span>into</span>
          <select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} style={FIELD_STYLE}>
            <option value="">…</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
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
        <select value={domainId} onChange={(e) => setDomainId(e.target.value)} style={{ border: '1px solid var(--border-default)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 12.5, padding: '7px 10px', borderRadius: 'var(--radius-input)' }}>
          <option value="">no domain</option>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
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
        <select value={domainId} onChange={(e) => setDomainId(e.target.value)} style={FIELD_STYLE}>
          <option value="">no domain</option>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button type="submit" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 12.5, padding: '7px 14px', borderRadius: 999, cursor: 'pointer' }}>
          Add
        </button>
      </form>
    </div>
  )
}

function TaskRow({ task, highlighted }: { task: Task; highlighted?: boolean }) {
  const done = task.status === 'done'
  return (
    <div
      id={`task-${task.id}`}
      className="task-row"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        padding: '12px 0',
        borderBottom: '1px dashed var(--line-dashed)',
        boxShadow: highlighted ? '0 0 0 3px rgba(138,154,126,0.28)' : undefined,
        opacity: done ? 0.55 : 1,
      }}
    >
      {done ? (
        <span
          style={{
            width: 17,
            height: 17,
            borderRadius: 5,
            background: 'var(--text-primary)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-on-accent)',
            fontSize: 11,
            flex: 'none',
            marginTop: 2,
            cursor: 'pointer',
          }}
          onClick={() => uncompleteTask(task)}
        >
          ✓
        </span>
      ) : (
        <span
          onClick={() => completeTask(task)}
          style={{ width: 17, height: 17, border: '1.5px solid var(--line-sidebar)', borderRadius: 5, flex: 'none', marginTop: 2, cursor: 'pointer' }}
        />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, color: done ? 'var(--ink-hairline)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none' }}>
            {task.title}
          </span>
          {!done && task.scheduled_start && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--acc-lavender-deep)',
                background: 'rgba(168,160,190,0.18)',
                border: '1px solid rgba(168,160,190,0.5)',
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              {new Date(task.scheduled_start).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          {!done && task.recurrence_rule && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>↻</span>}
        </div>
      </div>

      {done ? (
        <div className="task-row-controls" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
          <img src="assets/cherry/fallen.png" alt="" style={{ height: 22, width: 'auto', opacity: 0.7 }} />
          <span style={{ fontFamily: 'var(--font-hand)', fontSize: 14, color: 'var(--ink-hairline)' }}>a petal fell</span>
        </div>
      ) : (
        <div className="task-row-controls" style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 'none' }}>
          <span onClick={() => toggleTop3(task)} title="Top-3" style={{ color: task.top3 ? 'var(--acc-terra)' : 'var(--line-sidebar)', fontSize: 16, lineHeight: 1, cursor: 'pointer' }}>
            {task.top3 ? '★' : '☆'}
          </span>
          <select
            value={task.recurrence_rule ?? ''}
            onChange={(e) => setRecurrence(task, e.target.value || null)}
            title="Repeat"
            style={{ fontFamily: 'inherit', fontSize: 11, background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '3px 6px', color: 'var(--text-secondary)' }}
          >
            <option value="">no repeat</option>
            <option value="FREQ=DAILY">daily</option>
            <option value="FREQ=WEEKLY">weekly</option>
            <option value="FREQ=MONTHLY">monthly</option>
          </select>
          {!done && (
            <select
              value={task.reminder_at || ''}
              onChange={(e) => {
                const val = e.target.value
                if (!val) { setReminder(task, null); return }
                const base = task.due_at || task.scheduled_start
                if (!base) return
                const offset = parseInt(val, 10)
                const reminderAt = new Date(new Date(base).getTime() - offset * 60 * 1000).toISOString()
                setReminder(task, reminderAt)
              }}
              title="Remind me"
              style={{ fontFamily: 'inherit', fontSize: 11, background: task.reminder_at ? 'rgba(181,101,74,0.12)' : 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '3px 6px', color: 'var(--text-secondary)', maxWidth: 100 }}
            >
              <option value="">no reminder</option>
              <option value="0" disabled={!task.due_at && !task.scheduled_start}>at due time</option>
              <option value="5" disabled={!task.due_at && !task.scheduled_start}>5 min before</option>
              <option value="15" disabled={!task.due_at && !task.scheduled_start}>15 min before</option>
              <option value="30" disabled={!task.due_at && !task.scheduled_start}>30 min before</option>
              <option value="60" disabled={!task.due_at && !task.scheduled_start}>1 hr before</option>
            </select>
          )}
          <button type="button" onClick={() => snoozeTask(task, addDays(1))} style={{ border: 'none', background: 'none', color: 'var(--text-tertiary)', fontFamily: 'inherit', fontSize: 11.5, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
            snooze 1d
          </button>
          <button
            type="button"
            onClick={() => {
              const hasBlock = Boolean(task.scheduled_start)
              const message = hasBlock
                ? `Delete "${task.title}"? This also removes its scheduled calendar block.`
                : `Delete "${task.title}"?`
              if (window.confirm(message)) deleteTask(task)
            }}
            style={{ border: 'none', background: 'none', color: 'var(--acc-terra)', fontFamily: 'inherit', fontSize: 11.5, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
          >
            delete
          </button>
        </div>
      )}
    </div>
  )
}

export function TasksPage() {
  const { data: domains = [] } = useDomains()
  const { data: tasks = [] } = useTasks()
  const [title, setTitle] = useState('')
  const [searchParams] = useSearchParams()
  const focusId = searchParams.get('focus')

  const active = tasks.filter((t) => t.status !== 'cancelled')

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
          .task-row { flex-wrap: wrap; }
          .task-row-controls { flex-basis: 100%; padding-left: 31px; margin-top: 6px; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 9 }}>
            Tasks · Prunus
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 44, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>Tasks</h1>
        </div>
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
      </div>

      <div style={{ height: 1, borderBottom: '1px dashed var(--border-default)', margin: '26px 0 30px' }} />

      <div className="tasks-panels">
        <DomainsPanel />
        <AreasPanel domains={domains} />
        <ProjectsPanel domains={domains} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim()) createTask({ title: title.trim() })
          setTitle('')
        }}
        style={{ display: 'flex', gap: 10, margin: '24px 0 8px', maxWidth: 760 }}
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
        {active.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '10px 0 0' }}>
            No tasks yet. Type one above, or press ⌘K and just say what's on your mind.
          </p>
        ) : (
          active.map((t) => <TaskRow key={t.id} task={t} highlighted={t.id === focusId} />)
        )}
      </div>
    </div>
  )
}
