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
let cachedEvents: unknown[] = []
vi.mock('../../lib/queryClient', () => ({ queryClient: { getQueryData: (key: string[]) => (key[0] === 'inbox_items' ? cachedInbox : key[0] === 'calendar_events' ? cachedEvents : []) } }))
// calendar-rail's one way onto the calendar; its Undo is recorded so a capture's Undo can be checked.
const placeTask = vi.fn()
const unplace = vi.fn()
vi.mock('../calendar/api', () => ({ placeTask: (...args: unknown[]) => (placeTask(...args), { event: { id: 'e1' }, undo: unplace }) }))
vi.mock('../../lib/outbox', () => ({ writeRow: (...args: unknown[]) => writeRow(...args) }))
vi.mock('../../lib/activity', () => ({ logActivity: vi.fn() }))
vi.mock('../../lib/toastStore', () => ({ useToastStore: { getState: () => ({ push }) } }))
vi.mock('../tasks/api', () => ({ createTask: (...args: unknown[]) => createTask(...args) }))

const { blockIfTimed, captureWithAI, enrichTypedInboxItem, enrichTypedTask, processQueuedCaptures, saveUntranscribedVoiceNote, transcribeAudio } = await import('./api')
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
  cachedEvents = []
  placeTask.mockReset()
  unplace.mockReset()
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

// Kai 2026-10-07: typed captures are written at once from the local parse; the AI's read follows.
describe('enrichTypedTask (a typed capture with structure)', () => {
  const created = {
    id: 't1', title: 'Call the bank asap about the mortgage', notes: null, due_at: '2026-10-08T12:00:00.000Z', priority: null,
    duration_min: null, project_id: null, domain_id: null, reminder_at: null, deleted_at: null,
  } as never
  const read = (over: Record<string, unknown> = {}) => ({
    data: { kind: 'task', cleaned_text: 'x', title: 'Call the bank about the mortgage', priority: 1, description: 'Ask about the fixed rate', confidence: 0.9, ...over },
    error: null,
  })

  it('fills only the empty fields, says so, and Undo puts back exactly what it wrote', async () => {
    invoke.mockResolvedValue(read({ due_at: '2026-12-01T09:00:00Z' }))

    await enrichTypedTask(created, 'Call the bank asap about the mortgage tomorrow 3pm')

    expect(writeRow).toHaveBeenCalledTimes(1)
    const [table, row] = writeRow.mock.calls[0] as [string, Record<string, unknown>]
    expect(table).toBe('tasks')
    // the typed date stands; priority, notes (and the tidied title) come from the AI
    expect(row).toMatchObject({ id: 't1', due_at: '2026-10-08T12:00:00.000Z', priority: 1, notes: 'Ask about the fixed rate', title: 'Call the bank about the mortgage' })
    const toast = push.mock.calls[0][0] as { message: string; onUndo: () => void }
    expect(toast.message).toBe('✦ Filled by AI: priority, notes')
    toast.onUndo()
    expect(writeRow.mock.calls[1][1]).toMatchObject({ id: 't1', priority: null, notes: null, title: 'Call the bank asap about the mortgage', due_at: '2026-10-08T12:00:00.000Z' })
  })

  it('offline, over the allowance or failing: the local parse stands, nothing written, no toast', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    await enrichTypedTask(created, 'x')
    vi.stubGlobal('navigator', { onLine: true })
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(json(429, { error: 'daily_limit' })) })
    await enrichTypedTask(created, 'x')
    invoke.mockRejectedValue(new Error('network'))
    await enrichTypedTask(created, 'x')

    expect(writeRow).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })
})

describe('enrichTypedInboxItem (a plain typed line, already in the Inbox)', () => {
  const item = {
    id: 'i9', kind: 'text', raw_text: 'call mum about sunday, urgent', transcript: null, ai_parse: null, confidence: null, status: 'pending',
    filed_task_id: null, payload: null, snoozed_until: null, created_at: '2026-10-07T08:00:00.000Z', updated_at: '2026-10-07T08:00:00.000Z',
  } as never

  it('a task the AI is sure of is filed for you, with Undo back to the Inbox', async () => {
    invoke.mockResolvedValue({ data: { kind: 'task', cleaned_text: 'x', title: 'Call mum about Sunday', priority: 1, confidence: 0.92 }, error: null })
    createTask.mockReturnValue({ id: 't9', title: 'Call mum about Sunday' })

    await enrichTypedInboxItem(item, 'call mum about sunday, urgent')

    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Call mum about Sunday', priority: 1 }))
    expect(writeRow).toHaveBeenCalledWith('inbox_items', expect.objectContaining({ id: 'i9', status: 'filed', filed_task_id: 't9', confidence: 0.92 }))
    const toast = push.mock.calls[0][0] as { message: string; onUndo: () => void }
    expect(toast.message).toBe('✦ Filed by AI: “Call mum about Sunday”')
    toast.onUndo()
    expect(writeRow).toHaveBeenCalledWith('tasks', { id: 't9', title: 'Call mum about Sunday' }, 'delete')
    expect(writeRow).toHaveBeenLastCalledWith('inbox_items', expect.objectContaining({ id: 'i9', status: 'pending', filed_task_id: null }))
  })

  it('anything less stays in the Inbox, quietly carrying the AI read for triage', async () => {
    invoke.mockResolvedValue({ data: { kind: 'note', cleaned_text: 'x', title: 'x', confidence: 0.4 }, error: null })

    await enrichTypedInboxItem(item, 'x')

    expect(createTask).not.toHaveBeenCalled()
    expect(writeRow).toHaveBeenCalledWith('inbox_items', expect.objectContaining({ id: 'i9', status: 'pending', confidence: 0.4 }))
    expect(push).not.toHaveBeenCalled()
  })
})

