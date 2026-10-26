// Notification sounds, options for Kai to pick by ear (2026-10-26: "design the sounds for each").
// Deterministic synthesis in plain Node — no dependencies, no network, no audio service: the same
// felt and glass voices as app/src/lib/sounds.ts (Sounds v2), the same room (seeded impulse), the
// same key (C major pentatonic). Each candidate → <id>.wav (44.1 kHz, 16-bit, mono), normalised to
// about −16 LUFS (ITU-R BS.1770-4, integrated) with the true peak under −1 dBTP (4× oversampled).
//   node make.mjs            → writes the WAVs, sounds.js (the options page's list) and measurements.json
//   node make.mjs --check    → re-renders in memory and fails if a WAV on disk differs or breaks a limit
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RATE = 44100
const TARGET_LUFS = -16
const PEAK_CEILING_DB = -1
const MIN_S = 0.3
const MAX_S = 1.2

// ── the candidates: [start s, MIDI note (before the pack's transpose), velocity, ring s to −60 dB] ──
// C D E G A only. Felt plays an octave down (as in the app); nothing goes below E3.
const TYPES = [
  ['task_reminder', 'Task reminder', 'The one you hear most. Noticeable, never sharp.'],
  ['event_reminder', 'Event starting', 'An event with a reminder (0077): something is about to begin.'],
  ['snoozed_again', 'Snoozed reminder, again', 'A reminder you snoozed ("In 10 min", "In 1 hour") coming back.'],
  ['focus_end', 'Focus round end', 'The round is over: minutes tended, time for a break.'],
  ['break_end', 'Break end', 'The break is over: back to it.'],
  ['morning_digest', 'Morning digest', 'Your Top 3 and what’s overdue, at your morning time. Silent today (the Quiet channel) — pick one if you want it heard.'],
  ['evening_nudge', 'Evening nudge', '"4 done · 2 left" — time to close the day.'],
  ['paper_ready', 'Page read', 'Paper capture finished reading a page.'],
  ['terms', 'Terms changed', 'The Terms of Use or Privacy Policy changed. Rare.'],
  ['sync_problem', 'Sync problem', 'Changes couldn’t be saved. Distinct, but not an alarm.'],
]

