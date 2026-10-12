import { useEffect, useReducer, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { BottomSheet, useIsMobile } from '../../components/BottomSheet'
import { Icon } from '../../components/Icon'
import { Button, Checkbox, Star } from '../../components/kit'
import { durationLabel, fromMin, toMin } from '../../components/pickerMath'
import { EmptyState, OfflineChip } from '../../components/States'
import { TimePicker } from '../../components/TimePicker'
import { useOutboxMarks } from '../../lib/outbox'
import { useOnline } from '../../lib/useOnline'
import type { Task } from '../../lib/types'
import { deleteEventWithUndo, moveEventWithUndo, scheduleTask, useCalendarEvents } from '../calendar/api'
import { cairoToIso } from '../calendar/eventTime'
import { eventSpan } from '../calendar/phoneGridMath'
import { useFocusStore } from '../focus/focusStore'
import { githubUrl } from '../inbox/inboxDisplay'
import { useStartFocus } from '../today/startFocus'
import { completeTaskWithUndo, deleteTasksWithUndo, reopenTaskWithUndo, toggleTaskWithUndo, toggleTop3, useTasks } from './api'
import { TASK_PARAM, taskAnchor } from './openTask'
import { PhotoSource, SubtaskList, TaskChips, TaskMoreMenu, useTaskControls } from './TaskFields'
import { TaskPopover } from './TaskPopover'
import { blockLine, createdLine, dayWord, doneLine, dueChip, nextDates, saveLine, SAVED_MS, suggestHint, suggestTimes } from './taskSheetMath'
import { useTaskDraft } from './useTaskDraft'
import '../../components/pickers.css'
import './taskSheet.css'

// ── The task sheet (Wave N · Task Sheet.dc.html 4a–4n, SCREENS-2026-09-28-sheets §Task sheet): a phone
// opens any task here, over the page it was on (AppLayout draws it for `?task=<id>`; features/tasks/
// openTask). Medium first, full by the handle or the keyboard. No Save / Cancel: every edit writes at
// once through the same outbox helpers as the rows, the footer flickers "✓ Saved" then reads "Edited
// HH:MM" (offline: "○ Pending sync"), and closing — ✕, scrim, swipe, Back — never discards. Each chip
// opens the row ⋯ menu's own picker (TaskMenu, opened on that sub-picker). The controls are the ones
// the desktop popover and editor use too (./TaskFields). ──

/** `?task=<id>` (AppLayout): the sheet on a phone; on desktop the task detail popover anchored to the
 * row it was opened from — or, opened with no row on screen (a cold link), the editor page. */
export function TaskSheet({ id }: { id: string }) {
  const isMobile = useIsMobile()
  // Read once: the row can leave the list while the popover is open (checked off, moved).
  const [anchor] = useState(() => taskAnchor(id))
  if (isMobile) return <PhoneTaskSheet id={id} />
  return anchor ? <TaskPopover id={id} anchor={anchor} /> : <Navigate to={`/tasks/${id}`} replace />
}

/** Runs once the sheet has left: pops the entry openTask pushed (so Back doesn't reopen it); a cold
 * link has none, so it just drops the param. Then the write that waited for the exit (Delete, done). */
function useDismiss() {
  const navigate = useNavigate()
  const location = useLocation()
  const after = useRef<(() => void) | null>(null)
  return {
    dismiss() {
      if ((location.state as { taskSheet?: boolean } | null)?.taskSheet) void navigate(-1)
      else {
        const params = new URLSearchParams(location.search)
        params.delete(TASK_PARAM)
        const search = params.toString()
        void navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true })
      }
      after.current?.()
    },
    /** Close first, write after (4f): the row behind collapses and the Undo toast lands on the page. */
    closeThen(close: () => void, write: () => void) {
      after.current = write
      close()
    },
  }
}

