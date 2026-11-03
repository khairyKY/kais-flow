// Checks the widgets without Rainmeter: every .ini/.inc parses and points at files that exist, and widget.lua
// (run in fengari against a fake SKIN, see skin.mjs) shows the sample feed's rows, ticks, the Day / Night choice,
// the app-or-website clicks, where it keeps the link, and its error states. No flowers anywhere.   FENGARI=<path to fengari> node check.mjs
import fs from 'node:fs'
import path from 'node:path'
import { PKG, RES, SETTINGS, WIDGETS, readSkin, resolveRes, runSkin, finalMeters, readText, subst } from './skin.mjs'

let failed = 0, passed = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? passed++ : failed++
  if (!ok) console.log(`FAIL ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`)
  else console.log(`ok   ${name}`)
}
const sample = fs.readFileSync(path.join(RES, 'KaisFlow', 'sample-feed.json'), 'utf8')
const feed = JSON.parse(sample)
const LINK = 'https://abc.supabase.co/functions/v1/widget?t=kf_w_TEST'
const live = (w, o = {}) => runSkin(w, { body: sample, link: LINK, ...o, steps: ['Parse()', ...(o.steps ?? [])] })
const text = (r, m) => r.opt[m]?.Text
const visible = (r, m) => !finalMeters(r).find((x) => x.name === m).hidden
const lua = readText(path.join(RES, 'KaisFlow', 'widget.lua'))

// ---------------------------------------------------------------- the files
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
const files = walk(PKG)
for (const f of files.filter((f) => /\.(ini|inc)$/.test(f))) {
  const b = fs.readFileSync(f)
  check(`ascii (no BOM needed, like Kai's skins): ${path.relative(PKG, f)}`, [...b].every((c) => c < 128), true)
}
const wl = fs.readFileSync(path.join(RES, 'KaisFlow', 'widget.lua'))
check('widget.lua is UTF-16 LE with a BOM (Rainmeter then hands Lua UTF-8)', [wl[0], wl[1]], [0xff, 0xfe])
check('widget.lua is ASCII inside', [...lua].every((c) => c.charCodeAt(0) < 128), true)
const kl = fs.readFileSync(path.join(RES, 'KaisFlow', 'kaisflow.lua'))
check('kaisflow.lua is plain ASCII (dofile reads bytes)', [...kl].every((c) => c < 128), true)
check('kaisflow.lua is the widget-feed handoff\'s parser, unchanged',
  kl.equals(fs.readFileSync(path.join(PKG, '..', '..', '..', 'docs', 'log', 'assets', 'widget-feed', 'rainmeter-test', 'KaisFlowTest', 'kaisflow.lua'))), true)

const METERS = new Set(['String', 'Shape', 'Image']), MEASURES = new Set(['WebParser', 'Plugin', 'Script', 'Registry'])
for (const w of WIDGETS) {
  const s = readSkin(w)
  check(`${w}: every @Include found (package or Kai's Glass)`, s.includes.filter((i) => i.from === 'missing').map((i) => i.path), [])
  check(`${w}: meter types`, s.meters.filter((m) => !METERS.has(m.opts.Meter)).map((m) => m.name), [])
  check(`${w}: measure types`, s.measures.filter((m) => !MEASURES.has(m.opts.Measure)).map((m) => m.name), [])
  check(`${w}: MeterStyles exist`, s.meters.flatMap((m) => m.styles.filter((st) => !s.sections.has(st))), [])
  const paths = []
  for (const sec of s.sections.values()) {
    for (const [k, v] of sec.opts) {
      if (/^(ImageName|ScriptFile|LocalFont\d*)$/.test(k) && v) paths.push(v)
    }
  }
  const missing = paths.map((p) => subst(p, s.vars)).filter((p) => !fs.existsSync(p.startsWith(RES) ? p : resolveRes(p).file) && resolveRes(p.replace(RES, '#@#')).from === 'missing')
  check(`${w}: every image, font and script path exists`, missing, [])
  check(`${w}: snaps and is grouped`, [s.measures.some((m) => m.name === 'MeasureSnap'), s.sections.get('Rainmeter').opts.get('Group')], [true, 'Glass | KaisFlow'])
  // every section the Lua touches exists in this skin
  const r = live(w, { steps: ["Over('Row1Bg')", "Tick('GoalCb')"] })
  const known = new Set(s.sections.keys())
  check(`${w}: widget.lua only touches this skin's sections`, Object.keys({ ...r.opt, ...r.hid }).filter((m) => !known.has(m)), [])
  const imgs = Object.values(r.opt).map((o) => o.ImageName).filter(Boolean)
  check(`${w}: the images widget.lua picks exist`, imgs.filter((p) => !fs.existsSync(p)), [])
}
// no flowers: no plant art, no plant meters, nothing in the Lua or the skins that draws one
check('no Plants folder or plant images in the package', walk(PKG).filter((f) => /plants|\.png$/i.test(f) && !/(grain|tape)\.png$/.test(f)), [])
const all = [...walk(PKG).filter((f) => /\.(ini|inc|lua)$/.test(f)), path.join(PKG, '..', 'tools', 'gen-skins.py')]
check('nothing mentions a plant, flower, bud or bloom (KFPlant, GoalBud, cherry...)',
  all.filter((f) => /KFPlant|GoalBud|PlantX|PlantY|Plants\\|cherry|hydrangea|daisy|bloom/i.test(readText(f))).map((f) => path.basename(f)), [])
