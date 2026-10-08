import { useEffect, useState } from 'react'
import { testNotice } from '../../../../supabase/functions/notify/copy.ts'
import { isCapacitorShell } from '../../lib/platform'
import { isTauri } from '../tray/native'
import { isPushSupported, sendTestNotification } from './api'
import { showLocal } from './local'
import type { DeviceChannel, DeviceState } from './plan'
import type { PushSubscriptionRow } from '../../lib/types'

// Settings → Notifications → Send a test notification (notify-fix, 2026-10-08): which way a
// notification reaches this device, what could stop it, and a test through that same way.

export function deviceChannel(): DeviceChannel {
  return isTauri() ? 'windows' : isCapacitorShell() ? 'android' : 'web'
}

/** This browser's own push endpoint (getRegistration, not .ready — that never settles without a worker). */
async function thisEndpoint(): Promise<string | null> {
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    return (await registration?.pushManager?.getSubscription())?.endpoint ?? null
  } catch {
    return null
  }
}

export async function readDeviceState(subs: readonly PushSubscriptionRow[]): Promise<DeviceState> {
  const channel = deviceChannel()
  if (channel === 'windows') return { channel, permission: 'granted', subscribed: false } // tray.rs toasts; Windows' own switch is out of sight
  if (channel === 'android') return { channel, permission: await (await import('./android')).androidPermission(), subscribed: false }
  if (!isPushSupported() || typeof Notification === 'undefined') return { channel, permission: 'unsupported', subscribed: false }
  const endpoint = await thisEndpoint()
  const permission = Notification.permission === 'default' ? 'prompt' : Notification.permission
  return { channel, permission, subscribed: !!endpoint && subs.some((s) => s.endpoint === endpoint) }
}

/** Re-read on mount, whenever the stored devices change, and after `bump()` (a test or a subscribe). */
export function useDeviceState(subs: readonly PushSubscriptionRow[]): [DeviceState | null, () => void] {
  const [state, setState] = useState<DeviceState | null>(null)
  const [n, setN] = useState(0)
  const endpoints = subs.map((s) => s.endpoint).join(' ') // `subs` is a fresh [] each render while loading
  useEffect(() => {
    let live = true
    void readDeviceState(subs).then((s) => live && setState(s))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the endpoints, not the array
  }, [endpoints, n])
  return [state, () => setN((x) => x + 1)]
}

/** Sends a test the way a real reminder reaches this device; resolves to what to tell the person. */
export async function testThisDevice(subs: readonly PushSubscriptionRow[]): Promise<string> {
  const channel = deviceChannel()
  if (channel === 'windows') {
    await showLocal(testNotice())
    return 'Sent — it should be in the corner of the screen. Nothing there? Check Windows Settings → System → Notifications → Kai’s Flow, and Do not disturb.'
  }
  if (channel === 'android') {
    const permission = await (await import('./android')).androidPermission(true)
    if (permission === 'denied') return 'Not sent — notifications are off for Kai’s Flow in Android Settings.'
    if (permission !== 'granted') return 'Not sent — notifications weren’t allowed.'
    await showLocal(testNotice())
    return 'Sent — pull down the notification shade.'
  }
  if (subs.length === 0) return 'Not sent — no device is subscribed yet. Tap “Subscribe this device” first.'
  const result = await sendTestNotification()
  return `Sent to ${result.sent} device${result.sent === 1 ? '' : 's'}${result.pruned ? ` · ${result.pruned} old one${result.pruned === 1 ? '' : 's'} cleared` : ''}.`
}
