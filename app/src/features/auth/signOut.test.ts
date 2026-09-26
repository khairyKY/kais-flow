import { beforeEach, describe, expect, it, vi } from 'vitest'
import { unsyncedSignOutCopy } from './signOutCopy'

// P0-B (audit 2026-09-26): signing out offline deleted the queued writes, then failed to sign
// out, leaving the user signed in with the changes gone.

const delMock = vi.fn(async (_key: string) => {})
vi.mock('idb-keyval', () => ({ del: (key: string) => delMock(key) }))

const flushMock = vi.fn(async () => {})
const unsyncedMock = vi.fn(async () => 0)
vi.mock('../../lib/outbox', () => ({
  OUTBOX_KEY: 'kf-outbox',
  DEAD_KEY: 'kf-outbox-dead',
  flushOutbox: () => flushMock(),
  unsyncedChanges: () => unsyncedMock(),
  rescueEmptyUserIdWrites: vi.fn(),
}))

const authSignOutMock = vi.fn()
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      storageKey: 'sb-test-auth-token',
      signOut: (opts?: unknown) => authSignOutMock(opts),
    },
  },
}))
vi.mock('../../lib/queryClient', () => ({ queryClient: { clear: vi.fn() } }))
const dropPushMock = vi.fn(async () => {})
vi.mock('../notifications/api', () => ({ dropThisDevicePush: () => dropPushMock() }))
vi.mock('./recovery', () => ({ forgetRecovery: vi.fn(), rememberRecovery: vi.fn() }))

const net = { onLine: true }
vi.stubGlobal('navigator', net)

const local = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => local.get(k) ?? null,
  setItem: (k: string, v: string) => void local.set(k, v),
  removeItem: (k: string) => void local.delete(k),
})

describe('signOut', () => {
  beforeEach(() => {
    delMock.mockClear()
    flushMock.mockClear()
    unsyncedMock.mockReset()
    unsyncedMock.mockResolvedValue(0)
    authSignOutMock.mockReset()
    authSignOutMock.mockResolvedValue({ error: null })
    dropPushMock.mockClear()
    local.clear()
    local.set('sb-test-auth-token', '{"access_token":"t"}')
    local.set('kf-outbox-owner', 'u-1')
    net.onLine = true
  })

  it('with changes still unsynced after the flush: keeps them, stays signed in, reports how many', async () => {
    unsyncedMock.mockResolvedValue(2)
    const { signOut } = await import('./AuthProvider')
    expect(await signOut()).toBe(2)
    expect(flushMock).toHaveBeenCalledTimes(1)
    expect(delMock).not.toHaveBeenCalled()
    expect(authSignOutMock).not.toHaveBeenCalled()
    expect(dropPushMock).not.toHaveBeenCalled() // still signed in: keeps its notifications
    expect(local.get('kf-outbox-owner')).toBe('u-1')
  })

  it('with an empty queue: clears the outbox and signs out as before', async () => {
    const { signOut } = await import('./AuthProvider')
    expect(await signOut()).toBe(0)
    expect(delMock).toHaveBeenCalledWith('kf-outbox')
    expect(delMock).toHaveBeenCalledWith('kf-outbox-dead')
    expect(authSignOutMock).toHaveBeenCalledTimes(1)
    expect(authSignOutMock).toHaveBeenCalledWith(undefined) // global: the server session is revoked
    expect(local.has('kf-outbox-owner')).toBe(false)
  })

  it("drops this device's push subscription before the session ends (scope 4)", async () => {
    const { signOut } = await import('./AuthProvider')
    await signOut()
    expect(dropPushMock).toHaveBeenCalledTimes(1)
    expect(dropPushMock.mock.invocationCallOrder[0]).toBeLessThan(authSignOutMock.mock.invocationCallOrder[0])
  })

  it('"Discard & sign out" discards the unsynced changes and signs out', async () => {
    unsyncedMock.mockResolvedValue(3)
    const { signOut } = await import('./AuthProvider')
    expect(await signOut({ discardUnsynced: true })).toBe(0)
    expect(delMock).toHaveBeenCalledWith('kf-outbox')
    expect(authSignOutMock).toHaveBeenCalledTimes(1)
  })

  it('when the server cannot be reached, still ends the session on this device', async () => {
    authSignOutMock.mockImplementation(async (opts?: { scope?: string }) =>
      // supabase-js keeps the stored session on a failed /logout, even with scope 'local',
      // unless there's no stored session left to send.
      opts?.scope === 'local' && !local.has('sb-test-auth-token')
        ? { error: null }
        : { error: { name: 'AuthRetryableFetchError', status: 0 } },
    )
    const { signOut } = await import('./AuthProvider')
    expect(await signOut()).toBe(0)
    expect(local.has('sb-test-auth-token')).toBe(false)
    expect(authSignOutMock).toHaveBeenLastCalledWith({ scope: 'local' })
  })

  it('offline: ends the session on this device without trying the server', async () => {
    net.onLine = false
    const { signOut } = await import('./AuthProvider')
    expect(await signOut()).toBe(0)
    expect(local.has('sb-test-auth-token')).toBe(false)
    expect(authSignOutMock).toHaveBeenCalledTimes(1)
    expect(authSignOutMock).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('also falls back when supabase-js throws', async () => {
    authSignOutMock.mockImplementationOnce(async () => {
      throw new TypeError('Failed to fetch')
    })
    const { signOut } = await import('./AuthProvider')
    expect(await signOut()).toBe(0)
    expect(local.has('sb-test-auth-token')).toBe(false)
    expect(authSignOutMock).toHaveBeenLastCalledWith({ scope: 'local' })
  })
})

describe('unsyncedSignOutCopy', () => {
  it('names the count, singular and plural', () => {
    expect(unsyncedSignOutCopy(1).title).toBe('1 change hasn’t synced yet')
    expect(unsyncedSignOutCopy(4).title).toBe('4 changes haven’t synced yet')
  })

  it('short button labels that fit one line in the 300px card (Polish E)', () => {
    for (const n of [1, 4]) {
      expect(unsyncedSignOutCopy(n).confirmLabel).toBe('Discard & sign out')
      expect(unsyncedSignOutCopy(n).cancelLabel).toBe('Stay signed in')
    }
  })

  it('the body still says the changes would be discarded', () => {
    expect(unsyncedSignOutCopy(1).body).toMatch(/discard it\.$/)
    expect(unsyncedSignOutCopy(4).body).toMatch(/discard them\.$/)
  })

  it('never says "error" (house rule)', () => {
    for (const n of [1, 2, 50]) expect(JSON.stringify(unsyncedSignOutCopy(n))).not.toMatch(/error/i)
  })
})
