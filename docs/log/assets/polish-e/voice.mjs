// Item 1: never lose a voice recording. Real MediaRecorder on Chromium's fake mic; the local
// transcribe function fails on its own (it can't reach Groq), then a page.route forces the 429.
import { launch, newContext, signIn, triage, rest, OUT, DESKTOP, PHONE, sleep } from './lib.mjs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5247'
const browser = await launch()
const report = {}
const NOTE = 'Voice note (not transcribed yet)'
const EXPECTED = [/transcribe/, /status of 4(00|29)/]

const inboxNotes = async () => (await rest(`inbox_items?select=id,kind,raw_text,transcript,status,ai_parse,payload&raw_text=eq.${encodeURIComponent(NOTE)}`)).length

async function openVoice(page) {
  await page.locator('button[title="Voice capture"]:visible').first().click()
  await page.locator('[data-voice-phase]').waitFor({ timeout: 10000 })
}
const phase = (page) => page.locator('[data-voice-phase]').getAttribute('data-voice-phase')
const sheetText = (page) => page.locator('[data-voice-phase]').innerText()
async function recordAndStop(page, ms = 2200) {
  await page.getByRole('button', { name: 'Stop & file' }).waitFor()
  await page.waitForFunction(() => document.querySelector('[data-voice-phase]')?.textContent?.includes('Listening · 0:0'))
  await sleep(ms)
  await page.getByRole('button', { name: 'Stop & file' }).click()
}
async function waitPhase(page, p, timeout = 25000) {
  await page.waitForFunction((p) => document.querySelector('[data-voice-phase]')?.getAttribute('data-voice-phase') === p, p, { timeout })
}

