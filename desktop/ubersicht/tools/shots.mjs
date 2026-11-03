// Renders the five widgets headless (Chrome through Playwright) the way Übersicht runs them, against
// docs/log/assets/widget-feed/sample-feed.json, checks what they show and do, and takes the screenshots.
// The widgets' real shell `command` fetches the sample from a local fake feed, so the page gets exactly the text a Mac would.
//   node shots.mjs <outDir> [walls dir] [playwright-core index.mjs]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadCore, harnessScript, runCommand, SAMPLE, NOW } from './lib.mjs'

const out = path.resolve(process.argv[2] ?? 'shots')
const walls = process.argv[3] ?? 'D:/Coding/kais-flow/design-export/desktop-widgets/walls'
const PW = process.argv[4] ?? 'D:/INSTALLATIONS/Dev-Environment/npm-global/node_modules/openclaw/node_modules/playwright-core/index.mjs'
const FONTS = 'C:/Users/khair/OneDrive/Documents/Rainmeter/Skins/Glass/@Resources/Fonts' // Kai's SF Pro / Source Serif, read-only, stand-ins for the Mac's own
const COURIER = path.resolve('../../rainmeter/Glass/@Resources/KaisFlow/Fonts/CourierPrime-Regular.ttf')
fs.mkdirSync(path.join(out, 'widgets'), { recursive: true })
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-mac-shots-'))
const core = await loadCore(tmp)
const url = (p) => pathToFileURL(p).href
const feed = JSON.parse(fs.readFileSync(SAMPLE, 'utf8'))
const KINDS = ['today', 'nownext', 'daybar', 'goal', 'next']

let passed = 0, failed = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? passed++ : failed++
  console.log(ok ? `ok   ${name}` : `FAIL ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`)
}

// what the command prints on a Mac, per scenario (the real script, run in bash against the fake feed)
const outputs = {
  day: (await runCommand({ theme: 'auto' }, { core })).out,
  night: (await runCommand({ theme: 'night' }, { core })).out,
  app: (await runCommand({}, { core, app: true })).out,
  readonly: (await runCommand({}, { core, body: JSON.stringify({ ...feed, can_tick: false }) })).out,
  ticking: (await runCommand({}, { core, body: JSON.stringify({ ...feed, can_tick: true }) })).out,
  setup: (await runCommand(null, { core })).out,
  placeholder: (await runCommand({ link: 'PASTE YOUR WIDGET LINK HERE' }, { core })).out,
}
const script = await harnessScript()

const { chromium } = await import(url(PW))
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

async function scene(name, output, { wall = 'bloom-light', result } = {}) {
  const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:'SF Pro Display';src:url('${url(FONTS + '/SF Pro Display.OTF')}');font-weight:400}
@font-face{font-family:'SF Pro Display';src:url('${url(FONTS + '/SFPRODISPLAYMEDIUM.OTF')}');font-weight:500}
@font-face{font-family:'SF Pro Display';src:url('${url(FONTS + '/SFPRODISPLAYBOLD.OTF')}');font-weight:700}
@font-face{font-family:'Source Serif 4';src:url('${url(FONTS + '/SourceSerif4-var.ttf')}');font-weight:200 900}
@font-face{font-family:'Courier Prime';src:url('${url(COURIER)}')}
body{margin:0;width:1920px;height:1080px;position:relative;overflow:hidden;background:url('${url(path.join(walls, wall + '.jpg'))}') center/cover}
</style><body><div id="hosts"></div><script>${script}</script>`
  const file = path.join(tmp, `${name}.html`)
  fs.writeFileSync(file, html)
  await page.addInitScript(`globalThis.__KF_NOW__ = ${NOW * 1000}; globalThis.__runs = []; globalThis.__runResult = (c) => (globalThis.__reply ? globalThis.__reply(c) : '')`)
  await page.goto(url(file))
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(([o, kinds, res]) => {
    globalThis.__out = o
    globalThis.__reply = res ? new Function('c', res) : null
    globalThis.__mounts = {}
    for (const k of kinds) { const h = document.createElement('div'); document.getElementById('hosts').appendChild(h); globalThis.__mounts[k] = globalThis.KFH.mount(k, o, h) }
  }, [output, KINDS, result ?? null])
  await page.waitForTimeout(250)
}
const text = (kind, sel) => page.locator(`.kf-w[data-widget="${kind}"] ${sel}`).first().innerText()
const norm = (s) => s.replace(/\s+/g, ' ').trim()
const raw = (kind, sel) => page.locator(`.kf-w[data-widget="${kind}"] ${sel}`).first().evaluate((e) => e.textContent) // CSS upper-cases the stamp for innerText
const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`), clip: { x: 0, y: 0, width: 400, height: 990 } })
const runs = () => page.evaluate(() => globalThis.__runs.slice())

