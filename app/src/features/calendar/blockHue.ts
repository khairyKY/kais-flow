// cal-blocks (Kai 2026-10-26, palette C — design-export/Calendar extras options.html, values in
// docs/log/assets/looks2/palettes.json): a block is drawn from its accent — the fill and the edge are that accent
// mixed in (--blk-fill, 45%), the time row and the check are its own text tone, worked out per swatch to pass AA
// on every fill a block's text sits on. A swatch is its token (--blk-<name>, colors.css / colors.dark.css), so
// Night Garden draws it in its night value (the stored hex is the day one). The nine colours saved before palette C
// draw as their nearest new swatch. Any other colour (custom "+", a project's) keeps its hex, its text tone worked
// out the same way, by day and at night.

/** Palette C: a clear row and a deep row, 8 hues evenly spaced (OKLCH, equal lightness and strength). The value
 * saved on a block is the day hex. */
export const BLOCK_SWATCHES: readonly { name: string; value: string }[] = [
  // ds-ok: the swatch values a block stores (their tokens live in styles/tokens)
  { name: 'Rose', value: '#E58F99' }, { name: 'Clay', value: '#E29572' }, { name: 'Ochre', value: '#C9A658' }, { name: 'Olive', value: '#A0B569' }, // ds-ok: stored swatch values
  { name: 'Fern', value: '#72BF8E' }, { name: 'Lagoon', value: '#47BFC5' }, { name: 'Cornflower', value: '#81ADED' }, { name: 'Iris', value: '#B59CE3' }, // ds-ok: stored swatch values
  { name: 'Wine', value: '#B36670' }, { name: 'Rust', value: '#B16C4C' }, { name: 'Honey', value: '#9C7B31' }, { name: 'Moss', value: '#768A42' }, // ds-ok: stored swatch values
  { name: 'Pine', value: '#4A9266' }, { name: 'Tide', value: '#0D9298' }, { name: 'Indigo', value: '#5A81BC' }, { name: 'Heather', value: '#8972B3' }, // ds-ok: stored swatch values
]

/** The swatches before palette C (Lavender … Gold), as blocks saved them. */
export const LEGACY_SWATCHES: readonly string[] = ['#A8A0BE', '#8A9A7E', '#7A946E', '#B5654A', '#D4A8B0', '#9AB4BE', '#D4C78A', '#C9A0A0', '#C9A55A'] // ds-ok: colours saved before palette C

type Hue = { c: string; ink: string }
const token = (name: string): Hue => ({ c: `var(--blk-${name.toLowerCase()})`, ink: `var(--blk-${name.toLowerCase()}-ink)` })

/** A block with no colour of its own: a task or a Time block is Iris, a plain event Rose (palette C's roles). */
export const KIND_HUE: { task: Hue; event: Hue } = { task: token('Iris'), event: token('Rose') }

