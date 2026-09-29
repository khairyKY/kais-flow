import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ACTION_ROW_CSS } from '../../components/ActionSheet'
import { BottomSheet } from '../../components/BottomSheet'
import { DatePicker } from '../../components/DatePicker'
import { EmojiText } from '../../components/EmojiText'
import { Icon } from '../../components/Icon'
import type { IconName } from '../../components/icons/kf'
import { Button, Checkbox, Chip, SectionLabel } from '../../components/kit'
import { DURATIONS, dayHint, durationLabel, fromMin, toMin } from '../../components/pickerMath'
import { SheetTitle, TimePicker } from '../../components/TimePicker'
import { cairoDateKey, tomorrowHint } from '../../lib/dateShortcuts'
import { toastUndo } from '../../lib/undo'
import type { CalendarEvent, Domain, Project, Task } from '../../lib/types'
import { Segmented } from '../rituals/RitualChrome'
import { completeTaskWithUndo, createTask, uncompleteTask } from '../tasks/api'
import { useOpenTask } from '../tasks/openTask'
import { TaskMenu } from '../tasks/TaskMenu'
import { remindChip, SAVED_MS } from '../tasks/taskSheetMath'
import { taskActions } from '../tasks/useRowGrammar'
import { createEvent, deleteEvent, deleteEventWithUndo, scheduleTask } from './api'
import { cairoToIso } from './eventTime'
import { eventSpan, rangeText, scheduleSlots, slotLabel, spanIso, type DragMode, type Span } from './phoneGridMath'

// ── The phone calendar's sheets (Calendar Phone.dc.html): 7c quick create, 7d the block sheet,
// 7g / 7g2 Schedule. All on the kit BottomSheet; every write goes through calendar/api and
// tasks/api (the outbox), and every removal carries Undo. ──

type Rect = { left: number; top: number; width: number; height: number }

/** A kit action row (ActionSheet's look): icon · label · hint · chevron. */
function Row({ icon, label, hint, onClick }: { icon: IconName; label: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" className="kf-as-row" onClick={onClick}>
      <span className="kf-as-icon" aria-hidden><Icon name={icon} /></span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: '20px' }}>{label}</span>
      {hint && <span className="kf-as-hint">{hint}</span>}
      <Icon name="chevright" size={20} style={{ color: 'var(--ink-faint)' }} />
    </button>
  )
}

/** 7c — tap an empty slot: Task (default) or Event, 30 minutes, the keyboard up at once. The slot is
 * drawn over the scrim with the title as you type. Save waits for a title. */
