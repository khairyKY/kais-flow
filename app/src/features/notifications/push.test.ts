import { beforeEach, describe, expect, it, vi } from 'vitest'

// Scope (4), 2026-09-26: sign-out drops this device's push subscription, so a shared device
// stops receiving the previous account's notifications. Best-effort, never blocks sign-out.

const calls: string[] = []
const deleteEqMock = vi.fn(async (_col: string, _val: string) => ({ error: null as unknown }))
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      delete: () => ({
        eq: (col: string, val: string) => {
          calls.push(`delete ${table} ${col}=${val}`)
          return deleteEqMock(col, val)
        },
      }),
    }),
  },
}))
vi.mock('../../lib/queryClient', () => ({ queryClient: {} }))
vi.mock('../../lib/outbox', () => ({ writeRow: vi.fn() }))

function device(opts: { subscribed: boolean; ready?: boolean }) {
  const subscription = {
    endpoint: 'https://push.example/abc',
    unsubscribe: vi.fn(async () => {
      calls.push('unsubscribe')
      return true
    }),
  }
  const registration = { pushManager: { getSubscription: async () => (opts.subscribed ? subscription : null) } }
  vi.stubGlobal('window', { PushManager: function PushManager() {} })
  vi.stubGlobal('navigator', {
    serviceWorker: { ready: opts.ready === false ? new Promise(() => {}) : Promise.resolve(registration) },
  })
  return subscription
}

describe('dropThisDevicePush', () => {
  beforeEach(() => {
    calls.length = 0
    deleteEqMock.mockClear()
    deleteEqMock.mockResolvedValue({ error: null })
  })

  it("deletes this device's row by endpoint, then unsubscribes the browser", async () => {
    const sub = device({ subscribed: true })
    const { dropThisDevicePush } = await import('./api')
    await dropThisDevicePush()
    expect(calls).toEqual(['delete push_subscriptions endpoint=https://push.example/abc', 'unsubscribe'])
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('does nothing when this device has no subscription', async () => {
    device({ subscribed: false })
    const { dropThisDevicePush } = await import('./api')
    await dropThisDevicePush()
    expect(calls).toEqual([])
  })

  it('still unsubscribes when the row delete fails (offline), and never throws', async () => {
    deleteEqMock.mockResolvedValue({ error: { message: 'Failed to fetch' } })
    const sub = device({ subscribed: true })
    const { dropThisDevicePush } = await import('./api')
    await expect(dropThisDevicePush()).resolves.toBeUndefined()
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('never throws when the delete itself throws', async () => {
    deleteEqMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const sub = device({ subscribed: true })
    const { dropThisDevicePush } = await import('./api')
    await expect(dropThisDevicePush()).resolves.toBeUndefined()
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it("can't hold sign-out up when no service worker ever becomes ready", async () => {
    device({ subscribed: true, ready: false })
    const { dropThisDevicePush } = await import('./api')
    const started = Date.now()
    await dropThisDevicePush(50)
    expect(Date.now() - started).toBeLessThan(1000)
    expect(calls).toEqual([])
  })
})
