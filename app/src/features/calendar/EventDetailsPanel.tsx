import { useEffect, useRef, useState } from 'react'
import { useOpenTask } from '../tasks/openTask'
import { useQueryClient } from '@tanstack/react-query'
import { updateEvent, deleteEvent, restoreEvent } from './api'
import { toastUndo } from '../../lib/undo'
import { useBodyScrollLock, useEscapeStack } from '../../lib/overlayStack'
import { cairoTimeKey, cairoToIso } from './eventTime'
import { cairoDateKey } from '../../lib/dateShortcuts'
import { completeTaskWithUndo } from '../tasks/api'
import { DateField } from '../../components/DatePicker'
import { ColorDots } from './formFields'
import { TimeField } from './TimeField'
import type { CalendarEvent, CalendarEventType, Task } from '../../lib/types'

// ── Overlays.dc.html §02 "Event details · calendar" — a compact 280px popover,
// not the old 480px generic modal. Edits an existing Event/Time block; a
// task-linked block hands off to TaskEditorPage via "Edit Task" (matches
// the "Task detail · Enter · expands" cell's "Open full ↗"). ──

interface EventDetailsPanelProps {
  event: CalendarEvent
  conflicts: string[]
  onClose: () => void
  /** A ran-over task block that isn't done: "Replan ▾" opens the calendar's Plan menu here. */
  onReplan?: (x: number, y: number) => void
}

// Kai 2026-10-07 ("it felt like a read-only pop-up"): the title, date and times wear the kit's field
// chrome (formFields' bone fill + card line), darken on hover, ring on focus, and point; a click
// on a time opens its list in place, on the date its picker.
const FIELD_CSS = `
  .edp-field, .edp-when input, .edp-when button { font: inherit; color: var(--ink-body); background: var(--paper-bone); border: 1px solid var(--line-card); border-radius: 6px; padding: 3px 7px; cursor: pointer; text-transform: inherit; letter-spacing: inherit; transition: border-color var(--dur-quick), background var(--dur-quick); }
  .edp-field:hover, .edp-when input:hover, .edp-when button:hover { border-color: var(--ink-faint); }
  .edp-field:focus, .edp-when input:focus, .edp-when button:focus-visible { outline: none; border-color: var(--acc-lavender-deep); background: var(--paper-parchment); box-shadow: var(--focus-ring); }
  .edp-title { cursor: text; }
`