check('the grain and the tape are the only images', walk(path.join(PKG)).filter((f) => /\.png$/.test(f)).map((f) => path.basename(f)).sort(), ['grain.png', 'tape.png'])
for (const [w, icon] of [['Today', 'sun'], ['NowNext', 'clock'], ['DayBar', 'calendar'], ['Next', 'calendar'], ['Goal', null]]) {
  const m = readSkin(w).meters.find((x) => x.name === 'KFIcon')
  check(`${w}: ${icon ? `a ${icon} line icon in the header, in the muted ink` : 'no header icon (its stamp has the star)'}`,
    m ? [Object.keys(m.opts).filter((k) => /^Shape\d*$/.test(k)).length > 1, m.opts.Shape.includes('Stroke Color #KfMuted#')] : null, icon ? [true, true] : null)
}

// ---------------------------------------------------------------- Today: rows, ticks, counts
{
  const r = live('Today')
  check('Today: header', [text(r, 'TodayDate'), text(r, 'TodaySub')], ['Thursday 29', 'Today · 1 of 5 done'])
  check('Today: goal card', [text(r, 'GoalTitle'), text(r, 'GoalStamp')], [feed.goal.title, '✶ GOAL OF THE DAY · 1:30–3:00 PM'])
  const rows = [1, 2, 3, 4, 5, 6].map((i) => (visible(r, `Row${i}Bg`) ? [text(r, `Row${i}Num`), text(r, `Row${i}Title`), r.opt[`Row${i}Title`].InlineSetting] : null))
  check('Today: picks 2 and 3 (Gym done, struck through), then the two tasks; rows 5-6 hidden', rows,
    [['2', 'Call Omar', ''], ['3', 'Gym', 'Strikethrough'], ['', 'Pay rent', ''], ['', 'Water the plants', ''], null, null])
  check('Today: the label and the rows under it', [text(r, 'TodayLabel'), r.opt.TodayLabel.Y, r.opt.Row3Bg.Y], ["Today's tasks  2", '204', '214'])
  check('Today: Gym\'s box is filled sage, the others empty', [r.opt.Row2Cb.Shape.includes('Fill Color 77,102,80'), r.opt.Row1Cb.Shape.includes('Fill Color 246,240,225')], [true, true])
  check('Today: a two-line goal makes the card taller and moves the rows down',
    [live('Today', { heights: { GoalTitle: 36 } }).opt.Row1Bg.Y, r.opt.Row1Bg.Y], ['146', '128'])
  const many = JSON.parse(sample)
  many.tasks = Array.from({ length: 6 }, (_, i) => ({ id: `00000000-0000-4000-8000-00000000010${i}`, title: `Task ${i + 1}`, done: false, priority: null }))
  many.overdue = 3
  many.tasks_more = 4
  const m = live('Today', { body: JSON.stringify(many) })
  check('Today: rows stop above the footer; the rest is counted', [[1, 2, 3, 4, 5, 6].filter((i) => visible(m, `Row${i}Bg`)).length, text(m, 'TodayFoot')],
    [5, 'Overdue 3 · Also open 7 ›'])

  // tick the goal on a live link: shows at once, then curl posts it
  const t = live('Today', { steps: ["Tick('GoalCb')"] })
  check('tick: the goal shows done at once (filled check, "Done", struck through)', [text(t, 'GoalStamp').startsWith('✶ DONE'), t.opt.GoalCb.Shape.includes('Fill Color 77,102,80'), t.opt.GoalTitle.InlineSetting, text(t, 'TodaySub')],
    [true, true, 'Strikethrough', 'Today · 2 of 5 done'])
  check('tick: curl.exe gets the POST', [t.opt.MeasureTick.Parameter, t.log.includes('!CommandMeasure MeasureTick | Run')],
    [`-s -f -X POST "${LINK}&tick=${feed.goal.id}"`, true])
  const at = (b) => t.log.findIndex((l) => l.startsWith(b))
  check('tick: Parameter is set, applied (!UpdateMeasure), then Run', at('!SetOption MeasureTick | Parameter') >= 0 && at('!SetOption MeasureTick | Parameter') < at('!UpdateMeasure MeasureTick') && at('!UpdateMeasure MeasureTick') < at('!CommandMeasure MeasureTick | Run'), true)
  const ok = live('Today', { steps: ["Tick('GoalCb')", { tickOut: `{"done":"${feed.goal.id}","next":null}` }, 'TickDone()'] })
  check('tick: success keeps the tick and refreshes all five widgets', [text(ok, 'GoalStamp').startsWith('✶ DONE'),
    WIDGETS.every((w) => ok.log.includes(`!CommandMeasure MeasureFeed | Update | Glass\\KaisFlow\\${w}`))], [true, true])
  const bad = live('Today', { steps: ["Tick('Row1Cb')", { tickOut: '' }, 'TickDone()'] })
  check('tick: a failed POST takes the tick back and says so', [text(bad, 'TodaySub'), visible(bad, 'KFNote'), text(bad, 'KFNote')],
    ['Today · 1 of 5 done', true, "That didn't tick. Try again in Kai's Flow."])
  const later = JSON.parse(sample)
  later.top3[0].done = true
  later.goal.done = true
  later.done = 2
  const after = live('Today', { steps: ["Tick('GoalCb')", { tickOut: '{"done":"x"}' }, 'TickDone()', { body: JSON.stringify(later) }, 'Parse()'] })
  check('tick: once the feed has it, the count is the feed\'s (no double count)', text(after, 'TodaySub'), 'Today · 2 of 5 done')
  const ro = JSON.parse(sample)
  ro.can_tick = false
  const r2 = live('Today', { body: JSON.stringify(ro), steps: ["Tick('Row1Cb')"] })
  check('tick: a read-only link doesn\'t tick, and says why', [r2.opt.MeasureTick?.Parameter, text(r2, 'KFNote')],
    [undefined, "Ticking is off for this link. Turn it on in Kai's Flow."])
  const done = live('Today', { steps: ["Tick('Row2Cb')"] })
  check('tick: a done pick (Gym) can\'t be ticked again', done.opt.MeasureTick?.Parameter, undefined)
  const s = runSkin('Today', { body: sample, feedURL: 'sample', steps: ['Parse()', "Tick('Row3Cb')"] })
  check('sample mode: reads the shipped sample; a tick shows but posts nothing',
    [s.opt.MeasureFeed.URL, s.opt.Row3Cb.Shape.includes('Fill Color 77,102,80'), s.opt.MeasureTick?.Parameter],
    [`file://${RES}KaisFlow\\sample-feed.json`, true, undefined])

  const h = live('Today', { steps: ["Over('Row1Bg')"] })
  check('hover: the row lifts, its box darkens and "Open" replaces the meta',
    [h.opt.Row1Bg.Shape.endsWith('Fill Color 246,240,225'), h.opt.Row1Cb.Shape.includes('Stroke Color 95,88,73'), text(h, 'Row1Meta')], [true, true, 'Open ↗'])
  const h2 = live('Today', { steps: ["Over('Row1Bg')", "Over('Row1Cb')", "Out('Row1Bg')"] })
  check('hover: moving from the row onto its box keeps it lifted', text(h2, 'Row1Meta'), 'Open ↗')
  const h3 = live('Today', { steps: ["Over('Row1Bg')", "Over('Row1Cb')", "Out('Row1Bg')", "Out('Row1Cb')"] })
  check('hover: leaving it settles it', text(h3, 'Row1Meta'), '')
}

