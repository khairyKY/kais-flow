import { describe, expect, it } from 'vitest'
import {
  KEPT_ACTIONS,
  KEPT_AUDIO_NOTE,
  KEPT_HAND,
  KEPT_STATUS,
  RESTING,
  SAVED_UNTRANSCRIBED,
  UNTRANSCRIBED_VOICE_NOTE,
  keptReasonLine,
} from './voiceCopy'
import { VOICE_ALLOWANCE_USED_UP } from './aiAllowance'

const everyLine = [
  UNTRANSCRIBED_VOICE_NOTE,
  SAVED_UNTRANSCRIBED,
  KEPT_STATUS,
  KEPT_HAND,
  KEPT_AUDIO_NOTE,
  ...Object.values(KEPT_ACTIONS),
  ...Object.values(RESTING),
  keptReasonLine('limit'),
  keptReasonLine('offline'),
  keptReasonLine('other'),
]

describe('voice sheet copy (Polish E, X5 States rule)', () => {
  it('never says "error" and never shows a status code or server text', () => {
    for (const line of everyLine) {
      expect(line.toLowerCase()).not.toContain('error')
      expect(line.toLowerCase()).not.toContain('fail')
      expect(line).not.toMatch(/\b[45]\d\d\b/)
      expect(line).not.toContain('daily_limit')
    }
  })

  it('the Inbox row is the decided wording', () => {
    expect(UNTRANSCRIBED_VOICE_NOTE).toBe('Voice note (not transcribed yet)')
  })

  it('says the audio lasts only as long as the sheet', () => {
    expect(KEPT_AUDIO_NOTE).toMatch(/until you close this sheet/)
  })

  it('names the voice allowance (not all AI) for a daily-limit reply, up front and after recording', () => {
    expect(keptReasonLine('limit')).toBe(VOICE_ALLOWANCE_USED_UP)
    expect(RESTING.line).toBe(VOICE_ALLOWANCE_USED_UP)
    expect(RESTING.type).toBe('Type it instead')
  })

  it('offers the decided actions on a kept recording', () => {
    expect(KEPT_ACTIONS.retry).toBe('Try again')
    expect(KEPT_ACTIONS.save).toBe('Save to Inbox untranscribed')
  })
})
