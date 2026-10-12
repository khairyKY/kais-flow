import { describe, expect, it } from 'vitest'
import { PLANTS, PLANT_ORDER, plantOf, plantPreviewSrc, plantSrc } from './plant'

// Vite lists the botanical drawings and inlines 0067 at test time (no node types in the app's tsconfig).
const DRAWINGS = new Set(Object.keys(import.meta.glob('../../../public/ds/assets/*/*.png')).map((k) => k.replace('../../../public', '')))
const MIGRATION = Object.values(import.meta.glob('../../../../supabase/migrations/0067_routine_plant.sql', { query: '?raw', import: 'default', eager: true }))[0] as string

describe('routine plants', () => {
  it("lists 2a's five species, in its order — the same set 0067's check allows", () => {
    expect(PLANT_ORDER).toEqual(['vine', 'cherry', 'fern', 'clover', 'daisy'])
    expect(PLANT_ORDER.map((p) => PLANTS[p].label)).toEqual(['Vine', 'Cherry', 'Fern', 'Clover', 'Daisy'])
    const allowed = MIGRATION.match(/plant in \(([^)]*)\)/)?.[1].match(/'([a-z]+)'/g)?.map((s) => s.slice(1, -1))
    expect(allowed).toEqual(PLANT_ORDER)
    expect(MIGRATION).toMatch(/default 'vine'/)
  })

  it("grows every species on the vine's thresholds (bare 0 · 1–6 · 7–29 · 30+)", () => {
    expect([0, 1, 6, 7, 29, 30].map((d) => plantSrc('vine', d))).toEqual(['bare', 'sprouting', 'sprouting', 'flowering', 'flowering', 'lush'].map((s) => `/ds/assets/vine/${s}.png`))
    expect([0, 3, 12, 40].map((d) => plantSrc('fern', d))).toEqual(['coil', 'unfurl1', 'unfurl2', 'full'].map((s) => `/ds/assets/fern/${s}.png`))
    expect([0, 3, 12, 40].map((d) => plantSrc('clover', d))).toEqual(['seedling', 'resting', 'awake', 'four_leaf'].map((s) => `/ds/assets/clover/${s}.png`))
  })

  it('every drawing it points at exists in public/ds/assets', () => {
    expect(DRAWINGS.size).toBeGreaterThan(20)
    for (const p of PLANT_ORDER) {
      for (const d of [0, 1, 7, 30]) expect(DRAWINGS.has(plantSrc(p, d)), plantSrc(p, d)).toBe(true)
      expect(DRAWINGS.has(plantPreviewSrc(p)), plantPreviewSrc(p)).toBe(true)
    }
  })

  it('a row without a plant (cached before 0067) or with an unknown one is a vine', () => {
    expect(plantOf({})).toBe('vine')
    expect(plantOf({ plant: 'rose' as never })).toBe('vine')
    expect(plantOf({ plant: 'cherry' })).toBe('cherry')
  })
})
