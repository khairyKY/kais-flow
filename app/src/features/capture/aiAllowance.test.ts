import { describe, expect, it } from 'vitest'
import { FunctionsHttpError } from '@supabase/supabase-js'
import {
  AI_ALLOWANCE_USED_UP,
  DailyLimitError,
  INBOX_WITHOUT_AI,
  isDailyLimitError,
  isDailyLimitResponse,
} from './aiAllowance'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('isDailyLimitResponse (SEC-2: 429 {"error":"daily_limit"})', () => {
  it("recognises the functions' over-the-allowance answer", async () => {
    expect(await isDailyLimitResponse(json(429, { error: 'daily_limit' }))).toBe(true)
  })

  it('ignores any other 429 — a gateway or Groq rate limit is not our allowance', async () => {
    expect(await isDailyLimitResponse(json(429, { error: 'rate_limited' }))).toBe(false)
    expect(await isDailyLimitResponse(new Response('Too Many Requests', { status: 429 }))).toBe(false)
    expect(await isDailyLimitResponse(new Response(null, { status: 429 }))).toBe(false)
  })

  it('ignores the same body on any other status', async () => {
    for (const status of [200, 400, 401, 500, 502, 503]) {
      expect(await isDailyLimitResponse(json(status, { error: 'daily_limit' }))).toBe(false)
    }
  })

  it('leaves the body readable for the caller', async () => {
    const res = json(429, { error: 'daily_limit' })
    await isDailyLimitResponse(res)
    expect(await res.json()).toEqual({ error: 'daily_limit' })
  })
})

describe('isDailyLimitError', () => {
  it('recognises a functions.invoke FunctionsHttpError carrying the 429', async () => {
    expect(await isDailyLimitError(new FunctionsHttpError(json(429, { error: 'daily_limit' })))).toBe(true)
  })

  it('recognises DailyLimitError (the raw-fetch callers)', async () => {
    expect(await isDailyLimitError(new DailyLimitError())).toBe(true)
  })

  it('is false for every other failure', async () => {
    expect(await isDailyLimitError(new FunctionsHttpError(json(400, { error: 'bad' })))).toBe(false)
    expect(await isDailyLimitError(new FunctionsHttpError(json(503, { error: 'allowance unavailable' })))).toBe(false)
    expect(await isDailyLimitError(new Error('daily_limit'))).toBe(false)
    expect(await isDailyLimitError(null)).toBe(false)
    expect(await isDailyLimitError(undefined)).toBe(false)
  })
})

describe('copy (X5 States rule)', () => {
  it('never says "error" and never shows raw text', () => {
    for (const line of [AI_ALLOWANCE_USED_UP, INBOX_WITHOUT_AI]) {
      expect(line.toLowerCase()).not.toContain('error')
      expect(line).not.toContain('daily_limit')
      expect(line).not.toContain('429')
    }
  })

  it('the Inbox toast does not claim the AI step happened', () => {
    expect(INBOX_WITHOUT_AI).toMatch(/^Added to Inbox\./)
    expect(INBOX_WITHOUT_AI).toContain(AI_ALLOWANCE_USED_UP)
  })
})
