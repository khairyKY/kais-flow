import { describe, expect, it } from 'vitest'
import { sharedText } from './shareText'

describe('sharedText', () => {
  it('joins title, text and url on their own lines', () => {
    expect(sharedText(['Tyre invoice', 'call them back', 'https://x.test/a'])).toBe('Tyre invoice\ncall them back\nhttps://x.test/a')
  })
  it('trims and drops empty or missing parts', () => {
    expect(sharedText([null, '  hello  ', '', undefined])).toBe('hello')
    expect(sharedText([null, ' ', undefined])).toBe('')
  })
  it('keeps one copy of a repeated part (Chrome: the URL in text and url)', () => {
    expect(sharedText(['Page', 'https://x.test/a', 'https://x.test/a'])).toBe('Page\nhttps://x.test/a')
  })
  it('drops a subject the text already carries (Android apps)', () => {
    expect(sharedText(['Great article', 'Great article https://x.test/a', null])).toBe('Great article https://x.test/a')
  })
})