// ── OKLab / OKLCH (Björn Ottosson) and WCAG 2 contrast — the same maths as the options page ──
type RGB = [number, number, number]
export const rgbOf = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
const toHex = (c: readonly number[]) => '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase()
const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
function oklab(c: RGB): RGB {
  const [r, g, b] = c.map(lin)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
function fromOklab(L: number, A: number, B: number): RGB {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(
    (x) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.sign(x) * Math.abs(x) ** (1 / 2.4) - 0.055),
  ) as RGB
}
// ponytail: gamut fit by stepping chroma down — a few hundred steps at most, once per custom colour (cached)
function fromOklch(L: number, C: number, h: number): RGB {
  const at = (k: number) => fromOklab(L, k * Math.cos(h), k * Math.sin(h))
  for (let k = C; k > 0; k -= 0.002) {
    const c = at(k)
    if (c.every((v) => v >= -0.5 && v <= 255.5)) return c
  }
  return at(0)
}
const lum = (c: RGB) => {
  const [r, g, b] = c.map(lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const contrast = (a: RGB, b: RGB) => {
  const x = lum(a), y = lum(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
const over = (top: RGB, under: RGB, a: number): RGB => top.map((v, i) => v * a + under[i] * (1 - a)) as RGB

// What a block's text sits on: the grid's paper, or today's wash (lavender at 10%); each with and without the "Now"
// wash (the block's ink at 14%). The block's fill: palette C's, 24% by day, 20% at night.
const GROUND = {
  day: { grounds: [rgbOf('#FBF6E9'), over(rgbOf('#A8A0BE'), rgbOf('#FBF6E9'), 0.1)], fill: 0.24 }, // ds-ok: --paper-parchment and --acc-lavender (day), for the contrast maths
  night: { grounds: [rgbOf('#262233'), over(rgbOf('#C0B7E0'), rgbOf('#262233'), 0.1)], fill: 0.2 }, // ds-ok: --paper-parchment and --acc-lavender (night), for the contrast maths
}
/** The fills `ink` must read on for a block of colour `c`. */
export function blockFills(c: RGB, ink: RGB, theme: 'day' | 'night'): RGB[] {
  const g = GROUND[theme]
  return g.grounds.flatMap((under) => {
    const f = over(c, under, g.fill)
    return [f, over(ink, f, 0.14)]
  })
}
/** The text tone for colour `c`: its own hue, a step darker by day (lighter at night) at a time until it clears
 * 4.6:1 on every fill (a hair over AA's 4.5, so rounding never lands under). */
function inkFor(c: RGB, theme: 'day' | 'night'): string {
  const [L, A, B] = oklab(c)
  const C = Math.hypot(A, B), h = Math.atan2(B, A)
  for (let i = 0; i <= 95; i++) {
    const ink = fromOklch(theme === 'day' ? L - i / 100 : Math.min(0.99, L + i / 100), C * (theme === 'day' ? 0.85 : 0.5), h)
    if (Math.min(...blockFills(c, ink, theme).map((f) => contrast(ink, f))) >= 4.6) return toHex(ink)
  }
  return theme === 'day' ? '#2A2420' : '#F0EBDD' // ds-ok: the body ink, day and night — never reached for a real colour
}

const distance = (a: RGB, b: RGB) => {
  const [x, y] = [oklab(a), oklab(b)]
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}
/** The palette C swatch nearest `color` (OKLab distance). */
export function nearestSwatch(color: string): { name: string; value: string } {
  const c = rgbOf(color)
  return BLOCK_SWATCHES.reduce((best, s) => (distance(c, rgbOf(s.value)) < distance(c, rgbOf(best.value)) ? s : best))
}

// hex → the swatch it draws as: palette C's own, and each colour saved before it as its nearest new swatch.
const SWATCH_OF = new Map<string, { name: string; value: string }>([
  ...BLOCK_SWATCHES.map((s) => [s.value.toLowerCase(), s] as const),
  ...LEGACY_SWATCHES.map((v) => [v.toLowerCase(), nearestSwatch(v)] as const),
])

/** The swatch value a stored colour is shown as (a pre-palette-C swatch → its new one); anything else as it is. */
export function swatchValue(color: string | null | undefined): string | null {
  if (!color) return null
  return SWATCH_OF.get(color.toLowerCase())?.value ?? color
}

/** The colour a block is drawn in, for a dot or a square beside its title: its own, else its kind's. */
export function blockSwatch(e: { color?: string | null; type?: string | null; task_id?: string | null }): string {
  return e.color ? blockHue(e.color).c : (e.type === 'event' && !e.task_id ? KIND_HUE.event : KIND_HUE.task).c
}

const custom = new Map<string, Hue>()
/** `c`: the accent (fill and edge are mixed from it) · `ink`: the time row, the check, the elapsed wash. */
export function blockHue(color: string): Hue {
  const s = SWATCH_OF.get(color.toLowerCase())
  if (s) return token(s.name)
  if (!/^#[0-9a-f]{6}$/i.test(color)) return { c: color, ink: `color-mix(in srgb, ${color} 55%, var(--ink-body))` }
  let h = custom.get(color)
  if (!h) {
    // One value for both themes: --blk-night is 0% by day and 100% at night, so the mix is the day tone or the night one.
    h = { c: color, ink: `color-mix(in srgb, ${inkFor(rgbOf(color), 'day')}, ${inkFor(rgbOf(color), 'night')} var(--blk-night))` }
    custom.set(color, h)
  }
  return h
}
