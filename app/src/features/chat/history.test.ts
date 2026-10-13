import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KEEP, forgetChats, loadChat, saveChat, type DisplayMessage } from './history'

// The suite runs on node: a Map-backed localStorage with the Storage calls history.ts uses.
const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
})

const q = (content: string): DisplayMessage => ({ role: 'user', content })
const a = (content: string): DisplayMessage => ({ role: 'assistant', content, citations: [] })

beforeEach(() => store.clear())

describe('the chat keeps its conversation until Clear (A28)', () => {
  it('comes back as it was, per account', () => {
    saveChat('u1', [q('What’s on today?'), a('Three things.')])
    expect(loadChat('u1')).toEqual([q('What’s on today?'), a('Three things.')])
    expect(loadChat('u2')).toEqual([])
    expect(loadChat(undefined)).toEqual([])
  })
  it('Clear (an empty conversation) removes it', () => {
    saveChat('u1', [q('hi')])
    saveChat('u1', [])
    expect(store.has('kf.chat.u1')).toBe(false)
  })
  it('keeps only the newest KEEP messages', () => {
    saveChat('u1', Array.from({ length: KEEP + 5 }, (_, i) => q(`m${i}`)))
    const back = loadChat('u1')
    expect(back).toHaveLength(KEEP)
    expect(back[0].content).toBe('m5')
  })
  it('drops an answer cut off before its first word, and anything that isn’t a message', () => {
    store.set('kf.chat.u1', JSON.stringify([q('hi'), a(''), { role: 'system', content: 'x' }, null, 'junk']))
    expect(loadChat('u1')).toEqual([q('hi')])
    store.set('kf.chat.u1', '{not json')
    expect(loadChat('u1')).toEqual([])
  })
  it('sign-out forgets every account’s chat and nothing else', () => {
    saveChat('u1', [q('a')])
    saveChat('u2', [q('b')])
    store.set('kf_theme', 'night')
    forgetChats()
    expect([...store.keys()]).toEqual(['kf_theme'])
  })
})
