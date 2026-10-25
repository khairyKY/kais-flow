import { describe, expect, it } from 'vitest'
import { PAUSE_ROWS, SIGNED_OUT, menuRows, moveFocus, parseMenuState, type MenuLine } from './menuRows'

const ids = (lines: MenuLine[]) => lines.map((l) => (l === 'sep' ? '—' : l.id))
const idle = { on: false, time: '25:00' }

describe('menu B rows', () => {
  it('signed out (or not told yet): only Open and Quit', () => {
    expect(ids(menuRows(SIGNED_OUT, idle))).toEqual(['open', '—', 'quit'])
    expect(ids(menuRows(SIGNED_OUT, { on: true, time: '18:42' }))).toEqual(['open', '—', 'quit'])
  })
  it('signed in: the drawn rows, in order', () => {
    expect(ids(menuRows({ signedIn: true }, idle))).toEqual(['open', 'capture', '—', 'focus', 'pause', '—', 'settings', 'quit'])
    const rows = menuRows({ signedIn: true }, idle).filter((l) => l !== 'sep')
    expect(rows.map((r) => r.label)).toEqual(['Open Kai’s Flow', 'Quick capture…', 'Start focus', 'Pause notifications', 'Settings', 'Quit Kai’s Flow'])
    expect(rows[2]).toMatchObject({ hint: '25:00', icon: 'focus-ring' })
    expect(rows[3]).toMatchObject({ sub: true })
  })
  it('a round under way: Stop in terra with the time left; paused: Resume with until when', () => {
    const rows = menuRows({ signedIn: true, pausedUntil: '10:41 AM' }, { on: true, time: '18:42' }).filter((l) => l !== 'sep')
    expect(rows[2]).toMatchObject({ id: 'focus', label: 'Stop focus', hint: '18:42', danger: true, icon: 'stop' })
    expect(rows[3]).toMatchObject({ id: 'resume', label: 'Resume notifications', hint: 'until 10:41 AM' })
    expect(rows[3].sub).toBeUndefined()
  })
  it('Pause ▸ choices are TrayBridge’s ids', () => {
    expect(PAUSE_ROWS.map((r) => r.id)).toEqual(['pause:30', 'pause:60', 'pause:tomorrow'])
  })
  it('a state it can’t read is signed out', () => {
    expect(parseMenuState('{"signedIn":true,"next":null}')).toEqual({ signedIn: true, next: null })
    expect(parseMenuState('nonsense')).toEqual(SIGNED_OUT)
    expect(parseMenuState(null)).toEqual(SIGNED_OUT)
    expect(parseMenuState({ signedIn: 'yes' })).toEqual(SIGNED_OUT)
  })
  it('keys: ↓ ↑ wrap, Home End', () => {
    expect([moveFocus(-1, 6, 'ArrowDown'), moveFocus(5, 6, 'ArrowDown'), moveFocus(0, 6, 'ArrowUp'), moveFocus(-1, 6, 'ArrowUp'), moveFocus(3, 6, 'Home'), moveFocus(1, 6, 'End'), moveFocus(2, 6, 'x'), moveFocus(0, 0, 'ArrowDown')]).toEqual([0, 0, 5, 5, 0, 5, 2, -1])
  })
})