// ---------------------------------------------------------------- day
await scene('day', outputs.day)
await shot('day')
for (const k of KINDS) await page.locator(`.kf-w[data-widget="${k}"]`).screenshot({ path: path.join(out, 'widgets', `${k}.png`) })
check('Today: the date and how the day is going', [norm(await text('today', '.kf-big')), norm(await text('today', '.kf-hd .kf-dim'))], ['Thursday 29', 'Today · 1 of 5 done'])
check('Today: the goal card, stamp and title', [norm(await text('today', '.kf-goal .gtt')), norm(await raw('today', '.kf-goal .st'))], [feed.goal.title, '\u2736 Goal of the day \u00b7 1:30\u20133:00 PM'])
check('Today: rows are Call Omar, Gym (done), the label, Pay rent, Water the plants', await page.locator('.kf-w[data-widget="today"] .kf-row').evaluateAll((r) => r.map((x) => [x.querySelector('.tt').textContent, x.classList.contains('kf-done')])),
  [['Call Omar', false], ['Gym', true], ['Pay rent', false], ['Water the plants', false]])
check('Today: the label (the sample has nothing overdue, so the footer is just the + button)', [norm(await text('today', '.kf-lbl')), norm(await text('today', '.kf-ft'))].map((s) => s.replace(/\s*\+$/, '')), ["Today's tasks 2", ''])
check('Now + next: now, time left, title, the next two', [norm(await text('nownext', '.kf-hd')), norm(await text('nownext', '.kf-ttl')), await page.locator('.kf-w[data-widget="nownext"] .kf-blk').evaluateAll((b) => b.map((x) => x.innerText.replace(/\s+/g, ' ').trim()))],
  [`Now \u00b7 1:30\u20133:00 PM 1h left`, `\u2736 ${feed.goal.title}`, ['3:30 Standup 30m', '4:30 Deep work 1h 30m']])
check('Day bar: header, one block per feed block, the goal underlined, a now line, and Next', [norm(await text('daybar', '.kf-hd')), await page.locator('.kf-w[data-widget="daybar"] .bk').count(), await page.locator('.kf-w[data-widget="daybar"] .bk.goalbk').count(), norm(await text('daybar', '.kf-blk'))],
  ['Thu 29 \u00b7 1 of 5 done', feed.day.length, feed.day.filter((d) => d.is_goal).length, 'Next 3:30 Standup in 1h 30m'])
check('Day bar: the now line is at 2:00 pm on 7am-11pm (142.5 of 328)', await page.locator('.kf-w[data-widget="daybar"] .now').evaluate((e) => parseFloat(e.style.left)), 142.5)
check('Goal: stamp, title, when, an empty box', [norm(await raw('goal', '.st')), norm(await text('goal', '.gtt')), norm(await text('goal', '.foot')), await page.locator('.kf-w[data-widget="goal"] .kf-cb').getAttribute('aria-pressed')], ['\u2736 Goal of the day', feed.goal.title, '1:30\u20133:00 PM', 'false'])
check('Next: in, title, when, then', [norm(await text('next', '.kf-hd')), norm(await text('next', '.ttl')), norm(await text('next', '.when')), norm(await text('next', '.then'))], ['Next \u00b7 in 1h 30m', 'Standup', '3:30\u20134:00 PM', 'Then 4:30 \u00b7 Deep work'])
check('no flowers: no images on the page, no cherry, daisy, bloom or flower in the widgets', [await page.locator('img').count(), /cherry|hydrangea|daisy|bloom|flower|bud/i.test(await page.locator('.kf-w').first().evaluate((e) => e.outerHTML))], [0, false])
check('the five sit in the Windows set\'s left column (20,44 / 20,424 / 20,614 / 20,804 / 210,804), at its sizes',
  await page.evaluate(() => [...document.querySelectorAll('.kf-w')].map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] })),
  [[20, 44, 360, 360], [20, 424, 360, 170], [20, 614, 360, 170], [20, 804, 170, 170], [210, 804, 170, 170]])
