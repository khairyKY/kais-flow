import { describe, expect, it, vi } from 'vitest'

// captureKey.ts imports the Supabase client, which throws without VITE_ env (CI has none).
vi.mock('../../lib/supabase', () => ({ supabase: {} }))

import { bookmarklet, curlRecipe, newCaptureKey } from './captureKey'

describe('capture key', () => {
  it('has the shape the capture function accepts', () => {
    const key = newCaptureKey()
    // Must match the function's guard: /^kf_[A-Za-z0-9_-]{32,}$/
    expect(key).toMatch(/^kf_[A-Za-z0-9_-]{32,}$/)
    expect(newCaptureKey()).not.toBe(key)
  })

  it('bookmarklet posts to the capture endpoint with the key', () => {
    const js = decodeURIComponent(bookmarklet('kf_' + 'a'.repeat(43)).slice('javascript:'.length))
    expect(js).toContain('/functions/v1/capture')
    expect(js).toContain(`Bearer kf_${'a'.repeat(43)}`)
    expect(() => new Function(js)).not.toThrow() // parses as JavaScript
  })

  it('curl recipe posts JSON with the key in the header, not the address', () => {
    const key = 'kf_' + 'b'.repeat(43)
    const line = curlRecipe(key)
    const url = line.match(/-X POST (\S+)/)?.[1] ?? ''
    expect(url).toMatch(/\/functions\/v1\/capture$/)
    expect(url).not.toContain(key)
    expect(line).toContain(`-H "Authorization: Bearer ${key}"`)
    expect(JSON.parse(line.match(/-d '(.*)'$/)?.[1] ?? '')).toEqual({ text: 'call the tyre supplier' })
  })
})
