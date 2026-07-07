import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { updateEvent, deleteEvent } from './api'
import { completeTask } from '../tasks/api'
import type { CalendarEvent, Task } from '../../lib/types'

interface EventDetailsPanelProps {
  event: CalendarEvent
  onClose: () => void
}

export function EventDetailsPanel({ event, onClose }: EventDetailsPanelProps) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [title, setTitle] = useState(event.title)
  const [date, setDate] = useState(event.starts_at.slice(0, 10))
  const [startTime, setStartTime] = useState(event.all_day ? '' : event.starts_at.slice(11, 16))
  const [endTime, setEndTime] = useState(event.all_day ? '' : event.ends_at.slice(11, 16))
  const [allDay, setAllDay] = useState(event.all_day)
  const [busy, setBusy] = useState(event.busy)
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
    if (allDay) {
      const endsAt = nextDay(date)
      updateEvent(event, { title, starts_at: startsAt, ends_at: endsAt + 'T00:00:00.000Z', all_day: true, busy })
    } else {
      const endsAt = `${date}T${endTime}:00.000Z`
      updateEvent(event, { title, starts_at: `${date}T${startTime}:00.000Z`, ends_at: endsAt, all_day: false, busy })
    }
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

  const panelId = 'ev-panel-scoped'

  return (
    <>
      <div
        className={`${panelId}-scrim`}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(11, 10, 8, 0.25)',
          zIndex: 998,
        }}
        onClick={onClose}
      />
      <div
        className={`${panelId}-card`}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 420,
          maxWidth: '100vw',
          zIndex: 999,
          background: 'var(--bg-surface)',
          backdropFilter: 'blur(9px)',
          boxShadow: 'var(--shadow-popover)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'var(--font-ui)',
          color: 'var(--text-primary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 0' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: event.source === 'native' ? 'var(--acc-sage)' : 'var(--text-faint)',
            }}
          >
            {event.source === 'native' ? 'NATIVE' : 'GOOGLE'}
          </span>
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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8, padding: '6px 20px 0' }}>
          <img
            src="assets/daisy/bud.png"
            alt=""
            style={{ height: 16, width: 'auto', objectFit: 'contain', opacity: 0.6 }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => { setTitle(e.target.value); markDirty() }}
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

          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 6 }}>ALL DAY</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => { setAllDay(e.target.checked); markDirty() }}
                style={{ accentColor: 'var(--acc-lavender)' }}
              />
              SHOW AS ALL DAY
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
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 6 }}>SHOW AS BUSY</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={busy}
                onChange={(e) => { setBusy(e.target.checked); markDirty() }}
                style={{ accentColor: 'var(--acc-lavender)' }}
              />
              BLOCK TIME AS BUSY
            </label>
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
                gap: 10,
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

          <div style={{ flex: 1 }} />

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
              width: '100%',
              opacity: dirty ? 1 : 0.6,
            }}
          >
            SAVE
          </button>

          <div style={{ textAlign: 'center', marginTop: 4 }}>
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
      <style>{`
        @media (max-width: 767px) {
          .${panelId}-card { width: 100% !important; top: auto !important; bottom: 0 !important; max-height: 90vh; border-radius: var(--radius-sharp) var(--radius-sharp) 0 0; }
        }
      `}</style>
    </>
  )
}