const css = await page.locator('.kf-w').first().evaluate((e) => { const s = getComputedStyle(e); return [s.backdropFilter || s.webkitBackdropFilter, s.borderRadius, s.backgroundColor] })
check('real glass: backdrop-filter blur(36px) saturate(1.5) brightness(1.2), 24px corners, the paper at 76%', [css[0], css[1], css[2]], ['blur(36px) saturate(1.5) brightness(1.2)', '24px', 'color(srgb 0.984314 0.964706 0.913725 / 0.76)'])
check('day palette: paper, ink', await page.locator('.kf-w').first().evaluate((e) => [getComputedStyle(e).getPropertyValue('--paper').trim().toLowerCase(), getComputedStyle(e).getPropertyValue('--ink').trim()]), ['#fbf6e9', '#2a2420'])
check('the sheet has its grain (day) and a rim', await page.locator('.kf-w').first().evaluate((e) => [getComputedStyle(e, '::before').backgroundImage.startsWith('url('), getComputedStyle(e, '::before').opacity, (getComputedStyle(e, '::after').maskComposite || '').startsWith('exclude')]), [true, '1', true])

// ---------------------------------------------------------------- hover
await page.locator('.kf-w[data-widget="today"] .kf-row').nth(2).hover()
await page.waitForTimeout(250)
check('hover: the row shows "Open" in place of its meta', await page.locator('.kf-w[data-widget="today"] .kf-row').nth(2).evaluate((r) => [getComputedStyle(r.querySelector('.go')).display !== 'none', getComputedStyle(r.querySelector('.meta')).display]), [true, 'none'])
await shot('hover')

// ---------------------------------------------------------------- ticks (the link allows ticking)
await scene('ticked', outputs.ticking, { result: `return c.includes('-X POST') ? '{"done":"x","next":null}' : ${JSON.stringify(outputs.ticking)}` })
await page.locator('.kf-w[data-widget="today"] .kf-goal .kf-cb').click()
await page.locator('.kf-w[data-widget="today"] .kf-row').first().locator('.kf-cb').click()
await page.locator('.kf-w[data-widget="goal"] .kf-cb').click()
await page.waitForTimeout(450)
const rr = await runs()
check('tick: curl -X POST with the link and &tick=<id>, for the goal and for Call Omar', rr.filter((c) => c.includes('-X POST')),
  [feed.goal.id, feed.top3[1].id, feed.goal.id].map((id) => `curl -s -f -m 20 -X POST '${JSON.parse(outputs.ticking.split('@@KF@@JSON\n')[1].split('\n')[0]).link}&tick=${id}'`))
check('tick: shown at once and kept: goal is struck through with a filled check and "Done"; 3 of 5',
  [await page.locator('.kf-w[data-widget="today"] .kf-goal').evaluate((e) => e.classList.contains('kf-done')), norm(await raw('today', '.kf-goal .st')), await page.locator('.kf-w[data-widget="today"] .kf-goal .kf-cb').getAttribute('aria-pressed'), norm(await text('today', '.kf-hd .kf-dim'))],
  [true, '\u2736 Done \u00b7 1:30\u20133:00 PM', 'true', 'Today \u00b7 3 of 5 done'])
check('tick: the 1x1 goal shows a filled check and Done', [norm(await raw('goal', '.st')), await page.locator('.kf-w[data-widget="goal"] .kf-cb').evaluate((e) => [e.classList.contains('on'), getComputedStyle(e).backgroundColor])], ['\u2736 Done', [true, 'rgb(77, 102, 80)']])
check('tick: the widget refreshed itself after the POST (ran its command again)', rr.some((c) => c.startsWith('cfg=')), true)
await shot('ticked')

await scene('failed', outputs.ticking, { result: `return ''` })
await page.locator('.kf-w[data-widget="today"] .kf-row').first().locator('.kf-cb').click()
await page.waitForTimeout(450)
check('a POST that did not say done takes the tick back, with a note', [await page.locator('.kf-w[data-widget="today"] .kf-row').first().evaluate((r) => r.classList.contains('kf-done')), norm(await text('today', '.kf-note'))], [false, "That didn't tick. Try again in Kai's Flow."])

await scene('readonly', outputs.readonly)
await page.locator('.kf-w[data-widget="today"] .kf-row').first().locator('.kf-cb').click()
await page.waitForTimeout(300)
check('a read-only link does not POST, and says why', [(await runs()).filter((c) => c.includes('curl')).length, norm(await text('today', '.kf-note'))], [0, "Ticking is off for this link. Turn it on in Kai's Flow."])