function nextDay(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function EventDetailsPanel({ event, conflicts, onClose, onReplan }: EventDetailsPanelProps) {
  const openTask = useOpenTask()
  const qc = useQueryClient()
  const [title, setTitle] = useState(event.title)
  // On the user's clock (lib/appZone), like QuickCreate. The day is editable too (Kai 2026-10-07): a
  // missed block moves to today from here as well as by dragging it.
  const [date, setDate] = useState(cairoDateKey(new Date(event.starts_at)))
  const [startTime, setStartTime] = useState(event.all_day ? '' : cairoTimeKey(new Date(event.starts_at)))
  const [endTime, setEndTime] = useState(event.all_day ? '' : cairoTimeKey(new Date(event.ends_at)))
  const [type, setType] = useState<CalendarEventType>(event.type ?? 'event')
  const [busy, setBusy] = useState(event.busy)
  const [color, setColor] = useState<string | null>(event.color ?? null)
  const [dirty, setDirty] = useState(false)
  const [deleting, setDeleting] = useState<'idle' | 'confirm'>('idle')
  const titleRef = useRef<HTMLInputElement>(null)
  useBodyScrollLock(true)

  const tasks: Task[] = qc.getQueryData(['tasks']) ?? []
  const linkedTask = event.task_id ? tasks.find((t) => t.id === event.task_id) : null

  // F3 (punch 12): through the shared Esc stack — the private listener fired alongside
  // whatever overlay was genuinely topmost (two things closed on one Esc).
  useEscapeStack(true, onClose)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  function markDirty() { setDirty(true) }

  function handleSave() {
    if (!dirty) { onClose(); return }
    const startsAt = event.all_day ? `${date}T00:00:00.000Z` : cairoToIso(date, startTime)
    const endsAt = event.all_day ? `${nextDay(date)}T00:00:00.000Z` : cairoToIso(date, endTime)
    updateEvent(event, { title, starts_at: startsAt, ends_at: endsAt, busy, type, color })
    onClose()
  }

  function handleDelete() {
    // Punch 6 (calendar slice): capture prior state, undo through the same api path.
    const prior = { ...event }
    deleteEvent(event)
    toastUndo(`Deleted · ${event.title}`, () => restoreEvent(prior))
    onClose()
  }

  function handleComplete() {
    // Polish F2b (punch 6): "Done" with Undo, like every other place a task completes.
    if (linkedTask) completeTaskWithUndo(linkedTask)
    onClose()
  }

  function handleOpenTask() {
    if (!event.task_id) return
    onClose() // the sheet opens over the calendar (phone); desktop leaves for the editor page
    openTask(event.task_id)
  }

  const stripColor = color ?? 'var(--acc-lavender)'
  const overdue = cairoDateKey(new Date(Date.parse(event.ends_at) - 1)) < cairoDateKey(new Date())

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(11, 10, 8, 0.3)', zIndex: 998, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'edpFadeIn 210ms var(--ease-out)' }}
      onClick={onClose}
    >
      {/* Motion 3c — scrim and card arrive together, 210ms up-and-settle */}
      <style>{'@keyframes edpFadeIn{from{opacity:0}}' + FIELD_CSS}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 280, maxWidth: 'calc(var(--kf-vw) - 32px)', background: 'var(--paper-parchment)', border: '1px solid var(--line-card)', borderRadius: 5, boxShadow: 'var(--shadow-popover)', overflow: 'hidden', animation: 'entryFadeUp 210ms var(--ease-out)' }}
      >
        <div style={{ height: 6, background: stripColor }} />
        <div style={{ padding: '16px 18px' }}>
          {conflicts.length > 0 && (
            <div style={{ margin: '-4px 0 12px', padding: '6px 10px', background: 'var(--sig-overdue)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', color: 'var(--text-on-accent)' }}>
              OVERLAPS: {conflicts.join(', ')}
            </div>
          )}

          <input
            ref={titleRef}
            className="edp-field edp-title"
            aria-label="Title"
            value={title}
            onChange={(e) => { setTitle(e.target.value); markDirty() }}
            placeholder="Add title"
            style={{ width: '100%', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, padding: '3px 7px' }}
          />

          <div className="edp-when" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>
            <DateField value={date} title="Date" ariaLabel="Date" clearable={false} onChange={(v) => { if (v) { setDate(v); markDirty() } }} />
            {!event.all_day && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {/* C5 (2026-07-18 audit): themed TimeField, not native time inputs with OS chrome */}
                <TimeField value={startTime} day={date} ariaLabel="Start time" onChange={(v) => { setStartTime(v); markDirty() }} style={{ width: 76 }} />
                <span>–</span>
                <TimeField value={endTime} day={date} ariaLabel="End time" onChange={(v) => { setEndTime(v); markDirty() }} style={{ width: 76 }} />
              </span>
            )}
          </div>

          {onReplan && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              <span style={{ color: 'var(--acc-terra)' }}>{overdue ? 'Overdue' : 'Ran over'}</span>
              <button
                type="button"
                className="edp-field"
                aria-haspopup="menu"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  onReplan(r.left, r.bottom + 4)
                }}
              >
                Replan ▾
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {linkedTask ? (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999, background: 'color-mix(in srgb, var(--acc-blossom) 16%, transparent)', color: 'var(--kf-chip-tasks, #8A4A58)' }}>Task</span>
            ) : (
              (['event', 'time_block'] as CalendarEventType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setType(t); markDirty() }}
                  style={{
                    font: 'inherit', cursor: 'pointer', border: type === t ? 'none' : '1px solid var(--line-solid)',
                    fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 999,
                    background: type === t ? 'color-mix(in srgb, var(--acc-lavender) 22%, transparent)' : 'transparent',
                    color: type === t ? 'var(--acc-lavender-text)' : 'var(--ink-muted)',
                  }}
                >
                  {t === 'event' ? 'Event' : 'Time block'}
                </button>
              ))
            )}
          </div>

          {linkedTask && (
            // Punch 34: the whole From-task card is the click-through to the full task editor;
            // the buttons keep the two actions explicit ("Open task ↗" reaches it in one click).
            <div
              role="button"
              onClick={handleOpenTask}
              style={{ marginTop: 12, background: 'var(--paper-event)', border: '1px solid var(--line-card)', borderRadius: 4, padding: 11, cursor: 'pointer' }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>From task</div>
              <div style={{ fontSize: 13, color: 'var(--ink-body)', marginTop: 3 }}>{linkedTask.title}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" onClick={handleOpenTask} style={{ font: 'inherit', fontSize: 11, color: 'var(--acc-lavender-deep)', background: 'none', border: '1px solid var(--line-solid)', borderRadius: 999, padding: '4px 10px', cursor: 'pointer' }}>Open task ↗</button>
                <button type="button" onClick={(e) => { e.stopPropagation(); handleComplete() }} style={{ font: 'inherit', fontSize: 11, color: 'var(--ink-body)', background: 'none', border: '1px solid var(--line-solid)', borderRadius: 999, padding: '4px 10px', cursor: 'pointer' }}>Complete</button>
              </div>
            </div>
          )}

          {!linkedTask && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <ColorDots value={color} onChange={(v) => { setColor(v); markDirty() }} size={18} />
              <button
                type="button"
                onClick={() => { setBusy((b) => !b); markDirty() }}
                style={{ marginLeft: 'auto', font: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: busy ? 'var(--ink-body)' : 'var(--ink-faint)', background: 'none', border: '1px solid var(--line-solid)', borderRadius: 999, padding: '4px 10px', cursor: 'pointer' }}
              >
                {busy ? 'Busy' : 'Free'}
              </button>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: '1px dashed var(--line-dashed)' }}>
            {deleting === 'idle' ? (
              <span onClick={() => setDeleting('confirm')} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--acc-terra)', cursor: 'pointer' }}>
                Delete
              </span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-meta)', color: 'var(--ink-muted)' }}>Sure?</span>
                <button type="button" onClick={handleDelete} style={{ font: 'inherit', fontSize: 11, color: 'var(--text-on-accent)', background: 'var(--sig-overdue)', border: 'none', borderRadius: 999, padding: '4px 10px', cursor: 'pointer' }}>Delete</button>
                <button type="button" onClick={() => setDeleting('idle')} style={{ font: 'inherit', fontSize: 11, color: 'var(--ink-muted)', background: 'none', border: '1px solid var(--line-solid)', borderRadius: 999, padding: '4px 10px', cursor: 'pointer' }}>Cancel</button>
              </div>
            )}
            <button
              type="button"
              onClick={handleSave}
              style={{ border: 'none', background: 'var(--acc-terra)', color: 'var(--paper-parchment)', font: 'inherit', fontSize: 12.5, padding: '8px 16px', borderRadius: 999, boxShadow: 'var(--shadow-cta)', cursor: 'pointer' }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
