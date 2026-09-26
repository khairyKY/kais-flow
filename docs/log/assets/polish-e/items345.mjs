// Items 3 (S8 persister), 4 (command bar chip + Cairo time) and 5 (sign-out labels), plus the
// voice Cancel check. usage: node items345.mjs <base> <before|after>
import { launch, newContext, signIn, triage, rest, persistedCache, OUT, DESKTOP, PHONE, sleep } from './lib.mjs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:5247'
const TAG = process.argv[3] ?? 'after'
const browser = await launch()
const RUN = Date.now().toString(36).slice(-4) // keeps rows from separate runs apart
const report = { tag: TAG, base: BASE, run: RUN }
const shot = (name) => `${OUT}/${name}-${TAG}.png`
const dump = () => console.log(JSON.stringify(report, null, 2))
process.on('uncaughtException', (e) => {
  console.log('FAILED:', e.message)
  dump()
  process.exit(1)
})

async function openCommandBar(page) {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined))
  await page.keyboard.press('Control+k')
  await page.locator('input[placeholder="Send the quote tomorrow 3pm #shaheen"]').waitFor({ timeout: 5000 })
}
const chips = (page) => page.locator('.kf-overlay-card span').allInnerTexts()

/** How many lines each ConfirmCard button's label takes. */
const buttonLines = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.kf-overlay-card button')].map((b) => {
      const range = document.createRange()
      range.selectNodeContents(b)
      const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)))
      return { label: b.textContent, lines: tops.size, height: b.offsetHeight, width: b.offsetWidth }
    }),
  )

// ── Voice: Cancel mid-recording (the base build is the "before") ─────────────────────────────
if (TAG === 'before') {
  const { ctx, errors } = await newContext(browser, BASE, { label: 'cancel-before' })
  const page = await ctx.newPage()
  const calls = []
  page.on('response', (r) => r.url().includes('/functions/v1/transcribe') && calls.push(r.status()))
  const toasts = []
  await signIn(page, BASE)
  await page.goto(BASE + '/today')
  await sleep(1500)
  await page.locator('button[title="Voice capture"]:visible').first().click()
  await page.getByRole('button', { name: 'Stop & file' }).waitFor()
  await sleep(1800)
  await page.getByRole('button', { name: 'Cancel' }).click()
  await sleep(4000)
  report.cancelBefore = { transcribeCallsAfterCancel: calls.length, statuses: calls }
  // Stop & file with the natural failure: what happened to the recording.
  await page.locator('button[title="Voice capture"]:visible').first().click()
  await page.getByRole('button', { name: 'Stop & file' }).waitFor()
  await sleep(1800)
  await page.getByRole('button', { name: 'Stop & file' }).click()
  await page.getByText('Voice capture failed').waitFor({ timeout: 20000 }).then(() => toasts.push('Voice capture failed')).catch(() => {})
  await sleep(500)
  report.failureBefore = { toast: toasts, sheetStillOpen: await page.getByRole('button', { name: 'Stop & file' }).count() }
  await page.screenshot({ path: shot('voice-failure') })
  report.cancelBeforeErrors = triage(errors, [/status of 400/])
  await ctx.close()
}

// ── Item 4: the chip, in Cairo and on a Los Angeles device ───────────────────────────────────
for (const [tz, label] of [['Africa/Cairo', 'cairo'], ['America/Los_Angeles', 'la']]) {
  const { ctx, errors } = await newContext(browser, BASE, { label: `chip-${label}`, timezoneId: tz })
  const page = await ctx.newPage()
  await signIn(page, BASE)
  await page.goto(BASE + '/today')
  await sleep(1500)
  await openCommandBar(page)
  const title = `Chip check ${label} ${TAG} ${RUN}`
  await page.keyboard.type(`${title} 10am`)
  await sleep(400)
  report[`chip_${label}`] = { deviceNow: await page.evaluate(() => new Date().toString()), chips: await chips(page) }
  await page.locator('.kf-overlay-card').screenshot({ path: shot(`chip-${label}`) })
  await page.keyboard.press('Enter')
  await sleep(2500)
  const rows = await rest(`tasks?select=title,due_at&title=eq.${encodeURIComponent(title)}`)
  report[`chip_${label}`].stored = rows
  report[`chip_${label}_errors`] = triage(errors)
  await ctx.close()
}