// ---------------------------------------------------------------- Goal (1x1): a ticked goal is a filled check and "Done"
{
  const g = live('Goal')
  check('Goal: stamp, title, when', [text(g, 'GoalStamp'), text(g, 'GoalTitle'), text(g, 'GoalWhen')], ['✶ GOAL OF THE DAY', feed.goal.title, '1:30–3:00 PM'])
  check('Goal: an empty box before the tick', [g.opt.GoalCb.Shape.includes('Fill Color 246,240,225'), g.opt.GoalCb.Shape2.includes('Stroke Color 0,0,0,0')], [true, true])
  const t = live('Goal', { steps: ["Tick('GoalCb')"] })
  check('Goal: ticked, it shows a filled check and Done', [text(t, 'GoalStamp'), t.opt.GoalCb.Shape.includes('Fill Color 77,102,80'), t.opt.GoalCb.Shape2.includes('Stroke Color 251,246,233'), t.opt.GoalTitle.InlineSetting],
    ['✶ DONE', true, true, 'Strikethrough'])
  const none = JSON.parse(sample)
  none.goal = null
  none.top3 = []
  const e = live('Goal', { body: JSON.stringify(none) })
  check('Goal: none picked yet', [text(e, 'GoalTitle'), visible(e, 'GoalCb'), text(e, 'GoalWhen')], ['No goal picked yet', false, "Pick one in Kai's Flow"])
}