function PhoneTaskSheet({ id }: { id: string }) {
  const tasksQuery = useTasks()
  const tasks = tasksQuery.data ?? []
  const task = tasks.find((t) => t.id === id)
  const { dismiss } = useDismiss()
  if (task) return <LoadedSheet task={task} tasks={tasks} />

  // 4i: nothing cached yet (a cold link) — the sheet opens at once with its skeleton. 4j: gone.
  const loading = tasksQuery.isPending
  return (
    <BottomSheet
      detent={loading ? 'medium' : 'content'}
      handleGap={loading ? 4 : 14}
      onClose={dismiss}
      footer={loading ? () => (
        <>
          <div className="ts-foot ts-skel" style={{ paddingTop: 0, gap: 6 }}><span style={{ width: 90, height: 10 }} /><span style={{ width: 70, height: 10 }} /></div>
          <Button disabled icon={<Icon name="check" size={20} />}>Mark complete</Button>
        </>
      ) : undefined}
    >
      {(close) =>
        loading ? (
          <div className="ts-skel" role="status" aria-label="Loading" aria-busy="true">
            <div><span style={{ width: 22, height: 22, borderRadius: 6, flex: 'none' }} /><span style={{ flex: 1, height: 18 }} /></div>
            <div><span className="is-pill" style={{ width: 150 }} /><span className="is-pill" style={{ width: 64 }} /></div>
            <div><span className="is-pill" style={{ width: 128 }} /><span className="is-pill" style={{ width: 52 }} /><span className="is-pill" style={{ width: 96 }} /></div>
            <span style={{ height: 64, borderRadius: 8 }} />
            <span style={{ width: '45%', height: 12 }} />
            <span style={{ width: '70%', height: 12 }} />
          </div>
        ) : (
          <EmptyState image="/ds/assets/cherry/fallen.png" line="This task was deleted on another device." action={{ label: 'Close', onClick: close }} />
        )
      }
    </BottomSheet>
  )
}

