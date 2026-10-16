import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import type { Task } from '../../lib/types'
import { addTypedSubtask, subtaskHint } from '../command-bar/quickAdd'
import { cachedSubtasks } from './api'
import { SubtaskHintLine, SubtaskRow } from './TaskFields'
import { subCount } from './subtasks'
import { useSubtaskUi } from './subtaskStore'
import './taskSheet.css'

// Subtasks A in a list (Today, Tasks, a project or an area — Kai 2026-10-16): a parent's subtasks sit
// nested under its row, its meta line carries "1/3 ⌄" to fold them (remembered on this device), and
// the row's + (computer) or ⋯ → Add a subtask (phone) opens an add line at the end of them. Each one
// shows its own time (C), even when it's due another day than the list's.

const noEdit = (_field: string, write: () => void) => write()

/** "1/3 ⌄" on a parent's meta line — nothing on a task with no subtasks. */
export function SubtaskCount({ parent }: { parent: Task }) {
  const folded = useSubtaskUi((s) => s.folded.includes(parent.id))
  const toggle = useSubtaskUi((s) => s.toggle)
  const subs = cachedSubtasks(parent.id)
  if (subs.length === 0) return null
  const { done, total } = subCount(subs)
  return (
    <button
      type="button"
      className="kf-subcount"
      aria-expanded={!folded}
      aria-label={`${done} of ${total} subtasks done. ${folded ? 'Show' : 'Hide'} them`}
      onClick={(e) => {
        e.stopPropagation()
        toggle(parent.id)
      }}
    >
      {done}/{total}
      <Icon name="chevdown" size={14} />
    </button>
  )
}

/** The row's + (computer, shown on hover / focus): opens the add line under it. */
export function SubtaskAddButton({ parent }: { parent: Task }) {
  const setAdding = useSubtaskUi((s) => s.setAdding)
  return (
    <button
      type="button"
      className="kf-sub-add"
      aria-label={`Add a subtask to “${parent.title}”`}
      title="Add a subtask"
      onClick={(e) => {
        e.stopPropagation()
        setAdding(parent.id)
      }}
    >
      <Icon name="plus" size={18} />
    </button>
  )
}

/** Is the nest under this parent drawn (subtasks unfolded, or its add line open)? Its row then leaves
 * its bottom rule to the nest, so the parent and its subtasks read as one group. */
export function useNestOpen(parent: Task): boolean {
  const folded = useSubtaskUi((s) => s.folded.includes(parent.id))
  const adding = useSubtaskUi((s) => s.adding === parent.id)
  return adding || (!folded && cachedSubtasks(parent.id).length > 0)
}

/** The subtasks under a parent's row (unless folded), and the add line while it's open. `rule`: the
 * hairline the row would have drawn under itself. */
export function SubtaskNest({ parent, phone, rule }: { parent: Task; phone?: boolean; rule?: boolean }) {
  const folded = useSubtaskUi((s) => s.folded.includes(parent.id))
  const adding = useSubtaskUi((s) => s.adding === parent.id)
  if (!useNestOpen(parent)) return null
  return (
    <div className={`kf-nest${phone ? ' is-phone' : ''}${rule ? ' has-rule' : ''}`} data-nest={parent.id}>
      {!folded && cachedSubtasks(parent.id).map((s) => <SubtaskRow key={s.id} sub={s} edit={noEdit} dense={!phone} nested />)}
      {adding && <AddLine parent={parent} phone={phone} />}
    </div>
  )
}

/** Enter adds (through the one parse: "at 6pm" gives it a time) and keeps the line for the next one;
 * Esc, or leaving it empty, closes it. */
function AddLine({ parent, phone }: { parent: Task; phone?: boolean }) {
  const setAdding = useSubtaskUi((s) => s.setAdding)
  const [text, setText] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus({ preventScroll: false }), [])
  const hint = text.trim() ? subtaskHint(text) : null
  return (
    <>
      <label className="ts-sub is-nested">
        <span className="ts-box">
          <Icon name="plus" size={phone ? 20 : 16} />
        </span>
        <input
          ref={ref}
          className="ts-sub-add"
          value={text}
          placeholder="Add a subtask"
          aria-label={`Add a subtask to “${parent.title}”`}
          enterKeyHint="done"
          onChange={(e) => setText(e.target.value)}
          onBlur={() => !text.trim() && setAdding(null)}
          onKeyDown={(e) => {
            e.stopPropagation() // the list's keys stay with the list
            if (e.key === 'Escape') {
              e.preventDefault()
              setAdding(null)
            }
            if (e.key !== 'Enter') return
            e.preventDefault()
            if (addTypedSubtask(parent, text)) setText('')
          }}
        />
        {!phone && <span className="ts-sub-meta">Enter to add</span>}
      </label>
      {hint && <SubtaskHintLine hint={hint} />}
    </>
  )
}
