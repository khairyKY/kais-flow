import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The suite runs on node (no DOM). sounds.ts only needs localStorage, so a five-line shim
// beats switching the whole project to jsdom.
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
} as Storage

const s = await import('./sounds')
const { queryClient } = await import('./queryClient')
const { closeTheGarden, isQuiet, readSoundEvents, writeSoundEvents, readSoundPack, writeSoundPack, readVolume, writeQuietHours, writeVolume, migrateLegacy, completionSound, DEFAULT_VOLUME, DEFAULT_EVENTS, SOUND_EVENTS, SOUND_PACKS, MAX_DURATION, PACKS } = s

// The synthesis needs a real AudioContext (node has none); docs/log/assets/sounds/verify.mjs
// renders and measures every voice in Chrome. What's pinned here: the catalog, the v1 → v2
// migration, the pack choice, and the gating — a sound must never play when it was turned off.
function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('catalog', () => {
  beforeEach(() => localStorage.clear())

  it('seven events, three packs, a limit for every event, a voice for every pack', () => {
    expect(SOUND_EVENTS).toEqual(['complete', 'complete_big', 'capture', 'focus_start', 'focus_end', 'ritual_done', 'undo'])
    expect(SOUND_PACKS).toEqual(['kalimba', 'felt', 'glass'])
    for (const e of SOUND_EVENTS) expect(MAX_DURATION[e]).toBeGreaterThan(0)
    for (const p of SOUND_PACKS) expect(typeof PACKS[p].strike).toBe('function')
  })

  it('defaults: quiet volume, kalimba, everything on but undo', () => {
    expect(readVolume()).toBe(DEFAULT_VOLUME)
    expect(readSoundPack()).toBe('kalimba')
    expect(readSoundEvents()).toEqual({ ...DEFAULT_EVENTS })
    expect(DEFAULT_EVENTS.undo).toBe(false)
    expect(SOUND_EVENTS.filter((e) => e !== 'undo').every((e) => DEFAULT_EVENTS[e])).toBe(true)
  })

  it('round-trips the events and volume', () => {
    writeSoundEvents({ ...readSoundEvents(), complete: false, undo: true })
    expect(readSoundEvents().complete).toBe(false)
    expect(readSoundEvents().undo).toBe(true)
    writeVolume(0)
    expect(readVolume()).toBe(0)
  })

  it('a saved map missing a newer event still gets its default; junk keys are dropped', () => {
    localStorage.setItem('kf_sound_events', JSON.stringify({ complete: false, nonsense: true }))
    const e = readSoundEvents()
    expect(e.complete).toBe(false)
    expect(e.focus_end).toBe(true)
    expect('nonsense' in e).toBe(false)
  })

  it('a corrupt events map or volume falls back to the defaults', () => {
    localStorage.setItem('kf_sound_events', '{not json')
    expect(readSoundEvents()).toEqual({ ...DEFAULT_EVENTS })
    localStorage.setItem('kf_sound_volume', 'not-a-number')
    expect(readVolume()).toBe(DEFAULT_VOLUME)
  })
})

describe('pack persistence', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips each pack', () => {
    for (const p of SOUND_PACKS) {
      writeSoundPack(p)
      expect(readSoundPack()).toBe(p)
    }
  })

  it('an unknown pack (v1 never had one, or a removed one) falls back to kalimba', () => {
    localStorage.setItem('kf_sound_pack', 'tuba')
    expect(readSoundPack()).toBe('kalimba')
  })
})

describe('v1 → v2 migration (kf_sounds)', () => {
  beforeEach(() => localStorage.clear())

  it('maps each v1 voice to the event it stood for', () => {
    expect(migrateLegacy({ paper_rustle: false, petal_fall: true, distant_chime: false, birdsong: true, rain_patter: true, pencil_scratch: true })).toEqual({
      complete: false,
      complete_big: true,
      focus_start: false,
      focus_end: false,
      ritual_done: true,
    })
  })

  it('ignores junk', () => {
    expect(migrateLegacy(null)).toEqual({})
    expect(migrateLegacy('x')).toEqual({})
    expect(migrateLegacy({ paper_rustle: 'yes' })).toEqual({})
  })

  it('an old device reads its v1 toggles; the events it never had take their defaults', () => {
    localStorage.setItem('kf_sounds', JSON.stringify({ paper_rustle: false, petal_fall: true, distant_chime: true, birdsong: false, rain_patter: true, pencil_scratch: false }))
    expect(readSoundEvents()).toEqual({ complete: false, complete_big: true, capture: true, focus_start: true, focus_end: true, ritual_done: false, undo: false })
  })

  it('once v2 is written, v1 no longer counts', () => {
    localStorage.setItem('kf_sounds', JSON.stringify({ paper_rustle: false }))
    writeSoundEvents({ ...DEFAULT_EVENTS, complete: true })
    expect(readSoundEvents().complete).toBe(true)
  })

  it('a corrupt v1 map is just the defaults', () => {
    localStorage.setItem('kf_sounds', '{')
    expect(readSoundEvents()).toEqual({ ...DEFAULT_EVENTS })
  })
})

