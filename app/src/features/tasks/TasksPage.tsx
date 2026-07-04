import { useState } from 'react'
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
} from './api'
import type { Domain, Task } from '../../lib/types'

function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function DomainsPanel() {
  const { data: domains = [] } = useDomains()
  const [name, setName] = useState('')
  const [mergeFrom, setMergeFrom] = useState('')
  const [mergeInto, setMergeInto] = useState('')

  return (
    <div className="space-y-2 rounded border p-3">
      <h2 className="text-sm font-semibold">Domains</h2>
      <ul className="space-y-1 text-sm">
        {domains.map((d) => (
          <li key={d.id} className="flex items-center gap-2">
            <input
              defaultValue={d.name}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== d.name) renameDomain(d, e.target.value.trim())
              }}
              className="w-full rounded border px-2 py-1"
            />
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) createDomain(name.trim())
          setName('')
        }}
        className="flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New domain"
          className="w-full rounded border px-2 py-1 text-sm"
        />
        <button type="submit" className="rounded bg-slate-900 px-2 py-1 text-sm text-white">
          Add
        </button>
      </form>
      {domains.length > 1 && (
        <div className="flex items-center gap-2 text-xs">
          <select value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)} className="rounded border px-1 py-1">
            <option value="">merge…</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <span>into</span>
          <select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} className="rounded border px-1 py-1">
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
            className="rounded bg-slate-200 px-2 py-1 disabled:opacity-40"
          >
            Merge
          </button>
        </div>
      )}
    </div>
  )
}

function ProjectsPanel({ domains }: { domains: Domain[] }) {
  const { data: projects = [] } = useProjects()
  const [name, setName] = useState('')
  const [domainId, setDomainId] = useState('')

  return (
    <div className="space-y-2 rounded border p-3">
      <h2 className="text-sm font-semibold">Projects</h2>
      <ul className="space-y-1 text-sm">
        {projects.map((p) => (
          <li key={p.id}>
            {p.name} <span className="text-slate-400">— {domains.find((d) => d.id === p.domain_id)?.name ?? 'no domain'}</span>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) createProject(name.trim(), domainId || null)
          setName('')
        }}
        className="flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New project"
          className="w-full rounded border px-2 py-1 text-sm"
        />
        <select value={domainId} onChange={(e) => setDomainId(e.target.value)} className="rounded border px-1 py-1 text-sm">
          <option value="">no domain</option>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded bg-slate-900 px-2 py-1 text-sm text-white">
          Add
        </button>
      </form>
    </div>
  )
}

function TaskRow({ task }: { task: Task }) {
  return (
    <li className="flex items-center gap-2 rounded border px-2 py-1 text-sm">
      <input
        type="checkbox"
        checked={task.status === 'done'}
        onChange={() => (task.status === 'done' ? uncompleteTask(task) : completeTask(task))}
      />
      <span className={task.status === 'done' ? 'flex-1 line-through text-slate-400' : 'flex-1'}>
        {task.title}
        {task.scheduled_start && (
          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
            {new Date(task.scheduled_start).toLocaleString([], {
              weekday: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        )}
      </span>
      <button type="button" onClick={() => toggleTop3(task)} title="Top-3" className={task.top3 ? 'text-amber-500' : 'text-slate-300'}>
        ★
      </button>
      <select
        value={task.recurrence_rule ?? ''}
        onChange={(e) => setRecurrence(task, e.target.value || null)}
        title="Repeat"
        className="rounded border px-1 py-0.5 text-xs text-slate-500"
      >
        <option value="">no repeat</option>
        <option value="FREQ=DAILY">daily</option>
        <option value="FREQ=WEEKLY">weekly</option>
        <option value="FREQ=MONTHLY">monthly</option>
      </select>
      <button type="button" onClick={() => snoozeTask(task, addDays(1))} className="text-xs text-slate-500">
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
        className="text-xs text-red-500"
      >
        delete
      </button>
    </li>
  )
}

export function TasksPage() {
  const { data: domains = [] } = useDomains()
  const { data: tasks = [] } = useTasks()
  const [title, setTitle] = useState('')

  const active = tasks.filter((t) => t.status !== 'cancelled')

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Tasks</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <DomainsPanel />
        <ProjectsPanel domains={domains} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (title.trim()) createTask({ title: title.trim() })
          setTitle('')
        }}
        className="flex gap-2"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Quick add task…"
          className="w-full rounded border px-2 py-1"
        />
        <button type="submit" className="rounded bg-slate-900 px-3 py-1 text-white">
          Add
        </button>
      </form>
      <ul className="space-y-1">
        {active.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </ul>
    </div>
  )
}
