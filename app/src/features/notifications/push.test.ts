import { beforeEach, describe, expect, it, vi } from 'vitest'

// Scope (4), 2026-09-26: sign-out drops this device's push subscription, so a shared device
// stops receiving the previous account's notifications. Best-effort, never blocks sign-out.

const calls: string[] = []
const deleteEqMock = vi.fn(async (_col: string, _val: string) => ({ error: null as unknown }))
const stored: { id: string; endpoint: string }[] = []
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      delete: () => ({
        eq: (col: string, val: string) => {
          calls.push(`delete ${table} ${col}=${val}`)
          return deleteEqMock(col, val)
        },
      }),
      select: () => ({
        eq: (_col: string, endpoint: string) => ({
          maybeSingle: async () => ({ data: stored.find((r) => r.endpoint === endpoint) ?? null, error: null }),
        }),
      }),
    }),
  },
}))
const cache: { rows: unknown[] } = { rows: [] }
vi.mock('../../lib/queryClient', () => ({ queryClient: { getQueryData: () => cache.rows } }))
const writeRow = vi.fn()
vi.mock('../../lib/outbox', () => ({ writeRow: (...a: unknown[]) => writeRow(...a) }))

function device(opts: { subscribed: boolean; ready?: boolean }) {
  const subscription = {
    endpoint: 'https://push.example/abc',
    unsubscribe: vi.fn(async () => {
      calls.push('unsubscribe')
      return true
    }),
  }
  const json = { endpoint: subscription.endpoint, keys: { p256dh: 'p', auth: 'a' } }
  const registration = { pushManager: { getSubscription: async () => (opts.subscribed ? { ...subscription, toJSON: () => json } : null) } }
  vi.stubGlobal('window', { PushManager: function PushManager() {} })
  vi.stubGlobal('navigator', {
    serviceWorker: { ready: opts.ready === false ? new Promise(() => {}) : Promise.resolve(registration) },
    userAgent: 'test',
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

describe('subscribeThisDevice', () => {
  beforeEach(() => {
    stored.length = 0
    cache.rows = []
    writeRow.mockClear()
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'BKey')
  })

  it("reuses the stored row's id for this endpoint — a new id onto the unique endpoint would be refused", async () => {
    device({ subscribed: true })
    stored.push({ id: 'row-1', endpoint: 'https://push.example/abc' })
    const { subscribeThisDevice } = await import('./api')
    await subscribeThisDevice()
    expect(writeRow).toHaveBeenCalledTimes(1)
    expect(writeRow.mock.calls[0][1]).toMatchObject({ id: 'row-1', endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } })
  })

  it('a new endpoint gets a new row; one already in the cache writes nothing', async () => {
    device({ subscribed: true })
    const { subscribeThisDevice } = await import('./api')
    await subscribeThisDevice()
    expect(writeRow.mock.calls[0][1].id).toMatch(/^[0-9a-f-]{36}$/)
    writeRow.mockClear()
    cache.rows = [{ id: 'row-1', endpoint: 'https://push.example/abc' }]
    await subscribeThisDevice()
    expect(writeRow).not.toHaveBeenCalled()
  })
})