// ---------------------------------------------------------------- Now + next, Day bar, Next
{
  const r = live('NowNext')
  check('NowNext: now, time left, the next two', [text(r, 'NNHead'), text(r, 'NNLeft'), text(r, 'NNTitle'), text(r, 'Blk1Text'), text(r, 'Blk1Right'), text(r, 'Blk2Text'), text(r, 'Blk2Right')],
    ['Now · 1:30–3:00 PM', '1h left', `✶ ${feed.goal.title}`, '3:30  Standup', '30m', '4:30  Deep work', '1h 30m'])
  check('NowNext: progress is a third of the block (30 of 90 min)', r.opt.NNProg.Shape2, 'Rectangle 0,0,109.3,4,2 | StrokeWidth 0 | Fill Color 181,156,227')
  check('NowNext: palette C block (Cornflower): fill 24% into the paper, 45% edge, its ink',
    [r.opt.Blk1Box.Shape, r.opt.Blk1Text.FontColor], ['Rectangle 1.5,0.5,327,27,9 | StrokeWidth 1 | Stroke Color 129,173,237,115 | Fill Color 222,228,234', '50,83,131'])
  const late = live('NowNext', { now: 1793271600 + 2 * 3600 + 15 * 60 })
  check('NowNext: between blocks (16:15) it is free, the next is Deep work, nothing after',
    [text(late, 'NNHead'), text(late, 'Blk1Text'), visible(late, 'Blk2Box')], ['Now · free', '4:30  Deep work', false])

  const d = live('DayBar')
  check('DayBar: header, and the next block', [text(d, 'DBHead'), text(d, 'Blk1Text'), text(d, 'Blk1Right')], ['Thu 29 · 1 of 5 done', 'Next  3:30  Standup', 'in 1h 30m'])
  check('DayBar: track + 3 blocks + the goal\'s underline + the now line', Object.keys(d.opt.DBBar).filter((k) => /^Shape\d*$/.test(k)).length, 6)
  check('DayBar: the goal block 1:30-3:00 at its place on 7am-11pm', d.opt.DBBar.Shape2, 'Rectangle 133.3,14,30.8,14,4 | StrokeWidth 0 | Fill Color 213,197,230')
  check('DayBar: the now line at 2:00 pm', d.opt.DBBar.Shape6, 'Rectangle 142.5,9,2,24,1 | StrokeWidth 0 | Fill Color 42,36,32')

  const n = live('Next')
  check('Next: in, title, when, then', [text(n, 'SNHead'), text(n, 'SNTitle'), text(n, 'SNWhen'), text(n, 'SNThen')],
    ['Next · in 1h 30m', 'Standup', '3:30–4:00 PM', 'Then 4:30 · Deep work'])
  check('Next: the colour bar follows the title\'s height', [n.opt.SNBar.Shape, live('Next', { heights: { SNTitle: 37 } }).opt.SNWhen.Y],
    ['Rectangle 0,0,3,19,1.5 | StrokeWidth 0 | Fill Color 129,173,237', '83'])
}