const C = (type, letter, pack, notes, room, desc) => ({ id: `${type}_${letter.toLowerCase()}`, type, letter, pack, notes, room, desc })
export const CANDIDATES = [
  C('task_reminder', 'A', 'felt', [[0, 76, 0.85, 0.5], [0.14, 81, 1, 0.75]], 0.08, 'Two felt notes rising, E to A — a tap on the shoulder.'),
  C('task_reminder', 'B', 'glass', [[0, 79, 1, 0.9], [0.2, 79, 0.42, 0.75]], 0.1, 'One glass bell and its own quieter echo.'),
  C('task_reminder', 'C', 'felt', [[0, 72, 0.8, 0.35], [0.1, 76, 0.85, 0.35], [0.2, 79, 1, 0.65]], 0.08, 'Three felt notes climbing C–E–G, a softer cousin of the Top 3 "done".'),

  C('event_reminder', 'A', 'glass', [[0, 72, 0.8, 0.6], [0.16, 79, 1, 0.95]], 0.12, 'Glass, an open fifth up, C to G — something is beginning.'),
  C('event_reminder', 'B', 'felt', [[0, 74, 0.8, 0.45], [0.12, 79, 0.9, 0.45], [0.24, 84, 1, 0.75]], 0.1, 'Felt, three notes up to the high C — a door opening.'),
  C('event_reminder', 'C', 'glass', [[0, 84, 1, 0.55], [0.22, 79, 0.85, 0.85]], 0.12, 'A two-bell glass chime, high then low.'),

  C('snoozed_again', 'A', 'felt', [[0, 76, 0.7, 0.3], [0.1, 81, 0.8, 0.35], [0.36, 76, 0.6, 0.3], [0.46, 81, 0.75, 0.6]], 0.08, 'The task reminder’s tap, twice — "still here".'),
  C('snoozed_again', 'B', 'glass', [[0, 79, 0.9, 0.5], [0.14, 79, 0.7, 0.7]], 0.1, 'Two quick glass bells on the same note.'),
  C('snoozed_again', 'C', 'felt', [[0, 81, 0.9, 0.4], [0.14, 76, 1, 0.75]], 0.08, 'The reminder’s two notes turned round, falling A to E — a gentle nudge back.'),

  C('focus_end', 'A', 'felt', [[0, 76, 0.8, 0.5], [0.16, 79, 0.85, 0.5], [0.32, 84, 1, 0.85]], 0.14, 'The app’s own "round done" phrase (E–G–C) in felt, shortened for a notification.'),
  C('focus_end', 'B', 'glass', [[0, 76, 0.8, 0.5], [0.16, 79, 0.85, 0.5], [0.32, 84, 1, 0.85]], 0.14, 'The same phrase in glass, brighter.'),
  C('focus_end', 'C', 'glass', [[0, 84, 1, 1.05], [0.012, 76, 0.55, 1.0]], 0.16, 'One glass chord, E under C, left to ring.'),

  C('break_end', 'A', 'felt', [[0, 67, 0.8, 0.35], [0.12, 72, 1, 0.65]], 0.1, 'Felt, G up to C — back to it.'),
  C('break_end', 'B', 'glass', [[0, 72, 0.7, 0.4], [0.1, 74, 0.8, 0.4], [0.2, 76, 1, 0.65]], 0.1, 'Glass, three small steps up, C–D–E.'),

  C('morning_digest', 'A', 'glass', [[0, 72, 0.6, 0.6], [0.12, 74, 0.7, 0.6], [0.24, 76, 0.8, 0.6], [0.36, 79, 1, 0.8]], 0.14, 'Glass, a slow climb C–D–E–G — sunrise.'),
  C('morning_digest', 'B', 'felt', [[0, 60, 0.7, 0.55], [0.14, 64, 0.8, 0.55], [0.28, 67, 0.9, 0.55], [0.42, 72, 1, 0.7]], 0.12, 'Felt, a low warm arpeggio C–E–G–C.'),
  C('morning_digest', 'C', 'glass', [[0, 84, 1, 1.05], [0.01, 72, 0.45, 1.05]], 0.16, 'One high glass bell with a low C humming under it.'),

  C('evening_nudge', 'A', 'felt', [[0, 79, 0.9, 0.5], [0.16, 76, 0.85, 0.5], [0.32, 72, 1, 0.8]], 0.12, 'Felt, three notes down G–E–C — winding down.'),
  C('evening_nudge', 'B', 'glass', [[0, 76, 0.9, 0.6], [0.2, 72, 1, 0.9]], 0.14, 'Glass, a soft fall from E to C.'),
  C('evening_nudge', 'C', 'felt', [[0, 60, 1, 0.9], [0.03, 67, 0.7, 0.9]], 0.12, 'One low felt chord, C and G together.'),

  C('paper_ready', 'A', 'glass', [[0, 86, 0.7, 0.25], [0.07, 91, 1, 0.4]], 0.08, 'Two quick high glass notes — a page turned.'),
  C('paper_ready', 'B', 'felt', [[0, 74, 0.8, 0.25], [0.08, 79, 1, 0.45]], 0.06, 'Two quick felt notes up, D to G.'),
  C('paper_ready', 'C', 'glass', [[0, 79, 0.6, 0.3], [0.06, 84, 0.8, 0.3], [0.12, 88, 1, 0.5]], 0.1, 'A small glass sparkle, G–C–E.'),

  C('terms', 'A', 'felt', [[0, 72, 1, 0.55]], 0.08, 'One felt note — just so you know.'),
  C('terms', 'B', 'glass', [[0, 76, 1, 0.65]], 0.1, 'One soft glass bell.'),

  C('sync_problem', 'A', 'felt', [[0, 69, 0.9, 0.35], [0.16, 64, 1, 0.65]], 0.08, 'Felt, a low falling fourth, A to E — "hm, something’s off".'),
  C('sync_problem', 'B', 'glass', [[0, 74, 0.9, 0.35], [0.18, 74, 0.9, 0.6]], 0.08, 'Glass, the same low note twice — knock, knock.'),
  C('sync_problem', 'C', 'felt', [[0, 69, 0.8, 0.3], [0.12, 67, 0.9, 0.3], [0.24, 64, 1, 0.55]], 0.08, 'Felt, three notes stepping down A–G–E.'),
]

