import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutoUpdater, FLUSH_MS, useAutoUpdate, type Deps, type Found } from './autoUpdate'
import { CHECK_EVERY_MS } from './whatsNew'

const noop = () => {}
const found = (version: string, over: Partial<Found> = {}): Found & { calls: string[] } => {
  const calls: string[] = []
  return {
    version,
    calls,
    download: async (onLine) => {
      onLine('Downloading… 40%')
      calls.push('download')
    },
    install: async (restart) => void calls.push(`install:${restart}`),
    discard: () => void calls.push('discard'),
    ...over,
  }
}

function setup(first: Found | null | Error = null) {
  let clock = 1_000_000
  const queue: (Found | null | Error)[] = [first]
  const d = {
    find: vi.fn(async () => {
      const next = queue.length > 1 ? queue.shift()! : queue[0]
      if (next instanceof Error) throw next
      return next
    }),
    now: () => clock,
    flush: vi.fn(async () => {}),
    setReady: vi.fn(),
    exit: vi.fn(),
  } satisfies Deps
  return { d, u: createAutoUpdater(d), queue, advance: (ms: number) => (clock += ms) }
}

beforeEach(() => useAutoUpdate.setState({ phase: 'idle', version: null, line: null }))
afterEach(() => vi.useRealTimers())

describe('looking for an update', () => {
  it('checks at launch, then not again until the interval has passed', async () => {
    const { d, u, advance } = setup(null)
    await u.tick()
    await u.tick()
    expect(d.find).toHaveBeenCalledTimes(1)
    advance(CHECK_EVERY_MS - 1)
    await u.tick()
    expect(d.find).toHaveBeenCalledTimes(1)
    advance(1)
    await u.tick()
    expect(d.find).toHaveBeenCalledTimes(2)
  })

  it('a forced look (Check for updates) ignores the schedule', async () => {
    const { d, u } = setup(null)
    await u.tick()
    await u.tick(true)
    expect(d.find).toHaveBeenCalledTimes(2)
  })

  it('stays quiet and tries again at the next tick when the endpoint is unreachable', async () => {
    const { d, u } = setup(new Error('offline'))
    await u.tick()
    expect(useAutoUpdate.getState().phase).toBe('idle')
    await u.tick() // not stamped as checked, so due again
    expect(d.find).toHaveBeenCalledTimes(2)
  })
})

describe('downloading', () => {
  it('downloads without asking, then holds it ready and tells the shell', async () => {
    const f = found('1.7.0')
    const { d, u } = setup(f)
    const seen: string[] = []
    useAutoUpdate.subscribe((s) => seen.push(s.phase))
    await u.tick()
    expect(f.calls).toEqual(['download'])
    expect(seen).toContain('downloading')
    expect(useAutoUpdate.getState()).toMatchObject({ phase: 'ready', version: '1.7.0', line: null })
    expect(d.setReady).toHaveBeenCalledWith(true)
    expect(f.calls).not.toContain('install:true') // nothing installs by itself
    expect(f.calls).not.toContain('install:false')
    expect(d.exit).not.toHaveBeenCalled()
  })

  it('shows the progress line while it downloads', async () => {
    let release: () => void = noop
    const f = found('1.7.0', { download: (onLine) => (onLine('Downloading… 40%'), new Promise<void>((r) => (release = r))) })
    const { u } = setup(f)
    const p = u.tick()
    await vi.waitFor(() => expect(useAutoUpdate.getState()).toMatchObject({ phase: 'downloading', version: '1.7.0', line: 'Downloading… 40%' }))
    release()
    await p
    expect(useAutoUpdate.getState().phase).toBe('ready')
  })

  it('does not download the version it already holds, but takes a newer one', async () => {
    const a = found('1.7.0')
    const same = found('1.7.0')
    const newer = found('1.7.1')
    const { u, queue } = setup(a)
    await u.tick()
    queue.splice(0, queue.length, same)
    await u.tick(true)
    expect(same.calls).toEqual(['discard'])
    queue.splice(0, queue.length, newer)
    await u.tick(true)
    expect(newer.calls).toEqual(['download'])
    expect(a.calls).toEqual(['download', 'discard']) // the older download is dropped
    expect(useAutoUpdate.getState()).toMatchObject({ phase: 'ready', version: '1.7.1' })
  })

  it('a download that fails leaves what it held and retries at the next tick, not in hours', async () => {
    const bad = found('1.7.0', { download: async () => Promise.reject(new Error('dropped')) })
    const { d, u } = setup(bad)
    await u.tick()
    expect(useAutoUpdate.getState().phase).toBe('idle')
    expect(d.setReady).not.toHaveBeenCalled()
    await u.tick()
    expect(d.find).toHaveBeenCalledTimes(2)
  })

  it('one download at a time', async () => {
    let release: () => void = noop
    const f = found('1.7.0', { download: () => new Promise<void>((r) => (release = r)) })
    const { d, u } = setup(f)
    const p = u.tick()
    await u.tick(true)
    expect(d.find).toHaveBeenCalledTimes(1)
    release()
    await p
  })
})

