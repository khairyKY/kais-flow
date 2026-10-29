// A small stand-in for Rainmeter, for checks and previews (Rainmeter itself can't run headless):
//   readSkin(widget)        the skin's .ini with its @Includes, MeterStyles and variables, in draw order
//   runSkin(widget, opts)   runs widget.lua (in fengari, Lua 5.3; the script sticks to 5.1) against a fake SKIN
//                           and returns every option, visibility and variable it set, plus its bang log
// Includes the package doesn't ship (GlassVars.inc, GlassCard.inc, Snap.inc, Kai's fonts) are read from Kai's Glass set.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const PKG = path.resolve(here, '..', 'Glass')                      // what the .rmskin installs into Skins\Glass
export const RES = path.join(PKG, '@Resources') + path.sep
export const GLASS = process.env.KF_GLASS ?? path.join(process.env.USERPROFILE ?? '', 'OneDrive', 'Documents', 'Rainmeter', 'Skins', 'Glass')
export const KAI_RES = path.join(GLASS, '@Resources') + path.sep
export const WIDGETS = ['Today', 'NowNext', 'DayBar', 'Goal', 'Next']

// '#@#x' -> the package's @Resources\x, else Kai's (the Glass set's own files)
export function resolveRes(p) {
  const rel = p.replace(/^#@#/, '')
  const mine = path.join(RES, rel)
  if (fs.existsSync(mine)) return { file: mine, from: 'package' }
  const kais = path.join(KAI_RES, rel)
  return { file: kais, from: fs.existsSync(kais) ? 'glass' : 'missing' }
}

export function readText(file) {
  const b = fs.readFileSync(file)
  if (b[0] === 0xff && b[1] === 0xfe) return b.subarray(2).toString('utf16le')
  return b.toString('utf8').replace(/^﻿/, '')
}

// ---------------------------------------------------------------- the .ini
export function readSkin(widget) {
  const file = path.join(PKG, 'KaisFlow', widget, `${widget}.ini`)
  const sections = new Map() // name -> { name, opts: Map, order }
  const includes = []
  const parse = (f, depth) => {
    let cur = null
    for (const raw of readText(f).split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith(';')) continue
      const sec = line.match(/^\[(.+)\]$/)
      if (sec) {
        cur = sections.get(sec[1]) ?? { name: sec[1], opts: new Map(), order: sections.size }
        sections.set(sec[1], cur)
        continue
      }
      const i = line.indexOf('=')
      if (i < 0 || !cur) continue
      const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim()
      if (/^@include/i.test(k)) {
        const r = resolveRes(v)
        includes.push({ path: v, ...r })
        if (r.from !== 'missing' && depth < 5) parse(r.file, depth + 1) // the parent keeps its own section after
        continue
      }
      cur.opts.set(k, v)
    }
  }
  parse(file, 0)
  const vars = Object.fromEntries(sections.get('Variables')?.opts ?? [])
  vars['@'] = RES
  const all = [...sections.values()]
  const styleOf = (s) => (s.opts.get('MeterStyle') ?? '').split('|').map((x) => x.trim()).filter(Boolean)
  const merged = (s) => {
    const o = new Map()
    for (const st of styleOf(s)) for (const [k, v] of sections.get(st)?.opts ?? []) o.set(k, v)
    for (const [k, v] of s.opts) o.set(k, v)
    return Object.fromEntries(o)
  }
  const meters = all.filter((s) => s.opts.has('Meter')).map((s) => ({ name: s.name, opts: merged(s), styles: styleOf(s) }))
  const measures = all.filter((s) => s.opts.has('Measure')).map((s) => ({ name: s.name, opts: merged(s) }))
  return { widget, file, sections, vars, meters, measures, includes }
}

