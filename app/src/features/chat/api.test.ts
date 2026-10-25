import { afterEach, describe, expect, it, vi } from 'vitest'

// SEC-2: streamChat tells the panel when the chat allowance for today is used up.
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'user-token' } } }) } },
}))

const { runChatCalls, streamChat } = await import('./api')

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
    expect(h.onDone).toHaveBeenCalledWith([{ entity_type: 'task', entity_id: 't1', title: 'T' }], undefined)
    expect(h.onError).not.toHaveBeenCalled()
  })

  // Queue item 5: a plan arrives with the done event — nothing changed yet.
  it('hands over a plan to confirm, and sends the clock style', async () => {
    const plan = { calls: [{ tool: 'add_event', args: { title: 'Gym', start: '2026-10-26T07:00', end: '2026-10-26T08:15' } }], previews: [{ added: { title: 'Gym' } }] }
    const fetch = vi.fn(async () => new Response(`event: done\ndata: ${JSON.stringify({ citations: [], plan })}\n\n`, { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const h = handlers()
    await streamChat([{ role: 'user', content: 'gym monday 7' }], h)
    expect(h.onDone).toHaveBeenCalledWith([], plan)
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ hour24: false })
  })

  it("says 'busy' when the shared plan is out of tokens this minute", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(503, { error: 'busy' })))
    const h = handlers()
    await streamChat([{ role: 'user', content: 'hi' }], h)
    expect(h.onError).toHaveBeenCalledWith('busy', 'busy')
  })
})

describe('runChatCalls', () => {
  it('posts the confirmed calls and returns what each tool said', async () => {
    const results = [{ tool: 'add_event', args: {}, ok: true, output: { added: { id: 'e1' } } }]
    const restore = { put: [], drop: [{ table: 'calendar_events', id: 'e1' }] }
    const fetch = vi.fn(async () => json(200, { results, restore }))
    vi.stubGlobal('fetch', fetch)
    expect(await runChatCalls([{ tool: 'add_event', args: { title: 'Gym' } }])).toEqual({ results, restore })
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ run: [{ tool: 'add_event', args: { title: 'Gym' } }] })
  })

  it("throws when the request fails — the panel then says it can't tell what ran", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(500, {})))
    await expect(runChatCalls([{ tool: 'add_event', args: {} }])).rejects.toThrow()
  })
})
