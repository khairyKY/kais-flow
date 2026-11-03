import { describe, expect, it } from 'vitest'
import { deepLinkRoute } from './deepLink'

describe('deepLinkRoute', () => {
  it('maps the five links', () => {
    expect(deepLinkRoute('kaisflow://today')).toBe('/today')
    expect(deepLinkRoute('kaisflow://calendar')).toBe('/calendar')
    expect(deepLinkRoute('kaisflow://focus')).toBe('/focus')
    expect(deepLinkRoute('kaisflow://task/3f2a9c1e-0000-4000-8000-000000000001')).toBe('/tasks/3f2a9c1e-0000-4000-8000-000000000001')
  })
  it('reads what Windows and browsers do to a link', () => {
    expect(deepLinkRoute('kaisflow://today/')).toBe('/today')
    expect(deepLinkRoute('KaisFlow://Today?x=1')).toBe('/today')
    expect(deepLinkRoute('kaisflow:calendar')).toBe('/calendar')
    expect(deepLinkRoute(' kaisflow://task/abc-1/ ')).toBe('/tasks/abc-1')
  })
  it('opens nothing it does not know', () => {
    expect(deepLinkRoute('kaisflow://capture')).toBeNull()
    expect(deepLinkRoute('kaisflow://settings')).toBeNull()
    expect(deepLinkRoute('kaisflow://today/extra')).toBeNull()
    expect(deepLinkRoute('kaisflow://task')).toBeNull()
    expect(deepLinkRoute('kaisflow://task/../../settings')).toBeNull()
    expect(deepLinkRoute('https://today')).toBeNull()
  })
})
