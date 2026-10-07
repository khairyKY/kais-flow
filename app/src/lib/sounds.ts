// ── The garden's voice, v2 (Kai 2026-10-07: "Redesign the sounds, I hate the current sounds.")
//
// v1 was white noise through one filter (paper, pencil, rain) and two bare sine beeps: hiss and
// beeps. v2 is a small instrument. Each EVENT (a task done, a capture, a focus round ending…) has a
// short phrase in ONE key (C major pentatonic), so sounds that follow each other sound related, and
// three PACKS voice every phrase with their own timbre: kalimba (plucked tines), felt
// (muted felt piano, an octave down) and glass (soft low-index FM bells).
//
// Still synthesised in Web Audio: zero asset bytes, $0, nothing on the network. The craft:
//   · every partial ramps up from 0 and decays exponentially to −60 dB before it stops (no clicks);
//   · a detuned twin on the fundamental for warmth, partials above 6 kHz are never made (no hiss);
//   · a pack lowpass rounds the top; a short generated room (ConvolverNode, ~0.8 s, low-passed,
//     mixed low) gives the phrases a body; a soft-knee limiter sits before the volume so nothing
//     clips, even two sounds at once;
//   · peaks stay ≤ −6 dBFS at full volume (docs/log/assets/sounds/verify.mjs measures every voice).
//
// Public surface: playSound('complete') at the call site. It no-ops when the event is off, the
// volume is 0, the garden is closed for the night, notification quiet hours or the tray's pause
// apply, or the browser hasn't granted audio — so call sites never branch on settings.

import { queryClient } from './queryClient'
import { appZone } from './appZone'
import { legacyGoalId } from '../features/today/goalStore'
import { goalIdOf } from '../features/today/top3Order'
import { inQuietHours, isPaused, type NoticePrefs } from '../../../supabase/functions/notify/copy.ts'
import type { Task } from './types'

export const SOUND_EVENTS = ['complete', 'complete_big', 'capture', 'focus_start', 'focus_end', 'ritual_done', 'undo'] as const
export type SoundEvent = (typeof SOUND_EVENTS)[number]
export const SOUND_PACKS = ['kalimba', 'felt', 'glass'] as const
export type SoundPack = (typeof SOUND_PACKS)[number]

export const DEFAULT_EVENTS: Record<SoundEvent, boolean> = {
  complete: true,
  complete_big: true,
  capture: true,
  focus_start: true,
  focus_end: true,
  ritual_done: true,
  undo: false, // optional by design — a step back doesn't need applause
}
export const DEFAULT_PACK: SoundPack = 'felt' // Kai 2026-10-07 picked Felt after hearing all three
export const DEFAULT_VOLUME = 0.35 // "quiet" is still the first adjective

/** How long each event may ring, in seconds to −60 dBFS at full volume (the brief's limits). */
export const MAX_DURATION: Record<SoundEvent, number> = {
  complete: 0.25,
  complete_big: 0.9,
  capture: 0.25,
  focus_start: 0.6,
  focus_end: 2.5,
  ritual_done: 1.5,
  undo: 0.2,
}

const EVENTS_KEY = 'kf_sound_events' // per-event on/off
const LEGACY_KEY = 'kf_sounds' // v1's per-voice map — read once into EVENTS_KEY's shape
const PACK_KEY = 'kf_sound_pack'
const VOLUME_KEY = 'kf_sound_volume' // 0..1, 0 = master off
const QUIET_KEY = 'kf_sound_quiet' // '1' when "silent after you close the garden" is on
const CLOSED_KEY = 'kf.gardenClosed' // localDateKey written when the evening ritual finishes

function read<T>(key: string, fallback: T, parse: (raw: string) => T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : parse(raw)
  } catch {
    return fallback
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* session-only is fine */
  }
}

/** v1's voices → the events they stood for, so a choice made then carries over. rain_patter and
 * birdsong never played anywhere; they map to nothing. */
