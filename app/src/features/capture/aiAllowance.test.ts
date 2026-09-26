import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FunctionsHttpError } from '@supabase/supabase-js'
import {
  AI_ALLOWANCE_USED_UP,
  DailyLimitError,
  INBOX_WITHOUT_AI,
  VOICE_ALLOWANCE_USED_UP,
  isDailyLimitError,
  isDailyLimitResponse,
  rememberVoiceLimitReached,
  voiceLimitReachedToday,
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
    for (const line of [AI_ALLOWANCE_USED_UP, INBOX_WITHOUT_AI, VOICE_ALLOWANCE_USED_UP]) {
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

describe('voice daily limit, remembered for the rest of the Cairo day (Polish E)', () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // Cairo is UTC+3 until late October 2026, so 21:30 UTC on the 26th is already the 27th there.
  const lateEvening = new Date('2026-09-26T20:30:00Z') // 23:30 Cairo, the 26th
  const afterCairoMidnight = new Date('2026-09-26T21:30:00Z') // 00:30 Cairo, the 27th

  it('is not set until a daily-limit reply has been remembered', () => {
    expect(voiceLimitReachedToday('u1', lateEvening)).toBe(false)
  })

  it('holds for the rest of that Cairo day, for the same account', () => {
    rememberVoiceLimitReached('u1', new Date('2026-09-26T06:00:00Z'))
    expect(voiceLimitReachedToday('u1', lateEvening)).toBe(true)
  })

  it("lifts at Cairo midnight, even though it's still the 26th in UTC", () => {
    rememberVoiceLimitReached('u1', lateEvening)
    expect(voiceLimitReachedToday('u1', afterCairoMidnight)).toBe(false)
  })

  it("doesn't tell another account on this browser that its allowance is gone", () => {
    rememberVoiceLimitReached('u1', lateEvening)
    expect(voiceLimitReachedToday('u2', lateEvening)).toBe(false)
    expect(voiceLimitReachedToday(undefined, lateEvening)).toBe(false)
  })

  it('treats unreadable or blocked storage as "not remembered" instead of throwing', () => {
    store.set('kf-voice-limit-day', '{not json')
    expect(voiceLimitReachedToday('u1', lateEvening)).toBe(false)
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() => rememberVoiceLimitReached('u1', lateEvening)).not.toThrow()
    expect(voiceLimitReachedToday('u1', lateEvening)).toBe(false)
  })
})
