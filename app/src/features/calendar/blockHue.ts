import { ACCENT_COLORS } from './formFields'

// Calendar blocks options, "Now" (Kai 2026-10-23): a block is drawn from its accent — the fill and the edge
// are that accent mixed in, the time row and the check are its own text tone. A colour picked from the
// swatches is its token, so Night Garden draws it in the night value (the hex is the day one). Any other
// colour (a project's) keeps its hex, its ink mixed toward the body ink as the phone always did.
const TOKENS: Record<string, readonly [string, string]> = {
  Lavender: ['var(--acc-lavender)', 'var(--acc-lavender-text)'],
  Sage: ['var(--acc-sage)', 'var(--acc-sage-text)'],
  Moss: ['var(--acc-moss)', 'color-mix(in srgb, var(--acc-moss) 55%, var(--ink-body))'],
  Terra: ['var(--acc-terra)', 'var(--acc-terra-ink)'],
  Blossom: ['var(--acc-blossom)', 'var(--acc-blossom-text)'],
  Hydrangea: ['var(--acc-hydrangea)', 'var(--acc-hydrangea-deep)'],
  Buttercream: ['var(--acc-buttercream)', 'var(--acc-buttercream-text)'],
  Clover: ['var(--acc-clover)', 'var(--acc-clover-text)'],
  Gold: ['var(--acc-gold-warm)', 'var(--acc-gold)'],
}
const BY_HEX = new Map(ACCENT_COLORS.flatMap((c) => (c.value && TOKENS[c.name] ? [[c.value.toLowerCase(), TOKENS[c.name]] as const] : [])))

/** `c`: the accent (fill and edge are mixed from it) · `ink`: the time row, the check, the elapsed wash. */
export function blockHue(color: string): { c: string; ink: string } {
  const t = BY_HEX.get(color.toLowerCase())
  return t ? { c: t[0], ink: t[1] } : { c: color, ink: `color-mix(in srgb, ${color} 55%, var(--ink-body))` }
}