// ── Item 3: what the IndexedDB persister holds after journal + people have loaded ────────────
{
  const { ctx, errors } = await newContext(browser, BASE, { label: 'persist' })
  const page = await ctx.newPage()
  await signIn(page, BASE)
  const words = `Private words for S8 ${TAG} ${RUN}`
  await page.goto(BASE + '/journal')
  await sleep(2500)
  const box = page.locator('textarea:visible').first()
  await box.click()
  await page.keyboard.type(words)
  await sleep(2500)
  await page.goto(BASE + '/people')
  await sleep(2500)
  await page.goto(BASE + '/today')
  await sleep(2500)
  await page.reload()
  await sleep(3500)
  const raw = await persistedCache(page)
  const parsed = raw ? JSON.parse(raw) : null
  const roots = parsed ? parsed.clientState.queries.map((q) => q.queryKey[0]) : []
  report.persisted = {
    roots: [...new Set(roots)].sort(),
    hasJournal: roots.includes('journal_entries'),
    hasPeople: roots.includes('people'),
    containsJournalText: String(raw).includes(words),
    bytes: raw ? raw.length : 0,
  }
  // Today's entry may already hold an earlier run's words; the new ones are typed into it.
  report.journalOnServer = await rest(`journal_entries?select=body,entry_date&body=like.*${encodeURIComponent(words)}*`)
  report.outboxAfter = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('keyval-store')
        req.onsuccess = () => {
          const g = req.result.transaction('keyval').objectStore('keyval').get('kf-outbox')
          g.onsuccess = () => resolve((g.result ?? []).length)
        }
      }),
  )
  report.persistErrors = triage(errors)
  await ctx.close()
}

// ── Item 5: the sign-out prompt's buttons, desktop day and phone night ───────────────────────
for (const [label, viewport, night] of [['desktop-day', DESKTOP, false], ['phone-night', PHONE, true]]) {
  const { ctx, errors } = await newContext(browser, BASE, { label: `signout-${label}`, viewport, night })
  const page = await ctx.newPage()
  await signIn(page, BASE)
  await page.goto(BASE + '/inbox')
  await sleep(1500)
  // The command bar is a lazy chunk and this harness blocks the service worker that would
  // precache it, so load it once while online.
  await openCommandBar(page)
  await page.keyboard.press('Escape')
  await sleep(300)
  await ctx.setOffline(true)
  // No date words in it ("night" would parse as a due time and file a task instead).
  const capture = `Offline capture ${label.split('-')[0]} ${TAG} ${RUN}`
  if (label === 'desktop-day') {
    await openCommandBar(page)
    await page.keyboard.type(capture)
    await page.keyboard.press('Enter')
    await sleep(800)
    await page.getByText('Sign out', { exact: true }).click()
  } else {
    // Phone: the tab bar's capture button is the mic; typed capture goes through ⌘K here too.
    await openCommandBar(page)
    await page.keyboard.type(capture)
    await page.keyboard.press('Enter')
    await sleep(800)
    await page.getByText('More', { exact: true }).click()
    await sleep(500)
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  }
  await page.locator('.kf-overlay-card button').first().waitFor({ timeout: 8000 })
  await sleep(400)
  report[`signout_${label}`] = { buttons: await buttonLines(page), title: await page.locator('.kf-overlay-card').innerText() }
  await page.screenshot({ path: shot(`signout-prompt-${label}`) })
  await page.getByRole('button', { name: 'Stay signed in' }).click()
  await ctx.setOffline(false)
  await sleep(4000)
  report[`signout_${label}`].stillSignedIn = !new URL(page.url()).pathname.startsWith('/sign-in')
  report[`signout_${label}`].captureOnServer = (await rest(`inbox_items?select=raw_text&raw_text=eq.${encodeURIComponent(capture)}`)).length
  report[`signout_${label}_errors`] = triage(errors, [/ERR_INTERNET_DISCONNECTED/, /Failed to fetch/])
  await ctx.close()
}

await browser.close()
console.log(JSON.stringify(report, null, 2))
