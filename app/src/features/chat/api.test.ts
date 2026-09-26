import { afterEach, describe, expect, it, vi } from 'vitest'

// SEC-2: streamChat tells the panel when the chat allowance for today is used up.
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'user-token' } } }) } },
}))

const { streamChat } = await import('./api')

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function handlers() {
  return { onDelta: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('streamChat', () => {
  it("reports reason 'daily_limit' for the allowance 429", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(429, { error: 'daily_limit' })))
    const h = handlers()
    await streamChat([{ role: 'user', content: 'hi' }], h)
    expect(h.onError).toHaveBeenCalledWith('daily_limit', 'daily_limit')
    expect(h.onDelta).not.toHaveBeenCalled()
  })

  it('reports no reason for any other failure', async () => {
    for (const res of [json(503, { error: 'allowance unavailable' }), json(429, { error: 'other' }), json(502, {})]) {
      vi.stubGlobal('fetch', vi.fn(async () => res))
      const h = handlers()
      await streamChat([{ role: 'user', content: 'hi' }], h)
      expect(h.onError).toHaveBeenCalledTimes(1)
      expect(h.onError.mock.calls[0][1]).toBeUndefined()
    }
  })

  it('still streams deltas and citations on success', async () => {
    const sse =
      'data: {"delta":"Hel"}\n\ndata: {"delta":"lo"}\n\nevent: done\ndata: {"citations":[{"entity_type":"task","entity_id":"t1","title":"T"}]}\n\n'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })))
    const h = handlers()
    await streamChat([{ role: 'user', content: 'hi' }], h)
    expect(h.onDelta.mock.calls.map((c) => c[0]).join('')).toBe('Hello')
    expect(h.onDone).toHaveBeenCalledWith([{ entity_type: 'task', entity_id: 't1', title: 'T' }])
    expect(h.onError).not.toHaveBeenCalled()
  })
})
