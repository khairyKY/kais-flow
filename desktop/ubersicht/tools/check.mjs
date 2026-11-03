// Checks the Übersicht widgets without a Mac: the real `command` (a /bin/sh script) runs in bash against a local
// fake of the feed, and the widgets' state machine, links and tick command run in Node.
//   node check.mjs            (needs `npm ci` in app/ for esbuild, and bash + curl on PATH: Git Bash is fine)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadCore, runCommand, SAMPLE, NOW, ROOT } from './lib.mjs'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-mac-check-'))
const core = await loadCore(tmp)
globalThis.__KF_NOW__ = NOW * 1000
let passed = 0, failed = 0
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? passed++ : failed++
  console.log(ok ? `ok   ${name}` : `FAIL ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`)
}
const sample = fs.readFileSync(SAMPLE, 'utf8')
const feed = JSON.parse(sample)
const ran = (output, prev = core.initialState) => core.updateState({ type: 'UB/COMMAND_RAN', output }, prev)
const go = async (config, opts = {}) => { const r = await runCommand(config, { core, ...opts }); return { ...r, o: core.parseOutput(r.out), state: ran(r.out, opts.prev) } }

// ---------------------------------------------------------------- the shell command, end to end
{
  const r = await go({ theme: 'night', extra: 1 })
  check('command: finds ../kaisflow.config.json, reads the link with sed, fetches the feed with curl', [r.o.config.theme, r.o.body === sample.trim(), r.o.cfgPath.endsWith('kaisflow.config.json')], ['night', true, true])
  check('command: no desktop app on this machine', r.o.app, false)
  check('state: the day is loaded, no problem', [r.state.problem, r.state.feed.goal.id, r.state.cfg.theme], [null, feed.goal.id, 'night'])
  check('app flag: Kai\'s Flow.app found', (await go({}, { app: true })).o.app, true)
  const none = await go(null)
  check('no config file: "nolink" message state', [none.o.cfgPath, none.state.problem, none.state.feed], ['', 'nolink', null])
  check('the shipped example config (placeholder link) is "nolink" until a link is pasted', ran(['@@KF@@CFG x', '@@KF@@JSON', fs.readFileSync(path.join(ROOT, 'kaisflow.config.example.json'), 'utf8').split('\n').join(''), '@@KF@@APP 0', '@@KF@@FEED', ''].join('\n')).problem, 'nolink')
  check('a config that is not JSON: "badconfig"', (await go('{ link: oops')).state.problem, 'badconfig')
  check('a link that is not https (or localhost) is never fetched', (await go({ link: 'http://evil.example/x' })).state.problem, 'nolink')
  check('the link must be there, not just a key somewhere else', (await go('{"note":"link"}')).state.problem, 'nolink')
  check('feed says 401: "unauthorized", and the day goes', (await go({}, { body: '{"error":"unauthorized"}', status: 401 })).state.problem, 'unauthorized')
  check('feed says 429 with no day yet: "busy"', (await go({}, { body: '{"error":"rate_limited"}', status: 429 })).state.problem, 'busy')
  check('not JSON (a 404 page): "bad"', (await go({}, { body: '<html>404</html>' })).state.problem, 'bad')
  check('feed v2: "bad"', (await go({}, { body: '{"v":2}' })).state.problem, 'bad')
  check('server down (connection refused): "offline"', ran(`@@KF@@CFG x\n@@KF@@JSON\n{"link":"http://127.0.0.1:9/functions/v1/widget?t=kf_w_T"}\n@@KF@@APP 0\n@@KF@@FEED\n`).problem, 'offline')
  const good = ran((await runCommand({}, { core })).out)
  check('a bad fetch after a good one keeps the last day on screen', [ran('@@KF@@CFG x\n@@KF@@JSON\n{"link":"http://127.0.0.1:9/functions/v1/widget?t=kf_w_T"}\n@@KF@@APP 0\n@@KF@@FEED\n', good).problem, ran('@@KF@@CFG x\n@@KF@@JSON\n{"link":"http://127.0.0.1:9/functions/v1/widget?t=kf_w_T"}\n@@KF@@APP 0\n@@KF@@FEED\n', good).feed.goal.id], [null, feed.goal.id])
  const cmd = core.command
  check('the command touches nothing but the config (read) and the feed (curl GET); no writes, no sudo', [/(^|[\s;|&])(rm|mv|cp|tee|sudo)\s/.test(cmd), />\s*[^&\s]/.test(cmd.replace(/2>\/dev\/null/g, '').replace(/<\s*"\$cfg"/g, ''))], [false, false])
}

