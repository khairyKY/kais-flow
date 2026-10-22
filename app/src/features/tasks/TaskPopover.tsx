import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { Float } from '../../components/Float'
import { Checkbox, Star } from '../../components/kit'
import { useEscapeStack } from '../../lib/overlayStack'
import { uiZoom } from '../../lib/uiScale'
import type { Task } from '../../lib/types'
import { deleteTasksWithUndo, toggleTaskWithUndo, toggleTop3, useTasks } from './api'
import { taskSearch, type TaskAnchor } from './openTask'
import { SubtaskList, TaskChips, useTaskControls } from './TaskFields'
import { subtasksOf } from './subtasks'
import { useTaskDraft } from './useTaskDraft'
import './taskSheet.css'

// ── The desktop task detail popover (Overlays.dc.html "Task detail · Enter · expands"): a click on a
// task row opens it under the row — box, title, star; notes; the chips; its subtasks; Delete · Open full ↗. Every
// edit writes at once (the same controls as the phone sheet, ./TaskFields); Esc, a click outside or a
// scroll behind closes it; Enter (or Open full ↗) expands to the editor page, /tasks/:id. ──

const WIDTH = 300
const GAP = 6
const EDGE = 8

/** Where the popover sits (layout px): under the row, its left edge past the row's checkbox; over the
 * row when there's no room below. It never covers its own row: with room on neither side it takes the
 * roomier one and scrolls inside (`maxHeight`). */
export function placeUnderRow(row: { left: number; top: number; bottom: number }, size: { width: number; height: number }, view: { width: number; height: number }): { left: number; top: number; maxHeight: number } {
  const left = Math.max(EDGE, Math.min(row.left + 28, view.width - size.width - EDGE))
  const roomBelow = view.height - EDGE - (row.bottom + GAP)
  const roomAbove = row.top - GAP - EDGE
  if (size.height <= roomBelow || roomBelow >= roomAbove) return { left, top: row.bottom + GAP, maxHeight: Math.max(roomBelow, 120) }
  return { left, top: Math.max(EDGE, row.top - GAP - size.height), maxHeight: roomAbove }
}

const MONO: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer' }

