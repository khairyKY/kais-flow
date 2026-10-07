import { describe, expect, it } from 'vitest'
import { CANCEL_DISTANCE, LOCK_DISTANCE, appendDictation, clickIsTap, formatTake, holdStep, micAction, type HoldEvent, type HoldState } from './holdToTalk'

/** Runs events from idle; returns the final state and every non-null effect in order. */
function run(...events: HoldEvent[]): { state: HoldState; effects: string[] } {
  let state: HoldState = { phase: 'idle' }
  const effects: string[] = []
  for (const e of events) {
    const [next, effect] = holdStep(state, e)
    state = next
    if (effect) effects.push(effect)
  }
  return { state, effects }
}

const down = { type: 'down', x: 200, y: 800 } as const
const at = (x: number, y: number) => ({ type: 'move', x, y }) as const

describe('holdStep — hold-to-talk on the capture button', () => {
  it('a quick tap never opens the mic (the click handler opens the capture sheet)', () => {
    expect(run(down, { type: 'up' })).toEqual({ state: { phase: 'idle' }, effects: [] })
  })

  it('moving before the long-press is not a gesture yet', () => {
    expect(run(down, at(200, 600), { type: 'up' }).effects).toEqual([])
  })

  it('hold ≥ long-press starts recording; release sends', () => {
    expect(run(down, { type: 'longpress' }).effects).toEqual(['start'])
    expect(run(down, { type: 'longpress' }, { type: 'up' })).toEqual({ state: { phase: 'idle' }, effects: ['start', 'send'] })
  })

  it('tracks the slide (left/up only) while recording', () => {
    const { state } = run(down, { type: 'longpress' }, at(170, 760))
    expect(state).toMatchObject({ phase: 'recording', dx: -30, dy: -40 })
    expect(run(down, { type: 'longpress' }, at(260, 900)).state).toMatchObject({ dx: 0, dy: 0 })
  })

  it('sliding up onto the lock goes hands-free; lifting the finger keeps recording', () => {
    const r = run(down, { type: 'longpress' }, at(200, 800 - LOCK_DISTANCE), { type: 'up' })
    expect(r).toEqual({ state: { phase: 'locked' }, effects: ['start', 'lock'] })
  })

  it('locked: Send files it, Cancel discards it', () => {
    const locked = [down, { type: 'longpress' }, at(200, 800 - LOCK_DISTANCE), { type: 'up' }] as const
    expect(run(...locked, { type: 'send' })).toEqual({ state: { phase: 'idle' }, effects: ['start', 'lock', 'send'] })
    expect(run(...locked, { type: 'discard' })).toEqual({ state: { phase: 'idle' }, effects: ['start', 'lock', 'discard'] })
  })

  it('sliding left past the cancel distance discards once; the later release does nothing', () => {
    const r = run(down, { type: 'longpress' }, at(200 - CANCEL_DISTANCE, 800), at(40, 800), { type: 'up' })
    expect(r).toEqual({ state: { phase: 'idle' }, effects: ['start', 'discard'] })
  })

  it('a stolen pointer mid-recording parks the take hands-free instead of losing it', () => {
    expect(run(down, { type: 'longpress' }, { type: 'cancel' })).toEqual({ state: { phase: 'locked' }, effects: ['start', 'lock'] })
    expect(run(down, { type: 'cancel' })).toEqual({ state: { phase: 'idle' }, effects: [] })
  })

  it('a refused mic ends the hold without sending anything on release', () => {
    expect(run(down, { type: 'longpress' }, { type: 'fail' }, { type: 'up' })).toEqual({ state: { phase: 'idle' }, effects: ['start'] })
  })

  it('the locked bar buttons do nothing outside the locked state', () => {
    expect(run(down, { type: 'longpress' }, { type: 'send' }).state.phase).toBe('recording')
    expect(run({ type: 'discard' }).state.phase).toBe('idle')
  })
})

describe('which capture surface opens', () => {
  it('a tap or Enter/Space on the button opens the capture sheet; the click that ends a hold does not', () => {
    expect(clickIsTap(1, false)).toBe(true)
    expect(clickIsTap(0, true)).toBe(true) // keyboard: there is no hold
    expect(clickIsTap(1, true)).toBe(false)
  })

  it("the bar's mic: the voice sheet on a phone (hold-to-talk's tap twin), dictation on desktop", () => {
    expect(micAction(true)).toBe('voice-sheet')
    expect(micAction(false)).toBe('dictate')
  })
})

describe('appendDictation', () => {
  it('joins dictated words to what is typed with one space', () => {
    expect(appendDictation('', ' call mum tomorrow ')).toBe('call mum tomorrow')
    expect(appendDictation('Email Priya ', 'the slides tomorrow 9')).toBe('Email Priya the slides tomorrow 9')
    expect(appendDictation('Email Priya', '')).toBe('Email Priya')
  })
})

describe('formatTake', () => {
  it('formats m:ss', () => {
    expect(formatTake(0)).toBe('0:00')
    expect(formatTake(4_900)).toBe('0:04')
    expect(formatTake(72_000)).toBe('1:12')
  })
})
