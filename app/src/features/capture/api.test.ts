import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FunctionsHttpError } from '@supabase/supabase-js'

// SEC-2: what capture does when the edge functions answer 429 {"error":"daily_limit"}.
const invoke = vi.fn()
const push = vi.fn()
const writeRow = vi.fn()
const createTask = vi.fn()

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'user-token' } } }) },
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}))
vi.mock('../../lib/queryClient', () => ({ queryClient: { getQueryData: () => [] } }))
vi.mock('../../lib/outbox', () => ({ writeRow: (...args: unknown[]) => writeRow(...args) }))
vi.mock('../../lib/activity', () => ({ logActivity: vi.fn() }))
vi.mock('../../lib/toastStore', () => ({ useToastStore: { getState: () => ({ push }) } }))
vi.mock('../tasks/api', () => ({ createTask: (...args: unknown[]) => createTask(...args) }))

const { captureWithAI, saveUntranscribedVoiceNote, transcribeAudio } = await import('./api')
const { AI_ALLOWANCE_USED_UP, DailyLimitError, INBOX_WITHOUT_AI } = await import('./aiAllowance')

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  vi.stubGlobal('navigator', { onLine: true })
  invoke.mockReset()
  push.mockReset()
  writeRow.mockReset()
  createTask.mockReset()
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
