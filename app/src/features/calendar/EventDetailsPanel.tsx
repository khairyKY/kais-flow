import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { updateEvent, deleteEvent } from './api'
import { completeTask } from '../tasks/api'
import type { CalendarEvent, CalendarEventType, Task } from '../../lib/types'

interface EventDetailsPanelProps {
  event: CalendarEvent
  conflicts: string[]
  onClose: () => void
}

const ACCENT_COLORS = [
  { name: 'None', value: null },
  { name: 'Sage', value: '#8A9A7E' },
  { name: 'Moss', value: '#7A946E' },
  { name: 'Terra', value: '#B5654A' },
  { name: 'Blossom', value: '#D4A8B0' },
  { name: 'Lavender', value: '#A8A0BE' },
  { name: 'Hydrangea', value: '#9AB4BE' },
  { name: 'Buttercream', value: '#D4C78A' },
  { name: 'Clover', value: '#C9A0A0' },
  { name: 'Gold', value: '#9A7B3A' },
]

export function EventDetailsPanel({ event, conflicts, onClose }: EventDetailsPanelProps) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [title, setTitle] = useState(event.title)
  const [date, setDate] = useState(event.starts_at.slice(0, 10))
  const [startTime, setStartTime] = useState(event.all_day ? '' : event.starts_at.slice(11, 16))
  const [endTime, setEndTime] = useState(event.all_day ? '' : event.ends_at.slice(11, 16))
  const [allDay, setAllDay] = useState(event.all_day)
  const [busy, setBusy] = useState(event.busy)
  const [eventType, setEventType] = useState<CalendarEventType>(event.type ?? 'event')
  const [eventColor, setEventColor] = useState<string | null>(event.color ?? null)
  const [dirty, setDirty] = useState(false)
  const [deleting, setDeleting] = useState<'idle' | 'confirm'>('idle')
  const titleRef = useRef<HTMLInputElement>(null)

  const tasks: Task[] = qc.getQueryData(['tasks']) ?? []
  const linkedTask = event.task_id ? tasks.find((t) => t.id === event.task_id) : null

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (titleRef.current) titleRef.current.focus()
  }, [])

  function markDirty() { setDirty(true) }

  function nextDay(isoDate: string): string {
    const d = new Date(isoDate + 'T00:00:00.000Z')
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
  }

  function handleSave() {
    const startsAt = `${date}T00:00:00.000Z`
    let endsAt: string
    if (allDay) {
      endsAt = nextDay(date) + 'T00:00:00.000Z'
    } else {
      endsAt = `${date}T${endTime}:00.000Z`
    }
    updateEvent(event, {
      title,
      starts_at: allDay ? startsAt : `${date}T${startTime}:00.000Z`,
      ends_at: endsAt,
      all_day: allDay,
      busy,
      type: eventType,
      color: eventColor,
    })
    onClose()
  }

  function handleDelete() {
    deleteEvent(event)
    onClose()
  }

  function handleComplete() {
    if (linkedTask) completeTask(linkedTask)
    onClose()
  }

  function handleOpenTask() {
    if (event.task_id) {
      navigate(`/tasks/${event.task_id}`)
      onClose()
    }
  }

  const TYPES: { key: CalendarEventType; label: string }[] = [
    { key: 'event', label: 'Event' },
    { key: 'time_block', label: 'Time Block' },
    { key: 'task', label: 'Task' },
  ]

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(11, 10, 8, 0.3)',
          zIndex: 998,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'var(--bg-surface)',
            backdropFilter: 'blur(9px)',
            boxShadow: 'var(--shadow-popover)',
            borderRadius: 'var(--radius-sharp)',
            width: 480,
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: 'calc(100vh - 48px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: 'var(--font-ui)',
            color: 'var(--text-primary)',
          }}
        >
          {conflicts.length > 0 && (
            <div
              style={{
                padding: '8px 24px',
                background: 'var(--sig-overdue)',
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-on-accent)',
                letterSpacing: '0.08em',
              }}
            >
              OVERLAPS: {conflicts.join(', ')}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 0' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {TYPES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => { setEventType(t.key); markDirty() }}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9.5,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    padding: '4px 12px',
                    borderRadius: 'var(--radius-pill)',
                    border: eventType === t.key ? '1px solid var(--border-default)' : '1px solid transparent',
                    background: eventType === t.key ? 'var(--bg-surface)' : 'transparent',
                    color: eventType === t.key ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    cursor: 'pointer',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              style={{
                border: 'none',
                background: 'none',
                color: 'var(--text-tertiary)',
                fontSize: 18,
                cursor: 'pointer',
                padding: 0,
                lineHeight: 1,
              }}
            >
              &times;
            </button>
          </div>

          <div style={{ padding: '16px 24px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => { setTitle(e.target.value); markDirty() }}
              placeholder="Add title"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 22,
                fontWeight: 500,
                color: 'var(--text-primary)',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--border-faint)',
                outline: 'none',
                padding: '4px 0',
                width: '100%',
              }}
            />

            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 6 }}>DATE</div>
              <input
                type="date"
                value={date}
                onChange={(e) => { setDate(e.target.value); markDirty() }}
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-input)',
                  padding: '8px 10px',
                  width: '100%',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => { setAllDay(e.target.checked); markDirty() }}
                  style={{ accentColor: 'var(--acc-lavender)' }}
                />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.12em', color: 'var(--text-faint)' }}>ALL DAY</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={busy}
                  onChange={(e) => { setBusy(e.target.checked); markDirty() }}
                  style={{ accentColor: 'var(--acc-lavender)' }}
                />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.12em', color: 'var(--text-faint)' }}>BUSY</span>
              </label>
            </div>

            {!allDay && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 6 }}>STARTS</div>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => { setStartTime(e.target.value); markDirty() }}
                    style={{
                      fontFamily: 'var(--font-ui)',
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-input)',
                      padding: '8px 10px',
                      width: '100%',
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 6 }}>ENDS</div>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => { setEndTime(e.target.value); markDirty() }}
                    style={{
                      fontFamily: 'var(--font-ui)',
                      fontSize: 13,
                      color: 'var(--text-primary)',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-input)',
                      padding: '8px 10px',
                      width: '100%',
                    }}
                  />
                </div>
              </div>
            )}

            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8 }}>COLOR</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c.value ?? 'none'}
                    onClick={() => { setEventColor(c.value); markDirty() }}
                    title={c.name}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: eventColor === c.value ? '2px solid var(--text-primary)' : '2px solid transparent',
                      background: c.value ?? 'var(--bg-input)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {!c.value ? <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>&#8212;</span> : null}
                  </button>
                ))}
              </div>
            </div>

            {linkedTask && (
              <div
                style={{
                  background: 'var(--paper-event)',
                  border: '1px solid var(--line-card)',
                  borderRadius: 'var(--radius-sharp)',
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                  FROM TASK
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--text-primary)', fontWeight: 500 }}>{linkedTask.title}</div>
                {linkedTask.due_at && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)' }}>
                    due {new Date(linkedTask.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleOpenTask}
                    style={{
                      fontFamily: 'var(--font-ui)',
                      fontSize: 11.5,
                      color: 'var(--acc-lavender-deep)',
                      background: 'none',
                      border: '1px solid var(--line-solid)',
                      borderRadius: 'var(--radius-pill)',
                      padding: '5px 12px',
                      cursor: 'pointer',
                    }}
                  >
                    Edit Task
                  </button>
                  <button
                    onClick={handleComplete}
                    style={{
                      fontFamily: 'var(--font-ui)',
                      fontSize: 11.5,
                      color: 'var(--text-primary)',
                      background: 'none',
                      border: '1px solid var(--line-solid)',
                      borderRadius: 'var(--radius-pill)',
                      padding: '5px 12px',
                      cursor: 'pointer',
                    }}
                  >
                    Complete
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={handleSave}
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-on-accent)',
                  background: 'var(--acc-terra)',
                  border: 'none',
                  borderRadius: 'var(--radius-pill)',
                  padding: '10px 0',
                  cursor: 'pointer',
                  flex: 1,
                  opacity: dirty ? 1 : 0.6,
                }}
              >
                SAVE
              </button>
            </div>

            <div style={{ textAlign: 'center', marginTop: 2 }}>
              {deleting === 'idle' ? (
                <button
                  onClick={() => setDeleting('confirm')}
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 11.5,
                    color: 'var(--text-muted)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 0',
                    textDecoration: 'underline',
                  }}
                >
                  Delete event&hellip;
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-secondary)' }}>
                    {linkedTask
                      ? `Delete this time block? "${linkedTask.title}" stays on your task list, unscheduled.`
                      : `Delete "${title}"? This can't be undone.`
                    }
                  </span>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={handleDelete}
                      style={{
                        fontFamily: 'var(--font-ui)',
                        fontSize: 11.5,
                        color: 'var(--text-on-accent)',
                        background: 'var(--sig-overdue)',
                        border: 'none',
                        borderRadius: 'var(--radius-pill)',
                        padding: '5px 16px',
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setDeleting('idle')}
                      style={{
                        fontFamily: 'var(--font-ui)',
                        fontSize: 11.5,
                        color: 'var(--text-muted)',
                        background: 'none',
                        border: '1px solid var(--line-solid)',
                        borderRadius: 'var(--radius-pill)',
                        padding: '5px 16px',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
