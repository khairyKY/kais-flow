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
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys) throw new Error('Invalid push subscription')

  const existing = queryClient.getQueryData<PushSubscriptionRow[]>(['push_subscriptions']) ?? []
  if (existing.some((s) => s.endpoint === json.endpoint)) return

  writeRow('push_subscriptions', {
    id: crypto.randomUUID(),
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
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  const existing = queryClient.getQueryData<PushSubscriptionRow[]>(['push_subscriptions']) ?? []
  const row = existing.find((s) => s.endpoint === endpoint)
  if (row) writeRow('push_subscriptions', row, 'delete')
}

export async function sendTestNotification(): Promise<{ sent: number; pruned: number }> {
  const { data, error } = await supabase.functions.invoke('notify', { body: { kind: 'test' } })
  if (error) throw error
  return data as { sent: number; pruned: number }
}
