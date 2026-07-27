// ── The garden's voice (Settings.dc.html 3a + MOTION_RETROFIT §E sound map).
//
// Every sound is SYNTHESISED in the Web Audio API — no .mp3 files, no downloads, no
// licensing, ~0 bytes of assets. That isn't a shortcut: the design specifies "quiet,
// papery, never musical", and papery IS filtered noise, which synthesises better than
// it samples. It also keeps the $0 + "light" hard rules intact.
//
// Public surface is one call: playSound('paper_rustle'). It silently no-ops when the
// master is off, that sound is off, the volume is 0, quiet hours are on, or the browser
// hasn't granted audio yet — so call sites never branch on settings.

export const SOUND_IDS = ['paper_rustle', 'petal_fall', 'distant_chime', 'birdsong', 'rain_patter', 'pencil_scratch'] as const
export type SoundId = (typeof SOUND_IDS)[number]

const CATALOG_KEY = 'kf_sounds' // per-sound on/off — the map Settings has always written
const VOLUME_KEY = 'kf_sound_volume' // 0..1, 0 = master off
const QUIET_KEY = 'kf_sound_quiet' // '1' when "silent after you close the garden" is on
const CLOSED_KEY = 'kf.gardenClosed' // localDateKey written when the evening ritual finishes

export const DEFAULT_SOUNDS: Record<SoundId, boolean> = {
  paper_rustle: true,
  petal_fall: true,
  distant_chime: false,
  birdsong: false,
  rain_patter: true,
  pencil_scratch: false,
}
export const DEFAULT_VOLUME = 0.35 // "quiet" is the design's first adjective

function read<T>(key: string, fallback: T, parse: (raw: string) => T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : parse(raw)
  } catch {
    return fallback
  }
}

export function readSoundCatalog(): Record<SoundId, boolean> {
  return read(CATALOG_KEY, DEFAULT_SOUNDS, (raw) => ({ ...DEFAULT_SOUNDS, ...JSON.parse(raw) }))
}
export function readVolume(): number {
  return read(VOLUME_KEY, DEFAULT_VOLUME, (raw) => {
    const n = Number(raw)
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULT_VOLUME
  })
}
export function readQuietHours(): boolean {
  return read(QUIET_KEY, true, (raw) => raw === '1')
}

export function writeSoundCatalog(next: Record<SoundId, boolean>) {
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(next))
  } catch {
    /* session-only is fine */
  }
}
export function writeVolume(v: number) {
  try {
    localStorage.setItem(VOLUME_KEY, String(v))
  } catch {
    /* session-only is fine */
  }
}
export function writeQuietHours(on: boolean) {
  try {
    localStorage.setItem(QUIET_KEY, on ? '1' : '0')
  } catch {
    /* session-only is fine */
  }
}

/** Evening ritual calls this on "Goodnight" — Settings 3a: "The garden is silent after you close it." */
export function closeTheGarden(dateKey: string) {
  try {
    localStorage.setItem(CLOSED_KEY, dateKey)
  } catch {
    /* session-only is fine */
  }
}

/** True while quiet hours apply: the garden was closed today and the day hasn't turned over. */
export function isQuiet(now = new Date()): boolean {
  if (!readQuietHours()) return false
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return read(CLOSED_KEY, '', (raw) => raw) === today
}

// ── Synthesis ────────────────────────────────────────────────────────────────
// One lazily-created context (browsers require a user gesture; every call site is one).

let ctx: AudioContext | null = null
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null // no Web Audio (or blocked) — silence is the correct fallback
  }
}

/** A short burst of shaped noise — the papery family (rustle, scratch, patter, petal). */
function noiseBurst(
  ac: AudioContext,
  gain: number,
  { duration, type, frequency, q = 1, attack = 0.004, curve = 2 }: { duration: number; type: BiquadFilterType; frequency: number; q?: number; attack?: number; curve?: number },
) {
  const frames = Math.floor(ac.sampleRate * duration)
  const buffer = ac.createBuffer(1, frames, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) {
    // white noise under an exponential-ish decay envelope baked into the buffer
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, curve)
  }
  const src = ac.createBufferSource()
  src.buffer = buffer
  const filter = ac.createBiquadFilter()
  filter.type = type
  filter.frequency.value = frequency
  filter.Q.value = q
  const amp = ac.createGain()
  const t = ac.currentTime
  amp.gain.setValueAtTime(0, t)
  amp.gain.linearRampToValueAtTime(gain, t + attack)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  src.connect(filter).connect(amp).connect(ac.destination)
  src.start(t)
  src.stop(t + duration)
}

/** A soft struck tone — the chime/birdsong family. */
function tone(ac: AudioContext, gain: number, { freq, duration, type = 'sine', glideTo, delay = 0 }: { freq: number; duration: number; type?: OscillatorType; glideTo?: number; delay?: number }) {
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  const t = ac.currentTime + delay
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + duration)
  amp.gain.setValueAtTime(0, t)
  amp.gain.linearRampToValueAtTime(gain, t + 0.012)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  osc.connect(amp).connect(ac.destination)
  osc.start(t)
  osc.stop(t + duration + 0.02)
}

const VOICES: Record<SoundId, (ac: AudioContext, g: number) => void> = {
  // A page turning under a hand: bright, dry, gone in a blink.
  paper_rustle: (ac, g) => noiseBurst(ac, g * 0.5, { duration: 0.13, type: 'highpass', frequency: 1800, curve: 2.4 }),
  // A petal letting go — softer, lower, drifts a touch longer.
  petal_fall: (ac, g) => noiseBurst(ac, g * 0.32, { duration: 0.42, type: 'lowpass', frequency: 900, curve: 3, attack: 0.03 }),
  // Distant: a fifth above a fundamental, both barely there, long tail.
  distant_chime: (ac, g) => {
    tone(ac, g * 0.22, { freq: 528, duration: 1.5 })
    tone(ac, g * 0.12, { freq: 792, duration: 1.2, delay: 0.02 })
  },
  // Two quick chirps, the second answering the first.
  birdsong: (ac, g) => {
    tone(ac, g * 0.16, { freq: 2100, duration: 0.1, glideTo: 3000 })
    tone(ac, g * 0.13, { freq: 2600, duration: 0.09, glideTo: 1900, delay: 0.14 })
  },
  // Rain on a window — a wash rather than a hit.
  rain_patter: (ac, g) => noiseBurst(ac, g * 0.28, { duration: 0.9, type: 'bandpass', frequency: 1200, q: 0.7, attack: 0.12, curve: 1.4 }),
  // Graphite on paper: narrow band, mid-bright, short.
  pencil_scratch: (ac, g) => noiseBurst(ac, g * 0.34, { duration: 0.19, type: 'bandpass', frequency: 2600, q: 1.6, curve: 1.8 }),
}

/**
 * Play one of the garden's voices. Silent unless the user has it on and isn't in quiet
 * hours — call it unconditionally; never gate at the call site.
 */
export function playSound(id: SoundId): void {
  const volume = readVolume()
  if (volume <= 0) return
  if (!readSoundCatalog()[id]) return
  if (isQuiet()) return
  const ac = audio()
  if (!ac) return
  try {
    VOICES[id](ac, volume)
  } catch {
    /* a failed sound must never break the interaction that triggered it */
  }
}

/** Settings' per-row preview — bypasses the on/off toggle (you're auditioning it), not the volume. */
export function previewSound(id: SoundId): void {
  const volume = readVolume() || DEFAULT_VOLUME
  const ac = audio()
  if (!ac) return
  try {
    VOICES[id](ac, volume)
  } catch {
    /* ignore */
  }
}
