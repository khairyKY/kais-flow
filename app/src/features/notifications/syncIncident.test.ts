import { describe, expect, it } from 'vitest'
import { NO_INCIDENT, SYNC_PERSIST_MS, syncIncidentStep, type SyncIncident } from './syncIncident'
import type { SyncView } from '../../components/syncQueue'

// Sync problem (Tray and Notifications.dc.html 12k): said once per incident, when it has lasted and
// nobody is looking at the app.
const MIN = 60_000
function run(steps: [view: SyncView, atMin: number, looking?: boolean][]): (string | null)[] {
  let m: SyncIncident = NO_INCIDENT
  return steps.map(([v, at, looking = false]) => {
    const s = syncIncidentStep(m, v, at * MIN, looking)
    m = s.memory
    return s.notice && `${s.notice.title} / ${s.notice.body}`
  })
}
const offline = (n: number): SyncView => ({ kind: 'offline', n })

describe('syncIncidentStep', () => {
  it('waits until it has lasted, says it once, in the drawn words', () => {
    expect(SYNC_PERSIST_MS).toBe(5 * MIN)
    expect(run([[offline(2), 0], [offline(2), 4], [offline(2), 5], [offline(3), 6], [offline(3), 30]])).toEqual([
      null,
      null,
      '2 changes are waiting to sync / They’re safe on this device. We’ll keep trying.',
      null,
      null,
    ])
  })

  it('never while someone is looking; once they look away and it still holds, then', () => {
    expect(run([[offline(1), 0, true], [offline(1), 6, true], [offline(1), 7, false], [offline(1), 8, false]])).toEqual([
      null,
      null,
      '1 change is waiting to sync / It’s safe on this device. We’ll keep trying.',
      null,
    ])
  })

  it('a calm spell ends the incident; the next one can be said again', () => {
    const calm: SyncView = { kind: 'quiet', n: 0 }
    const out = run([[offline(2), 0], [offline(2), 5], [calm, 6], [offline(1), 10], [offline(1), 15]])
    expect(out.filter(Boolean)).toHaveLength(2)
    expect(run([[offline(2), 0], [{ kind: 'synced', n: 0 }, 2], [offline(2), 3], [offline(2), 7]])).toEqual([null, null, null, null]) // restarted at 3
  })

  it('offline with nothing waiting is no problem; a slow write and set-aside writes are', () => {
    expect(run([[offline(0), 0], [offline(0), 10]])).toEqual([null, null])
    expect(run([[{ kind: 'syncing', n: 4 }, 0], [{ kind: 'syncing', n: 4 }, 5]])[1]).toBe('4 changes are waiting to sync / They’re safe on this device. We’ll keep trying.')
    expect(run([[{ kind: 'parked', n: 1 }, 0], [{ kind: 'parked', n: 1 }, 5]])[1]).toBe('1 change couldn’t be saved / Set aside so the rest sync on.')
  })

  it('offline then set aside is the same incident: still once', () => {
    expect(run([[offline(2), 0], [offline(2), 5], [{ kind: 'parked', n: 1 }, 6], [{ kind: 'parked', n: 1 }, 20]]).filter(Boolean)).toHaveLength(1)
  })
})
