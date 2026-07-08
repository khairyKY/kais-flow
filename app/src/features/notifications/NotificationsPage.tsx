import { useEffect, useMemo, useState } from 'react'
import { useAppSettings, updateAppSetting } from '../../lib/settings'
import { useRecentActivity } from './api'
import type { ActivityLogEntry } from '../../lib/types'

const ALLOWED_EVENT_TYPES = new Set([
  'capture.autofiled',
  'task.reminder_sent',
  'notify.sent',
  'routine.checked',
  'entity.reviewed',
])

const EVENT_LABELS: Record<string, string> = {
  'capture.autofiled': 'Capture filed',
  'task.reminder_sent': 'Task reminder',
  'notify.sent': 'Digest sent',
  'routine.checked': 'Routine checked',
  'entity.reviewed': 'Reviewed',
}

type Tab = 'unread' | 'all'

export function NotificationsPage() {
  const { data: settings } = useAppSettings()
  const { data: rawEntries = [] } = useRecentActivity()
  const [tab, setTab] = useState<Tab>('unread')

  const entries = useMemo(() => rawEntries.filter((e) => ALLOWED_EVENT_TYPES.has(e.event_type)), [rawEntries])

  const lastSeen = settings?.notifications_last_seen_at ? new Date(settings.notifications_last_seen_at) : new Date(0)
  const unreadCount = entries.filter((e) => new Date(e.created_at) > lastSeen).length

  const shown = tab === 'unread' ? entries.filter((e) => new Date(e.created_at) > lastSeen) : entries

  useEffect(() => {
    if (unreadCount > 0) updateAppSetting('notifications_last_seen_at', new Date().toISOString())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 9 }}>
            Activity
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 44, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>
            Activity
          </h1>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)' }}>
          {unreadCount} unread
        </span>
      </div>

      <div style={{ height: 1, borderBottom: '1px dashed var(--border-default)', margin: '26px 0 24px' }} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <TabButton active={tab === 'unread'} onClick={() => setTab('unread')}>Unread ({unreadCount})</TabButton>
        <TabButton active={tab === 'all'} onClick={() => setTab('all')}>All ({entries.length})</TabButton>
      </div>

      {shown.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-hand)', fontSize: 18, color: 'var(--text-tertiary)', margin: '40px 0 0', transform: 'rotate(-0.5deg)' }}>
          All caught up.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 640 }}>
          {shown.map((entry) => (
            <NotificationRow key={entry.id} entry={entry} lastSeen={lastSeen} />
          ))}
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11.5,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        background: active ? 'var(--bg-surface)' : 'none',
        color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
        border: active ? '1px solid var(--line-card)' : '1px solid transparent',
        borderRadius: 'var(--radius-input)',
        padding: '6px 16px',
        cursor: 'pointer',
        boxShadow: active ? 'var(--shadow-card)' : 'none',
      }}
    >
      {children}
    </button>
  )
}

function NotificationRow({ entry, lastSeen }: { entry: ActivityLogEntry; lastSeen: Date }) {
  const isUnread = new Date(entry.created_at) > lastSeen
  const label = EVENT_LABELS[entry.event_type] ?? entry.event_type
  const ts = new Date(entry.created_at)
  const timeStr = ts.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 0',
        borderBottom: '1px dashed var(--line-dashed)',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: isUnread ? 'var(--acc-terra)' : 'transparent',
          border: isUnread ? 'none' : '1px solid var(--line-sidebar)',
          flex: 'none',
          marginTop: 5,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>{label}</div>
        {entry.payload && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {JSON.stringify(entry.payload).slice(0, 80)}
          </div>
        )}
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-tertiary)', flex: 'none' }}>
        {timeStr}
      </span>
    </div>
  )
}
