import { parse as parseEmoji } from 'twemoji-parser'

export type EmojiSegment = { type: 'text'; value: string } | { type: 'emoji'; char: string; file: string }

// Pure text→segments split, kept apart from EmojiText.tsx's JSX so the
// parsing/slicing logic (the actual non-trivial part) is unit-testable
// without a DOM/component-rendering harness this project doesn't otherwise use.
export function splitEmojiSegments(text: string): EmojiSegment[] {
  const matches = parseEmoji(text)
  if (matches.length === 0) return [{ type: 'text', value: text }]

  const segments: EmojiSegment[] = []
  let cursor = 0
  for (const m of matches) {
    if (m.indices[0] > cursor) segments.push({ type: 'text', value: text.slice(cursor, m.indices[0]) })
    segments.push({ type: 'emoji', char: m.text, file: m.url.slice(m.url.lastIndexOf('/') + 1) })
    cursor = m.indices[1]
  }
  if (cursor < text.length) segments.push({ type: 'text', value: text.slice(cursor) })
  return segments
}
