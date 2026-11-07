import { describe, expect, it, vi } from 'vitest'
import { fetchAll, PAGE_SIZE } from './fetchAll'

describe('fetchAll', () => {
  it('skips the first request if already aborted', async () => {
    const controller = new AbortController()
    const page = vi.fn(async () => ({ data: [], error: null }))
    controller.abort()

    await expect(fetchAll(page, undefined, controller.signal)).rejects.toBe(controller.signal.reason)
    expect(page).not.toHaveBeenCalled()
  })

  it('stops before processing an in-flight page that resolved after cancellation', async () => {
    const controller = new AbortController()
    const data = Array.from({ length: PAGE_SIZE }, (_, i) => i)
    const page = vi.fn(async () => {
      await Promise.resolve()
      return { data, error: null }
    })
    const onPage = vi.fn()
    const result = fetchAll(page, onPage, controller.signal)

    expect(page).toHaveBeenCalledOnce()
    controller.abort()
    await expect(result).rejects.toBe(controller.signal.reason)
    expect(page).toHaveBeenCalledOnce()
    expect(onPage).not.toHaveBeenCalled()
  })

  it('returns all rows in order and reports progress without a signal', async () => {
    const data = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => i)
    const page = vi.fn(async (from: number, to: number) => ({ data: data.slice(from, to + 1), error: null }))
    const onPage = vi.fn()

    await expect(fetchAll(page, onPage)).resolves.toEqual(data)
    expect(page.mock.calls).toEqual([[0, PAGE_SIZE - 1], [PAGE_SIZE, 2 * PAGE_SIZE - 1]])
    expect(onPage.mock.calls).toEqual([[PAGE_SIZE], [PAGE_SIZE + 1]])
  })

  it('preserves backend errors for an active request', async () => {
    const controller = new AbortController()
    const error = { code: '42501', message: 'Permission denied' }
    const page = async () => ({ data: null, error })

    await expect(fetchAll(page, undefined, controller.signal)).rejects.toBe(error)
  })
})