// #Var# (nested) and [\xNNNN] character references, as Rainmeter reads an option
export function subst(v, vars, self) {
  let s = String(v ?? '')
  for (let i = 0; i < 8; i++) {
    const n = s.replace(/#([A-Za-z0-9_@]+)#/g, (m, k) => (k === 'CURRENTSECTION' ? self ?? m : k in vars ? vars[k] : m))
    if (n === s) break
    s = n
  }
  return s.replace(/\[\\x([0-9A-Fa-f]{4,5})\]/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
}
// (formulas) -> numbers, innermost first
export function formulas(s) {
  for (let i = 0; i < 20; i++) {
    const n = s.replace(/\(([-+*/.\d\s]+)\)/g, (_, e) => String(+Function(`return (${e})`)().toFixed(4)))
    if (n === s) return s
    s = n
  }
  return s
}

// ---------------------------------------------------------------- running widget.lua
let fengari
function lua() {
  fengari ??= createRequire(import.meta.url)(process.env.FENGARI ?? 'fengari')
  return fengari
}

// a JS value as a Lua literal (strings as byte escapes, so UTF-8 survives)
function luaLit(v) {
  if (v === null || v === undefined) return 'nil'
  if (typeof v === 'boolean' || typeof v === 'number') return String(v)
  if (typeof v === 'string') return '"' + [...Buffer.from(v, 'utf8')].map((b) => (b >= 32 && b < 127 && b !== 34 && b !== 92 ? String.fromCharCode(b) : `\\${String(b).padStart(3, '0')}`)).join('') + '"'
  if (Array.isArray(v)) return '{' + v.map(luaLit).join(',') + '}'
  return '{' + Object.entries(v).map(([k, x]) => `[${luaLit(k)}]=${luaLit(x)}`).join(',') + '}'
}

const FAKE = String.raw`
OPT, HID, LOG, FILES = {}, {}, {}, FILES or {}
local realDate, realTime = os.date, os.time
-- the clock: NOW (epoch s) on the user's zone (OFFSET s east of UTC), whatever this machine's zone is
os.time = function(t) if t then return realTime(t) end return NOW end
-- (fengari's os.date ignores a '!' in string formats, so they're built from '!*t' here)
local DAYS = { 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday' }
os.date = function(f, t)
  f, t = f or '%c', t or NOW
  local d = realDate('!*t', t + OFFSET)
  if f == '*t' then return d end
  return (f:gsub('%%(%a)', { H = string.format('%02d', d.hour), M = string.format('%02d', d.min), d = string.format('%02d', d.day),
    A = DAYS[d.wday], a = DAYS[d.wday]:sub(1, 3) }))
end
io = io or {}
io.open = function(p, mode)
  if mode == 'w' then return { write = function(_, s) FILES[p] = s end, close = function() end } end
  if FILES[p] == nil then return nil end
  return { read = function() return FILES[p] end, close = function() end }
end
SKIN = {}
function SKIN:GetVariable(k) return V[k] end
function SKIN:GetX() return POS[1] end
function SKIN:GetY() return POS[2] end
function SKIN:GetMeasure(m) return { GetStringValue = function() if m == 'MeasureTick' then return TICKOUT end return BODY end } end
function SKIN:GetMeter(m) return { GetH = function() return HEIGHTS[m] or 18 end } end
function SKIN:Bang(b, ...)
  local a = { ... }
  for i = 1, #a do a[i] = tostring(a[i]) end
  LOG[#LOG + 1] = b .. (#a > 0 and (' ' .. table.concat(a, ' | ')) or '')
  if b == '!SetOption' then OPT[a[1]] = OPT[a[1]] or {}; OPT[a[1]][a[2]] = a[3]
  elseif b == '!SetVariable' then V[a[1]] = a[2]
  elseif b == '!ShowMeter' then HID[a[1]] = false
  elseif b == '!HideMeter' then HID[a[1]] = true
  elseif b == '!ShowMeterGroup' or b == '!HideMeterGroup' then
    for m, g in pairs(GROUPS) do if g[a[1]] then HID[m] = (b == '!HideMeterGroup') end end
  elseif b == '!Move' then POS = { tonumber(a[1]), tonumber(a[2]) }
  end
end
local function json(v)
  if type(v) == 'table' then
    local out = {}
    for k, x in pairs(v) do out[#out + 1] = string.format('%q', tostring(k)):gsub('\\\n', '\\n') .. ':' .. json(x) end
    return '{' .. table.concat(out, ',') .. '}'
  end
  if type(v) == 'boolean' then return tostring(v) end
  return (string.format('%q', tostring(v)):gsub('\\\n', '\\n'))
end
function DUMP() return json({ opt = OPT, hid = HID, vars = V, files = FILES, pos = POS, log = LOG }) end
`

// The feed's own clock zone, from a block: its from_min (local) against its start (epoch)
export function offsetOf(feed) {
  const d = (feed.day ?? [])[0]
  if (!d) return 0
  return ((d.from_min * 60 - (d.start % 86400)) % 86400 + 86400 + 43200) % 86400 - 43200
}

/**
 * Runs a widget. opts:
 *   body      the feed text (WebParser's string), or null for "never fetched"
 *   link      the saved link file's content (null = none)
 *   feedURL   the FeedURL variable
 *   now, offset   the clock (epoch s) and the zone (s east of UTC)
 *   heights   meter -> GetH() (a preview measures them in the browser)
 *   steps     Lua calls after Initialize, e.g. ['Parse()', "Tick('Row1Cb')"]; {tickOut} sets curl's output
 *   pos       the skin's [x, y] on screen
 */
export function runSkin(widget, opts = {}) {
  const { lua: L_, lauxlib, lualib, to_luastring, to_jsstring } = lua()
  const skin = readSkin(widget)
  const vars = { ...skin.vars, FeedURL: opts.feedURL ?? skin.vars.FeedURL ?? '', ...(opts.vars ?? {}) }
  const groups = Object.fromEntries(skin.meters.map((m) => [m.name, Object.fromEntries(String(m.opts.Group ?? '').split('|').map((g) => [g.trim(), true]))]))
  const files = {}
  if (opts.link != null) files[RES + 'KaisFlow\\link.txt'] = opts.link
  const L = lauxlib.luaL_newstate()
  lualib.luaL_openlibs(L)
  const run = (code, name) => {
    if (lauxlib.luaL_loadbuffer(L, to_luastring(code), null, to_luastring(name)) !== 0 || L_.lua_pcall(L, 0, 1, 0) !== 0) {
      throw new Error(`${name}: ${to_jsstring(L_.lua_tostring(L, -1))}`)
    }
    const r = L_.lua_isstring(L, -1) ? to_jsstring(L_.lua_tostring(L, -1)) : undefined
    L_.lua_pop(L, 1)
    return r
  }
  run(`V = ${luaLit(vars)}; GROUPS = ${luaLit(groups)}; FILES = ${luaLit(files)}; HEIGHTS = ${luaLit(opts.heights ?? {})};
    POS = ${luaLit(opts.pos ?? [0, 0])}; NOW = ${opts.now ?? 1793271600}; OFFSET = ${opts.offset ?? 10800};
    BODY = ${luaLit(opts.body ?? '')}; TICKOUT = ''`, 'setup')
  run(FAKE, 'fake-skin')
  // V['@'] ends in a backslash; fengari's dofile reads it through node's fs, which takes it on Windows
  run(readText(path.join(RES, 'KaisFlow', 'widget.lua')), 'widget.lua')
  run('Initialize()', 'Initialize')
  for (const s of opts.steps ?? []) {
    if (typeof s === 'object') { run(`TICKOUT = ${luaLit(s.tickOut ?? '')} ${s.body != null ? `BODY = ${luaLit(s.body)}` : ''}`, 'step'); continue }
    run(s, s)
  }
  const out = JSON.parse(run('return DUMP()', 'dump'))
  const arr = (o) => Object.keys(o).sort((a, b) => a - b).map((k) => o[k]) // Lua arrays come back as {1:..}
  return { skin, opt: out.opt, hid: out.hid, vars: out.vars, files: out.files, pos: arr(out.pos).map(Number), log: arr(out.log) }
}

// The meters as Rainmeter would draw them after the run: options merged, variables and formulas resolved.
export function finalMeters(r) {
  return r.skin.meters.map((m) => {
    const o = { ...m.opts, ...(r.opt[m.name] ?? {}) }
    const hidden = m.name in r.hid ? r.hid[m.name] : o.Hidden === '1'
    const res = {}
    for (const [k, v] of Object.entries(o)) res[k] = formulas(subst(v, r.vars, m.name))
    return { name: m.name, type: o.Meter, opts: res, raw: o, hidden }
  })
}