describe('installing', () => {
  it('Restart to update: flushes the outbox, then installs and restarts', async () => {
    const f = found('1.7.0')
    const { d, u } = setup(f)
    await u.tick()
    const order: string[] = []
    d.flush.mockImplementation(async () => void order.push('flush'))
    f.install = async (restart) => void order.push(`install:${restart}`)
    expect(await u.install(true)).toBe(true)
    expect(order).toEqual(['flush', 'install:true'])
  })

  it('does nothing when no update is held', async () => {
    const { d, u } = setup(null)
    expect(await u.install(true)).toBe(false)
    expect(d.flush).not.toHaveBeenCalled()
  })

  it('a stuck outbox flush does not hold the install back for long', async () => {
    vi.useFakeTimers()
    const f = found('1.7.0')
    const { d, u } = setup(f)
    await u.tick()
    d.flush.mockImplementation(() => new Promise<void>(() => {}))
    const p = u.install(false)
    await vi.advanceTimersByTimeAsync(FLUSH_MS)
    expect(await p).toBe(true)
    expect(f.calls).toContain('install:false')
  })

  it('a failed install keeps the update ready to try again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const f = found('1.7.0', { install: async () => Promise.reject(new Error('installer blocked')) })
    const { u } = setup(f)
    await u.tick()
    expect(await u.install(true)).toBe(false)
    expect(useAutoUpdate.getState()).toMatchObject({ phase: 'ready', version: '1.7.0' })
    warn.mockRestore()
  })

  it('a second install while one runs is ignored', async () => {
    let release: () => void = noop
    const f = found('1.7.0', { install: () => new Promise<void>((r) => (release = r)) })
    const { u } = setup(f)
    await u.tick()
    const first = u.install(true)
    await vi.waitFor(() => expect(release).not.toBe(noop))
    expect(await u.install(true)).toBe(false)
    release()
    await first
  })
})

describe('quitting with an update waiting', () => {
  it('installs without restarting, and the app is not asked to exit again (the installer closes it)', async () => {
    const f = found('1.7.0')
    const { d, u } = setup(f)
    await u.tick()
    await u.quit()
    expect(f.calls).toContain('install:false')
    expect(d.flush).toHaveBeenCalled()
    expect(d.exit).not.toHaveBeenCalled()
  })

  it('still quits when the install fails, and when nothing is held', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bad = found('1.7.0', { install: async () => Promise.reject(new Error('no')) })
    const a = setup(bad)
    await a.u.tick()
    await a.u.quit()
    expect(a.d.exit).toHaveBeenCalledTimes(1)
    const b = setup(null)
    await b.u.quit()
    expect(b.d.exit).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('leaves a Restart that is already installing alone', async () => {
    let release: () => void = noop
    const f = found('1.7.0', { install: () => new Promise<void>((r) => (release = r)) })
    const { d, u } = setup(f)
    await u.tick()
    const restart = u.install(true)
    await vi.waitFor(() => expect(release).not.toBe(noop))
    await u.quit()
    expect(d.exit).not.toHaveBeenCalled()
    release()
    await restart
  })
})
