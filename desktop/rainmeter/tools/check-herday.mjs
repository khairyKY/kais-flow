// Checks the Her day skin without Rainmeter (Partner sharing P2, flow 6): its files, and herday.lua (run in fengari against the
// fake SKIN in skin.mjs) for what it shows at each level, a pause, 24 hours without an answer, a stopped key or a disconnect
// (nothing is kept), its own key (never the Widget link, and never the other way round), and where it keeps the key.
//   FENGARI=<path to fengari> node check-herday.mjs
import fs from 'node:fs'
import path from 'node:path'
import { PKG, RES, SETTINGS, readSkin, runSkin, finalMeters, readText } from './skin.mjs'

let failed = 0, passed = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? passed++ : failed++
  console.log(ok ? `ok   ${name}` : `FAIL ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`)
}
const NOW = 1793271600 // 14:00 in Cairo (UTC+3)
const sample = fs.readFileSync(path.join(RES, 'KaisFlow', 'sample-her-feed.json'), 'utf8')
const KEY = 'https://abc.supabase.co/functions/v1/share-widget?t=kf_p_TESTKEY'
const WIDGET_LINK = 'https://abc.supabase.co/functions/v1/widget?t=kf_w_TEST'
const dot = '·'
const run = (o = {}) => runSkin('HerDay', { script: 'herday.lua', herKey: KEY, body: sample, now: NOW, ...o, steps: ['Parse()', ...(o.steps ?? [])] })
const text = (r, m) => r.opt[m]?.Text
const vis = (r, m) => !finalMeters(r).find((x) => x.name === m).hidden
const feed = (over = {}) => JSON.stringify({ ...JSON.parse(sample), ...over })
const ALL = ['HDAv', 'HDAvT', 'HDHead', 'HDRight', 'N1Box', 'N1Text', 'N1Right', 'N2Box', 'N2Text', 'N2Right', 'HDStar', 'HDGoal', 'HDFoot']

// ---------------------------------------------------------------- the files
const ini = path.join(PKG, 'KaisFlow', 'HerDay', 'HerDay.ini'), inc = path.join(RES, 'KaisFlow', 'HerDay.inc')
for (const f of [ini, inc]) check(`ascii: ${path.relative(PKG, f)}`, [...fs.readFileSync(f)].every((c) => c < 128), true)
const bytes = fs.readFileSync(path.join(RES, 'KaisFlow', 'herday.lua'))
check('herday.lua is UTF-16 LE with a BOM (Rainmeter then hands Lua UTF-8)', [bytes[0], bytes[1]], [0xff, 0xfe])
const src = readText(path.join(RES, 'KaisFlow', 'herday.lua'))
check('herday.lua is ASCII inside', [...src].every((c) => c.charCodeAt(0) < 128), true)
check('sample-her-feed.json parses', JSON.parse(sample).status, 'ok')
const s = readSkin('HerDay')
check('every @Include found (the package, or Kai\'s Glass set: GlassVars / Snap / GlassCard are his)', s.includes.filter((i) => i.from === 'missing' && !/(GlassVars|Snap|GlassCard)\.inc$/.test(i.path)).map((i) => i.path), [])
check('MeterStyles exist', s.meters.flatMap((m) => m.styles.filter((st) => !s.sections.has(st))), [])
check('snaps and is grouped like the others', s.sections.get('Rainmeter').opts.get('Group'), 'Glass | KaisFlow')
check('it asks every 5 minutes (UpdateRate 300 on a 1 s skin)', [s.sections.get('Rainmeter').opts.get('Update'), s.sections.get('MeasureFeed').opts.get('UpdateRate')], ['1000', '300'])
check('it runs herday.lua, not widget.lua', s.sections.get('MeasureKF').opts.get('ScriptFile'), '#@#KaisFlow\\herday.lua')
check('no Widget link anywhere in its files (the key is its own)', [src, fs.readFileSync(ini, 'utf8'), fs.readFileSync(inc, 'utf8')].some((t) => /kf_w_|functions\/v1\/widget\b|KaisFlow-link\.txt/.test(t)), false)
check('the Lua only touches sections this skin has', Object.keys({ ...run().opt, ...run().hid }).filter((m) => !s.sections.has(m)), [])

