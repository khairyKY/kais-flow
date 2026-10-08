import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import {
  useTasks, rescheduleDue, setLabels, setSomeday, setRecurrence,
  setReminder, setDuration, toggleTop3, deleteTasksWithUndo, toggleTaskWithUndo,
} from '../tasks/api'
import { useTaskDraft } from '../tasks/useTaskDraft'
import { useCalendarEvents } from './api'
import { EmojiText } from '../../components/EmojiText'
import { MiniFocus } from '../focus/MiniFocus'
import { useAllInboxItems } from '../inbox/api'
import { githubUrl } from '../inbox/inboxDisplay'
import { useProjects } from '../projects/api'
import { useAreas } from '../areas/api'
import { localTimeKey, localToIso } from './eventTime'
import { localDateKey } from '../routines/streaks'
import { priorityColor, priorityFlag } from '../tasks/taskDisplay'
import { Select } from '../../components/Select'
import { useIsMobile } from '../../components/BottomSheet'
import { BackLink, Checkbox, KeyCombo, Toggle } from '../../components/kit'
import { FLabel, FHelp, DateInput, TimeInput } from './formFields'
import { writeRow } from '../../lib/outbox'
import type { Task } from '../../lib/types'

// ── Editor.dc.html 1a — task detail, the full page (popover's "Open full ↗"
// lands here). Sidebar/topbar are the shell's (AppLayout); this owns everything past the
// breadcrumb. Subtasks (1a's "Subtasks · 1 of 3") are children one level deep
// via tasks.parent_task_id (migration 0029) — hidden on a task that is itself
// a child, so the tree can't nest. On a phone a task is the task sheet over the page you were
// on (features/tasks/TaskSheet), so a cold /tasks/:id link lands on Tasks with the sheet open. ──

function taskCherryStage(task: Task): 'bud' | 'opening' | 'bloom' | 'fallen' {
  if (task.status === 'done') return 'fallen'
  if (task.someday) return 'bloom'
  if (task.scheduled_start) return 'opening'
  return 'bud'
}

const DURATION_CHIPS = [30, 45, 60, 90]
// Editor.dc.html 1a "30 min before due" — the labels name what they're before.
const REMINDER_OPTIONS = [
  { value: '', label: 'No reminder' },
  { value: '10', label: '10 min before due' },
  { value: '30', label: '30 min before due' },
  { value: '60', label: '1 hour before due' },
  { value: '1440', label: '1 day before due' },
]
const REPEAT_OPTIONS = [
  { value: '', label: "Doesn't repeat" },
  { value: 'FREQ=DAILY', label: '↻ Daily' },
  { value: 'FREQ=WEEKLY', label: '↻ Weekly' },
  { value: 'FREQ=MONTHLY', label: '↻ Monthly' },
]

