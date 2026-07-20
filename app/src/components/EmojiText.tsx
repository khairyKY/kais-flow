import { useState } from 'react'
import { splitEmojiSegments, emojiCandidates } from './emojiSegments'

// Renders emoji in text with self-hosted Twemoji SVGs (public/emoji/, from
// @discordapp/twemoji — MIT + CC-BY 4.0) instead of the OS's native emoji
// glyph, so a project name like Akiflow's "🏠 Home" looks the same on
// Windows/Android as it does on iOS. Falls back to the plain character if
// the image fails (offline + never-seen-before emoji) — never worse than
// native rendering, just not restyled.
export function EmojiText({ text }: { text: string }) {
  const segments = splitEmojiSegments(text)
  return (
    <>
      {segments.map((s, i) =>
        s.type === 'text' ? s.value : <EmojiGlyph key={i} char={s.char} file={s.file} />
      )}
    </>
  )
}

function EmojiGlyph({ char, file }: { char: string; file: string }) {
  // Walk the candidate filenames (base, then the -fe0f variant); if none resolve, fall back to
  // the plain character — never worse than the OS rendering we're replacing.
  const [attempt, setAttempt] = useState(0)
  const candidates = emojiCandidates(file)
  if (attempt >= candidates.length) return <>{char}</>
  return (
    <img
      src={`/emoji/${candidates[attempt]}`}
      alt={char}
      draggable={false}
      loading="lazy"
      onError={() => setAttempt((a) => a + 1)}
      style={{ height: '1em', width: '1em', verticalAlign: '-0.15em', display: 'inline-block' }}
    />
  )
}