const LEGACY_MAP: Record<string, SoundEvent[]> = {
  paper_rustle: ['complete'], // played on every task check
  petal_fall: ['complete_big'], // "a bloom moment"
  distant_chime: ['focus_start', 'focus_end'], // the focus round's chime (Focus page toggle)
  pencil_scratch: ['ritual_done'], // played in the evening ritual
}
export function migrateLegacy(old: unknown): Partial<Record<SoundEvent, boolean>> {
  const out: Partial<Record<SoundEvent, boolean>> = {}
  if (!old || typeof old !== 'object') return out
  for (const [from, to] of Object.entries(LEGACY_MAP)) {
    const v = (old as Record<string, unknown>)[from]
    if (typeof v === 'boolean') for (const e of to) out[e] = v
  }
  return out
}

export function readSoundEvents(): Record<SoundEvent, boolean> {
  const saved = read<Partial<Record<SoundEvent, boolean>> | null>(EVENTS_KEY, null, JSON.parse) ?? read(LEGACY_KEY, {}, (raw) => migrateLegacy(JSON.parse(raw)))
  const out = { ...DEFAULT_EVENTS }
  for (const e of SOUND_EVENTS) if (typeof saved?.[e] === 'boolean') out[e] = saved[e]
  return out
}
export function writeSoundEvents(next: Record<SoundEvent, boolean>) {
  write(EVENTS_KEY, JSON.stringify(next))
}
export function readSoundPack(): SoundPack {
  return read(PACK_KEY, DEFAULT_PACK, (raw) => ((SOUND_PACKS as readonly string[]).includes(raw) ? (raw as SoundPack) : DEFAULT_PACK))
}
export function writeSoundPack(pack: SoundPack) {
  write(PACK_KEY, pack)
}
export function readVolume(): number {
  return read(VOLUME_KEY, DEFAULT_VOLUME, (raw) => {
    const n = Number(raw)
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : DEFAULT_VOLUME
  })
}
export function writeVolume(v: number) {
  write(VOLUME_KEY, String(v))
}
export function readQuietHours(): boolean {
  return read(QUIET_KEY, true, (raw) => raw === '1')
}
export function writeQuietHours(on: boolean) {
  write(QUIET_KEY, on ? '1' : '0')
}

/** Evening ritual calls this on "Goodnight" — Settings 3a: "The garden is silent after you close it." */
export function closeTheGarden(dateKey: string) {
  write(CLOSED_KEY, dateKey)
}

/** True while the garden is closed: the evening ritual ran today and the day hasn't turned over. */
export function isQuiet(now = new Date()): boolean {
  if (!readQuietHours()) return false
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return read(CLOSED_KEY, '', (raw) => raw) === today
}

/** Every reason to stay silent besides the toggles: the garden closed, or Notifications' quiet hours
 * ("nothing makes a sound") or the tray's pause — read from the app_settings the app already has. */
function silenced(now = new Date()): boolean {
  if (isQuiet(now)) return true
  const prefs = queryClient.getQueryData<NoticePrefs>(['app_settings'])
  return isPaused(prefs, now) || inQuietHours(prefs, now, appZone())
}

/** 'complete_big' for the Goal of the day or the last open Top 3 pick, else 'complete'. `tasks` is
 * the list as it was just before this completion. */
export function completionSound(task: Pick<Task, 'id' | 'top3'>, tasks: readonly Pick<Task, 'id' | 'top3' | 'status' | 'deleted_at'>[], goalId: string | null): SoundEvent {
  if (!task.top3) return 'complete'
  if (task.id === goalId) return 'complete_big'
  return tasks.some((t) => t.id !== task.id && t.top3 && t.status === 'todo' && !t.deleted_at) ? 'complete' : 'complete_big'
}

/** tasks/api completeTask's one call: the right sound for this check. */
export function playCompletion(task: Task): void {
  const tasks = queryClient.getQueryData<Task[]>(['tasks']) ?? []
  // The goal of the day, synced on the rows (plan-replan, today/top3Order). ponytail: no star log
  // here (it would pull the network client into the sound module) — only an unranked Top 3 differs.
  playSound(completionSound(task, tasks, goalIdOf(tasks, legacyGoalId())))
}

// ── Synthesis ────────────────────────────────────────────────────────────────

