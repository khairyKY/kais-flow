// Polish E ("never lose a voice recording", conductor decision 2026-09-26): what the voice sheet
// says when a recording couldn't be transcribed, and when today's voice allowance is already
// known to be used up. Calm, no "error", never a status code or server text (X5 States rule).
// Pure so the house rule is unit-tested.
import { VOICE_ALLOWANCE_USED_UP } from './aiAllowance'

/** Why a finished recording is still sitting in the sheet. */
export type KeptReason = 'limit' | 'offline' | 'other'

/** The Inbox row "Save to Inbox untranscribed" writes. There's no storage bucket for audio, so
 * the row is a reminder that you said something, not the recording itself. */
export const UNTRANSCRIBED_VOICE_NOTE = 'Voice note (not transcribed yet)'

export const SAVED_UNTRANSCRIBED = 'Saved to Inbox — not transcribed yet.'

export const KEPT_STATUS = 'Not transcribed yet'
export const KEPT_HAND = 'your recording is still here'
/** The audio lives only in this sheet's memory — said plainly, so closing it is a real choice. */
export const KEPT_AUDIO_NOTE = 'The audio stays only until you close this sheet. Saving to the Inbox keeps a reminder, not the audio.'

export const KEPT_ACTIONS = {
  retry: 'Try again',
  save: 'Save to Inbox untranscribed',
  discard: 'Discard',
} as const

export function keptReasonLine(reason: KeptReason): string {
  if (reason === 'limit') return VOICE_ALLOWANCE_USED_UP
  if (reason === 'offline') return 'You’re offline, so it couldn’t be transcribed.'
  return 'It couldn’t be transcribed just now.'
}

/** The sheet's up-front state after a daily-limit reply earlier today, on this device. */
export const RESTING = {
  status: 'Voice is used up for today',
  hand: 'type it instead?',
  line: VOICE_ALLOWANCE_USED_UP,
  type: 'Type it instead',
  close: 'Close',
} as const
