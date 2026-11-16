// Calendar block colours by name — the MCP's `color` argument. A MIRROR of app/src/features/calendar/blockHue.ts
// (BLOCK_SWATCHES, LEGACY_SWATCHES, nearestSwatch): the functions can't import the app, so the app's vitest
// (blockHue.test.ts) checks this against it. Change one, change both. Pure — no Deno APIs.

/** Palette C, as the app stores it (the day hex). */
export const BLOCK_SWATCHES: readonly { name: string; value: string }[] = [
  { name: 'Rose', value: '#E58F99' }, { name: 'Clay', value: '#E29572' }, { name: 'Ochre', value: '#C9A658' }, { name: 'Olive', value: '#A0B569' },
  { name: 'Fern', value: '#72BF8E' }, { name: 'Lagoon', value: '#47BFC5' }, { name: 'Cornflower', value: '#81ADED' }, { name: 'Iris', value: '#B59CE3' },
  { name: 'Wine', value: '#B36670' }, { name: 'Rust', value: '#B16C4C' }, { name: 'Honey', value: '#9C7B31' }, { name: 'Moss', value: '#768A42' },
  { name: 'Pine', value: '#4A9266' }, { name: 'Tide', value: '#0D9298' }, { name: 'Indigo', value: '#5A81BC' }, { name: 'Heather', value: '#8972B3' },
]

/** The nine colours saved before palette C, in the app's order. */
export const LEGACY_SWATCHES: readonly { name: string; value: string }[] = [
  { name: 'Lavender', value: '#A8A0BE' }, { name: 'Sage', value: '#8A9A7E' }, { name: 'Moss', value: '#7A946E' }, { name: 'Terra', value: '#B5654A' },
  { name: 'Blossom', value: '#D4A8B0' }, { name: 'Hydrangea', value: '#9AB4BE' }, { name: 'Buttercream', value: '#D4C78A' }, { name: 'Clover', value: '#C9A0A0' },
  { name: 'Gold', value: '#C9A55A' },
]

type RGB = [number, number, number]
const rgbOf = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
function oklab(c: RGB): RGB {
  const [r, g, b] = c.map(lin)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
const distance = (a: RGB, b: RGB) => {
  const [x, y] = [oklab(a), oklab(b)]
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

/** The palette C swatch nearest `color` (OKLab distance) — the app's nearestSwatch. */
export function nearestSwatch(color: string): { name: string; value: string } {
  const c = rgbOf(color)
  return BLOCK_SWATCHES.reduce((best, s) => (distance(c, rgbOf(s.value)) < distance(c, rgbOf(best.value)) ? s : best))
}

/** A colour name (any case) → its palette C swatch. A palette C name is itself ("moss" is #768A42); a name only the
 * old palette had (Lavender, Sage, Terra, Blossom, Hydrangea, Buttercream, Clover, Gold) is its nearest new swatch,
 * as the app draws a block saved with it. Undefined for anything else. */
export function swatchByName(name: string): { name: string; value: string } | undefined {
  const k = name.trim().toLowerCase()
  const own = BLOCK_SWATCHES.find((s) => s.name.toLowerCase() === k)
  if (own) return own
  const old = LEGACY_SWATCHES.find((s) => s.name.toLowerCase() === k)
  return old ? nearestSwatch(old.value) : undefined
}

/** The names a caller may use, for an error or a description. */
export const COLOR_NAMES = BLOCK_SWATCHES.map((s) => s.name)
export const LEGACY_COLOR_NAMES = LEGACY_SWATCHES.map((s) => s.name).filter((n) => !COLOR_NAMES.includes(n))

/** A stored colour as the app draws it: a pre-palette-C hex as its new swatch; palette C's own as itself; any other
 * colour (a custom one) as null (it has no name). */
export function swatchOfHex(hex: string | null | undefined): { name: string; value: string } | null {
  if (!hex) return null
  const k = hex.toLowerCase()
  return BLOCK_SWATCHES.find((s) => s.value.toLowerCase() === k) ?? (LEGACY_SWATCHES.some((s) => s.value.toLowerCase() === k) ? nearestSwatch(hex) : null)
}