const midi = (m: number) => 440 * 2 ** ((m - 69) / 12)
const LEAD = 0.006 // notes start 6 ms ahead: the envelope is scheduled before the first rendered sample
const NYQUIST_GUARD = 6000 // no partial above this — the top is where hiss lives
const FLOOR = 52 // E3: a note below it goes up an octave — phone and laptop speakers can't play it

/** [start s, MIDI note, velocity 0..1, ring s (time to −60 dB)]. One key: C major pentatonic. */
type Note = [at: number, note: number, vel: number, ring: number]
interface Phrase {
  notes: Note[]
  /** Peak amplitude of a velocity-1 note at full volume (the partials share it). */
  level: number
  /** Send into the room, 0..1. The ≤ 250 ms ones are dry: a room tail can't fit inside them. */
  room: number
}
// E5 is the tock everything grows from: complete_big climbs from it, focus_end rings past it to C6,
// ritual_done resolves G4 → C5, undo steps back down from A5 to E5.
const PHRASES: Record<SoundEvent, Phrase> = {
  complete: { notes: [[0, 76, 1, 0.2]], level: 0.17, room: 0 },
  complete_big: { notes: [[0, 72, 0.75, 0.28], [0.085, 76, 0.85, 0.28], [0.17, 79, 1, 0.45]], level: 0.26, room: 0.06 },
  capture: { notes: [[0, 86, 0.55, 0.07], [0.04, 81, 1, 0.12]], level: 0.14, room: 0 },
  focus_start: { notes: [[0, 60, 1, 0.38]], level: 0.24, room: 0.04 },
  focus_end: { notes: [[0, 76, 0.8, 0.9], [0.22, 79, 0.85, 0.9], [0.44, 84, 1, 1.45]], level: 0.34, room: 0.14 },
  ritual_done: { notes: [[0, 67, 0.85, 0.7], [0.17, 72, 1, 0.95]], level: 0.28, room: 0.12 },
  undo: { notes: [[0, 81, 0.7, 0.05], [0.035, 76, 1, 0.09]], level: 0.11, room: 0 },
}

/** One sine partial under its own ADSR: 0 → `amp` in `attack`, exponential to −60 dB over `decay`,
 * then to 0 and stopped. Returns when it's silent. */
function partial(ac: BaseAudioContext, out: AudioNode, t: number, f: number, amp: number, attack: number, decay: number, detune = 0): number {
  if (f >= NYQUIST_GUARD || amp <= 0) return t
  const osc = ac.createOscillator()
  osc.frequency.value = f
  osc.detune.value = detune
  const g = ac.createGain()
  const end = t + attack + decay
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(amp, t + attack)
  g.gain.exponentialRampToValueAtTime(amp * 0.001, end)
  g.gain.linearRampToValueAtTime(0, end + 0.004)
  osc.connect(g).connect(out)
  osc.start(t)
  osc.stop(end + 0.01)
  return end + 0.004
}

/** A low-index FM bell: the index falls as the note rings, so it starts glassy and ends pure. */
function fmBell(ac: BaseAudioContext, out: AudioNode, t: number, f: number, amp: number, attack: number, decay: number, ratio: number, index: number): number {
  const mf = f * ratio
  if (f >= NYQUIST_GUARD) return t
  const car = ac.createOscillator()
  car.frequency.value = f
  const mod = ac.createOscillator()
  mod.frequency.value = mf
  const depth = ac.createGain()
  depth.gain.setValueAtTime(mf * index, t)
  depth.gain.exponentialRampToValueAtTime(mf * index * 0.03, t + attack + decay * 0.6)
  mod.connect(depth).connect(car.frequency)
  const g = ac.createGain()
  const end = t + attack + decay
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(amp, t + attack)
  g.gain.exponentialRampToValueAtTime(amp * 0.001, end)
  g.gain.linearRampToValueAtTime(0, end + 0.004)
  car.connect(g).connect(out)
  mod.start(t)
  car.start(t)
  mod.stop(end + 0.01)
  car.stop(end + 0.01)
  return end + 0.004
}

interface Pack {
  label: string
  blurb: string
  /** Semitones from the phrase table. */
  transpose: number
  /** The pack's lowpass, Hz. */
  cutoff: number
  strike: (ac: BaseAudioContext, out: AudioNode, t: number, f: number, amp: number, ring: number) => number
}