// ---------------------------------------------------------------- ticks, links
{
  const ok = ran(`@@KF@@CFG x\n@@KF@@JSON\n{"link":"https://abc.supabase.co/functions/v1/widget?t=kf_w_TEST"}\n@@KF@@APP 1\n@@KF@@FEED\n${sample}`)
  const s = core.updateState({ type: 'tick', id: feed.goal.id }, ok)
  check('a tick shows at once: the goal counts as done, "2 of 5 done"', [core.view(s).isDone(feed.goal), core.view(s).doneCount()], [true, '2 of 5 done'])
  const once = ran(`@@KF@@CFG x\n@@KF@@JSON\n{"link":"https://abc.supabase.co/functions/v1/widget?t=kf_w_TEST"}\n@@KF@@APP 1\n@@KF@@FEED\n${sample}`, s)
  check('until the feed has it (still open there) the tick stays', Object.keys(once.pending), [feed.goal.id])
  const later = JSON.parse(sample); later.goal.done = true; later.top3[0].done = true; later.done = 2
  const settled = ran(`@@KF@@CFG x\n@@KF@@JSON\n{"link":"https://abc.supabase.co/functions/v1/widget?t=kf_w_TEST"}\n@@KF@@APP 1\n@@KF@@FEED\n${JSON.stringify(later)}`, s)
  check('once the feed has it the tick is dropped (no double count)', [Object.keys(settled.pending), core.view(settled).doneCount()], [[], '2 of 5 done'])
  const failed_ = core.updateState({ type: 'tickFailed', id: feed.goal.id }, s)
  check('a failed POST takes the tick back and says so', [Object.keys(failed_.pending), failed_.note.text], [[], "That didn't tick. Try again in Kai's Flow."])
  const out = `@@KF@@CFG x
@@KF@@JSON
{"link":"https://abc.supabase.co/functions/v1/widget?t=kf_w_TEST"}
@@KF@@APP 1
@@KF@@FEED
${sample}`
  const expired = core.updateState({ type: 'ran', output: out }, { ...s, pending: { [feed.goal.id]: NOW * 1000 - 200000 } })
  check('a tick the server never took clears after 120 s', Object.keys(expired.pending).length, 0)

  const web = 'https://kais-flow.kaidagoat.workers.dev'
  const app = { ...ok, app: true }, site = { ...ok, app: false }
  const id = feed.top3[1].id
  check('app installed: kaisflow://today, /calendar, /focus, /capture, /task/<id>', ['today', 'calendar', 'focus', 'capture', `task/${id}`].map((w) => core.openTarget(app, w)),
    ['kaisflow://today', 'kaisflow://calendar', 'kaisflow://focus', 'kaisflow://capture', `kaisflow://task/${id}`])
  check('no app: the website (capture is /new, a task is /tasks/<id>)', ['today', 'calendar', 'focus', 'capture', `task/${id}`].map((w) => core.openTarget(site, w)),
    [`${web}/today`, `${web}/calendar`, `${web}/focus`, `${web}/new`, `${web}/tasks/${id}`])
  const cur = feed.now_block, nxt = feed.next_blocks[0]
  check('a block opens its task, or the calendar when it has none', [core.openTarget(app, 'now'), core.openTarget(app, 'next1')],
    [cur.task_id ? `kaisflow://task/${cur.task_id}` : 'kaisflow://calendar', nxt.task_id ? `kaisflow://task/${nxt.task_id}` : 'kaisflow://calendar'])
  const empty = JSON.parse(sample); empty.now_block = null; empty.next_blocks = []
  check('nothing on: the calendar', core.openTarget({ ...app, feed: empty }, 'now'), 'kaisflow://calendar')
  check('appUrl in the config changes the website base', core.openTarget({ ...site, cfg: { ...site.cfg, appUrl: 'https://example.test/' } }, 'focus'), 'https://example.test/focus')

}

// ---------------------------------------------------------------- theme, time and words
{
  const base = ran(`@@KF@@CFG x\n@@KF@@JSON\n{"link":"https://abc.supabase.co/functions/v1/widget?t=kf_w_TEST"}\n@@KF@@APP 0\n@@KF@@FEED\n${sample}`)
  const at = (h, theme) => { globalThis.__KF_NOW__ = (NOW + (h - 14) * 3600) * 1000; const v = core.view({ ...base, cfg: { ...base.cfg, theme } }); return v.night }
  check('theme auto: day at 14:00, night at 21:00 and 05:00, day again at 06:30', [at(14, 'auto'), at(21, 'auto'), at(5, 'auto'), at(6.5, 'auto')], [false, true, true, false])
  check('theme day / night are fixed whatever the hour', [at(21, 'day'), at(14, 'night')], [false, true])
  globalThis.__KF_NOW__ = NOW * 1000
  const v = core.view(base)
  check('now is 14:00 on the feed\'s own zone (Cairo), whatever this machine\'s zone is', v.nowM, 14 * 60)
  check('the running block and the next ones', [v.cur.title, v.nexts.map((b) => b.title), v.goalWhen(), v.doneCount()], [feed.now_block.title, feed.next_blocks.map((b) => b.title), '1:30–3:00 PM', '1 of 5 done'])
}

console.log(`\n${passed} passed, ${failed} failed`)
fs.rmSync(tmp, { recursive: true, force: true })
process.exit(failed ? 1 : 0)