// ---------------------------------------------------------------- night: the Night Garden colours
{
  const night = 1793271600 + 7 * 3600 + 40 * 60 // 21:40
  const r = live('NowNext', { now: night - 6 * 3600 })
  check('day at 15:40: paper and ink', [r.vars.KfPaper, r.vars.KfInk, r.vars.KfGrain], ['251,246,233,194', '42,36,32', '255'])
  const n = live('Today', { now: night })
  check('night at 21:40: Night Garden paper, ink, no grain', [n.vars.KfPaper, n.vars.KfInk, n.vars.KfGrain, n.vars.KfTerra], ['38,34,51,194', '240,235,221', '0', '226,148,115'])
  check('night: a check box takes the night sage', live('Today', { now: night }).opt.Row2Cb.Shape.includes('Fill Color 168,192,154'), true)
  const d = live('DayBar', { now: night })
  check('night: blocks take palette C\'s night accents (Cornflower 98C0FB at 55% into the night paper)', d.opt.DBBar.Shape4, 'Rectangle 174.3,14,10.3,14,4 | StrokeWidth 0 | Fill Color 101,121,161,115')
  const early = live('Today', { now: night + 9 * 3600 }) // 06:40
  check('06:40 is day again', early.vars.KfPaper, '251,246,233,194')
}

// ---------------------------------------------------------------- the link, and when there's nothing to show
{
  const none = runSkin('Today', {})
  check('no link: says so, with "Add my link", content hidden', [text(none, 'KFMsg'), text(none, 'KFBtnText'), visible(none, 'KFBtn'), visible(none, 'GoalTitle'), none.opt.MeasureFeed],
    ["Add your Kai's Flow Widget link", 'Add my link', true, false, undefined])
  check('first load: the skin moves to its place in the left column', [runSkin('NowNext', {}).pos, runSkin('Next', { pos: [400, 20] }).pos], [[20, 400], [400, 20]])
  const r = runSkin('Today', { link: `pasted: ${LINK} ` })
  check('a saved link turns the feed on', [r.opt.MeasureFeed.URL, r.log.includes('!EnableMeasure MeasureFeed')], [LINK, true])
  const save = runSkin('Today', { steps: [`V.KfPasted = [==[  ${LINK}\n]==] SaveLink()`] })
  check('Add my link: saves the link in Rainmeter\'s settings folder (not beside the skins) and refreshes the widgets',
    [save.files[`${SETTINGS}KaisFlow-link.txt`], save.files[`${RES}KaisFlow\\link.txt`], save.log.includes('!RefreshGroup KaisFlow')], [LINK, undefined, true])
  const junk = runSkin('Today', { steps: ["V.KfPasted = [==[hello]==] SaveLink()"] })
  check('Add my link: junk is refused', [junk.files[`${SETTINGS}KaisFlow-link.txt`], text(junk, 'KFNote')], [undefined, "That isn't a Widget link. Copy it again from Kai's Flow."])
  const cases = [['{"error":"unauthorized"}', 'This link was turned off or mistyped'], ['<html>404</html>', "Can't read Kai's Flow right now"],
    ['{"error":"rate_limited"}', 'Too many refreshes. Back in a bit'], ['{"v":2}', "Can't read Kai's Flow right now"]]
  for (const [body, want] of cases) check(`feed answers ${body}`, text(live('Goal', { body }), 'KFMsg'), want)
  const off = runSkin('Today', { link: LINK, steps: ['Offline()'] })
  check('offline before any feed', [text(off, 'KFMsg'), text(off, 'KFBtnText')], ['Offline', 'Try again'])
  const keep = live('Today', { steps: [{ body: '<html>502</html>' }, 'Parse()', 'Offline()'] })
  check('a bad fetch after a good one keeps the last day on screen', [visible(keep, 'KFMsg'), text(keep, 'GoalTitle')], [false, feed.goal.title])
  const revoked = live('Today', { steps: [{ body: '{"error":"unauthorized"}' }, 'Parse()'] })
  check('a revoked link clears the day', [visible(revoked, 'KFMsg'), visible(revoked, 'GoalTitle')], [true, false])
}

