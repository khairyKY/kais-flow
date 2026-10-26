import { describe, expect, it } from 'vitest'
import { barLanes, thenBlocks } from './phoneView'

// Mon 26 Oct 2026; the app's zone is Cairo (UTC+3), so 09:00Z is noon there — mid-day in every test zone's run.
const at = (hhmmZ: string) => `2026-10-26T${hhmmZ}:00.000Z`
const ev = (id: string, from: string, to: string, task_id: string | null = null) => ({ id, title: id, starts_at: at(from), ends_at: at(to), all_day: false, task_id })
const EVENTS = [ev('ml', '05:30', '07:00'), ev('cv', '08:00', '09:30'), ev('cnn', '10:30', '12:30', 't1'), ev('gym', '14:00', '15:15'), ev('study', '16:00', '17:00', 't7')]
const ids = (xs: { id: string }[]) => xs.map((x) => x.id)

describe('thenBlocks', () => {
  it('lists the two after the card’s Up next', () => {
    expect(ids(thenBlocks(EVENTS, new Date(at('07:40'))))).toEqual(['cnn', 'gym'])
  })
  it('skips nothing the card does not show while a block runs and nothing starts within the hour', () => {
    expect(ids(thenBlocks(EVENTS, new Date(at('08:10'))))).toEqual(['cnn', 'gym'])
  })
  it('leaves out the Next strip the card hangs under a running block', () => {
    expect(ids(thenBlocks([...EVENTS, ev('tea', '11:00', '11:15')], new Date(at('10:40'))))).toEqual(['gym', 'study'])
  })
  it('drops what skip says (a done task’s block)', () => {
    expect(ids(thenBlocks(EVENTS, new Date(at('07:40')), (e) => e.task_id === 't1'))).toEqual(['gym', 'study'])
  })
})

describe('barLanes', () => {
  it('drops an overlap to the second lane and goes back to the first after', () => {
    const lanes = barLanes([ev('cv', '08:00', '09:30'), ev('oh', '09:00', '09:45'), ev('cnn', '10:30', '12:30'), ev('coffee', '12:00', '12:45'), ev('gym', '14:00', '15:15')])
    expect(lanes.map((l) => `${l.e.id}:${l.lane}`)).toEqual(['cv:0', 'oh:1', 'cnn:0', 'coffee:1', 'gym:0'])
  })
})