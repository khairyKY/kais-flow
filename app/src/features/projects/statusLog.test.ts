import { describe, expect, it } from 'vitest'
import { resolveUpdates, type LogRow } from './statusLog'

const row = (id: string, event_type: string, created_at: string, payload: Record<string, unknown> = {}): LogRow => ({ id, event_type, created_at, payload })
const logged = (id: string, at: string, note: string) => row(id, 'project.update_logged', at, { note })

describe('a project’s status updates, from the append-only log', () => {
  it('lists updates newest first, ignoring every other event', () => {
    const feed = resolveUpdates([logged('u1', '2026-10-01T10:00:00Z', 'Kickoff'), row('x', 'project.renamed', '2026-10-02T10:00:00Z', { name: 'y' }), logged('u2', '2026-10-03T10:00:00Z', 'Copy approved')])
    expect(feed.map((u) => u.note)).toEqual(['Copy approved', 'Kickoff'])
  })

  it('an edit changes the note (the latest edit wins) and keeps the update’s place', () => {
    const feed = resolveUpdates([
      row('e2', 'project.update_edited', '2026-10-05T10:00:00Z', { update_id: 'u1', note: 'Kickoff with Priya' }),
      logged('u1', '2026-10-01T10:00:00Z', 'Kickof'),
      row('e1', 'project.update_edited', '2026-10-04T10:00:00Z', { update_id: 'u1', note: 'Kickoff' }),
    ])
    expect(feed).toEqual([{ id: 'u1', note: 'Kickoff with Priya', created_at: '2026-10-01T10:00:00Z', edited: true }])
  })

  it('a delete takes it out; Undo (restored) brings it back with its edits', () => {
    const base = [logged('u1', '2026-10-01T10:00:00Z', 'Kickoff'), row('e', 'project.update_edited', '2026-10-02T10:00:00Z', { update_id: 'u1', note: 'Kickoff!' })]
    const del = row('d', 'project.update_deleted', '2026-10-03T10:00:00Z', { update_id: 'u1' })
    expect(resolveUpdates([...base, del])).toEqual([])
    expect(resolveUpdates([...base, del, row('r', 'project.update_restored', '2026-10-03T10:00:05Z', { update_id: 'u1' })]).map((u) => u.note)).toEqual(['Kickoff!'])
  })

  it('a change for an update that isn’t here is ignored', () => {
    expect(resolveUpdates([row('d', 'project.update_deleted', '2026-10-03T10:00:00Z', { update_id: 'ghost' })])).toEqual([])
  })
})
