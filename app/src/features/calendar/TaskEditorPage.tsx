import { useEffect, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { useTasks, planWithUndo, editWithUndo, setSomeday, toggleTop3, deleteTasksWithUndo, toggleTaskWithUndo } from '../tasks/api'
import { useTaskDraft } from '../tasks/useTaskDraft'
import { PhotoSource, SubtaskList, TaskMoreMenu, anchorUnder, useTaskControls } from '../tasks/TaskFields'
import { remindChip, repeatLabel, dayWord } from '../tasks/taskSheetMath'
import { listState } from '../journal/journalDay'
import { deleteEventWithUndo, useCalendarEvents } from './api'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import { MiniFocus } from '../focus/MiniFocus'
import { useAllInboxItems } from '../inbox/api'
import { linkLabel, taskLink } from '../../lib/links'
import { zoneTimeKey, zoneToIso } from './eventTime'
import { zoneDateKey } from '../../lib/dateShortcuts'
import { useAppZone } from '../../lib/appZone'
import { useOnline } from '../../lib/useOnline'
import { DURATIONS, dayShort, durationLabel } from '../../components/pickerMath'
import { priorityColor, priorityFlag } from '../tasks/taskDisplay'
import { useIsMobile } from '../../components/BottomSheet'
import { EmptyState, ErrorCard, OfflineChip, Skeleton } from '../../components/States'
import { BackLink, Checkbox, KeyCombo, Segmented, Toggle } from '../../components/kit'
import { FLabel, FHelp, DateInput, TimeInput } from './formFields'
import type { Task } from '../../lib/types'

// ── Editor.dc.html 1a — task detail, the full page (the popover's "Open full ↗" lands here).
// Sidebar/topbar are the shell's (AppLayout); this owns everything past the breadcrumb. Its fields
// open the same pickers as the phone task sheet and the desktop popover (features/tasks/TaskFields:
// Plan, Move to…, Priority, Repeat + Custom…, Remind, Duration, the ⋯ list, the subtask rows), so the
// three can't drift apart. Subtasks (1a's "Subtasks · 1 of 3") are children one level deep via
// tasks.parent_task_id (migration 0029) — hidden on a task that is itself a child. Days and times are
// the user's (app_settings.timezone), not the device's. On a phone a task is the task sheet over the
// page you were on (features/tasks/TaskSheet), so a cold /tasks/:id link lands on Tasks with it open. ──

function taskCherryStage(task: Task): 'bud' | 'opening' | 'bloom' | 'fallen' {
  if (task.status === 'done') return 'fallen'
  if (task.someday) return 'bloom'
  if (task.scheduled_start) return 'opening'
  return 'bud'
}

const PRIORITIES = [
  { value: 0, label: 'None' },
  { value: 3, label: '!' },
  { value: 2, label: '!!' },
  { value: 1, label: '!!!' },
]

export function TaskEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const tasksQuery = useTasks()
  const online = useOnline()

  if (isMobile) return <Navigate to={`/tasks?task=${id}`} replace />
  const task = tasksQuery.data?.find((t) => t.id === id)
  if (task) return <Editor key={task.id} task={task} tasks={tasksQuery.data!} />

  // MK States: a skeleton while it comes; offline and never loaded, say so; a failed load, Retry;
  // loaded and not there, it's gone.
  const state = listState(tasksQuery, online)
  return (
    <div>
      <BackLink to="/tasks">Tasks</BackLink>
      <div style={{ marginTop: 24, maxWidth: 560 }}>
        {state === 'loading' ? (
          <Skeleton rows={3} />
        ) : state === 'away' ? (
          <OfflineChip>Offline — this task will be here when you’re back online</OfflineChip>
        ) : state === 'resting' ? (
          <ErrorCard message="Couldn’t load this task." onRetry={() => void tasksQuery.refetch()} />
        ) : (
          <EmptyState image="/ds/assets/cherry/fallen.png" line="This task isn’t here — it may have been deleted." action={{ label: 'Back to Tasks', onClick: () => void navigate('/tasks') }} />
        )}
      </div>
    </div>
  )
}