export function TaskPopover({ id, anchor }: { id: string; anchor: TaskAnchor }) {
  const navigate = useNavigate()
  const tasksQuery = useTasks()
  const task = tasksQuery.data?.find((t) => t.id === id)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null)
  const commit = useRef<() => void>(() => {})

  /** Leaves `?task=` (replace: openTask didn't push) — after the typed fields have written. */
  const close = () => {
    commit.current()
    void navigate({ pathname: window.location.pathname, search: taskSearch(null) }, { replace: true })
    if (anchor.el instanceof HTMLElement && anchor.el.isConnected) anchor.el.focus({ preventScroll: true })
  }
  const expand = () => {
    commit.current()
    void navigate({ pathname: window.location.pathname, search: taskSearch(null) }, { replace: true })
    void navigate(`/tasks/${id}`)
  }
  const closeRef = useRef(close)
  closeRef.current = close
  useEscapeStack(true, close)

  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    const inside = (t: EventTarget | null) => t instanceof Node && (!!ref.current?.contains(t) || anchor.el.contains(t))
    const onDown = (e: MouseEvent) => {
      if (!inside(e.target)) closeRef.current()
    }
    // A scroll behind moves the row away from the popover hanging off it (the menus close the same way).
    const onScroll = (e: Event) => {
      if (!(e.target instanceof Node && ref.current?.contains(e.target))) closeRef.current()
    }
    const onResize = () => closeRef.current()
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [anchor.el])

  // Placed from its measured size before paint (rects are visual px, `fixed` offsets layout px). The
  // height is the content's own (scrollHeight + border), so a capped popover doesn't re-place itself.
  useLayoutEffect(() => { // eslint-disable-line react-hooks/exhaustive-deps -- re-measured every render; an unchanged place bails out
    const el = ref.current
    if (!el) return
    const z = uiZoom()
    const r = el.getBoundingClientRect()
    const row = { left: anchor.rect.left / z, top: anchor.rect.top / z, bottom: anchor.rect.bottom / z }
    const next = placeUnderRow(row, { width: r.width / z, height: el.scrollHeight + 2 }, { width: window.innerWidth / z, height: window.innerHeight / z })
    setPos((p) => (p && p.left === next.left && p.top === next.top && p.maxHeight === next.maxHeight ? p : next))
  })

  return (
    <Float>
      <div
        ref={ref}
        role="dialog"
        aria-label={task ? `Task: ${task.title}` : 'Task'}
        tabIndex={-1}
        className="kf-pop tp-pop"
        style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, maxHeight: pos?.maxHeight, width: WIDTH }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') return // the overlay stack's
          e.stopPropagation() // the list's keys (j/k, 1/2/3, #) stay with the list
          if (e.key === 'Enter' && e.target === e.currentTarget) {
            e.preventDefault()
            expand()
          }
        }}
      >
        {task ? (
          <Body task={task} subs={task.parent_task_id ? null : subtasksOf(tasksQuery.data ?? [], task.id)} commit={commit} onDelete={() => { close(); deleteTasksWithUndo([task]) }} onExpand={expand} />
        ) : tasksQuery.isPending ? (
          <div className="ts-skel" role="status" aria-label="Loading" aria-busy="true" style={{ paddingTop: 0 }}>
            <div><span style={{ width: 19, height: 19, borderRadius: 'var(--radius-check)', flex: 'none' }} /><span style={{ flex: 1, height: 17 }} /></div>
            <span style={{ width: '70%', height: 12 }} />
            <div><span className="is-pill" style={{ width: 80, height: 24 }} /><span className="is-pill" style={{ width: 64, height: 24 }} /></div>
          </div>
        ) : (
          <div style={{ fontSize: 'var(--fs-body-s)', color: 'var(--ink-muted)' }}>
            This task was deleted on another device.
            <div className="tp-foot">
              <span />
              <button type="button" style={{ ...MONO, color: 'var(--ink-faint)' }} onClick={close}>Close</button>
            </div>
          </div>
        )}
      </div>
    </Float>
  )
}

function Body({ task: t, subs, commit, onDelete, onExpand }: { task: Task; subs: Task[] | null; commit: { current: () => void }; onDelete: () => void; onExpand: () => void }) {
  const draft = useTaskDraft(t)
  const controls = useTaskControls(t)
  const done = t.status === 'done' || !!t.completed_at
  // The typed fields write when they're left — and when the popover goes, however it goes.
  commit.current = () => {
    draft.saveTitle()
    draft.saveNotes()
  }
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <Checkbox checked={done} size={19} label={t.title} onChange={() => toggleTaskWithUndo(t)} style={{ marginTop: 3 }} />
        <textarea
          className={`tp-title${done ? ' is-done' : ''}`}
          rows={1}
          value={draft.title}
          aria-label="Title"
          onChange={(e) => draft.setTitle(e.target.value)}
          onBlur={draft.saveTitle}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            draft.saveTitle()
            e.currentTarget.closest<HTMLElement>('[role="dialog"]')?.focus() // a second Enter expands
          }}
        />
        <Star on={t.top3} label={t.title} onChange={() => toggleTop3(t)} style={{ margin: '-12px -14px -12px -8px' }} />
      </div>
      <textarea className="tp-notes" value={draft.notes} placeholder="Add notes" aria-label="Notes" onChange={(e) => draft.setNotes(e.target.value)} onBlur={draft.saveNotes} />
      <TaskChips task={t} controls={controls} />
      {/* Subtasks A + C (Kai 2026-10-16): the popover has its subtasks — open full is no longer the way to add one. */}
      {subs && <SubtaskList subs={subs} draft={draft} edit={controls.edit} dense />}
      <div className="tp-foot">
        <button type="button" style={{ ...MONO, color: 'var(--acc-terra)' }} onClick={onDelete}>Delete</button>
        <button type="button" style={{ ...MONO, color: 'var(--ink-faint)' }} onClick={onExpand} title="Open full (Enter)">Open full ↗</button>
      </div>
      {controls.menu}
    </>
  )
}