// ── the voices (lib/sounds.ts PACKS, sample by sample) ──
const midi = (m) => 440 * 2 ** ((m - 69) / 12)
const LEAD = 0.006
const NYQUIST_GUARD = 6000
const FLOOR = 52 // E3

/** One sine partial: linear 0 → amp over `attack`, exponential to −60 dB over `decay`, 4 ms to 0. */
function partial(buf, t, f, amp, attack, decay, detuneCents = 0) {
  if (f >= NYQUIST_GUARD || amp <= 0) return
  f *= 2 ** (detuneCents / 1200)
  const i0 = Math.round(t * RATE)
  const n = Math.ceil((attack + decay + 0.004) * RATE)
  const k = Math.log(0.001) / decay
  for (let j = 0; j < n && i0 + j < buf.length; j++) {
    const s = j / RATE
    const env = s < attack ? (amp * s) / attack : s < attack + decay ? amp * Math.exp(k * (s - attack)) : amp * 0.001 * (1 - (s - attack - decay) / 0.004)
    buf[i0 + j] += env * Math.sin(2 * Math.PI * f * s)
  }
}

/** The low-index FM bell: its index falls as it rings (glassy → pure). */
function fmBell(buf, t, f, amp, attack, decay, ratio, index) {
  if (f >= NYQUIST_GUARD) return
  const mf = f * ratio
  const i0 = Math.round(t * RATE)
  const n = Math.ceil((attack + decay + 0.004) * RATE)
  const k = Math.log(0.001) / decay
  const kd = Math.log(0.03) / (attack + decay * 0.6)
  let phase = 0
  for (let j = 0; j < n && i0 + j < buf.length; j++) {
    const s = j / RATE
    const depth = mf * index * Math.exp(kd * Math.min(s, attack + decay * 0.6))
    phase += (2 * Math.PI * (f + depth * Math.sin(2 * Math.PI * mf * s))) / RATE
    const env = s < attack ? (amp * s) / attack : s < attack + decay ? amp * Math.exp(k * (s - attack)) : amp * 0.001 * (1 - (s - attack - decay) / 0.004)
    buf[i0 + j] += env * Math.sin(phase)
  }
}

const PACKS = {
  felt: {
    transpose: -12,
    cutoff: 2200,
    strike: (b, t, f, a, r) => {
      partial(b, t, f, a * 0.62, 0.009, r)
      partial(b, t, f, a * 0.22, 0.009, r * 0.9, -5)
      partial(b, t, f * 2, a * 0.3, 0.008, r * 0.55)
      partial(b, t, f * 3, a * 0.1, 0.007, r * 0.35)
      partial(b, t, f * 4, a * 0.07, 0.006, r * 0.22)
    },
  },
  glass: {
    transpose: 0,
    cutoff: 5200,
    strike: (b, t, f, a, r) => {
      fmBell(b, t, f, a * 0.62, 0.005, r, 3.5, 0.55)
      partial(b, t, f, a * 0.28, 0.006, r * 0.9, 4)
      partial(b, t, f * 2.76, a * 0.04, 0.004, r * 0.3)
    },
  },
}