// ---------------------------------------------------------------- what it shows
let r = run()
check('Details: her name, the level, her Top 3', [text(r, 'HDHead'), text(r, 'HDRight')], [`Reem ${dot} Details`, `Top 3 ${dot} 1/3`])
check('now: Heather, "1h left", her title', [text(r, 'N1Text'), text(r, 'N1Right')], ['Now  1:20 PM  Pharmacology lecture', '1h left'])
check('next, in order', [text(r, 'N2Text'), vis(r, 'N2Box')], ['Next  5:20 PM  Study group', true])
check('her goal of the day, at Details', [text(r, 'HDGoal'), vis(r, 'HDGoal'), vis(r, 'HDStar')], ['Finish the pharmacology summary', true, true])
check('her block has the dashed Heather edge', /StrokeDashes 4,3/.test(r.opt.N1Box.Shape) && /137,114,179/.test(r.opt.N1Box.Shape), true)
check('the foot says when it was read and how often', text(r, 'HDFoot'), `Updated 2:00 PM ${dot} every 5 min`)
check('no message over it', [vis(r, 'KFMsg'), vis(r, 'KFBtn')], [false, false])

r = run({ body: feed({ level: 'titles', goal: null, top3: [], top3_done: 0 }) })
check('Titles: titles and times, no goal, no Top 3', [text(r, 'HDHead'), text(r, 'HDRight'), vis(r, 'HDGoal'), text(r, 'N1Text')], [`Reem ${dot} Titles`, '', false, 'Now  1:20 PM  Pharmacology lecture'])
r = run({ body: feed({ level: 'busy', goal: null, top3: [], now_block: { busy: true, start: 1793268000, end: 1793275200, start_hm: '13:20', end_hm: '15:20', color: 'heather' }, next_blocks: [{ busy: true, start: 1793282400, end: 1793286000, start_hm: '17:20', end_hm: '18:20', color: 'heather' }] }) })
check('Busy only: Busy blocks, no title, no goal', [text(r, 'HDHead'), text(r, 'N1Text'), text(r, 'N2Text'), vis(r, 'HDGoal')], [`Reem ${dot} Busy only`, 'Now  1:20 PM  Busy', 'Next  5:20 PM  Busy', false])
r = run({ body: feed({ now_block: null, next_blocks: [] }) })
check('nothing on: one quiet line', [text(r, 'N1Text'), vis(r, 'N2Box')], ['Nothing else today', false])
r = run({ steps: ['NOW = NOW + 2 * 3600', 'Render()'] })
check('the clock moves it on between fetches: the lecture is over, so the first block to come is Next', [text(r, 'N1Text'), vis(r, 'N1Right')], ['Next  5:20 PM  Study group', false])

// ---------------------------------------------------------------- a pause
r = run({ body: JSON.stringify({ v: 1, status: 'paused', name: 'Reem', paused_until: NOW + 3 * 3600, updated_at: '2026-10-29T11:00:00.000Z' }) })
check('paused: her name and when it ends, no blocks, no goal', [text(r, 'HDHead'), text(r, 'N1Text'), vis(r, 'N2Box'), vis(r, 'HDGoal')], [`Reem ${dot} paused`, 'Reem paused sharing. Back at 5:00 PM', false, false])

// ---------------------------------------------------------------- out of date
const later = feed({ now_block: null, next_blocks: [{ title: 'Secret plans', start: NOW + 30 * 3600, end: NOW + 31 * 3600, start_hm: '20:00', end_hm: '21:00', color: 'heather' }] })
r = run({ body: later, steps: ['NOW = NOW + 86400', 'Render()'] })
check('exactly 24 hours is still fresh: the title shows', [text(r, 'N1Text'), vis(r, 'HDGoal')], ['Next  8:00 PM  Secret plans', true])
r = run({ body: later, steps: ['NOW = NOW + 86400 + 1', 'Render()'] })
check('a second past 24 hours: it greys out, hides every title and her goal, and says so', [text(r, 'N1Text'), vis(r, 'HDGoal'), text(r, 'HDRight'), text(r, 'HDFoot')], ['Next  8:00 PM  Busy', false, '', `Out of date ${dot} last updated 2:00 PM`])
check('...greyed: no Heather edge, the muted ink', [/137,114,179/.test(r.opt.N1Box.Shape), r.opt.N1Text.FontColor === r.vars.KfMuted], [false, true])
r = run({ body: later, steps: ['NOW = NOW + 86400 + 1', 'Parse()'] })
check('a fresh answer brings it back at once', [text(r, 'N1Text'), text(r, 'HDFoot')], ['Next  8:00 PM  Secret plans', `Updated 2:00 PM ${dot} every 5 min`])

