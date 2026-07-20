import { describe, expect, it } from 'vitest'
import { splitEmojiSegments } from './emojiSegments'

describe('splitEmojiSegments', () => {
  it('returns the whole string as one text segment when there is no emoji', () => {
    expect(splitEmojiSegments('Buy milk')).toEqual([{ type: 'text', value: 'Buy milk' }])
  })

  it('splits leading emoji + text into emoji then text segments', () => {
    const segs = splitEmojiSegments('🏠 Home')
    expect(segs).toEqual([
      { type: 'emoji', char: '🏠', file: '1f3e0' },
      { type: 'text', value: ' Home' },
    ])
  })

  it('splits text-emoji-text into three segments', () => {
    const segs = splitEmojiSegments('Buy 🥛 milk')
    expect(segs).toEqual([
      { type: 'text', value: 'Buy ' },
      { type: 'emoji', char: '🥛', file: '1f95b' },
      { type: 'text', value: ' milk' },
    ])
  })

  it('handles back-to-back emoji with no gap segment between them', () => {
    const segs = splitEmojiSegments('🔥🔥')
    expect(segs).toEqual([
      { type: 'emoji', char: '🔥', file: '1f525' },
      { type: 'emoji', char: '🔥', file: '1f525' },
    ])
  })

  it('handles an empty string', () => {
    expect(splitEmojiSegments('')).toEqual([{ type: 'text', value: '' }])
  })
})