/** RBJ biquad, in place. */
function biquad(x, b0, b1, b2, a1, a2) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y
    x[i] = y
  }
  return x
}
function lowpass(x, fc, q) {
  const w = (2 * Math.PI * fc) / RATE, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al
  return biquad(x, (1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, (-2 * c) / a0, (1 - al) / a0)
}

/** sounds.ts roomImpulse: seeded decaying low-passed noise, −60 dB at 0.8 s, 12 ms pre-delay, unit energy. */
function roomImpulse() {
  const len = Math.floor(RATE * 0.85)
  const d = new Float64Array(len)
  const a = 1 - Math.exp((-2 * Math.PI * 2400) / RATE)
  const pre = Math.floor(RATE * 0.012)
  let seed = 20261007, lp1 = 0, lp2 = 0, energy = 0
  for (let i = pre; i < len; i++) {
    seed = (seed * 16807) % 2147483647
    lp1 += a * (seed / 1073741823.5 - 1 - lp1)
    lp2 += a * (lp1 - lp2)
    const s = (i - pre) / RATE
    d[i] = lp2 * Math.exp((-6.9 * s) / 0.8) * Math.min(1, s / 0.01)
    energy += d[i] * d[i]
  }
  const norm = 1 / Math.sqrt(energy || 1)
  for (let i = 0; i < len; i++) d[i] *= norm
  return d
}

/** In-place iterative radix-2 FFT (re, im of a power-of-two length). */
function fft(re, im, inverse) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let j = 0; j < len / 2; j++) {
        const ar = re[i + j], ai = im[i + j], br = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, bi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr
        re[i + j] = ar + br; im[i + j] = ai + bi; re[i + j + len / 2] = ar - br; im[i + j + len / 2] = ai - bi
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n }
}
const IR = roomImpulse()
function convolve(x, h) {
  let n = 1
  while (n < x.length + h.length) n <<= 1
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n)
  ar.set(x); br.set(h)
  fft(ar, ai, false); fft(br, bi, false)
  for (let i = 0; i < n; i++) { const r = ar[i] * br[i] - ai[i] * bi[i]; ai[i] = ar[i] * bi[i] + ai[i] * br[i]; ar[i] = r }
  fft(ar, ai, true)
  return ar.subarray(0, x.length)
}

// ── loudness (BS.1770-4) and true peak ──
function kWeighted(x) {
  const y = Float64Array.from(x)
  { // high shelf (pyloudnorm's constants, any sample rate)
    const G = 3.99984385397, Q = 0.7071752369554193, fc = 1681.9744509555319
    const A = 10 ** (G / 40), w = (2 * Math.PI * fc) / RATE, al = Math.sin(w) / (2 * Q), c = Math.cos(w), s = 2 * Math.sqrt(A) * al
    const a0 = A + 1 - (A - 1) * c + s
    biquad(y, (A * (A + 1 + (A - 1) * c + s)) / a0, (-2 * A * (A - 1 + (A + 1) * c)) / a0, (A * (A + 1 + (A - 1) * c - s)) / a0, (2 * (A - 1 - (A + 1) * c)) / a0, (A + 1 - (A - 1) * c - s) / a0)
  }
  { // high pass
    const Q = 0.5003270373253953, fc = 38.13547087613982
    const w = (2 * Math.PI * fc) / RATE, al = Math.sin(w) / (2 * Q), c = Math.cos(w), a0 = 1 + al
    biquad(y, (1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, (-2 * c) / a0, (1 - al) / a0)
  }
  return y
}
/** Integrated loudness, LUFS. A sound shorter than one 400 ms block is measured padded with silence to it. */
export function lufs(x) {
  const pad = new Float64Array(Math.max(x.length, Math.ceil(0.4 * RATE)))
  pad.set(x)
  const y = kWeighted(pad)
  const block = Math.round(0.4 * RATE), hop = Math.round(0.1 * RATE)
  const z = []
  for (let i = 0; i + block <= y.length; i += hop) {
    let e = 0
    for (let j = i; j < i + block; j++) e += y[j] * y[j]
    z.push(e / block)
  }
  const L = (m) => -0.691 + 10 * Math.log10(m)
  const abs = z.filter((m) => L(m) > -70)
  if (!abs.length) return -Infinity
  const rel = L(abs.reduce((a, b) => a + b, 0) / abs.length) - 10
  const gated = abs.filter((m) => L(m) > rel)
  return L(gated.reduce((a, b) => a + b, 0) / gated.length)
}
/** True peak, dBTP: 4× oversampled through a 48-tap windowed sinc. */
export function truePeakDb(x) {
  const taps = 12, os = 4
  let peak = 0
  for (let i = 0; i < x.length; i++) {
    peak = Math.max(peak, Math.abs(x[i]))
    for (let p = 1; p < os; p++) {
      const frac = p / os
      let acc = 0
      for (let k = -taps + 1; k <= taps; k++) {
        const j = i + k
        if (j < 0 || j >= x.length) continue
        const d = k - frac
        const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / taps)
        acc += x[j] * (Math.sin(Math.PI * d) / (Math.PI * d)) * w
      }
      peak = Math.max(peak, Math.abs(acc))
    }
  }
  return 20 * Math.log10(peak)
}