export function TaskEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: tasks = [] } = useTasks()
  const { data: events = [] } = useCalendarEvents()
  const { data: inboxItems = [] } = useAllInboxItems()
  const { data: projects = [] } = useProjects()
  const { data: areas = [] } = useAreas()

  const task = tasks.find((t) => t.id === id)

  const draft = useTaskDraft(task)
  const { title, notes } = draft
  const [labelInput, setLabelInput] = useState('')
  const isMobile = useIsMobile()

  // Editor.dc.html 1a shows a ⌘⏎ hint next to Save — wire it so the hint is true.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && task) { e.preventDefault(); handleSave() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (isMobile) return <Navigate to={`/tasks?task=${id}`} replace />

  if (!task) {
    return (
      <div>
        <BackLink to="/tasks">Tasks</BackLink>
        <p style={{ marginTop: 24, color: 'var(--ink-muted)' }}>That task isn't here — it may have been deleted, or is still loading.</p>
      </div>
    )
  }

  const dueDate = task.due_at ? localDateKey(new Date(task.due_at)) : ''
  const dueTime = task.due_at ? localTimeKey(new Date(task.due_at)) : ''
  const reminderOffset = task.due_at && task.reminder_at ? String(Math.round((new Date(task.due_at).getTime() - new Date(task.reminder_at).getTime()) / 60000)) : ''
  const linkedEvent = events.find((e) => e.task_id === task.id)
  const linkedInbox = inboxItems.find((i) => i.filed_task_id === task.id)
  const issueUrl = githubUrl(task.external_ref?.url) // a filed GitHub issue (P6 step 4)
  const project = task.project_id ? projects.find((p) => p.id === task.project_id) : null
  const area = task.area_id ? areas.find((a) => a.id === task.area_id) : null
  const stage = taskCherryStage(task)
  const statusLabel = task.status === 'done' ? 'Done' : task.status === 'cancelled' ? 'Cancelled' : 'Open'
  // Children come straight from the tasks cache — no extra query needed.
  const subtasks = tasks.filter((t) => t.parent_task_id === task.id)
  const subtasksDone = subtasks.filter((t) => t.status === 'done').length
  const { saveTitle, saveNotes } = draft

  // Kai 2026-10-07 (a task given a time is on the calendar): setting the time places it there; a new
  // date keeps a task that's on the calendar on it (at its due time); otherwise a date is just a date.
  function handleDueChange(date: string, time: string, timed = !!linkedEvent) {
    rescheduleDue(task!, date ? localToIso(date, time || '09:00') : null, timed)
  }

  function handleProjectOrArea(value: string) {
    const p = projects.find((x) => x.id === value)
    if (p) writeRow('tasks', { ...task!, project_id: p.id, domain_id: p.domain_id, area_id: null })
    else writeRow('tasks', { ...task!, area_id: value || null, project_id: null, domain_id: null })
  }

  function handleReminderChange(offsetStr: string) {
    if (!offsetStr || !task!.due_at) { setReminder(task!, null); return }
    setReminder(task!, new Date(new Date(task!.due_at).getTime() - Number(offsetStr) * 60000).toISOString())
  }

  function addLabel() {
    if (!labelInput.trim()) return
    setLabels(task!, [...task!.labels, labelInput.trim()])
    setLabelInput('')
  }

  function handleDelete() {
    deleteTasksWithUndo([task!])
    navigate('/tasks')
  }

  function handleSave() {
    saveTitle()
    saveNotes()
    navigate('/tasks')
  }

  return (
    <div>
      <style>{`
        .te-body { display: grid; grid-template-columns: minmax(0, 1fr) 316px; gap: 36px; margin-top: 26px; }
        .te-sub-add::placeholder { color: var(--ink-faint); }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <BackLink to="/tasks">Tasks</BackLink>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Created {new Date(task.created_at).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
          {task.updated_at !== task.created_at && ` · edited ${new Date(task.updated_at).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginTop: 24 }}>
        <Checkbox
          checked={task.status === 'done'}
          onChange={() => toggleTaskWithUndo(task)}
          size={22}
          style={{ borderRadius: 6, marginTop: 9, ...(task.status === 'done' ? { background: 'var(--sig-done)' } : {}) }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999, background: task.status === 'done' ? 'color-mix(in srgb, var(--check-border) 30%, transparent)' : 'color-mix(in srgb, var(--acc-sage) 18%, transparent)', color: task.status === 'done' ? 'var(--ink-faint)' : 'var(--acc-sage-text)' }}>{statusLabel}</span>
            {linkedInbox?.kind === 'voice' && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999, border: '1px solid var(--line-solid)', color: 'var(--ink-faint)' }}>via voice</span>
            )}
            {issueUrl && (
              <a href={issueUrl} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999, border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', textDecoration: 'none' }}>View issue ↗</a>
            )}
            {task.priority != null && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 999, background: 'color-mix(in srgb, var(--acc-gold-warm) 22%, transparent)', color: priorityColor(task.priority) ?? 'var(--acc-gold)' }}>
                {priorityFlag(task.priority)} {task.priority === 1 ? 'Critical' : task.priority === 2 ? 'High' : 'Medium'}
              </span>
            )}
          </div>
          <input
            value={title}
            onChange={(e) => draft.setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            style={{ width: '100%', margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 34, lineHeight: 1.15, letterSpacing: '-0.01em', color: 'var(--ink-body)', background: 'none', border: 'none', outline: 'none', padding: 0 }}
          />
          <div className="kf-help" style={{ marginTop: 6 }}>click the title to edit · saves when you leave it</div>
        </div>
        <img src={`/ds/assets/cherry/${stage}.png`} alt="" style={{ height: 52, flex: 'none', filter: 'var(--shadow-drop-sm)', marginTop: 2 }} />
        <button
          type="button"
          onClick={() => toggleTop3(task)}
          title={task.top3 ? 'Remove from Top-3' : 'Add to Top-3'}
          style={{ color: 'var(--acc-terra)', fontSize: 22, flex: 'none', marginTop: 6, background: 'none', border: 'none', cursor: 'pointer', opacity: task.top3 ? 1 : 0.3 }}
        >★</button>
      </div>

      <div className="te-body">
        <div style={{ minWidth: 0 }}>
          <FLabel>Notes</FLabel>
          <textarea
            value={notes}
            onChange={(e) => draft.setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder="Anything worth remembering when you sit down to do it…"
            style={{ marginTop: 8, width: '100%', minHeight: 150, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '14px 16px', fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-body)', fontFamily: 'var(--font-ui)', resize: 'vertical' }}
          />
          <FHelp>plain text · autosaves on blur</FHelp>

          {/* Subtasks — Editor.dc.html 1a:332. Hidden on a child task: one level deep only. */}
          {!task.parent_task_id && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '26px 0 10px' }}>
                <span style={{ ...FLabelInline }}>Subtasks{subtasks.length > 0 && ` · ${subtasksDone} of ${subtasks.length}`}</span>
                <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {subtasks.map((c) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 2px', borderBottom: '1px dashed var(--line-dashed)' }}>
                    <Checkbox
                      checked={c.status === 'done'}
                      onChange={() => toggleTaskWithUndo(c)}
                      size={16}
                      style={{ borderRadius: 4, ...(c.status === 'done' ? { background: 'var(--sig-done)' } : {}) }}
                    />
                    <span style={{ fontSize: 13.5, color: c.status === 'done' ? 'var(--ink-hairline)' : 'var(--ink-body)', textDecoration: c.status === 'done' ? 'line-through' : 'none' }}><EmojiText text={c.title} /></span>
                    {c.duration_min != null && (
                      <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>
                        {c.duration_min >= 60 ? `${Math.floor(c.duration_min / 60)}h${c.duration_min % 60 ? c.duration_min % 60 + 'm' : ''}` : `${c.duration_min}m`}
                      </span>
                    )}
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px' }}>
                  <span style={{ width: 16, height: 16, border: '1.5px dashed var(--ink-hairline)', borderRadius: 4, flex: 'none', opacity: 0.6 }} />
                  <input
                    className="te-sub-add"
                    value={draft.subtask}
                    onChange={(e) => draft.setSubtask(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); draft.addSubtask() } }}
                    placeholder="Add a subtask…"
                    style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--ink-body)', fontFamily: 'var(--font-ui)', background: 'none', border: 'none', outline: 'none', padding: 0 }}
                  />
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>enter to add</span>
                </div>
              </div>
            </>
          )}

          {(linkedEvent || linkedInbox) && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '26px 0 10px' }}>
                <span style={{ ...FLabelInline }}>Linked</span>
                <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--line-dashed)' }} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {linkedEvent && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: 'color-mix(in srgb, var(--acc-lavender) 16%, transparent)', borderLeft: '3px solid var(--acc-lavender)', borderRadius: 3, padding: '9px 13px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--acc-lavender-text)' }}>
                      Block · {new Date(linkedEvent.starts_at).toLocaleDateString('en-US', { weekday: 'short' })} {localTimeKey(new Date(linkedEvent.starts_at))}–{localTimeKey(new Date(linkedEvent.ends_at))}
                    </span>
                    <Link to="/calendar" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--acc-lavender-deep)', textDecoration: 'none' }}>view on calendar →</Link>
                  </span>
                )}
                {linkedInbox && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: 'color-mix(in srgb, var(--acc-hydrangea) 14%, transparent)', borderLeft: '3px solid var(--acc-hydrangea)', borderRadius: 3, padding: '9px 13px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--acc-hydrangea-deep)' }}>
                      Capture · {linkedInbox.kind}, {new Date(linkedInbox.created_at).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                    <Link to="/inbox" style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--acc-hydrangea-deep)', textDecoration: 'none' }}>open in inbox →</Link>
                  </span>
                )}
              </div>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 44, paddingTop: 16, borderTop: '1px dashed var(--line-dashed)', flexWrap: 'wrap', gap: 12 }}>
            <div>
              {/* Flow Audit §4: no confirm — it goes to Trash with an Undo. */}
              <span onClick={handleDelete} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}>Delete task</span>
              <FHelp>to Trash, with its calendar block · Undo</FHelp>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {/* J-17 / 2026-09-26 decision: every shortcut hint is the kit's keycap (was hand-rolled mono text). */}
              <KeyCombo keys={['⌘', '⏎']} size="sm" />
              <button type="button" onClick={handleSave} style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', font: 'inherit', fontSize: 13, padding: '10px 22px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* R4-D3 (2026-07-20 ruling): a Focus entry point right on the task, with the tiny
              pomodoro beside it — same session as /focus, so it keeps running either way.
              Only for open tasks: nothing to focus on once it's done. */}
          {task.status === 'todo' && <MiniFocus task={task} />}

          <div style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: '16px 17px 15px', transform: 'rotate(0.4deg)' }}>
            {/* washi tape — Editor.dc.html 1a:382 */}
            <span style={{ position: 'absolute', top: -9, left: 24, width: 56, height: 16, background: 'color-mix(in srgb, var(--acc-moss) 40%, transparent)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.3) 0 4px,transparent 4px 8px)', transform: 'rotate(-2deg)', borderRadius: 1 }} />
            <div style={{ ...FLabelInline, marginBottom: 12 }}>Organize</div>
            <FLabel style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>Project or area</FLabel>
            <Select
              value={project?.id ?? area?.id ?? ''}
              onChange={handleProjectOrArea}
              options={[{ value: '', label: '—' }, ...projects.map((p) => ({ value: p.id, label: p.name })), ...areas.map((a) => ({ value: a.id, label: a.name }))]}
              ariaLabel="Project or area"
              style={{ fontSize: 13, padding: '8px 10px', width: '100%' }}
            />
            <FHelp>a task lives in a project or an area, not both</FHelp>
            <FLabel style={{ fontSize: 'var(--fs-meta)', marginTop: 12 }}>Labels</FLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {task.labels.map((l) => (
                <span key={l} style={chipStyle}>
                  *{l} <span onClick={() => setLabels(task, task.labels.filter((x) => x !== l))} style={{ cursor: 'pointer' }}>✕</span>
                </span>
              ))}
              <input
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLabel() } }}
                onBlur={addLabel}
                placeholder="+ label"
                style={{ ...chipStyle, border: '1px dashed var(--ink-hairline)', color: 'var(--ink-faint)', background: 'none', width: 70, outline: 'none' }}
              />
            </div>
          </div>

          <div style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: '16px 17px 15px', transform: 'rotate(-0.4deg)' }}>
            {/* washi tape — Editor.dc.html 1a:398 */}
            <span style={{ position: 'absolute', top: -9, right: 26, width: 52, height: 16, background: 'color-mix(in srgb, var(--acc-lavender) 42%, transparent)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.3) 0 4px,transparent 4px 8px)', transform: 'rotate(2deg)', borderRadius: 1 }} />
            <div style={{ ...FLabelInline, marginBottom: 12 }}>Schedule</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8 }}>
              <div>
                <FLabel style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>Due date</FLabel>
                <DateInput value={dueDate} title="Due date" onChange={(v) => handleDueChange(v, dueTime || '09:00')} />
              </div>
              <div>
                <FLabel style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>Due time</FLabel>
                <TimeInput value={dueTime} onChange={(v) => handleDueChange(dueDate || localDateKey(new Date()), v, true)} />
              </div>
            </div>
            <FLabel style={{ fontSize: 'var(--fs-meta)', marginTop: 12 }}>Duration</FLabel>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DURATION_CHIPS.map((m) => (
                <span key={m} onClick={() => setDuration(task, m)} style={{ ...chipStyle, cursor: 'pointer', ...(task.duration_min === m ? { background: 'color-mix(in srgb, var(--acc-lavender) 22%, transparent)', color: 'var(--acc-lavender-text)', border: 'none' } : {}) }}>
                  {m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? m % 60 + 'm' : ''}` : `${m}m`}
                </span>
              ))}
            </div>
            <FLabel style={{ fontSize: 'var(--fs-meta)', marginTop: 12 }}>Reminder</FLabel>
            <Select value={reminderOffset} onChange={handleReminderChange} options={REMINDER_OPTIONS} ariaLabel="Reminder" style={{ fontSize: 13, padding: '8px 10px', width: '100%' }} />
            <FHelp>sends a push · needs a due time {dueTime ? '✓' : ''}</FHelp>
            <FLabel style={{ fontSize: 'var(--fs-meta)', marginTop: 12 }}>Repeat</FLabel>
            <Select value={task.recurrence_rule ?? ''} onChange={(v) => setRecurrence(task, v || null)} options={REPEAT_OPTIONS} ariaLabel="Repeat" style={{ fontSize: 13, padding: '8px 10px', width: '100%' }} />
            <FHelp>recurring tasks roll forward on done</FHelp>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--ink-body)' }}>Someday</div>
                <FHelp style={{ marginTop: 2 }}>rests in the fern · leaves every list</FHelp>
              </div>
              <Toggle on={task.someday} label="Someday" onToggle={() => setSomeday(task, !task.someday)} />
            </div>
          </div>

          <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--ink-muted)', transform: 'rotate(-1deg)', padding: '0 6px' }}>every field saves quietly — no dialog unless something gets deleted ✿</div>
        </div>
      </div>

    </div>
  )
}

const FLabelInline = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: 'var(--ink-faint)' }

const chipStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--fs-meta)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  padding: '5px 9px',
  borderRadius: 3,
  border: '1px solid var(--line-solid)',
  color: 'var(--ink-muted)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
}
