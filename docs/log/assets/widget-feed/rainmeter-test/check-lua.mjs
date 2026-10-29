// Runs kaisflow.lua and the test skin's script outside Rainmeter (Lua in JS: fengari), on the sample feed and
// the error bodies the function answers. A fake SKIN stands in for Rainmeter's.
//   node check-lua.mjs <path to fengari's package dir>
// Fengari is Lua 5.3; kaisflow.lua sticks to what Lua 5.1 (Rainmeter's) has too.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = createRequire(import.meta.url)(process.argv[2] ?? 'fengari')
const skinDir = path.join(here, 'KaisFlowTest') + path.sep
const sample = fs.readFileSync(path.join(here, '..', 'sample-feed.json'), 'utf8')

function run(code, globals) {
  const L = lauxlib.luaL_newstate()
  lualib.luaL_openlibs(L)
  for (const [k, v] of Object.entries(globals)) {
    lua.lua_pushstring(L, to_luastring(v))
    lua.lua_setglobal(L, to_luastring(k))
  }
  if (lauxlib.luaL_dostring(L, to_luastring(code)) !== 0) throw new Error(to_jsstring(lua.lua_tostring(L, -1)))
  return to_jsstring(lua.lua_tostring(L, -1))
}

let failed = 0
const check = (name, got, want) => {
  const ok = got === want
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n  got:  ${got}\n  want: ${want}`}`)
}
const K = `local K = dofile(DIR .. 'kaisflow.lua')`

check('parse: the sample feed', run(`${K}
  local f = assert(K.parse(BODY))
  return table.concat({ f.goal.title, #f.top3, tostring(f.top3[3].done), f.tasks[1].title, f.now_block.start_hm, f.next_blocks[1].title, K.rgb(f.next_blocks[1].color), tostring(f.load.over_min), f.plant, tostring(f.goal.priority), tostring(f.top3[2].priority) }, '|')`, { DIR: skinDir, BODY: sample }),
  'Draft the essay — “intro”|3|true|Pay rent|13:30|Standup|129,173,237|0|bloom|1|nil')
check('parse: 401', run(`${K} local f, e = K.parse('{"error":"unauthorized"}') return tostring(f) .. ' ' .. e`, { DIR: skinDir }), 'nil unauthorized')
check('parse: not JSON', run(`${K} local f, e = K.parse('<html>502</html>') return tostring(f) .. ' ' .. e`, { DIR: skinDir }), 'nil bad_json')
check('decode: escapes, \\u, numbers', run(`${K} local t = K.decode('{"a":"x\\\\"y\\\\n\\\\u00e9\\\\ud83c\\\\udf3f","b":[1,-2.5,3e2,true,false,null],"c":{}}') return t.a .. '|' .. t.b[1] .. '|' .. t.b[2] .. '|' .. t.b[3] .. '|' .. tostring(t.b[4]) .. tostring(t.b[5]) .. '|' .. tostring(t.b[6])`, { DIR: skinDir }),
  'x"y\né🌿|1|-2.5|300.0|truefalse|nil')
check('link: from a pasted line', run(`${K} return K.link('  https://abc.supabase.co/functions/v1/widget?t=kf_w_AbC-_9 ') or 'nil'`, { DIR: skinDir }), 'https://abc.supabase.co/functions/v1/widget?t=kf_w_AbC-_9')
check('tickCommand', run(`${K} return K.tickCommand('https://x/functions/v1/widget?t=kf_w_1', 'abc')`, { DIR: skinDir }), '-s -f -X POST "https://x/functions/v1/widget?t=kf_w_1&tick=abc"')

// The test skin's own script, with a fake SKIN: what its one meter would say.
const SKIN = `
  local opts, bangs = {}, {}
  SKIN = {
    GetVariable = function(_, k) return VARS[k] end,
    Bang = function(_, b, m, o, v) if b == '!SetOption' then opts[m .. '.' .. o] = v end bangs[#bangs + 1] = b .. ' ' .. tostring(m) end,
    GetMeasure = function(_, m) return { GetStringValue = function() return BODY end } end,
  }
  VARS = { CURRENTPATH = DIR, Link = LINK }
  dofile(DIR .. 'KaisFlowTest.lua')
  Initialize()
  if BODY ~= '' then Parse() end
  return (opts['MeterText.Text'] or '') .. ' || ' .. table.concat(bangs, ',')`
check('test skin: the sample', run(SKIN, { DIR: skinDir, BODY: sample, LINK: 'https://abc.supabase.co/functions/v1/widget?t=kf_w_x' }),
  'Goal: Draft the essay — “intro”#CRLF#Now: 13:30-15:00 Draft the essay — “intro”#CRLF#- Pay rent#CRLF#- Water the plants#CRLF#1 of 5 done (20%) - bloom || !EnableMeasure MeasureFeed,!SetOption MeterText,!UpdateMeter MeterText,!Redraw nil')
check('test skin: no link yet', run(SKIN, { DIR: skinDir, BODY: '', LINK: '' }).split(' || ')[0], 'Paste your Widget link into Link= in KaisFlowTest.ini')
check('test skin: a revoked link', run(SKIN, { DIR: skinDir, BODY: '{"error":"unauthorized"}', LINK: 'https://abc.supabase.co/functions/v1/widget?t=kf_w_x' }).split(' || ')[0], 'This link was revoked or mistyped -- make a new one in Settings')

console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