function Editor({ task, tasks }: { task: Task; tasks: Task[] }) {
  const navigate = useNavigate()
  const zone = useAppZone()
  const { data: events = [] } = useCalendarEvents()
  const { data: inboxItems = [] } = useAllInboxItems()
  const draft = useTaskDraft(task)
  const { title, notes, saveTitle, saveNotes } = draft
  const controls = useTaskControls(task)
  const { actions, open, place, edit } = controls
  const [more, setMore] = useState<{ x: number; y: number } | null>(null)

  // Editor.dc.html 1a shows a ⌘⏎ hint next to Save — wire it so the hint is true.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const now = new Date()
  const due = task.due_at ? new Date(task.due_at) : null
  const dueDate = due ? zoneDateKey(due, zone) : ''
  const dueTime = due ? zoneTimeKey(due, zone) : ''
  const linkedEvent = events.find((e) => e.task_id === task.id && !e.deleted_at)
  const linkedInbox = inboxItems.find((i) => i.filed_task_id === task.id)
  const link = taskLink(task) // a filed GitHub issue (P6 step 4) or a captured page (P7e A19)
  const stage = taskCherryStage(task)
  const statusLabel = task.status === 'done' ? 'Done' : task.status === 'cancelled' ? 'Cancelled' : 'Open'
  // Children come straight from the tasks cache — no extra query needed.
  const subtasks = tasks.filter((t) => t.parent_task_id === task.id)
  const day = (iso: string) => dayShort(zoneDateKey(new Date(iso), zone))
  const edited = new Date(task.updated_at)
  const editedWord = dayWord(zoneDateKey(edited, zone), now)

  // Kai 2026-10-07 (a task given a time is on the calendar): setting the time places it there; a new
  // date keeps a task that's on the calendar on it (at its due time); otherwise a date is just a date.
  function handleDueChange(date: string, time: string, timed = !!linkedEvent) {
    planWithUndo(task, date ? zoneToIso(date, time || '09:00', zone) : null, timed) // with its Undo (P7e A17)
  }

  function handleDelete() {
    deleteTasksWithUndo([task])
    void navigate('/tasks')
  }

  function handleSave() {
    saveTitle()
    saveNotes()
    void navigate('/tasks')
  }

  return (
    <div>
      <style>{`.te-body { display: grid; grid-template-columns: minmax(0, 1fr) 316px; gap: 36px; margin-top: 26px; }`}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <BackLink to="/tasks">Tasks</BackLink>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Created {day(task.created_at)}
          {task.updated_at !== task.created_at && ` · edited ${editedWord === 'Today' || editedWord === 'Tomorrow' ? editedWord.toLowerCase() : editedWord} ${zoneTimeKey(edited, zone)}`}
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
            <span style={{ ...PILL, background: task.status === 'done' ? 'color-mix(in srgb, var(--check-border) 30%, transparent)' : 'color-mix(in srgb, var(--acc-sage) 18%, transparent)', color: task.status === 'done' ? 'var(--ink-faint)' : 'var(--acc-sage-text)' }}>{statusLabel}</span>
            {linkedInbox?.kind === 'voice' && <span style={{ ...PILL, border: '1px solid var(--line-solid)', color: 'var(--ink-faint)' }}>via voice</span>}
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" style={{ ...PILL, border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', textDecoration: 'none' }}>{linkLabel(link)} ↗</a>
            )}
            <PhotoSource task={task} style={{ ...PILL, display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--line-solid)', color: 'var(--ink-muted)', background: 'none', cursor: 'pointer' }} />
            {task.priority != null && (
              <button type="button" onClick={(e) => open('priority', e)} style={{ ...PILL, border: 'none', cursor: 'pointer', background: 'color-mix(in srgb, var(--acc-gold-warm) 22%, transparent)', color: priorityColor(task.priority) ?? 'var(--acc-gold)' }}>
                {priorityFlag(task.priority)} {task.priority === 1 ? 'Critical' : task.priority === 2 ? 'High' : 'Medium'}
              </button>
            )}
          </div>
          <input
            value={title}
            aria-label="Title"
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
          onClick={() => edit('top3', () => toggleTop3(task))}
          title={task.top3 ? 'Remove from Top-3' : 'Add to Top-3'}
          style={{ color: 'var(--acc-terra)', fontSize: 22, flex: 'none', marginTop: 6, background: 'none', border: 'none', cursor: 'pointer', opacity: task.top3 ? 1 : 0.3 }}
        >★</button>
        <button type="button" className="kf-row-more" aria-label={`More for "${task.title}"`} aria-haspopup="menu" onClick={(e) => setMore(anchorUnder(e))} style={{ margin: '6px 0 0' }}>
          <Icon name="dots" size={20} />
        </button>
      </div>

      <div className="te-body">
        <div style={{ minWidth: 0 }}>
          <FLabel>Notes</FLabel>
          <textarea
            value={notes}
            aria-label="Notes"
            onChange={(e) => draft.setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder="Anything worth remembering when you sit down to do it…"
            style={{ marginTop: 8, width: '100%', minHeight: 150, background: 'var(--paper-bone)', border: '1px solid var(--line-card)', borderRadius: 6, padding: '14px 16px', fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-body)', fontFamily: 'var(--font-ui)', resize: 'vertical' }}
          />
          <FHelp>plain text · autosaves on blur</FHelp>

          {/* Subtasks — Editor.dc.html 1a:332. Hidden on a child task: one level deep only. */}
          {!task.parent_task_id && (
            <div style={{ marginTop: 18 }}>
              <SubtaskList subs={subtasks} draft={draft} edit={edit} dense />
            </div>
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
                    <span style={{ ...LINK, color: 'var(--acc-lavender-text)' }}>
                      Block · {day(linkedEvent.starts_at).slice(0, 3)} {zoneTimeKey(new Date(linkedEvent.starts_at), zone)}–{zoneTimeKey(new Date(linkedEvent.ends_at), zone)}
                    </span>
                    <Link to="/calendar" style={{ ...LINK, color: 'var(--acc-lavender-deep)', textDecoration: 'none' }}>view on calendar →</Link>
                    <button type="button" onClick={() => deleteEventWithUndo(linkedEvent, 'Unscheduled')} style={{ ...LINK, color: 'var(--acc-terra)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>Unschedule</button>
                  </span>
                )}
                {linkedInbox && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: 'color-mix(in srgb, var(--acc-hydrangea) 14%, transparent)', borderLeft: '3px solid var(--acc-hydrangea)', borderRadius: 3, padding: '9px 13px' }}>
                    <span style={{ ...LINK, color: 'var(--acc-hydrangea-deep)' }}>
                      Capture · {linkedInbox.kind}, {day(linkedInbox.created_at)}
                    </span>
                    <Link to="/inbox" style={{ ...LINK, color: 'var(--acc-hydrangea-deep)', textDecoration: 'none' }}>open in inbox →</Link>
                  </span>
                )}
              </div>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 44, paddingTop: 16, borderTop: '1px dashed var(--line-dashed)', flexWrap: 'wrap', gap: 12 }}>
            <div>
              {/* Flow Audit §4: no confirm — it goes to Trash with an Undo. */}
              <button type="button" onClick={handleDelete} style={{ ...LINK, letterSpacing: 'var(--ls-mono-tight)', color: 'var(--acc-terra)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>Delete task</button>
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
            {/* "Move to…" (tasks/MovePicker): a project, an area or a domain — the domain follows (move.ts
                placeTask) — or a new project. */}
            <Field label="Project or area" value={place ? <EmojiText text={place} /> : '—'} onOpen={(e) => open('project', e)} />
            <FHelp>a task lives in a project or an area, not both</FHelp>
            <FLabel style={{ fontSize: 'var(--fs-meta)', marginTop: 12 }}>Labels</FLabel>
            {/* The shared Label picker (tasks/LabelPicker — the L key's, the sheet's and the popover's): every
                chip opens it, where a tap adds or takes a label off and a new one can be made. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {task.labels.map((l) => (
                <button key={l} type="button" aria-label={`Labels: ${l}`} aria-haspopup="menu" onClick={(e) => open('labels', e)} style={{ ...chipStyle, cursor: 'pointer' }}>
                  *{l}
                </button>
              ))}
              <button type="button" aria-haspopup="menu" onClick={(e) => open('labels', e)} style={{ ...chipStyle, border: '1px dashed var(--ink-hairline)', color: 'var(--ink-faint)', background: 'none', cursor: 'pointer' }}>
                + label
              </button>
            </div>
          </div>

          <div style={{ position: 'relative', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 3, boxShadow: 'var(--shadow-card)', padding: '16px 17px 15px', transform: 'rotate(-0.4deg)' }}>
            {/* washi tape — Editor.dc.html 1a:398 */}
            <span style={{ position: 'absolute', top: -9, right: 26, width: 52, height: 16, background: 'color-mix(in srgb, var(--acc-lavender) 42%, transparent)', backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,0.3) 0 4px,transparent 4px 8px)', transform: 'rotate(2deg)', borderRadius: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={FLabelInline}>Schedule</span>
              {/* The Plan list (tasks/PlanMenu): Today, Next free slot, Tomorrow, This weekend, Next week, Pick… */}
              <button type="button" onClick={(e) => open('date', e)} style={{ ...LINK, color: 'var(--acc-lavender-text)', background: 'color-mix(in srgb, var(--acc-lavender) 22%, transparent)', border: 'none', borderRadius: 999, padding: '5px 10px', cursor: 'pointer' }}>Plan ▾</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 8 }}>
              <div>
                <FLabel style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>Due date</FLabel>
                <DateInput value={dueDate} title="Due date" onChange={(v) => handleDueChange(v, dueTime || '09:00')} />
              </div>
              <div>
                <FLabel style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink-faint)' }}>Due time</FLabel>
                <TimeInput value={dueTime} onChange={(v) => handleDueChange(dueDate || zoneDateKey(now, zone), v, true)} />
              </div>
            </div>
            <FLabel style={{ fontSize: 'var(--fs-meta)', marginTop: 12 }}>Priority</FLabel>
            <Segmented value={task.priority ?? 0} onChange={(p) => actions.priority(p || null)} options={PRIORITIES} label="Priority" />
            <FLabel style={{ fontSize: 'var(--fs-meta)', marginTop: 12 }}>Duration</FLabel>
            {/* The phone's Duration list (TaskMenu): None, 15m … 2h. */}
            <div role="group" aria-label="Duration" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[null, ...DURATIONS].map((m) => (
                <button
                  key={m ?? 'none'}
                  type="button"
                  aria-pressed={task.duration_min === m}
                  onClick={() => actions.duration?.(m)}
                  style={{ ...chipStyle, cursor: 'pointer', background: 'none', ...(task.duration_min === m ? { background: 'color-mix(in srgb, var(--acc-lavender) 22%, transparent)', color: 'var(--acc-lavender-text)', borderColor: 'transparent' } : {}) }}
                >
                  {m ? durationLabel(m) : 'None'}
                </button>
              ))}
            </div>
            <FLabel style={{ fontSize: 'var(--fs-meta)', marginTop: 12 }}>Reminder</FLabel>
            <Field label="Reminder" value={task.reminder_at ? remindChip(task.reminder_at, task.due_at) : 'No reminder'} onOpen={(e) => open('remind', e)} />
            <FHelp>sends a push · needs a due time {dueTime ? '✓' : ''}</FHelp>
            <FLabel style={{ fontSize: 'var(--fs-meta)', marginTop: 12 }}>Repeat</FLabel>
            <Field label="Repeat" value={task.recurrence_rule ? `↻ ${repeatLabel(task.recurrence_rule)}` : 'Doesn’t repeat'} onOpen={(e) => open('repeat', e)} />
            <FHelp>daily · weekly · monthly · custom rule</FHelp>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--ink-body)' }}>Someday</div>
                <FHelp style={{ marginTop: 2 }}>rests in the fern · leaves every list</FHelp>
              </div>
              <Toggle on={task.someday} label="Someday" onToggle={() => editWithUndo([task], task.someday ? 'Out of someday' : 'Parked for someday', (t) => setSomeday(t, !task.someday))} />
            </div>
          </div>

          <div style={{ fontFamily: 'var(--font-hand)', fontSize: 16, color: 'var(--ink-muted)', transform: 'rotate(-1deg)', padding: '0 6px' }}>every field saves quietly — no dialog unless something gets deleted ✿</div>
        </div>
      </div>

      {controls.menu}
      {more && <TaskMoreMenu task={task} at={more} block={linkedEvent} edit={edit} onClose={() => setMore(null)} onDelete={handleDelete} />}
    </div>
  )
}

/** A field that opens a picker (Editor.dc.html .fsel): the value and a caret, the Select trigger's look. */
function Field({ label, value, onOpen }: { label: string; value: ReactNode; onOpen: (e: ReactMouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="menu"
      onClick={onOpen}
      style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-body-s)', padding: '8px 10px', background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-input)', color: 'var(--text-primary)' }}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      <span aria-hidden="true" style={{ fontSize: '0.8em', color: 'var(--text-tertiary)', lineHeight: 1 }}>▾</span>
    </button>
  )
}

const FLabelInline = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: 'var(--ink-faint)' }
const LINK: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-meta)', textTransform: 'uppercase' }
const PILL: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: 'var(--ls-meta)', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 'var(--radius-pill)' }

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
