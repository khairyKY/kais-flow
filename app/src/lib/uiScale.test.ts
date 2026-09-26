import { describe, it, expect } from 'vitest'
import indexHtml from '../../index.html?raw'
import { defaultUiScale, resolveUiScale, DESKTOP_UI_SCALE, TOUCH_UI_SCALE, UI_SCALES, type UiScaleEnv } from './uiScale'

const PHONE: UiScaleEnv = { coarsePointer: true, screenShortSide: 390 }
const TABLET: UiScaleEnv = { coarsePointer: true, screenShortSide: 820 }
const LAPTOP: UiScaleEnv = { coarsePointer: false, screenShortSide: 800 }
const TOUCH_LAPTOP: UiScaleEnv = { coarsePointer: false, screenShortSide: 900 } // trackpad is the primary pointer
const SMALL_FINE: UiScaleEnv = { coarsePointer: false, screenShortSide: 412 } // a phone reporting a fine pointer
const UNKNOWN: UiScaleEnv = { coarsePointer: false, screenShortSide: 0 }

describe('defaultUiScale (Polish F2b: phones 100%, computers 125%)', () => {
  it('a phone gets 100%, so a 390px screen lays out at 390 CSS px like the phone designs', () => {
    expect(defaultUiScale(PHONE)).toBe(1)
    expect(TOUCH_UI_SCALE).toBe(1)
  })

  it('a touch-first tablet gets 100% too (coarse primary pointer)', () => {
    expect(defaultUiScale(TABLET)).toBe(1)
  })

  it('a small screen gets 100% even when its pointer reads fine', () => {
    expect(defaultUiScale(SMALL_FINE)).toBe(1)
    expect(defaultUiScale({ coarsePointer: false, screenShortSide: 599 })).toBe(1)
  })

  it('a computer keeps 125%, a touchscreen laptop included', () => {
    expect(defaultUiScale(LAPTOP)).toBe(1.25)
    expect(defaultUiScale(TOUCH_LAPTOP)).toBe(1.25)
    expect(defaultUiScale({ coarsePointer: false, screenShortSide: 600 })).toBe(1.25)
    expect(DESKTOP_UI_SCALE).toBe(1.25)
  })

  it('an unknown screen size (0) is not "small": the desktop default stands', () => {
    expect(defaultUiScale(UNKNOWN)).toBe(1.25)
  })
})

describe('resolveUiScale — a saved choice always wins', () => {
  it('uses a saved scale on any device', () => {
    expect(resolveUiScale('1.25', PHONE)).toBe(1.25)
    expect(resolveUiScale('1', LAPTOP)).toBe(1)
    expect(resolveUiScale('1.75', TABLET)).toBe(1.75)
  })

  it('falls back to the device default when nothing (or junk) is saved', () => {
    for (const stored of [null, '', '0', 'abc', '1.3', '2']) {
      expect(resolveUiScale(stored, PHONE)).toBe(1)
      expect(resolveUiScale(stored, LAPTOP)).toBe(1.25)
    }
  })
})

// index.html applies the scale before first paint in ES5; lib/uiScale.ts is the app's copy. Run the
// real pre-paint script against stubbed browser globals and check it agrees with resolveUiScale.
function runPrePaint(stored: string | null, env: UiScaleEnv, storageThrows = false) {
  const script = indexHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1]
  if (!script) throw new Error('pre-paint <script> not found in index.html')
  const props: Record<string, string> = {}
  const style = {
    zoom: '',
    setProperty(k: string, v: string) {
      props[k] = v
    },
  }
  const document = { documentElement: { dataset: {} as Record<string, string>, style } }
  const localStorage = {
    getItem(k: string) {
      if (storageThrows) throw new Error('SecurityError')
      return k === 'kf_ui_scale' ? stored : null
    },
  }
  const window = { matchMedia: (q: string) => ({ matches: q === '(pointer: coarse)' && env.coarsePointer }) }
  const screen = { width: env.screenShortSide, height: env.screenShortSide ? env.screenShortSide + 400 : 0 }
  new Function('document', 'localStorage', 'window', 'screen', script)(document, localStorage, window, screen)
  return { zoom: style.zoom, cssVar: props['--kf-ui-scale'] }
}

describe('index.html pre-paint script stays in sync with uiScale.ts', () => {
  const envs = [PHONE, TABLET, LAPTOP, TOUCH_LAPTOP, SMALL_FINE, UNKNOWN]
  const saved = [null, '', 'junk', ...UI_SCALES.map(String)]

  it('applies exactly the scale resolveUiScale picks, for every device and saved value', () => {
    for (const env of envs) {
      for (const stored of saved) {
        const want = resolveUiScale(stored, env)
        const got = runPrePaint(stored, env)
        expect(got.cssVar).toBe(String(want))
        expect(got.zoom).toBe(want === 1 ? '' : String(want)) // 1:1 leaves zoom off, as applyUiScale does
      }
    }
  })

  it('still applies the device default when storage is blocked', () => {
    expect(runPrePaint(null, PHONE, true).cssVar).toBe('1')
    expect(runPrePaint(null, LAPTOP, true).cssVar).toBe('1.25')
  })
})