function LoadedSheet({ task: t, tasks }: { task: Task; tasks: Task[] }) {
  const { data: events = [] } = useCalendarEvents()
  const online = useOnline()
  const { pending } = useOutboxMarks('tasks')
  const startFocus = useStartFocus()
  const focusMin = useFocusStore((s) => s.settings.focusRoundMin)
  const [saved, setSaved] = useState<{ at: number; field: string } | null>(null)
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const [blockTime, setBlockTime] = useState(false)
  const [more, setMore] = useState(false)
  const { dismiss, closeThen } = useDismiss()
  const onSaved = (field: string) => setSaved({ at: Date.now(), field })
  const draft = useTaskDraft(t, onSaved)
  // The chips open the ⋯ menu's pickers; every write they make flickers "Saved" and names its chip
  // (4k: offline, the changed chip keeps its selected ring until the outbox flushes).
  const controls = useTaskControls(t, onSaved)
  const { edit, place } = controls

  // "✓ Saved" settles on "Edited HH:MM" once SAVED_MS has passed.
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(rerender, SAVED_MS)
    return () => clearTimeout(timer)
  }, [saved])

  const now = new Date()
  const done = t.status === 'done' || !!t.completed_at
  const block = events.find((e) => e.task_id === t.id)
  const span = block && eventSpan(block)
  const subs = t.parent_task_id ? null : tasks.filter((c) => c.parent_task_id === t.id)
  const pendingOffline = !online && pending.has(t.id)
  const line = saveLine(t, saved?.at ?? null, now, pendingOffline)
  const recurring = !!t.recurrence_rule && !!t.due_at
  const next = recurring && !done ? nextDates(t.recurrence_rule!, t.due_at!) : null
  const issueUrl = githubUrl(t.external_ref?.url) // a filed GitHub issue (P6 step 4)
  const dur = t.duration_min || 30
  const suggestion = block || done ? null : suggestTimes(events, t.due_at, now, dur)
  const meta = [place, t.duration_min ? durationLabel(t.duration_min) : null, t.due_at ? dueChip(t.due_at, now) : null].filter(Boolean).join(' · ')

  return (
    <BottomSheet
      detent="medium"
      handleGap={4} // room for the title field's focus ring (4c)
      onClose={dismiss}
      footer={(close, keyboardUp) =>
        keyboardUp ? null : (
          <>
            <div className="ts-foot">
              {line && (
                <span className={`ts-save is-${line.tone}`}>
                  {line.tone === 'saved' && <Icon name="check" size={16} />}
                  {line.text}
                </span>
              )}
              <span>{createdLine(t.created_at)}</span>
            </div>
            {done ? (
              <Button variant="secondary" icon={<Icon name="undo" size={20} />} onClick={() => edit('status', () => reopenTaskWithUndo(t))}>Reopen</Button>
            ) : (
              <Button icon={<Icon name="check" size={20} />} onClick={() => closeThen(close, () => completeTaskWithUndo(t))}>
                {recurring ? 'Done for today' : 'Mark complete'}
              </Button>
            )}
          </>
        )
      }
    >
      {(close) => (
        <>
          <div className="ts-top">
            <span className="ts-box">
              <Checkbox checked={done} label={t.title} onChange={() => edit('status', () => toggleTaskWithUndo(t))} />
            </span>
            <textarea
              className={`ts-title${done ? ' is-done' : ''}`}
              rows={1}
              value={draft.title}
              aria-label="Title"
              enterKeyHint="done"
              onChange={(e) => draft.setTitle(e.target.value)}
              onBlur={draft.saveTitle}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                e.currentTarget.blur()
              }}
            />
            <Star on={t.top3} label={t.title} onChange={() => edit('top3', () => toggleTop3(t))} />
            <button type="button" className="kf-bs-icon ts-more" aria-label={`More for "${t.title}"`} aria-haspopup="menu" onClick={() => setMore(true)}>
              <Icon name="dots" size={24} />
            </button>
          </div>
          {done && t.completed_at && (
            <div className="ts-done">
              <Icon name="check" size={16} />
              {doneLine(t.completed_at, now)}
            </div>
          )}
          {!online && (
            <div className="ts-offline">
              <OfflineChip />
            </div>
          )}

          <TaskChips task={t} controls={controls} ringed={pendingOffline ? saved?.field : null} now={now} />
          {next && (
            <div className="ts-next">
              <Icon name="repeat" size={16} />
              {next}
            </div>
          )}
          {issueUrl && (
            <a className="ts-next" href={issueUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="link" size={16} />
              View issue ↗
            </a>
          )}
          <PhotoSource task={t} className="ts-next ts-photo" />

          <textarea className="ts-notes" value={draft.notes} placeholder="Add notes" aria-label="Notes" onChange={(e) => draft.setNotes(e.target.value)} onBlur={draft.saveNotes} />

          {subs && <SubtaskList subs={subs} draft={draft} edit={edit} />}

          {(block || suggestion) && <div className="ts-sec">Schedule on calendar</div>}
          {block ? (
            // The block's own actions live here (Kai 2026-10-03: a task block on the calendar opens this
            // sheet, not a block sheet first): Change time moves it, Unschedule takes it off — the task stays.
            <div className="ts-block">
              <b>On your calendar</b>
              <small>{blockLine(block, now)}</small>
              <div className="ts-block-acts">
                <Button variant="ghost" icon={<Icon name="clock" size={20} />} onClick={() => setBlockTime(true)}>Change time</Button>
                <Button variant="ghost" onClick={() => edit('schedule', () => deleteEventWithUndo(block, 'Unscheduled'))}>Unschedule</Button>
              </div>
            </div>
          ) : (
            suggestion && (
              <>
                {suggestion.starts.length > 0 && (
                  <div className="kf-pk-slots">
                    {suggestion.starts.map((m, i) => (
                      <button
                        key={m}
                        type="button"
                        className="kf-pk-slot"
                        aria-pressed={i === 0}
                        onClick={() => edit('schedule', () => scheduleTask(t, cairoToIso(suggestion.day, fromMin(m)), cairoToIso(suggestion.day, fromMin(m + dur))))}
                      >
                        {i === 0 ? `${dayWord(suggestion.day, now)} ${fromMin(m)}` : fromMin(m)}
                      </button>
                    ))}
                  </div>
                )}
                <div className="ts-hint">
                  <Icon name="clock" size={16} />
                  {suggestHint(suggestion, now)}
                </div>
              </>
            )
          )}
          {!done && (
            <div className="ts-focus">
              <Button variant="secondary" icon={<Icon name="focus" size={20} />} onClick={() => startFocus(t)}>
                Focus · {focusMin}:00
              </Button>
            </div>
          )}

          {controls.menu}
          {blockTime && block && span && (
            <TimePicker
              day={span.day}
              value={fromMin(span.start)}
              duration={span.end - span.start}
              title={t.title}
              onDone={(hhmm, d) => {
                const start = toMin(hhmm)
                const to = { day: span.day, start, end: start + (d ?? span.end - span.start) }
                if (to.start !== span.start || to.end !== span.end) edit('schedule', () => moveEventWithUndo(block, span, to, d ? 'bottom' : 'move'))
              }}
              onClose={() => setBlockTime(false)}
            />
          )}
          {more && (
            <TaskMoreMenu task={t} at={{ x: 0, y: 0 }} meta={meta || undefined} edit={edit} onClose={() => setMore(false)} onDelete={() => closeThen(close, () => deleteTasksWithUndo([t]))} />
          )}
        </>
      )}
    </BottomSheet>
  )
}