export const PACKS: Record<SoundPack, Pack> = {
  // A tine: nearly a sine, a detuned twin for the shimmer, a faint octave from the box, and the
  // tine's own inharmonic ping (~5.9×) that's gone in a few tens of ms.
  kalimba: {
    label: 'Kalimba',
    blurb: 'plucked tines, bright and round',
    transpose: 0,
    cutoff: 4800,
    strike: (ac, out, t, f, amp, ring) =>
      Math.max(
        partial(ac, out, t, f, amp * 0.72, 0.003, ring),
        partial(ac, out, t, f, amp * 0.24, 0.003, ring * 0.85, 7),
        partial(ac, out, t, f * 2, amp * 0.07, 0.002, ring * 0.3),
        partial(ac, out, t, f * 5.93, amp * 0.06, 0.0015, Math.min(0.06, ring * 0.35)),
      ),
  },
  // A felt hammer on a soft string: a slower attack, harmonic partials that fade top-down, a
  // marimba-ish 4th, all an octave lower and under a dark lowpass.
  felt: {
    label: 'Felt',
    blurb: 'muted felt piano, warm and low',
    transpose: -12,
    cutoff: 2200,
    strike: (ac, out, t, f, amp, ring) =>
      Math.max(
        partial(ac, out, t, f, amp * 0.62, 0.009, ring),
        partial(ac, out, t, f, amp * 0.22, 0.009, ring * 0.9, -5),
        partial(ac, out, t, f * 2, amp * 0.3, 0.008, ring * 0.55),
        partial(ac, out, t, f * 3, amp * 0.1, 0.007, ring * 0.35),
        partial(ac, out, t, f * 4, amp * 0.07, 0.006, ring * 0.22),
      ),
  },
  // Soft glass: an FM bell with a low index (ratio 3.5 gives the inharmonic glass sidebands), a pure
  // twin a few cents up so it breathes, and a slower attack than a real strike so it never pings.
  glass: {
    label: 'Glass',
    blurb: 'soft glass bells, airy',
    transpose: 0,
    cutoff: 5200,
    strike: (ac, out, t, f, amp, ring) =>
      Math.max(
        fmBell(ac, out, t, f, amp * 0.62, 0.005, ring, 3.5, 0.55),
        partial(ac, out, t, f, amp * 0.28, 0.006, ring * 0.9, 4),
        partial(ac, out, t, f * 2.76, amp * 0.04, 0.004, ring * 0.3),
      ),
  },
}

/** The room: decaying, low-passed noise from a fixed seed (identical every time, and in the
 * offline renders), −60 dB at 0.8 s, 12 ms pre-delay, normalised to unit energy. */
function roomImpulse(ac: BaseAudioContext): AudioBuffer {
  const rate = ac.sampleRate
  const len = Math.floor(rate * 0.85)
  const buf = ac.createBuffer(1, len, rate)
  const d = buf.getChannelData(0)
  const a = 1 - Math.exp((-2 * Math.PI * 2400) / rate) // one-pole ~2.4 kHz, applied twice
  const pre = Math.floor(rate * 0.012)
  let seed = 20261007
  let lp1 = 0
  let lp2 = 0
  let energy = 0
  for (let i = pre; i < len; i++) {
    seed = (seed * 16807) % 2147483647
    lp1 += a * (seed / 1073741823.5 - 1 - lp1)
    lp2 += a * (lp1 - lp2)
    const s = (i - pre) / rate
    d[i] = lp2 * Math.exp((-6.9 * s) / 0.8) * Math.min(1, s / 0.01)
    energy += d[i] * d[i]
  }
  const norm = 1 / Math.sqrt(energy || 1)
  for (let i = 0; i < len; i++) d[i] *= norm
  return buf
}

/** The limiter's transfer curve: straight through up to KNEE, then a tanh shoulder that never
 * passes CEILING (−6.4 dBFS). Stateless, so a voice measures the same offline as it plays live —
 * a DynamicsCompressorNode's makeup gain and envelope made the first 200 ms of a render ~10 dB
 * quieter than the same sound on a warmed-up live bus. */
