// Sotto (Kai's own offline dictation app, D:\Coding\sotto) — the math its pill overlay
// (ui/overlay.js) animates with, kept pure so the port is unit-tested. SottoPill.tsx draws with it.

/** Where a spoken take is, in Sotto's words. */
export type SottoState = 'listening' | 'transcribing' | 'polishing' | 'done' | 'error'

/** What the pill says to a screen reader (Sukoon's strings; the error is a take kept, not lost). */
export const SOTTO_LABEL: Record<SottoState, string> = {
  listening: 'Listening. Tap when you’re done',
  transcribing: 'Writing it down',
  polishing: 'Working it out',
  done: 'Done',
  error: 'Not transcribed yet',
}

/** How long the tick shows before the surface lets the pill go (Sotto starts fading it at 600ms). */
export const SOTTO_DONE_MS = 700

/** 0..1 through a `per`-second CSS loop at `ms`, with the design's (negative) animation-delay. */
export const cycle = (ms: number, per: number, delay: number) => ((((ms / 1000 - delay) / per) % 1) + 1) % 1

/** One keyframe segment a → b, a cosine standing in for CSS ease-in-out. */
export const seg = (a: number, b: number, u: number) => a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * u))

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/** mm-blob: [dx, dy, scale] of one blob on a `per`-second loop. */
export function mmBlob(ms: number, per: number, delay: number): [number, number, number] {
  const p = cycle(ms, per, delay)
  if (p < 1 / 3) {
    const u = p * 3
    return [seg(0, 3, u), seg(0, -2, u), seg(1, 1.16, u)]
  }
  if (p < 2 / 3) {
    const u = (p - 1 / 3) * 3
    return [seg(3, -3, u), seg(-2, 1, u), seg(1.16, 0.88, u)]
  }
  const u = (p - 2 / 3) * 3
  return [seg(-3, 0, u), seg(1, 0, u), seg(0.88, 1, u)]
}

/** RMS of the samples — the level Sotto's recorder publishes (audio.rs publish_level). */
export function rms(samples: ArrayLike<number>): number {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return samples.length ? Math.sqrt(sum / samples.length) : 0
}

/** The five listening bars (0.15..1 each) at `now` for a mic `level` — overlay.js verbatim. A bar
 * stands max(4, v × 18)px tall at Sotto's scale, at opacity 0.5 + v / 2. */
export function barLevels(now: number, level: number): number[] {
  const amplitude = Math.min(1, level * 6)
  return Array.from({ length: 5 }, (_, i) => {
    const wave = Math.sin((now * 0.003 + i * 0.18) * Math.PI * 2)
    return 0.15 + 0.85 * (amplitude * 0.7 + 0.3 * (0.5 + 0.5 * wave))
  })
}

/** An AnalyserNode on the take's own stream: read() is its live RMS. No Web Audio → always 0. */
export function micMeter(stream: MediaStream): { read: () => number; close: () => void } {
  try {
    const audio = new AudioContext()
    const analyser = audio.createAnalyser()
    analyser.fftSize = 1024
    audio.createMediaStreamSource(stream).connect(analyser)
    void audio.resume()
    const buf = new Float32Array(analyser.fftSize)
    return {
      read: () => {
        analyser.getFloatTimeDomainData(buf)
        return rms(buf)
      },
      close: () => void audio.close(),
    }
  } catch {
    return { read: () => 0, close: () => {} } // the meter is decorative; the take records regardless
  }
}