// Kai 2026-10-07 (the 4am complaint): a task given a TIME is on the calendar as a block; a date alone isn't.
describe('a timed capture lands on the calendar', () => {
  const base = { id: 't4', title: 'Crypto session', notes: null, due_at: null, priority: null, duration_min: null, project_id: null, domain_id: null, reminder_at: null, deleted_at: null }
  const at4 = '2026-10-08T01:00:00.000Z' // 04:00 Cairo

  it('blockIfTimed: a time → one block at it, its estimate or 30 minutes long; a date alone → none', () => {
    blockIfTimed({ ...base, due_at: at4 } as never, true)
    expect(placeTask).toHaveBeenLastCalledWith(expect.objectContaining({ id: 't4' }), at4, '2026-10-08T01:30:00.000Z')
    blockIfTimed({ ...base, due_at: at4, duration_min: 90 } as never, true)
    expect(placeTask).toHaveBeenLastCalledWith(expect.anything(), at4, '2026-10-08T02:30:00.000Z')
    expect(blockIfTimed({ ...base, due_at: at4 } as never, false)).toBeNull()
    expect(blockIfTimed(base as never, true)).toBeNull()
    expect(placeTask).toHaveBeenCalledTimes(2)
  })

  it('the AI filling a time (has_time) makes the block; its Undo takes the block off too', async () => {
    invoke.mockResolvedValue({ data: { kind: 'task', cleaned_text: 'x', title: 'Crypto session', due_at: at4, has_time: true, confidence: 0.9 }, error: null })
    await enrichTypedTask(base as never, 'crypto session at four in the morning')
    expect(placeTask).toHaveBeenCalledWith(expect.objectContaining({ id: 't4', due_at: at4 }), at4, '2026-10-08T01:30:00.000Z')
    const toast = push.mock.calls[0][0] as { message: string; onUndo: () => void }
    expect(toast.message).toBe('✦ Filled by AI: date')
    toast.onUndo()
    expect(unplace).toHaveBeenCalledTimes(1)
    expect(writeRow).toHaveBeenLastCalledWith('tasks', expect.objectContaining({ id: 't4', due_at: null }))
  })

  it('the AI filling a date alone (has_time false, or an old function without it) makes no block', async () => {
    invoke.mockResolvedValue({ data: { kind: 'task', cleaned_text: 'x', title: 'Crypto session', due_at: at4, has_time: false, confidence: 0.9 }, error: null })
    await enrichTypedTask(base as never, 'crypto session tomorrow')
    invoke.mockResolvedValue({ data: { kind: 'task', cleaned_text: 'x', title: 'Crypto session', due_at: at4, confidence: 0.9 }, error: null })
    await enrichTypedTask(base as never, 'crypto session tomorrow')
    expect(placeTask).not.toHaveBeenCalled()
  })

  it('a length the AI read stretches the default 30-minute block the typed time made', async () => {
    cachedEvents = [{ id: 'e1', task_id: 't4', starts_at: at4, ends_at: '2026-10-08T01:30:00.000Z', all_day: false, deleted_at: null }]
    invoke.mockResolvedValue({ data: { kind: 'task', cleaned_text: 'x', title: 'Crypto session', duration_min: 60, confidence: 0.9 }, error: null })
    await enrichTypedTask({ ...base, due_at: at4 } as never, 'crypto session 4am for an hour')
    expect(placeTask).toHaveBeenCalledWith(expect.objectContaining({ duration_min: 60 }), at4, '2026-10-08T02:00:00.000Z')
  })

  it('a timed task the AI files by itself goes on the calendar; Undo takes the block off before the task', async () => {
    invoke.mockResolvedValue({ data: { kind: 'task', cleaned_text: 'x', title: 'Crypto session', due_at: at4, has_time: true, confidence: 0.92 }, error: null })
    createTask.mockReturnValue({ ...base, due_at: at4 })
    await enrichTypedInboxItem({ id: 'i4', status: 'pending', raw_text: 'x' } as never, 'crypto session 4am tomorrow')
    expect(placeTask).toHaveBeenCalledWith(expect.objectContaining({ id: 't4' }), at4, '2026-10-08T01:30:00.000Z')
    ;(push.mock.calls[0][0] as { onUndo: () => void }).onUndo()
    expect(unplace.mock.invocationCallOrder[0]).toBeLessThan(writeRow.mock.invocationCallOrder[writeRow.mock.calls.findIndex((c) => c[2] === 'delete')])
  })

  it('voice / ⌘↵ captures with a time are blocked the same way', async () => {
    invoke.mockResolvedValue({ data: { kind: 'task', cleaned_text: 'x', title: 'Crypto session', due_at: at4, has_time: true, confidence: 0.92 }, error: null })
    createTask.mockReturnValue({ ...base, due_at: at4 })
    await captureWithAI('crypto session 4am tomorrow', 'voice', 'crypto session 4am tomorrow')
    expect(placeTask).toHaveBeenCalledTimes(1)
  })
})