// ── render one candidate ──
export function render(c) {
  const p = PACKS[c.pack]
  const last = Math.max(...c.notes.map(([at, , , ring]) => at + ring))
  const seconds = Math.min(MAX_S, Math.max(MIN_S, LEAD + last + 0.05))
  const dry = new Float64Array(Math.ceil(seconds * RATE))
  for (const [at, note, vel, ring] of c.notes) {
    const m = note + p.transpose < FLOOR ? note + p.transpose + 12 : note + p.transpose
    p.strike(dry, LEAD + at, midi(m), 0.25 * vel, ring)
  }
  lowpass(dry, p.cutoff, 1)
  const wet = convolve(dry.map((v) => v * c.room), IR)
  const out = dry.map((v, i) => v + wet[i])
  // A 40 ms fade at the end: a tail cut at the length cap never clicks.
  const fade = Math.round(0.04 * RATE)
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade
  // Loudness first; the peak ceiling wins if the two disagree (then it's quieter than the target).
  let gain = 10 ** ((TARGET_LUFS - lufs(out)) / 20)
  const tp = truePeakDb(out) + 20 * Math.log10(gain)
  if (tp > PEAK_CEILING_DB - 0.1) gain *= 10 ** ((PEAK_CEILING_DB - 0.1 - tp) / 20)
  const pcm = new Int16Array(out.length)
  for (let i = 0; i < out.length; i++) pcm[i] = Math.max(-32767, Math.min(32767, Math.round(out[i] * gain * 32767)))
  const back = Float64Array.from(pcm, (v) => v / 32767)
  let clipped = 0
  for (const v of pcm) if (Math.abs(v) >= 32767) clipped++
  return { pcm, seconds: +(pcm.length / RATE).toFixed(3), lufs: +lufs(back).toFixed(2), truePeak: +truePeakDb(back).toFixed(2), clipped }
}

function wav(pcm) {
  const b = Buffer.alloc(44 + pcm.length * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + pcm.length * 2, 4); b.write('WAVE', 8)
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(pcm.length * 2, 40)
  Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).copy(b, 44)
  return b
}

const check = process.argv.includes('--check')
const rows = []
let bad = 0
for (const c of CANDIDATES) {
  const r = render(c)
  const file = path.join(HERE, `${c.id}.wav`)
  const bytes = wav(r.pcm)
  const problems = []
  if (r.clipped) problems.push(`${r.clipped} clipped samples`)
  if (r.truePeak > PEAK_CEILING_DB) problems.push(`true peak ${r.truePeak} dBTP`)
  if (r.seconds < MIN_S || r.seconds > MAX_S) problems.push(`${r.seconds} s`)
  if (Math.abs(r.lufs - TARGET_LUFS) > 2) problems.push(`${r.lufs} LUFS`)
  if (check && (!fs.existsSync(file) || !fs.readFileSync(file).equals(bytes))) problems.push('differs from the WAV on disk')
  if (!check) fs.writeFileSync(file, bytes)
  bad += problems.length ? 1 : 0
  rows.push({ id: c.id, type: c.type, letter: c.letter, pack: c.pack, seconds: r.seconds, lufs: r.lufs, truePeak: r.truePeak, clipped: r.clipped })
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${c.id.padEnd(18)} ${c.pack.padEnd(5)} ${r.seconds.toFixed(2)} s  ${r.lufs.toFixed(1)} LUFS  ${r.truePeak.toFixed(1)} dBTP${problems.length ? '  ← ' + problems.join(', ') : ''}`)
}
if (!check) {
  fs.writeFileSync(path.join(HERE, 'measurements.json'), JSON.stringify(rows, null, 2) + '\n')
  const list = { types: TYPES.map(([id, label, say]) => ({ id, label, say })), sounds: CANDIDATES.map((c) => ({ ...c, notes: undefined, ...rows.find((r) => r.id === c.id) })) }
  fs.writeFileSync(path.join(HERE, 'sounds.js'), `// Written by make.mjs — the options page's list. Don't edit by hand.\nwindow.NOTIFICATION_SOUNDS = ${JSON.stringify(list, null, 2)}\n`)
}
console.log(`${CANDIDATES.length} sounds, ${bad} with a problem`)
process.exit(bad ? 1 : 0)
