import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FunctionsHttpError } from '@supabase/supabase-js'

// SEC-2: what capture does when the edge functions answer 429 {"error":"daily_limit"}.
const invoke = vi.fn()
const push = vi.fn()
const writeRow = vi.fn()
const createTask = vi.fn()

// The server-side claim processQueuedCaptures makes: from().update().eq().eq().select() → claimRows.
const claimCalls: unknown[][] = []
let claimRows: { id: string }[] = []
const claim = {
  update: (...a: unknown[]) => (claimCalls.push(['update', ...a]), claim),
  eq: (...a: unknown[]) => (claimCalls.push(['eq', ...a]), claim),
  select: async () => ({ data: claimRows, error: null }),
}
let cachedInbox: unknown[] = []

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'user-token' } } }) },
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    from: (table: string) => (claimCalls.push(['from', table]), claim),
  },
}))
vi.mock('../../lib/queryClient', () => ({ queryClient: { getQueryData: (key: string[]) => (key[0] === 'inbox_items' ? cachedInbox : []) } }))
vi.mock('../../lib/outbox', () => ({ writeRow: (...args: unknown[]) => writeRow(...args) }))
vi.mock('../../lib/activity', () => ({ logActivity: vi.fn() }))
vi.mock('../../lib/toastStore', () => ({ useToastStore: { getState: () => ({ push }) } }))
vi.mock('../tasks/api', () => ({ createTask: (...args: unknown[]) => createTask(...args) }))

const { captureWithAI, processQueuedCaptures, saveUntranscribedVoiceNote, transcribeAudio } = await import('./api')
const { AI_ALLOWANCE_USED_UP, DailyLimitError, INBOX_WITHOUT_AI } = await import('./aiAllowance')

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  vi.stubGlobal('navigator', { onLine: true })
  invoke.mockReset()
  push.mockReset()
  writeRow.mockReset()
  createTask.mockReset()
  claimCalls.length = 0
  claimRows = []
  cachedInbox = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('captureWithAI when the parse allowance is used up', () => {
  it('still lands the capture in the Inbox, unparsed, and says the AI step was skipped', async () => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(json(429, { error: 'daily_limit' })) })

    await captureWithAI('call the plumber tomorrow')

    expect(createTask).not.toHaveBeenCalled()
    expect(writeRow).toHaveBeenCalledTimes(1)
    const [table, row] = writeRow.mock.calls[0] as [string, Record<string, unknown>]
    expect(table).toBe('inbox_items')
    expect(row).toMatchObject({ raw_text: 'call the plumber tomorrow', ai_parse: null, confidence: null, status: 'pending' })
    expect(push).toHaveBeenCalledWith({ message: INBOX_WITHOUT_AI })
  })

  it('keeps the old toast for any other parse failure', async () => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(json(502, { error: 'upstream' })) })

    await captureWithAI('call the plumber tomorrow')

    expect(writeRow).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith({ message: 'Added to Inbox for review' })
  })

  it('a successful low-confidence parse is unchanged', async () => {
    invoke.mockResolvedValue({
      data: { kind: 'note', cleaned_text: 'x', title: 'x', confidence: 0.4 },
      error: null,
    })

    await captureWithAI('x')

    expect(push).toHaveBeenCalledWith({ message: 'Added to Inbox for review' })
  })
})

describe('transcribeAudio', () => {
  it('throws DailyLimitError on the daily_limit 429', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(429, { error: 'daily_limit' })))
    await expect(transcribeAudio(new Blob(['x']))).rejects.toBeInstanceOf(DailyLimitError)
  })

  it('throws a plain Error for anything else', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(503, { error: 'allowance unavailable' })))
    const err = await transcribeAudio(new Blob(['x'])).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(DailyLimitError)
  })

  it('returns the text on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { text: 'hello' })))
    expect(await transcribeAudio(new Blob(['x']))).toBe('hello')
  })

  it('the voice copy for this state is the calm allowance line', () => {
    expect(AI_ALLOWANCE_USED_UP).toBe("Today's AI allowance is used up — it refills tomorrow.")
  })
})

describe('saveUntranscribedVoiceNote (Polish E: never lose a recording)', () => {
  it('writes one pending voice item to the Inbox through the outbox, with no transcript', () => {
    const item = saveUntranscribedVoiceNote()

    expect(writeRow).toHaveBeenCalledTimes(1)
    const [table, row] = writeRow.mock.calls[0] as [string, Record<string, unknown>]
    expect(table).toBe('inbox_items')
    expect(row).toBe(item)
    expect(row).toMatchObject({
      kind: 'voice',
      raw_text: 'Voice note (not transcribed yet)',
      transcript: null,
      ai_parse: null,
      confidence: null,
      status: 'pending',
      filed_task_id: null,
      snoozed_until: null,
    })
    expect(push).toHaveBeenCalledWith({ message: 'Saved to Inbox — not transcribed yet.' })
  })

  it("isn't queued for the reconnect parser — there's no text to parse", () => {
    const item = saveUntranscribedVoiceNote()
    expect((item.payload as { needs_parse?: boolean } | null)?.needs_parse).toBeUndefined()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('only uses columns inbox_items already has', () => {
    const item = saveUntranscribedVoiceNote()
    expect(Object.keys(item).sort()).toEqual(
      ['id', 'kind', 'raw_text', 'transcript', 'ai_parse', 'confidence', 'status', 'filed_task_id', 'payload', 'snoozed_until', 'created_at', 'updated_at'].sort(),
    )
  })
})

// ?file=1 on the capture endpoint (supabase/functions/capture) queues the item with needs_parse.
describe('processQueuedCaptures with an endpoint capture', () => {
  const item = {
    id: 'i1', kind: 'text', raw_text: 'dentist friday 3pm', transcript: null, ai_parse: null, confidence: null, status: 'pending',
    filed_task_id: null, payload: { source: 'capture', needs_parse: true }, snoozed_until: null,
    created_at: '2026-10-01T20:00:00.000Z', updated_at: '2026-10-01T20:00:00.000Z',
  }
  const parse = { kind: 'task', cleaned_text: 'dentist friday 3pm', title: 'Dentist', due_at: '2026-10-02T12:00:00.000Z', confidence: 0.9 }

  it('claims it on the server, parses it as of when it was sent and files the task', async () => {
    cachedInbox = [item]
    claimRows = [{ id: 'i1' }]
    invoke.mockResolvedValue({ data: parse, error: null })
    createTask.mockReturnValue({ id: 't1', title: 'Dentist' })

    await processQueuedCaptures()

    expect(claimCalls).toEqual([['from', 'inbox_items'], ['update', { payload: { source: 'capture' } }], ['eq', 'id', 'i1'], ['eq', 'payload->>needs_parse', 'true']])
    expect((invoke.mock.calls[0][1] as { body: { context: { today: string } } }).body.context.today).toBe(item.created_at)
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dentist', dueAt: parse.due_at }))
    expect(writeRow).toHaveBeenCalledWith('inbox_items', expect.objectContaining({ id: 'i1', status: 'filed', filed_task_id: 't1', payload: { source: 'capture' } }))
  })

  it('leaves it alone when another device claimed it first', async () => {
    cachedInbox = [item]
    claimRows = []

    await processQueuedCaptures()

    expect(invoke).not.toHaveBeenCalled()
    expect(createTask).not.toHaveBeenCalled()
    expect(writeRow).not.toHaveBeenCalled()
  })
})
