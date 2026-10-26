import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SEED_AT, SYNCED_PREFS, decide, remoteKey, type Prefs } from './prefs'

describe('remoteKey', () => {
  it('keeps the interface size per device class', () => {
    expect(remoteKey('kf_ui_scale', 'phone')).toBe('kf_ui_scale.phone')
    expect(remoteKey('kf_ui_scale', 'computer')).toBe('kf_ui_scale.computer')
  })
  it('syncs every other key as itself, the same on both classes', () => {
    for (const key of SYNCED_PREFS.filter((k) => k !== 'kf_ui_scale')) {
      expect(remoteKey(key, 'phone')).toBe(key)
      expect(remoteKey(key, 'computer')).toBe(key)
    }
  })
  it('never lists a device-only key', () => {
    for (const key of ['kf_tray_shown', 'kf_widgets_hide_titles', 'kf_theme', 'kf.calNowFolded', 'kf.sidebarCollapsed', 'kf-tz-offered']) {
      expect(SYNCED_PREFS as readonly string[]).not.toContain(key)
    }
  })
})

describe('decide — the most recent change wins', () => {
  const T1 = '2026-10-26T10:00:00.000Z'
  const T2 = '2026-10-26T10:05:00.000Z'
  it('takes a newer value from the server', () => expect(decide('day', T1, { v: 'night', at: T2 })).toBe('take'))
  it('sends a newer value of ours', () => expect(decide('night', T2, { v: 'day', at: T1 })).toBe('send'))
  it('leaves equal values alone, whatever their times', () => expect(decide('day', T1, { v: 'day', at: T2 })).toBeNull())
  it('sends what the server has never seen', () => expect(decide('1.25', undefined, undefined)).toBe('send'))
  it('has nothing to do with nothing on either side', () => expect(decide(null, undefined, undefined)).toBeNull())
  it('takes the server value on a device that never set one', () => expect(decide(null, undefined, { v: 'auto', at: T1 })).toBe('take'))
  it('an unstamped value from before sync loses to the server (the first device seeds, the rest adopt)', () =>
    expect(decide('light', undefined, { v: 'dark', at: SEED_AT })).toBe('take'))
  it('any real change beats a seeded one', () => expect(decide('light', T1, { v: 'dark', at: SEED_AT })).toBe('send'))
})

// Two devices against one server map — the server keeps the newer entry per key, as 0087's trigger does.
describe('reconcile, two devices', () => {
  const { server, merge } = vi.hoisted(() => {
    const server: { prefs: Prefs } = { prefs: {} }
    const merge = (incoming: Prefs) => {
      for (const [k, e] of Object.entries(incoming)) if (!server.prefs[k] || e.at >= server.prefs[k].at) server.prefs[k] = e
    }
    return { server, merge }
  })
  vi.mock('./supabase', () => ({ supabase: {} }))
  vi.mock('./outbox', () => ({ writeRow: vi.fn() }))
  vi.mock('./settings', () => ({
    settingSynced: () => true,
    updateAppSetting: (_k: string, v: Prefs) => merge(v),
    useAppSettings: () => ({}),
  }))
  const device = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
  }
  beforeEach(() => {
    server.prefs = {}
  })

  it('seeds from the first device, the second adopts, then the newest change wins each way', async () => {
    const { reconcile } = await import('./prefsSync')
    const desk = device()
    const phone = device()
    desk.setItem('kf_theme_mode', 'dark')
    desk.setItem('kf_sound_pack', 'glass')
    phone.setItem('kf_theme_mode', 'light')

    vi.stubGlobal('localStorage', desk)
    reconcile(server.prefs)
    expect(server.prefs.kf_theme_mode).toEqual({ v: 'dark', at: SEED_AT })

    vi.stubGlobal('localStorage', phone)
    reconcile(server.prefs)
    expect(phone.getItem('kf_theme_mode')).toBe('dark')
    expect(phone.getItem('kf_sound_pack')).toBe('glass')

    // A change on the phone, stamped now, reaches the desk.
    phone.setItem('kf_theme_mode', 'auto')
    phone.setItem('kf.prefsAt', JSON.stringify({ ...JSON.parse(phone.getItem('kf.prefsAt') ?? '{}'), kf_theme_mode: '2026-10-26T10:00:00.000Z' }))
    reconcile(server.prefs)
    expect(server.prefs.kf_theme_mode.v).toBe('auto')
    vi.stubGlobal('localStorage', desk)
    reconcile(server.prefs)
    expect(desk.getItem('kf_theme_mode')).toBe('auto')
    vi.unstubAllGlobals()
  })
})
