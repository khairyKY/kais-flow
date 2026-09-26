// Bug 1 real run: type into a new day's Journal offline, with the journal list never loaded
// on this device, then reconnect and count the rows that reached the server.
// usage: node journal.mjs <label> <shotDir>
import { launch, watch, signIn, ensureOnboarded, idbGet, rest, BASE, waitFor } from './lib.mjs'

const [label = 'run', shotDir = '.'] = process.argv.slice(2)
const TEXT = 'Written while offline.'
const errs = []
await ensureOnboarded()
const since = new Date().toISOString()

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, timezoneId: 'Africa/Cairo' })
const page = await ctx.newPage()
watch(page, label, errs)
await signIn(page)
await page.goto(BASE + '/tasks')
await page.waitForTimeout(2500)
await page.reload() // second load: the service worker now controls the page (lazy chunks precached)
await page.waitForTimeout(2500)

await ctx.setOffline(true)
await page.waitForTimeout(500)
// Client-side navigation to the Journal — its list has never been fetched on this device.
await page.locator('a[href="/journal"]').first().click()
await page.waitForTimeout(1500)
const ta = page.locator('textarea.ruled').first()
await ta.click()
await page.keyboard.type(TEXT, { delay: 70 })
await page.waitForTimeout(2000) // past the 800ms body debounce
const onScreen = await page.locator('textarea.ruled').evaluateAll((els) => els.map((e) => e.value))
const queue = (await idbGet(page, 'kf-outbox')) ?? []
const qJournal = queue.filter((e) => e.table === 'journal_entries')
console.log(`[${label}] offline: textareas on screen =`, JSON.stringify(onScreen))
console.log(`[${label}] offline: outbox journal_entries entries = ${qJournal.length}, bodies =`, JSON.stringify(qJournal.map((e) => e.payload.body)))
await page.screenshot({ path: `${shotDir}/${label}-journal-offline.png` })

await ctx.setOffline(false)
const drained = await waitFor(async () => ((await idbGet(page, 'kf-outbox')) ?? []).length === 0, 45000)
console.log(`[${label}] online: outbox drained = ${drained}`)
await page.waitForTimeout(1500)

const rows = await rest(`journal_entries?select=id,body,entry_date,created_at&created_at=gte.${encodeURIComponent(since)}&order=created_at`)
console.log(`[${label}] server: journal_entries rows since run start = ${rows.data.length}`)
console.log(`[${label}] server: bodies =`, JSON.stringify(rows.data.map((r) => r.body)))
const acts = await rest(`activity_log?select=event_type&event_type=eq.journal.created&created_at=gte.${encodeURIComponent(since)}`)
console.log(`[${label}] server: journal.created activity rows = ${acts.data?.length}`)
await page.reload()
await page.waitForTimeout(2500)
await page.screenshot({ path: `${shotDir}/${label}-journal-after-reconnect.png` })
await ctx.close()
await browser.close()
console.log(errs.length ? 'CONSOLE ERRORS:\n' + errs.join('\n') : 'console clean (open-meteo ignored)')
