import { parse as parseEmoji } from 'twemoji-parser'

export type EmojiSegment = { type: 'text'; value: string } | { type: 'emoji'; char: string; file: string }

// R4 (2026-07-20): Kai asked for iOS emoji and the first pass shipped **Twemoji**, which is
// Twitter's set — a different look entirely, which is why he still saw "not iOS". The glyphs
// now come from `emoji-datasource-apple` (Apple artwork, vendored into public/emoji as 64px
// PNGs). twemoji-parser is kept purely as the *detector* — it finds emoji sequences in text,
// including multi-codepoint ones (flags, ZWJ families, skin tones) — and only its codepoint
// output is used, never its CDN URL.
//
// Naming differs slightly between the two sets: Apple keeps the FE0F variation selector on
// some sequences that Twemoji strips. Measured against the real file lists: 3570 names match
// exactly, 202 more match with `-fe0f` appended (the rest are lone regional indicators, which
// aren't emoji on their own). `fallbacks` carries both candidates so the renderer can try the
// second before giving up and drawing the plain character.
export function splitEmojiSegments(text: string): EmojiSegment[] {
  const matches = parseEmoji(text)
  if (matches.length === 0) return [{ type: 'text', value: text }]

  const segments: EmojiSegment[] = []
  let cursor = 0
  for (const m of matches) {
    if (m.indices[0] > cursor) segments.push({ type: 'text', value: text.slice(cursor, m.indices[0]) })
    const base = m.url.slice(m.url.lastIndexOf('/') + 1).replace(/\.svg$/, '')
    segments.push({ type: 'emoji', char: m.text, file: base })
    cursor = m.indices[1]
  }
  if (cursor < text.length) segments.push({ type: 'text', value: text.slice(cursor) })
  return segments
}

/** Candidate filenames for a detected emoji, in order. See the note above on FE0F. */
export function emojiCandidates(file: string): string[] {
  return [`${file}.png`, `${file}-fe0f.png`]
}
