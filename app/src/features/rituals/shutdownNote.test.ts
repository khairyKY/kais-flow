import { describe, expect, it } from 'vitest'
import { noteHome, shutdownNote, tidyNote, withShutdownNote } from '../../../../supabase/functions/_shared/shutdownNote.ts'

describe('shutdown note', () => {
  it('starts an empty entry with the heading', () => {
    expect(withShutdownNote('', 'Coffee helped.')).toBe('Shut down\nCoffee helped.')
  })
  it('appends under the heading after what is already written', () => {
    expect(withShutdownNote('Slow start.\n', 'Coffee helped.')).toBe('Slow start.\n\nShut down\nCoffee helped.')
  })
  it('saving twice (same or edited) replaces, never duplicates', () => {
    const once = withShutdownNote('Slow start.', 'Coffee helped.')
    expect(withShutdownNote(once, 'Coffee helped.')).toBe(once)
    const twice = withShutdownNote(once, 'Coffee helped; email got in the way.')
    expect(twice).toBe('Slow start.\n\nShut down\nCoffee helped; email got in the way.')
    expect(twice.match(/Shut down/g)).toHaveLength(1)
  })
  it('leaves text written after the block alone', () => {
    const body = 'Morning.\n\nShut down\nold\n\nLater thought.'
    expect(withShutdownNote(body, 'new')).toBe('Morning.\n\nShut down\nnew\n\nLater thought.')
    expect(shutdownNote(body)).toBe('old')
  })
  it('reads nothing when there is no block, or "Shut down" is only mid-sentence', () => {
    expect(shutdownNote('I Shut down early.')).toBeNull()
    expect(shutdownNote('Shut down')).toBeNull()
  })
  it('keeps the answer one paragraph', () => {
    expect(tidyNote('  a\n\n\nb \n')).toBe('a\nb')
  })
  it('picks the entry holding the block, else the day\'s last', () => {
    const a = { body: 'one' }, b = { body: 'two\n\nShut down\nx' }, c = { body: 'three' }
    expect(noteHome([a, b, c])).toBe(b)
    expect(noteHome([a, c])).toBe(c)
    expect(noteHome([])).toBeUndefined()
  })
})