// ── Desktop, day, Cairo ──────────────────────────────────────────────────────────────────────
{
  const { ctx, errors } = await newContext(browser, BASE, { label: 'voice-desktop', viewport: DESKTOP })
  const page = await ctx.newPage()
  const transcribeCalls = []
  page.on('response', (r) => {
    if (r.url().includes('/functions/v1/transcribe')) transcribeCalls.push(r.status())
  })
  await signIn(page, BASE)
  await page.goto(BASE + '/today')
  await sleep(1500)
  const notesBefore = await inboxNotes()

  // 1. Natural failure (local function can't reach Groq) → the recording is kept.
  await openVoice(page)
  await recordAndStop(page)
  await waitPhase(page, 'kept')
  report.kept = { phase: await phase(page), text: await sheetText(page), transcribeStatuses: [...transcribeCalls] }
  await page.screenshot({ path: `${OUT}/voice-kept-desktop-day.png` })

  // 2. Tapping outside and Esc don't throw it away.
  await page.mouse.click(40, 40)
  await sleep(500)
  await page.keyboard.press('Escape')
  await sleep(500)
  report.afterOutsideTapAndEsc = await phase(page)

  // 3. Try again re-sends the same recording and keeps it again on failure.
  await page.getByRole('button', { name: 'Try again' }).click()
  await waitPhase(page, 'kept')
  report.afterRetry = { phase: await phase(page), transcribeCalls: transcribeCalls.length }

  // 4. Save to Inbox untranscribed → one inbox row, the sheet closes, a calm toast.
  await page.getByRole('button', { name: 'Save to Inbox untranscribed' }).click()
  await page.locator('[data-voice-phase]').waitFor({ state: 'detached', timeout: 5000 })
  await page.getByText('Saved to Inbox — not transcribed yet.').waitFor({ timeout: 5000 })
  await page.screenshot({ path: `${OUT}/voice-saved-toast-desktop-day.png` })
  await sleep(2500) // outbox flush
  const rows = await rest(`inbox_items?select=kind,raw_text,transcript,status,ai_parse,payload&raw_text=eq.${encodeURIComponent(NOTE)}&order=created_at.desc`)
  report.saved = { rowsBefore: notesBefore, rowsAfter: rows.length, newest: rows[0] }
  await page.goto(BASE + '/inbox')
  await sleep(2000)
  await page.screenshot({ path: `${OUT}/voice-note-in-inbox-desktop-day.png` })
  await page.goto(BASE + '/today')
  await sleep(1500)

  // 5. Cancel mid-recording sends nothing to be transcribed.
  const callsBeforeCancel = transcribeCalls.length
  await openVoice(page)
  await page.getByRole('button', { name: 'Stop & file' }).waitFor()
  await sleep(1800)
  await page.getByRole('button', { name: 'Cancel' }).click()
  await sleep(4000)
  report.cancel = { transcribeCallsDuringCancel: transcribeCalls.length - callsBeforeCancel, sheetOpen: await page.locator('[data-voice-phase]').count(), inboxNotes: await inboxNotes() }

  // 6. Force the daily limit: 429 {"error":"daily_limit"}.
  await page.route('**/functions/v1/transcribe', (route) =>
    route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'daily_limit' }) }),
  )
  await openVoice(page)
  await recordAndStop(page, 1500)
  await waitPhase(page, 'kept')
  report.limitKept = { text: await sheetText(page), remembered: await page.evaluate(() => localStorage.getItem('kf-voice-limit-day')) }
  await page.screenshot({ path: `${OUT}/voice-limit-kept-desktop-day.png` })
  await page.getByRole('button', { name: 'Discard' }).click()
  await page.locator('[data-voice-phase]').waitFor({ state: 'detached', timeout: 5000 })

  // 7. The next tap says so up front — no microphone, no recording — and offers typing.
  const gumBefore = await page.evaluate(() => window.__gum)
  const callsBefore = transcribeCalls.length
  await openVoice(page)
  await sleep(1200)
  report.resting = {
    phase: await phase(page),
    text: await sheetText(page),
    micRequests: (await page.evaluate(() => window.__gum)) - gumBefore,
    transcribeCalls: transcribeCalls.length - callsBefore,
  }
  await page.screenshot({ path: `${OUT}/voice-resting-desktop-day.png` })
  await page.getByRole('button', { name: 'Type it instead' }).click()
  await page.locator('input[placeholder="Send the quote tomorrow 3pm #shaheen"]').waitFor({ timeout: 5000 })
  report.typeInstead = { commandBarOpen: true, focused: await page.evaluate(() => document.activeElement?.getAttribute('placeholder')) }
  await page.screenshot({ path: `${OUT}/voice-type-instead-desktop-day.png` })
  await page.keyboard.press('Escape')

  // 8. It survives a reload (rest of the Cairo day, this device).
  await page.reload()
  await sleep(2000)
  await openVoice(page)
  await sleep(800)
  report.restingAfterReload = await phase(page)
  await page.getByRole('button', { name: 'Close' }).click()

  report.desktopErrors = triage(errors, EXPECTED)
  report.transcribeStatuses = transcribeCalls
  await ctx.close()
}

// ── Phone, night, Cairo ──────────────────────────────────────────────────────────────────────
{
  const { ctx, errors } = await newContext(browser, BASE, { label: 'voice-phone', viewport: PHONE, night: true })
  const page = await ctx.newPage()
  await signIn(page, BASE)
  await page.goto(BASE + '/today')
  await sleep(1500)
  await openVoice(page)
  await recordAndStop(page, 1500)
  await waitPhase(page, 'kept')
  report.phoneKept = await phase(page)
  await page.screenshot({ path: `${OUT}/voice-kept-phone-night.png` })
  await page.getByRole('button', { name: 'Discard' }).click()
  await page.route('**/functions/v1/transcribe', (route) =>
    route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'daily_limit' }) }),
  )
  await openVoice(page)
  await recordAndStop(page, 1200)
  await waitPhase(page, 'kept')
  await page.screenshot({ path: `${OUT}/voice-limit-kept-phone-night.png` })
  await page.getByRole('button', { name: 'Discard' }).click()
  await openVoice(page)
  await sleep(800)
  report.phoneResting = await phase(page)
  await page.screenshot({ path: `${OUT}/voice-resting-phone-night.png` })
  report.phoneErrors = triage(errors, EXPECTED)
  await ctx.close()
}

await browser.close()
console.log(JSON.stringify(report, null, 2))
