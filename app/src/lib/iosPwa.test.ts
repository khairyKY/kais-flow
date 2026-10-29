import { describe, expect, it } from 'vitest'
import { isIOS, isIOSSafari, shouldOfferInstall } from './iosPwa'

const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1'
const CHROME_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15'
const IN_APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

describe('iosPwa', () => {
  it('knows Safari on an iPhone or iPad from every other browser', () => {
    expect(isIOSSafari(SAFARI_IPHONE, 5)).toBe(true)
    expect(isIOSSafari(IPAD_DESKTOP, 5)).toBe(true) // iPadOS asks for the desktop site
    expect(isIOSSafari(IPAD_DESKTOP, 0)).toBe(false) // a Mac
    expect(isIOSSafari(CHROME_IPHONE, 5)).toBe(false)
    expect(isIOSSafari(IN_APP, 5)).toBe(false)
    expect(isIOS(CHROME_IPHONE, 5)).toBe(true)
    expect(isIOSSafari(ANDROID, 5)).toBe(false)
    expect(isIOSSafari(WINDOWS, 0)).toBe(false)
  })

  it('offers the install guide only in an iOS Safari tab, until it is dismissed', () => {
    expect(shouldOfferInstall({ iosSafari: true, plainTab: true, dismissed: false })).toBe(true)
    expect(shouldOfferInstall({ iosSafari: true, plainTab: false, dismissed: false })).toBe(false) // already on the Home Screen
    expect(shouldOfferInstall({ iosSafari: true, plainTab: true, dismissed: true })).toBe(false)
    expect(shouldOfferInstall({ iosSafari: false, plainTab: true, dismissed: false })).toBe(false)
  })
})
