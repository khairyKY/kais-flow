import { useState, type ReactNode } from 'react'
import {
  isPushSupported,
  useMyPushSubscriptions,
  subscribeThisDevice,
  unsubscribeThisDevice,
  sendTestNotification,
} from '../notifications/api'

function Card({ tapeSide, tapeTint, rotate, children }: { tapeSide: 'left' | 'right' | 'center'; tapeTint: string; rotate: number; children: ReactNode }) {
  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--bg-surface)',
        border: '1px solid var(--line-card)',
        boxShadow: 'var(--shadow-card)',
        borderRadius: 'var(--radius-sharp)',
        padding: '18px 20px',
        transform: `rotate(${rotate}deg)`,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: -8,
          ...(tapeSide === 'center' ? { left: '50%', marginLeft: -26 } : { [tapeSide]: 22 }),
          width: 52,
          height: 13,
          background: tapeTint,
          backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.3) 0 4px, transparent 4px 8px)',
          transform: 'rotate(-2deg)',
          borderRadius: 1,
          boxShadow: 'var(--shadow-crisp)',
        }}
      />
      {children}
    </div>
  )
}

function PushSettings() {
  const { data: subs = [] } = useMyPushSubscriptions()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const supported = isPushSupported()
  const thisDeviceLabel = navigator.userAgent.slice(0, 60)
  const subscribed = subs.some((s) => s.device_label === thisDeviceLabel)

  async function handleToggle() {
    setBusy(true)
    setMessage(null)
    try {
      if (subscribed) {
        await unsubscribeThisDevice()
        setMessage('Unsubscribed this device.')
      } else {
        await subscribeThisDevice()
        setMessage('Subscribed! You should get pushes on this device now.')
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function handleTest() {
    setBusy(true)
    setMessage(null)
    try {
      const result = await sendTestNotification()
      setMessage(`Sent to ${result.sent} device(s), pruned ${result.pruned} dead subscription(s).`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Test send failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card tapeSide="center" tapeTint="rgba(181,101,74,0.32)" rotate={-0.2}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 'var(--fw-semibold)', color: 'var(--text-primary)', marginBottom: 4 }}>
        Push notifications
      </div>
      {!supported ? (
        <p style={{ fontSize: 13.5, color: 'var(--acc-terra)', margin: '11px 0 2px', paddingTop: 11, borderTop: '1px dashed var(--line-dashed)' }}>
          Not supported on this browser. On iPhone, install this app to your home screen first
          (Share → Add to Home Screen) — Safari tabs can't receive push, only installed PWAs can.
        </p>
      ) : (
        <div style={{ padding: '11px 0 2px', borderTop: '1px dashed var(--line-dashed)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-tertiary)' }}>
            {subs.length} device{subs.length === 1 ? '' : 's'} subscribed.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleToggle}
              disabled={busy}
              style={{ border: '1px solid var(--border-default)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 12.5, padding: '8px 16px', borderRadius: 999, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}
            >
              {subscribed ? 'Unsubscribe this device' : 'Subscribe this device'}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={busy}
              style={{ border: 'none', background: 'none', color: 'var(--acc-terra)', fontFamily: 'inherit', fontSize: 12.5, textDecoration: 'underline', cursor: busy ? 'default' : 'pointer', padding: '8px 4px', opacity: busy ? 0.5 : 1 }}
            >
              Send test push
            </button>
          </div>
        </div>
      )}
      {message && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '10px 0 0' }}>{message}</p>}
    </Card>
  )
}

export function SettingsPage() {
  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 9 }}>
            Settings
          </div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 44, lineHeight: 1, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>Settings</h1>
        </div>
        <img src="assets/clover/seedling.png" alt="" style={{ height: 52, width: 'auto', objectFit: 'contain', marginBottom: 2, filter: 'var(--shadow-drop-sm)' }} />
      </div>

      <div style={{ height: 1, borderBottom: '1px dashed var(--border-default)', margin: '26px 0 30px' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 640 }}>
        <PushSettings />
        <p style={{ margin: 0, fontFamily: 'var(--font-hand)', fontSize: 17, color: 'var(--text-tertiary)', transform: 'rotate(-0.6deg)' }}>
          more integrations and preferences land here in later phases…
        </p>
      </div>
    </div>
  )
}
