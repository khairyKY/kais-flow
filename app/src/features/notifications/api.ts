import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { queryClient } from '../../lib/queryClient'
import { writeRow } from '../../lib/outbox'
import type { ActivityLogEntry, PushSubscriptionRow } from '../../lib/types'

// activity_log is excluded from realtime, but logActivity()'s writeRow updates this cache
// optimistically on every domain action, so new notifications appear as you work.
export function useRecentActivity() {
  return useQuery({
    queryKey: ['activity_log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as ActivityLogEntry[]
    },
    refetchInterval: 60_000,
  })
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

export function useMyPushSubscriptions() {
  return useQuery({
    queryKey: ['push_subscriptions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('push_subscriptions').select('*')
      if (error) throw error
      return data as PushSubscriptionRow[]
    },
  })
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}

/** This device opted in (Subscribe this device): kept so an app open can put a vanished subscription back. */
const PUSH_ON_KEY = 'kf-push-on'
function setPushOn(on: boolean): void {
  try {
    if (on) localStorage.setItem(PUSH_ON_KEY, '1')
    else localStorage.removeItem(PUSH_ON_KEY)
  } catch {
    /* private mode: the next open just doesn't re-subscribe */
  }
}

/** Settings → Subscribe this device. On iOS the permission prompt only shows for a request made inside the
 * tap, so the caller asks first (Notification.requestPermission(), the click handler's first await). */
export async function subscribeThisDevice(): Promise<void> {
  if (!isPushSupported()) throw new Error('Push not supported on this browser/device')
  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  if (!publicKey) throw new Error('Missing VITE_VAPID_PUBLIC_KEY')

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    })
  }
  setPushOn(true)
  await saveSubscription(subscription)
}

/** Every app open (AppLayout): iOS drops a Home Screen app's push subscription after a while, and a browser can
 * rotate it. On a device that opted in, with permission still granted: subscribe again if it went missing, and
 * store the current endpoint if the account doesn't have it — the same save as Subscribe. Quiet; never asks. */
let keptAt = 0
export async function keepPushSubscription(): Promise<void> {
  if (Date.now() - keptAt < 5 * 60_000) return // a return within five minutes: already looked
  keptAt = Date.now()
  try {
    if (!isPushSupported() || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const registration = await navigator.serviceWorker.getRegistration() // not .ready: it never settles without a worker
    if (!registration) return
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
      if (!publicKey) return
      // Opted in before this flag existed: the account still has this device's row (the label the save writes).
      if (localStorage.getItem(PUSH_ON_KEY) !== '1') {
        const { data } = await supabase.from('push_subscriptions').select('id').eq('device_label', navigator.userAgent.slice(0, 60)).limit(1)
        if (!data?.length) return
      }
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource })
    }
    setPushOn(true)
    await saveSubscription(subscription)
  } catch {
    /* offline, or the browser said no without a tap: Settings → Subscribe still works */
  }
}

async function saveSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys) throw new Error('Invalid push subscription')

  const existing = queryClient.getQueryData<PushSubscriptionRow[]>(['push_subscriptions']) ?? []
  if (existing.some((s) => s.endpoint === json.endpoint)) return

  // `endpoint` is unique (0005): a row this device already stored that the cache hasn't loaded keeps
  // its id — an upsert under a new id would be refused by the database and parked as "couldn't save".
  const { data: stored } = await supabase.from('push_subscriptions').select('id').eq('endpoint', json.endpoint).maybeSingle()
  writeRow('push_subscriptions', {
    id: (stored as { id: string } | null)?.id ?? crypto.randomUUID(),
    endpoint: json.endpoint,
    keys: json.keys as Record<string, string>,
    device_label: navigator.userAgent.slice(0, 60),
    created_at: new Date().toISOString(),
  })
}

export async function unsubscribeThisDevice(): Promise<void> {
  if (!isPushSupported()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  setPushOn(false)
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  const existing = queryClient.getQueryData<PushSubscriptionRow[]>(['push_subscriptions']) ?? []
  const row = existing.find((s) => s.endpoint === endpoint)
  if (row) writeRow('push_subscriptions', row, 'delete')
}

/** Resolves to `undefined` if `p` hasn't settled within `ms` (or rejects). */
function within<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p.catch(() => undefined), new Promise<undefined>((r) => setTimeout(r, ms))])
}

/** Sign-out: this device stops receiving the account's notifications. Deletes this device's
 * `push_subscriptions` row by endpoint — directly, not through the outbox, because sign-out
 * clears the outbox and ends the session right after — then drops the browser subscription.
 * Best-effort: never throws, and every step is time-boxed so it can't hold sign-out up
 * (`serviceWorker.ready` never settles without a service worker, e.g. on the dev server). */
export async function dropThisDevicePush(ms = 2000): Promise<void> {
  setPushOn(false)
  try {
    if (!isPushSupported()) return
    const registration = await within(navigator.serviceWorker.ready, ms)
    const subscription = registration && (await within(registration.pushManager.getSubscription(), ms))
    if (!subscription) return
    await within(Promise.resolve(supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)), ms)
    await within(subscription.unsubscribe(), ms)
  } catch {
    /* best effort — sign-out goes ahead regardless */
  }
}

export async function sendTestNotification(): Promise<{ sent: number; pruned: number }> {
  const { data, error } = await supabase.functions.invoke('notify', { body: { kind: 'test' } })
  if (error) throw error
  return data as { sent: number; pruned: number }
}