// ---------------------------------------------------------------- upgrading from 1.0: the link is kept
{
  const up = runSkin('Today', { legacyLink: `https://abc.supabase.co/functions/v1/widget?t=kf_w_OLD1`, steps: ['Parse()'] })
  check('1.0 link (in @Resources\\KaisFlow\\link.txt) is still used', up.opt.MeasureFeed.URL, 'https://abc.supabase.co/functions/v1/widget?t=kf_w_OLD1')
  check('...and is copied once to the settings folder', up.files[`${SETTINGS}KaisFlow-link.txt`], 'https://abc.supabase.co/functions/v1/widget?t=kf_w_OLD1')
  const both = runSkin('Today', { link: LINK, legacyLink: 'https://abc.supabase.co/functions/v1/widget?t=kf_w_OLD1' })
  check('a link in the settings folder wins over the old one', both.opt.MeasureFeed.URL, LINK)
  const nowhere = runSkin('Today', { link: 'junk', legacyLink: 'junk' })
  check('no usable link anywhere: asks for one', text(nowhere, 'KFMsg'), "Add your Kai's Flow Widget link")
  const pkg = fs.readdirSync(path.join(RES, 'KaisFlow'))
  check('the package never ships a link or a theme file (so an install can\'t overwrite them)', pkg.filter((f) => /link|theme/i.test(f)), [])
}

// ---------------------------------------------------------------- Theme: Auto / Day / Night, remembered
{
  const day = 1793271600 + 3 * 3600      // 14:00 on the clock
  const night = 1793271600 + 10 * 3600   // 21:00
  const paper = (o) => runSkin('Today', { body: sample, link: LINK, steps: ['Parse()'], ...o }).vars.KfPaper
  const DAY = '251,246,233,194', NIGHT = '38,34,51,194'
  check('Auto (no file) follows the clock: day at 14:00, night at 21:00', [paper({ now: day }), paper({ now: night })], [DAY, NIGHT])
  check('Auto written out is the same', [paper({ now: day, theme: 'auto' }), paper({ now: night, theme: 'auto\n' })], [DAY, NIGHT])
  check('Day stays day at 21:00', paper({ now: night, theme: 'day' }), DAY)
  check('Night stays night at 14:00', paper({ now: day, theme: 'night' }), NIGHT)
  check('a garbled file is Auto', [paper({ now: day, theme: 'purple' }), paper({ now: night, theme: '' })], [DAY, NIGHT])
  const set = runSkin('Today', { body: sample, link: LINK, now: day, steps: ['Parse()', "SetTheme('night')"] })
  check('Theme > Night: remembered in the settings folder, not beside the skins', [set.files[`${SETTINGS}KaisFlow-theme.txt`], Object.keys(set.files).filter((f) => f.startsWith(RES))], ['night', []])
  check('Theme: every Kai\'s Flow widget is told to read it again',
    WIDGETS.every((w) => set.log.includes(`!CommandMeasure MeasureKF | LoadTheme() | Glass\\KaisFlow\\${w}`)), true)
  check('Theme: the widget says which one was picked', text(set, 'KFNote'), 'Theme: Night')
  // another widget gets the order: it reads the file and redraws
  const other = runSkin('NowNext', { body: sample, link: LINK, now: day, steps: ['Parse()', { files: { [`${SETTINGS}KaisFlow-theme.txt`]: 'night' } }, 'LoadTheme()'] })
  check('LoadTheme(): the other widget switches to night at once', other.vars.KfPaper, NIGHT)
  const back = runSkin('NowNext', { body: sample, link: LINK, now: night, theme: 'night', steps: ['Parse()', { files: { [`${SETTINGS}KaisFlow-theme.txt`]: 'auto' } }, 'LoadTheme()'] })
  check('Theme > Auto at 21:00 stays night; at 14:00 it goes back to day', [back.vars.KfPaper, runSkin('NowNext', { body: sample, link: LINK, now: day, theme: 'night', steps: ['Parse()', { files: { [`${SETTINGS}KaisFlow-theme.txt`]: 'auto' } }, 'LoadTheme()'] }).vars.KfPaper], [NIGHT, DAY])
  const menu = readSkin('Today').sections.get('Rainmeter').opts
  const titles = [...menu].filter(([k]) => /^ContextTitle\d*$/.test(k)).map(([, v]) => v)
  check('the right-click menu has Theme: Auto, Day, Night', titles.filter((t) => t.startsWith('Theme')), ['Theme: Auto (7 PM - 6 AM)', 'Theme: Day', 'Theme: Night'])
  check('...each calls SetTheme', ['4', '5', '6'].map((n) => menu.get(`ContextAction${n}`)), ['auto', 'day', 'night'].map((c) => `[!CommandMeasure MeasureKF "SetTheme('${c}')"]`))
  check('...and a menu title is 30 characters at most (Rainmeter cuts longer ones)', titles.filter((t) => t.length > 30), [])
}