export function QuickCreateSheet({ day, start: at, slotRect, onClose }: { day: string; start: number; slotRect: (start: number, end: number) => Rect | null; onClose: () => void }) {
  const [kind, setKind] = useState<'task' | 'event'>('task')
  const [title, setTitle] = useState('')
  const [start, setStart] = useState(at)
  const [dur, setDur] = useState(30)
  const [timeOpen, setTimeOpen] = useState(false)
  const name = title.trim()
  const save = (close: () => void) => {
    if (!name) return
    const { starts_at, ends_at } = spanIso({ day, start, end: start + dur })
    if (kind === 'task') scheduleTask(createTask({ title: name, dueAt: starts_at, durationMin: dur }), starts_at, ends_at)
    else createEvent(name, starts_at, ends_at, 'event')
    close()
  }
  const rect = slotRect(start, start + dur)
  return (
    <>
      <BottomSheet onClose={onClose} handleGap={8}>
        {(close) => (
          <div className="pc-qc">
            <div className="pc-qc-top">
              <Segmented label="New" options={[{ value: 'task', label: 'Task' }, { value: 'event', label: 'Event' }]} value={kind} onChange={setKind} />
              <Button disabled={!name} onClick={() => save(close)}>Save</Button>
            </div>
            <input
              className="pc-qc-title"
              autoFocus
              aria-label="Title"
              placeholder={kind === 'task' ? 'New task' : 'New event'}
              enterKeyHint="done"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save(close)
              }}
            />
            <div className="pc-qc-chips">
              <Chip tone="date" onClick={() => setTimeOpen(true)}>
                {dayHint(day, cairoDateKey(new Date()))} · {fromMin(start)}
              </Chip>
              {DURATIONS.map((m) => (
                <Chip key={m} tone="duration" icon={false} selected={dur === m} onClick={() => setDur(m)}>
                  {durationLabel(m)}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </BottomSheet>
      {rect &&
        createPortal(
          <div className="pc-qc-slot" style={rect} aria-hidden>
            <span className="pc-name">{name || (kind === 'task' ? 'New task' : 'New event')}</span>
            <span className="pc-time">{rangeText(start, start + dur)}</span>
          </div>,
          document.body,
        )}
      {timeOpen && (
        <TimePicker
          day={day}
          value={fromMin(start)}
          duration={dur}
          title={name || undefined}
          onDone={(hhmm, d) => {
            setStart(toMin(hhmm))
            if (d) setDur(d)
          }}
          onClose={() => setTimeOpen(false)}
        />
      )}
    </>
  )
}

/** 7d — tap a block. A task block: its checkbox marks the task done; Time moves it; Open the task is
 * the task sheet; Remind is the task's; Unschedule sends it back to the strip; Delete removes the
 * block only (the task stays). A plain event: Time and Delete. */
export function BlockSheet({ event, task, project, domains, projects, subtasks, pending, onMove, onClose }: {
  event: CalendarEvent
  task?: Task
  project?: Project
  domains: Domain[]
  projects: Project[]
  subtasks: number
  pending: boolean
  onMove: (e: CalendarEvent, from: Span, to: Span, mode: DragMode) => void
  onClose: () => void
}) {
  const openTask = useOpenTask()
  const [picker, setPicker] = useState<'time' | 'remind' | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  useEffect(() => {
    if (savedAt == null) return
    const t = window.setTimeout(() => setSavedAt(null), SAVED_MS)
    return () => window.clearTimeout(t)
  }, [savedAt])
  const span = eventSpan(event)
  const len = span.end - span.start
  const done = task?.status === 'done'
  const today = cairoDateKey(new Date())
  const kind = task ? 'Task block' : event.type === 'time_block' ? 'Time block' : 'Event'
  const meta = [kind, task ? project?.name : durationLabel(len)].filter(Boolean).join(' · ')
  const opens = [task?.notes ? 'Notes' : null, subtasks ? `${subtasks} subtask${subtasks > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ')
  return (
    <>
      <BottomSheet
        detent="medium"
        onClose={onClose}
        handleGap={8}
        footer={(close) => (
          <>
            <Button variant="ghost" className="pc-bs-delete" icon={<Icon name="delete" size={20} />} onClick={() => { close(); deleteEventWithUndo(event, 'Deleted') }}>
              Delete
            </Button>
            {task && <Button variant="secondary" onClick={() => { close(); deleteEventWithUndo(event, 'Unscheduled') }}>Unschedule</Button>}
          </>
        )}
      >
        {(close) => (
          <>
            <div className="pc-bs-head">
              {task && <Checkbox checked={done} onChange={() => (done ? uncompleteTask(task) : completeTaskWithUndo(task))} label={task.title} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={`pc-bs-title${done ? ' is-done' : ''}`}><EmojiText text={task?.title ?? event.title} /></div>
                <div className="pc-bs-meta">{meta}</div>
              </div>
            </div>
            <div className="pc-bs-rows">
              <style>{ACTION_ROW_CSS}</style>
              <Row icon="clock" label="Time" hint={`${dayHint(span.day, today)} · ${rangeText(span.start, span.end)}`} onClick={() => setPicker('time')} />
              {task && <Row icon="tasks" label="Open the task" hint={opens || undefined} onClick={() => { close(); openTask(task.id) }} />}
              {task && <Row icon="remind" label="Remind" hint={task.reminder_at ? remindChip(task.reminder_at, task.due_at) : 'Off'} onClick={() => setPicker('remind')} />}
            </div>
            {(pending || savedAt != null) && <div className={`pc-bs-save${pending ? ' is-pending' : ''}`}>{pending ? '○ Pending sync' : '✓ Saved'}</div>}
          </>
        )}
      </BottomSheet>
      {picker === 'time' && (
        <TimePicker
          day={span.day}
          value={fromMin(span.start)}
          duration={len}
          title={task?.title ?? event.title}
          onDone={(hhmm, d) => {
            const start = toMin(hhmm)
            const to = { day: span.day, start, end: start + (d ?? len) }
            if (to.start === span.start && to.end === span.end) return
            onMove(event, span, to, d ? 'bottom' : 'move')
            setSavedAt(Date.now())
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'remind' && task && (
        <TaskMenu
          task={task}
          anchor={{ at: { x: 0, y: 0 }, sub: 'remind' }}
          actions={taskActions(task)}
          ctx={{ tomorrowHint: tomorrowHint(), projectName: project?.name }}
          projects={projects}
          domains={domains}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  )
}

/** 7g — tap an unscheduled chip: the next 3 free slots, one tap places the block (toast + Undo).
 * 7g2 — nothing fits today: says so and offers the next days. Or pick a time / a date. */
export function ScheduleSheet({ task, events, onPlaced, onClose }: { task: Task; events: readonly CalendarEvent[]; onPlaced: (day: string) => void; onClose: () => void }) {
  const [picker, setPicker] = useState<'time' | 'date' | null>(null)
  const now = new Date()
  const today = cairoDateKey(now)
  const dur = task.duration_min || 30
  const { today: fitsToday, slots } = scheduleSlots(events, now, dur)
  const place = (startsAt: string, len: number) => {
    const ev = scheduleTask(task, startsAt, new Date(Date.parse(startsAt) + len * 60_000).toISOString())
    toastUndo(`Scheduled · ${task.title}`, () => deleteEvent(ev))
    onPlaced(cairoDateKey(new Date(startsAt)))
  }
  return (
    <>
      <BottomSheet onClose={onClose} title={<SheetTitle title="Schedule" meta={`${task.title} · ${durationLabel(dur)}`} />}>
        {(close) => (
          <>
            <SectionLabel>{fitsToday ? 'Next free today' : 'Next free'}</SectionLabel>
            <div className="pc-slots">
              {slots.map((s) => (
                <button key={`${s.day}-${s.start}`} type="button" className="kf-pk-slot" onClick={() => { place(spanIso({ ...s, end: s.start + dur }).starts_at, dur); close() }}>
                  {slotLabel(s, dur, today)}
                </button>
              ))}
            </div>
            {!fitsToday && (
              <div className="pc-hint">
                <Icon name="clock" size={16} />
                No {durationLabel(dur)} gap left today
              </div>
            )}
            <div className="pc-bs-rows">
              <style>{ACTION_ROW_CSS}</style>
              <Row icon="clock" label="Pick a time…" onClick={() => setPicker('time')} />
              <Row icon="pickdate" label="Pick a date…" onClick={() => setPicker('date')} />
            </div>
          </>
        )}
      </BottomSheet>
      {picker === 'time' && (
        <TimePicker day={today} value={null} duration={dur} title={task.title} onDone={(hhmm, d) => { place(cairoToIso(today, hhmm), d ?? dur); onClose() }} onClose={() => setPicker(null)} />
      )}
      {picker === 'date' && (
        <DatePicker title="Schedule" meta={task.title} value={null} quick withTime duration={dur} onPick={(iso, d) => { place(iso, d ?? dur); onClose() }} onClose={() => setPicker(null)} />
      )}
    </>
  )
}