// ---------------------------------------------------------------- a stopped key, a disconnect: nothing is kept
for (const [body, why, msg] of [['{"error":"unauthorized"}', 'unauthorized', 'doesn\'t work any more'], ['{"error":"gone","reason":"revoked"}', 'gone', 'Not connected any more']]) {
  r = runSkin('HerDay', { script: 'herday.lua', herKey: KEY, body: sample, now: NOW, steps: ['Parse()', { body }, 'Parse()'] })
  check(`${why}: the message, and every meter of hers is hidden`, [text(r, 'KFMsg').includes(msg), ALL.filter((m) => vis(r, m))], [true, []])
  check(`${why}: no word of hers is left in any meter`, ALL.map((m) => text(r, m)).filter((t) => t && t.length), [])
  check(`${why}: the saved key is wiped and polling stops`, [r.files[SETTINGS + 'KaisFlow-her-link.txt'], r.log.includes('!DisableMeasure MeasureFeed')], ['', true])
  check(`${why}: "Add my key" is the button`, text(r, 'KFBtnText'), 'Add my key')
}
r = runSkin('HerDay', { script: 'herday.lua', herKey: KEY, body: sample, now: NOW, steps: ['Parse()', { body: '{"error":"rate_limited"}' }, 'Parse()'] })
check('a busy answer after a good one keeps the day (and the key)', [text(r, 'N1Text').startsWith('Now'), r.files[SETTINGS + 'KaisFlow-her-link.txt']], [true, KEY])
r = runSkin('HerDay', { script: 'herday.lua', herKey: KEY, body: sample, now: NOW, steps: ['Parse()', 'Offline()'] })
check('offline after a good one keeps the day (the 24 hours decide)', text(r, 'N1Text').startsWith('Now'), true)
r = runSkin('HerDay', { script: 'herday.lua', herKey: KEY, body: sample, now: NOW, steps: ['Offline()'] })
check('offline from the start: says so, with Try again', [text(r, 'KFMsg'), text(r, 'KFBtnText')], ['Can\'t reach Kai\'s Flow.', 'Try again'])
r = run({ body: '<html>502</html>' })
check('something that is not JSON: a plain message, no day', [text(r, 'KFMsg').includes('can\'t read'), vis(r, 'N1Text')], [true, false])

// ---------------------------------------------------------------- its own key
r = runSkin('HerDay', { script: 'herday.lua', link: WIDGET_LINK, now: NOW, steps: [] })
check('the Widget link on this PC is never used: no her-day key, "needs a key"', [text(r, 'KFMsg').includes('needs a key'), r.opt.MeasureFeed?.URL], [true, undefined])
r = runSkin('HerDay', { script: 'herday.lua', herKey: WIDGET_LINK, now: NOW, steps: [] })
check('a Widget link saved as the key is not accepted either', text(r, 'KFMsg').includes('needs a key'), true)
r = runSkin('HerDay', { script: 'herday.lua', herKey: KEY, body: sample, now: NOW, steps: [] })
check('with its key it asks that URL and starts the measure', [r.opt.MeasureFeed.URL, r.log.includes('!EnableMeasure MeasureFeed')], [KEY, true])
r = runSkin('HerDay', { script: 'herday.lua', now: NOW, vars: { KfPasted: WIDGET_LINK }, steps: ['SaveLink()'] })
check('pasting a Widget link as the key: refused, nothing saved', [text(r, 'KFNote'), SETTINGS + 'KaisFlow-her-link.txt' in r.files], ['That isn\'t a her-day key. Copy it again from Kai\'s Flow.', false])
r = runSkin('HerDay', { script: 'herday.lua', now: NOW, vars: { KfPasted: `here: ${KEY} thanks` }, steps: ['SaveLink()'] })
check('pasting the key (junk around it is fine): saved in the settings folder, as its own file, then the skin reloads', [r.files[SETTINGS + 'KaisFlow-her-link.txt'], SETTINGS + 'KaisFlow-link.txt' in r.files, r.log.includes('!Refresh')], [KEY, false, true])

// ---------------------------------------------------------------- theme and clicks
r = run({ theme: 'night' })
check('Theme: Night is read from the same file as the other skins', [r.vars.KfInk, r.vars.KfPaper], ['240,235,221', '38,34,51,194'])
r = run({ theme: 'day', now: NOW + 8 * 3600 })
check('Theme: Day stays day at 10 PM', r.vars.KfInk, '42,36,32')
r = run({ steps: ["SetTheme('night')"] })
check('right-click > Theme saves the choice and tells the other skins', [r.files[SETTINGS + 'KaisFlow-theme.txt'], r.log.filter((l) => l.startsWith('!CommandMeasure MeasureKF')).length], ['night', 5])
r = runSkin('HerDay', { script: 'herday.lua', herKey: KEY, body: sample, now: NOW, app: true, steps: ['Parse()', "Go('today')"] })
check('a click: the desktop app when installed', r.log.at(-1), '"kaisflow://today"')
r = runSkin('HerDay', { script: 'herday.lua', herKey: KEY, body: sample, now: NOW, steps: ['Parse()', "Go('today')"] })
check('...else the website', r.log.at(-1), '"https://kais-flow.kaidagoat.workers.dev/today"')

console.log(`\n${passed} of ${passed + failed} ok`)
process.exit(failed ? 1 : 0)