// ---------------------------------------------------------------- clicks open the desktop app, or the website when it isn't there
{
  const url = (r) => r.log.filter((l) => l.startsWith('"')).map((l) => l.slice(1, -1))
  const web = 'https://kais-flow.kaidagoat.workers.dev'
  const go = (what, o = {}) => url(live('Today', { steps: [`Go('${what}')`], ...o }))
  const id = feed.top3[1].id
  check('app installed (the kaisflow key has subkeys): today opens kaisflow://today', go('today', { app: true }), ['kaisflow://today'])
  check('app installed (only the default value is set): still the app', go('today', { appValue: 'URL:Kai\'s Flow' }), ['kaisflow://today'])
  check('app not installed: the website', go('today'), [`${web}/today`])
  check('calendar, focus', [go('calendar', { app: true }), go('focus', { app: true })], [['kaisflow://calendar'], ['kaisflow://focus']])
  check('a task: kaisflow://task/<id>, or the website\'s /tasks/<id>', [go(`task/${id}`, { app: true }), go(`task/${id}`)], [[`kaisflow://task/${id}`], [`${web}/tasks/${id}`]])
  check('capture: kaisflow://capture, or the website\'s /new', [go('capture', { app: true }), go('capture')], [['kaisflow://capture'], [`${web}/new`]])
  check('both registry measures are refreshed at each click (the app may be installed later)', live('Today', { steps: ["Go('today')"] }).log.filter((l) => l.startsWith('!UpdateMeasure MeasureApp')).length, 2)
  const row = (sec, o) => url(live('Today', { steps: [`Open('${sec}')`], ...o }))
  check('a Top 3 row opens its task; the goal card opens the goal', [row('Row1Bg', { app: true }), row('GoalCard', { app: true })], [[`kaisflow://task/${feed.top3[1].id}`], [`kaisflow://task/${feed.goal.id}`]])
  check('a task row on the website', row('Row3Bg'), [`${web}/tasks/${feed.tasks[0].id}`])
  check('the + button opens capture', readSkin('Today').sections.get('TodayAdd').opts.get('LeftMouseUpAction'), `[!CommandMeasure MeasureKF "Go('capture')"]`)
  check('the menu\'s Open Kai\'s Flow opens today', readSkin('Today').sections.get('Rainmeter').opts.get('ContextAction'), `[!CommandMeasure MeasureKF "Go('today')"]`)
  const nb = (w, what, o = {}) => url(live(w, { steps: [`Go('${what}')`], ...o }))
  const block = feed.now_block
  check('Now: the running block\'s task, or the calendar when the block has no task',
    [nb('NowNext', 'now', { app: true }), nb('NowNext', 'next1', { app: true })],
    [[block.task_id ? `kaisflow://task/${block.task_id}` : 'kaisflow://calendar'], [feed.next_blocks[0].task_id ? `kaisflow://task/${feed.next_blocks[0].task_id}` : 'kaisflow://calendar']])
  const empty = JSON.parse(sample)
  empty.now_block = null
  empty.next_blocks = []
  check('Now / Next with nothing on: the calendar', [nb('NowNext', 'now', { body: JSON.stringify(empty), app: true }), nb('Next', 'next1', { body: JSON.stringify(empty) })],
    [['kaisflow://calendar'], [`${web}/calendar`]])
  const clicks = (w) => readSkin(w).meters.filter((m) => /Go\(|Open\(/.test(m.opts.LeftMouseUpAction ?? '')).map((m) => m.name)
  check('Now + next, Day bar, Next, Goal have something to click', [clicks('NowNext'), clicks('DayBar'), clicks('Next'), clicks('Goal')],
    [['NNHit', 'Blk1Box', 'Blk2Box'], ['DBBar', 'Blk1Box'], ['SNHit'], ['GoalCard', 'GoalCb']].map((a) => a.filter((n) => n !== 'GoalCb')))
  check('no click action still opens the old AppURL directly', ['Today', 'NowNext', 'DayBar', 'Goal', 'Next'].flatMap((w) => readSkin(w).meters.filter((m) => /AppURL/.test(m.opts.LeftMouseUpAction ?? '')).map((m) => `${w}.${m.name}`)), [])
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
