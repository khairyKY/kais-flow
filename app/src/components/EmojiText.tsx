import { useState } from 'react'
import { splitEmojiSegments } from './emojiSegments'

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
  const [failed, setFailed] = useState(false)
  if (failed) return <>{char}</>
  return (
    <img
      src={`/emoji/${file}`}
      alt={char}
      draggable={false}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ height: '1em', width: '1em', verticalAlign: '-0.15em', display: 'inline-block' }}
    />
  )
}