// ---------------------------------------------------------------- clicks: the app when it is there, else the website
const web = 'https://kais-flow.kaidagoat.workers.dev'
await scene('click-web', outputs.day)
await page.locator('.kf-w[data-widget="today"] .kf-row').first().locator('.tt').click()
await page.locator('.kf-w[data-widget="today"] .kf-goal .gtt').click()
await page.locator('.kf-w[data-widget="today"] .kf-add').click()
await page.locator('.kf-w[data-widget="daybar"] .kf-dbar').click()
await page.locator('.kf-w[data-widget="next"] .ttl').click()
check('no desktop app: rows, the goal, +, the day bar and Next open the website', (await runs()).filter((c) => c.startsWith('open ')),
  [`open "${web}/tasks/${feed.top3[1].id}"`, `open "${web}/tasks/${feed.goal.id}"`, `open "${web}/new"`, `open "${web}/calendar"`, feed.next_blocks[0].task_id ? `open "${web}/tasks/${feed.next_blocks[0].task_id}"` : `open "${web}/calendar"`])
await scene('click-app', outputs.app)
await page.locator('.kf-w[data-widget="today"] .kf-row').first().locator('.tt').click()
await page.locator('.kf-w[data-widget="today"] .kf-goal .gtt').click()
await page.locator('.kf-w[data-widget="today"] .kf-add').click()
await page.locator('.kf-w[data-widget="daybar"] .kf-dbar').click()
await page.locator('.kf-w[data-widget="nownext"] .kf-ttl').click()
check('desktop app installed: the same clicks open kaisflow:// links', (await runs()).filter((c) => c.startsWith('open ')),
  [`open "kaisflow://task/${feed.top3[1].id}"`, `open "kaisflow://task/${feed.goal.id}"`, 'open "kaisflow://capture"', 'open "kaisflow://calendar"', feed.now_block.task_id ? `open "kaisflow://task/${feed.now_block.task_id}"` : 'open "kaisflow://calendar"'])
check('a tick click does not also open the row', (await (async () => { await page.evaluate(() => (globalThis.__runs = [])); await page.locator('.kf-w[data-widget="today"] .kf-row').first().locator('.kf-cb').click(); return runs() })()).filter((c) => c.startsWith('open ')).length, 0)

// ---------------------------------------------------------------- night, and the empty states
await scene('night', outputs.night, { wall: 'bloom-dark' })
await shot('night')
check('theme "night" in the config: the Night Garden palette on all five, at 2 pm', await page.evaluate(() => [...document.querySelectorAll('.kf-w')].map((e) => [e.dataset.theme, getComputedStyle(e).getPropertyValue('--paper').trim().toLowerCase(), getComputedStyle(e, '::before').opacity])),
  Array(5).fill(['night', '#262233', '0']))
check('night: block colours take palette C\'s night accents (Cornflower 98C0FB on Standup)', await page.locator('.kf-w[data-widget="nownext"] .kf-blk').first().evaluate((e) => [e.style.getPropertyValue('--c'), e.style.getPropertyValue('--ci')]), ['#98C0FB', '#D6E6FE'])
await scene('setup', outputs.setup)
await shot('setup')
check('no config file yet: each widget says where to put it, with no dead button', [await page.locator('.kf-msg').evaluateAll((m) => m.map((x) => x.firstChild.textContent)), await page.locator('.kf-btn').count()], [Array(5).fill("Can't find kaisflow.config.json. Put it in the Kais-Flow widgets folder."), 0])
await scene('placeholder', outputs.placeholder)
await shot('setup-link')
check('config there, link not pasted yet: "Add your Widget link" and an Open it button', [await page.locator('.kf-msg').evaluateAll((m) => m.map((x) => x.firstChild.textContent)), await page.locator('.kf-btn').first().innerText()], [Array(5).fill("Add your Kai's Flow Widget link to kaisflow.config.json"), 'Open it'])
await page.locator('.kf-w[data-widget="today"] .kf-btn').click()
check('Open it opens the config in the default text editor', (await runs()).filter((c) => c.startsWith('open -t')).length, 1)

check('no page errors', errors, [])
console.log(`\n${passed} passed, ${failed} failed`)
await browser.close()
fs.rmSync(tmp, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