const KNEE = 0.3
const CEILING = 0.48
function limiterCurve(): Float32Array<ArrayBuffer> {
  const n = 4097
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    const a = Math.abs(x)
    curve[i] = Math.sign(x) * (a <= KNEE ? a : KNEE + (CEILING - KNEE) * Math.tanh((a - KNEE) / (CEILING - KNEE)))
  }
  return curve
}

interface Bus {
  input: AudioNode
  room: ConvolverNode
  master: GainNode
}
const buses = new WeakMap<BaseAudioContext, Bus>()
/** Limiter → volume → speakers, with the room feeding the limiter. One per context. */
function bus(ac: BaseAudioContext): Bus {
  const have = buses.get(ac)
  if (have) return have
  const limiter = ac.createWaveShaper()
  limiter.curve = limiterCurve()
  limiter.oversample = '2x'
  const master = ac.createGain()
  limiter.connect(master).connect(ac.destination)
  const room = ac.createConvolver()
  room.normalize = false
  room.buffer = roomImpulse(ac)
  room.connect(limiter)
  const b = { input: limiter, room, master }
  buses.set(ac, b)
  return b
}

/** Volume 0..1 → gain: a 1.5 power so "whisper" (0.34) is −14 dB, not −9. */
const volumeGain = (v: number) => Math.min(1, Math.max(0, v)) ** 1.5

/** Schedules `event` in `pack` on `ac` at `t0`; returns when it's silent. */
function voice(ac: BaseAudioContext, pack: SoundPack, event: SoundEvent, volume: number, t0: number): number {
  const b = bus(ac)
  b.master.gain.setValueAtTime(volumeGain(volume), t0)
  const p = PACKS[pack]
  const phrase = PHRASES[event]
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = p.cutoff
  lp.Q.value = 0
  lp.connect(b.input)
  if (phrase.room > 0) {
    const send = ac.createGain()
    send.gain.value = phrase.room
    lp.connect(send).connect(b.room)
  }
  let end = t0
  for (const [at, note, vel, ring] of phrase.notes) {
    const m = note + p.transpose < FLOOR ? note + p.transpose + 12 : note + p.transpose
    end = Math.max(end, p.strike(ac, lp, t0 + LEAD + at, midi(m), phrase.level * vel, ring))
  }
  return end
}

/** Renders one voice offline at full volume — the browser harness turns these into the WAVs and
 * measures them. Mono, `seconds` long. */
export function renderSound(pack: SoundPack, event: SoundEvent, seconds = MAX_DURATION[event] + 0.4, sampleRate = 44100): Promise<AudioBuffer> {
  const ac = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate)
  voice(ac, pack, event, 1, 0)
  return ac.startRendering()
}

// One lazily-created context (browsers require a user gesture; every call site is one).
let ctx: AudioContext | null = null
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null // no Web Audio (or blocked): silence is the correct fallback
  }
}

/** The one thing that makes noise. An object so the browser harness can swap `play` and record
 * which event fired (docs/log/assets/sounds/verify.mjs). */
export const player = {
  play(event: SoundEvent, pack: SoundPack, volume: number): void {
    const ac = audio()
    if (!ac) return
    try {
      voice(ac, pack, event, volume, ac.currentTime)
    } catch {
      /* a failed sound must never break the interaction that triggered it */
    }
  },
}

let lastAt = 0
/**
 * Play an event's sound. Silent unless it's on and nothing asks for quiet — call it
 * unconditionally; never gate at the call site.
 */
export function playSound(event: SoundEvent): void {
  const volume = readVolume()
  if (volume <= 0 || !readSoundEvents()[event] || silenced()) return
  // ponytail: one sound per 80 ms — a bulk complete of twelve tasks is one tock, not a drumroll.
  const now = Date.now()
  if (now - lastAt < 80) return
  lastAt = now
  player.play(event, readSoundPack(), volume)
}

/** Settings' previews: bypass the toggles and quiet (you're auditioning), not the volume. */
export function previewSound(event: SoundEvent, pack: SoundPack = readSoundPack()): void {
  player.play(event, pack, readVolume() || DEFAULT_VOLUME)
}
