import { useState } from 'react'
import {
  isPushSupported,
  useMyPushSubscriptions,
  subscribeThisDevice,
  unsubscribeThisDevice,
  sendTestNotification,
} from '../notifications/api'

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
    <section className="space-y-2 rounded border p-3">
      <h2 className="text-sm font-semibold">Push notifications</h2>
      {!supported ? (
        <p className="text-sm text-amber-600">
          Not supported on this browser. On iPhone, install this app to your home screen first
          (Share → Add to Home Screen) — Safari tabs can't receive push, only installed PWAs can.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-500">
            {subs.length} device{subs.length === 1 ? '' : 's'} subscribed.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleToggle}
              disabled={busy}
              className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50"
            >
              {subscribed ? 'Unsubscribe this device' : 'Subscribe this device'}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={busy}
              className="rounded border px-3 py-1 text-sm disabled:opacity-50"
            >
              Send test push
            </button>
          </div>
        </>
      )}
      {message && <p className="text-xs text-slate-500">{message}</p>}
    </section>
  )
}

export function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Settings</h1>
      <PushSettings />
      <p className="text-sm text-slate-500">More integrations and preferences land here in later phases.</p>
    </div>
  )
}