describe('which completion sound', () => {
  const t = (id: string, top3: boolean, status: 'todo' | 'done' = 'todo') => ({ id, top3, status, deleted_at: null })

  it('a plain task is a tock', () => {
    expect(completionSound(t('a', false), [t('a', false), t('b', true)], 'b')).toBe('complete')
  })
  it('the Goal of the day is the phrase, even with other picks open', () => {
    expect(completionSound(t('g', true), [t('g', true), t('b', true), t('c', true)], 'g')).toBe('complete_big')
  })
  it('a Top 3 pick with others still open is a tock', () => {
    expect(completionSound(t('b', true), [t('g', true), t('b', true)], 'g')).toBe('complete')
  })
  it('the last open Top 3 pick is the phrase (done and trashed picks don\'t count)', () => {
    const tasks = [t('g', true, 'done'), t('b', true), { ...t('c', true), deleted_at: '2026-10-07T00:00:00Z' }]
    expect(completionSound(t('b', true), tasks, 'g')).toBe('complete_big')
  })
  it('a stale goal id that is no longer a pick does not make a plain task big', () => {
    expect(completionSound(t('g', false), [t('g', false)], 'g')).toBe('complete')
  })
})

describe('quiet', () => {
  beforeEach(() => localStorage.clear())

  it('starts when the garden closes and lifts the next day', () => {
    expect(isQuiet()).toBe(false)
    closeTheGarden(dateKey(new Date()))
    expect(isQuiet()).toBe(true)
    const tomorrow = new Date(Date.now() + 86_400_000)
    expect(isQuiet(tomorrow)).toBe(false)
  })

  it('can be switched off entirely', () => {
    closeTheGarden(dateKey(new Date()))
    writeQuietHours(false)
    expect(isQuiet()).toBe(false)
  })
})

describe('playSound gating', () => {
  const calls: string[] = []
  let clock = Date.parse('2026-10-07T10:00:00Z') // noon in Cairo: outside default quiet hours
  const play = (e: Parameters<typeof s.playSound>[0]) => {
    clock += 1000 // past the 80 ms bulk throttle
    vi.setSystemTime(clock)
    s.playSound(e)
  }
  beforeEach(() => {
    localStorage.clear()
    calls.length = 0
    vi.useFakeTimers({ toFake: ['Date'] })
    s.player.play = (e) => void calls.push(e)
    queryClient.setQueryData(['app_settings'], { quiet_hours_on: true, quiet_from: '22:30', quiet_to: '07:00' })
  })
  afterEach(() => vi.useRealTimers())

  it('plays an event that is on', () => {
    play('complete')
    expect(calls).toEqual(['complete'])
  })
  it('stays silent for an event that is off (undo, by default) or at volume 0', () => {
    play('undo')
    writeVolume(0)
    play('complete')
    expect(calls).toEqual([])
  })
  it('stays silent after the garden closes', () => {
    closeTheGarden(dateKey(new Date(clock + 1000)))
    play('focus_end')
    expect(calls).toEqual([])
  })
  it("stays silent in Notifications' quiet hours and while the tray has notifications paused", () => {
    queryClient.setQueryData(['app_settings'], { quiet_hours_on: true, quiet_from: '00:00', quiet_to: '23:59' })
    play('complete')
    queryClient.setQueryData(['app_settings'], { quiet_hours_on: false, notify_paused_until: new Date(clock + 3_600_000).toISOString() })
    play('complete')
    expect(calls).toEqual([])
  })
  it('a burst (a bulk complete) is one sound', () => {
    play('complete')
    s.playSound('complete')
    s.playSound('complete_big')
    expect(calls).toEqual(['complete'])
  })
  it('previews ignore the toggles and quiet, in the pack asked for', () => {
    let pack = ''
    s.player.play = (e, p) => void (calls.push(e), (pack = p))
    closeTheGarden(dateKey(new Date()))
    s.previewSound('undo', 'glass')
    expect(calls).toEqual(['undo'])
    expect(pack).toBe('glass')
  })
})
