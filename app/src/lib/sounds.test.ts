import { beforeEach, describe, expect, it } from 'vitest'

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

const { closeTheGarden, isQuiet, readSoundCatalog, readVolume, writeQuietHours, writeSoundCatalog, writeVolume, DEFAULT_VOLUME } = await import('./sounds')

// The synthesis itself needs a real AudioContext (jsdom has none) — playSound is written to
// no-op silently in that case. What's worth pinning is the GATING: a sound must never play
// when the user turned it off, muted, or closed the garden for the night.
function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('sound settings + quiet hours', () => {
  beforeEach(() => localStorage.clear())

  it('defaults: quiet volume, papery sounds on, ceremonial ones off', () => {
    expect(readVolume()).toBe(DEFAULT_VOLUME)
    const c = readSoundCatalog()
    expect(c.paper_rustle).toBe(true)
    expect(c.distant_chime).toBe(false)
  })

  it('round-trips the catalog and volume', () => {
    writeSoundCatalog({ ...readSoundCatalog(), distant_chime: true })
    expect(readSoundCatalog().distant_chime).toBe(true)
    writeVolume(0)
    expect(readVolume()).toBe(0)
  })

  it('quiet hours start when the garden closes and lift the next day', () => {
    expect(isQuiet()).toBe(false)
    closeTheGarden(dateKey(new Date()))
    expect(isQuiet()).toBe(true)
    const tomorrow = new Date(Date.now() + 86_400_000)
    expect(isQuiet(tomorrow)).toBe(false)
  })

  it('quiet hours can be switched off entirely', () => {
    closeTheGarden(dateKey(new Date()))
    writeQuietHours(false)
    expect(isQuiet()).toBe(false)
  })

  it('a corrupt volume falls back to the quiet default', () => {
    localStorage.setItem('kf_sound_volume', 'not-a-number')
    expect(readVolume()).toBe(DEFAULT_VOLUME)
  })
})
