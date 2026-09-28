// Hold-to-talk on the tab bar's capture button — MK Capture.dc.html / DS-CHANGELOG §3 "Capture
// button": tap = the capture sheet · hold ≥ --dur-longpress = record while held · release = send ·
// slide up onto the lock = hands-free · slide to cancel = discard (+ Undo).
// Pure so the gesture rules are unit-tested; CaptureButton runs the effect each step returns.

/** Drag up this far while holding → locked (about halfway up the 112px lock rail). */
export const LOCK_DISTANCE = 96
/** Drag left this far while holding → discard. */
export const CANCEL_DISTANCE = 120

export type HoldState =
  | { phase: 'idle' }
  /** Finger down, not yet held long enough — lifting now is a plain tap. */
  | { phase: 'pressing'; x: number; y: number }
  /** Held and recording; dx/dy = how far the finger has slid (left / up only, ≤ 0). */
  | { phase: 'recording'; x: number; y: number; dx: number; dy: number }
  /** Hands-free: the finger is off; the locked bar's Cancel / Send decide. */
  | { phase: 'locked' }
  /** The hold ended early (slid to cancel, mic refused) — wait for the finger to lift. */
  | { phase: 'spent' }

export type HoldEvent =
  | { type: 'down'; x: number; y: number }
  | { type: 'longpress' }
  | { type: 'move'; x: number; y: number }
  | { type: 'up' }
  /** pointercancel — the browser took the pointer away. */
  | { type: 'cancel' }
  /** The mic can't record (refused, missing, voice used up for today). */
  | { type: 'fail' }
  /** The locked bar's buttons. */
  | { type: 'send' }
  | { type: 'discard' }

/** start = open the mic · send / discard = stop it and file / drop the take · lock = keep going hands-free. */
export type HoldEffect = 'start' | 'send' | 'discard' | 'lock' | null

export function holdStep(s: HoldState, e: HoldEvent): [HoldState, HoldEffect] {
  switch (e.type) {
    case 'down':
      return s.phase === 'idle' ? [{ phase: 'pressing', x: e.x, y: e.y }, null] : [s, null]
    case 'longpress':
      return s.phase === 'pressing' ? [{ phase: 'recording', x: s.x, y: s.y, dx: 0, dy: 0 }, 'start'] : [s, null]
    case 'move': {
      if (s.phase !== 'recording') return [s, null]
      const dx = Math.min(0, e.x - s.x)
      const dy = Math.min(0, e.y - s.y)
      if (dy <= -LOCK_DISTANCE) return [{ phase: 'locked' }, 'lock']
      if (dx <= -CANCEL_DISTANCE) return [{ phase: 'spent' }, 'discard']
      return [{ ...s, dx, dy }, null]
    }
    case 'up':
      if (s.phase === 'recording') return [{ phase: 'idle' }, 'send']
      // Locked keeps recording after the finger lifts; everything else just settles.
      return s.phase === 'locked' ? [s, null] : [{ phase: 'idle' }, null]
    case 'cancel':
      // Never lose a take to a stolen pointer: park it hands-free and let the person decide.
      if (s.phase === 'recording') return [{ phase: 'locked' }, 'lock']
      return s.phase === 'locked' ? [s, null] : [{ phase: 'idle' }, null]
    case 'fail':
      if (s.phase === 'pressing' || s.phase === 'recording') return [{ phase: 'spent' }, null]
      return s.phase === 'locked' ? [{ phase: 'idle' }, null] : [s, null]
    case 'send':
    case 'discard':
      return s.phase === 'locked' ? [{ phase: 'idle' }, e.type] : [s, null]
  }
}

/** The recorder's container: the first one this browser can write (shared with VoiceCaptureSheet). */
export function pickMimeType(): string {
  const candidates = ['audio/webm', 'audio/mp4', 'audio/aac']
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

/** "0:04" — the recording pill's timer. */
export function formatTake(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
