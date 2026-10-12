#!/usr/bin/env node
// ds-check — the design system's house rules as a static, dependency-free drift check over app/src.
// Sources: design-export/Design System.dc.html (§07 radii & motion, §08 house rules, §10 iconography),
// DS Type Touch (type scale + 48px touch floor), DS-CHANGELOG.md (Sep 2026 refresh), Mobile Kit / MK*,
// docs/CONDUCTOR.md IDENTITY GUARD, app/src/styles/tokens/*.css, app/src/components/kit.tsx.
//
//   npm run ds:check                                   summary per rule + top files
//   npm run ds:check -- --list                         every hit, file:line
//   npm run ds:check -- --json                         full machine output
//   npm run ds:check -- --baseline scripts/ds-baseline.json        exit 1 only on hits NOT in the baseline
//   npm run ds:check -- --write-baseline scripts/ds-baseline.json  re-snapshot (after a fix wave lands)
//
// Escape hatch for a deliberate exception: `// ds-ok: <reason>` (CSS: `/* ds-ok: <reason> */`, JSX:
// `{/* ds-ok: <reason> */}`) on the hit's line or in the comment block directly above it. An existing
// `deviation(<date> …)` marker there counts too (CONDUCTOR: "Kai's eyes > export > code").
//
// ponytail: regex + a tiny tokenizer, not a TS/CSS parser — every rule is a heuristic with a known
// ceiling (named per rule below). Upgrade path if noise grows: the TypeScript compiler API (already a dep).

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const RULES = {
  'colour-literal': 'raw hex / rgb() / hsl() outside styles/tokens — use a var(--…) token',
  'svg-colour-literal': 'raw colour in an SVG fill/stroke — fine in an illustration, UI icons use currentColor/tokens',
  'pure-black-white': 'pure black or opaque white — bark --ink-body is the darkest ink, parchment the lightest paper',
  'font-size-literal': 'px font size — use a --fs-* token',
  'line-height-literal': 'px line height — unitless or --lh-*',
  'letter-spacing-literal': 'literal tracking — use --ls-* (mono ≤0.07em on a phone)',
  'font-family-literal': 'font family literal — use var(--font-display|ui|mono|hand)',
  'shadow-literal': 'blurred or raw-coloured shadow — use --shadow-* (crisp rings/hairlines in a token colour are fine)',
  'radius-off-scale': 'radius off the 3 · 6 · 8 · pill scale — no modern rounded cards',
  'motion-property': 'transition/animation on something other than transform/opacity',
  'bold-huge': 'big size at a bold weight — big sizes are quiet weights',
  'hand-in-control': 'Caveat (hand) inside a button/label — marginalia only',
  'hover-only-reveal': 'appears only on hover — needs a touch path',
  'phone-tiny-text': 'under 12px on a phone code path',
  'native-control': 'native <select>/<input type=date|time|datetime-local|checkbox> — use the kit (Select, DatePicker, TimePicker, Checkbox)',
  'confirm-delete': 'confirm()/alert()/"are you sure"/ConfirmCard for a delete — delete is instant Trash + Undo',
  'kit-duplicate': 'second copy of a kit component/hook — import the kit one',
  'hairline-text': '--ink-hairline as a text colour — it is non-text only',
  'unknown-token': 'var(--x) that no token file or component defines',
}

// Kit name → its one home. A function/const with one of these names anywhere else is a second copy.
const KIT = Object.fromEntries([
  ...['Button', 'Chip', 'SectionLabel', 'KeyChip', 'KeyCombo', 'TapeCard', 'Checkbox', 'Star', 'Toggle', 'Segmented', 'BackLink'].map((n) => [n, 'src/components/kit.tsx']),
  ['ActionSheet', 'src/components/ActionSheet.tsx'], ['BottomSheet', 'src/components/BottomSheet.tsx'], ['useIsMobile', 'src/components/BottomSheet.tsx'],
  ['BulkBar', 'src/components/BulkBar.tsx'], ['ContextMenu', 'src/components/ContextMenu.tsx'], ['EmojiText', 'src/components/EmojiText.tsx'],
  ['Float', 'src/components/Float.tsx'], ['Select', 'src/components/Select.tsx'], ['ToastHost', 'src/components/ToastHost.tsx'],
  ['DatePicker', 'src/components/DatePicker.tsx'], ['TimePicker', 'src/components/TimePicker.tsx'], ['NumberField', 'src/components/NumberField.tsx'],
  ['RenameField', 'src/components/RenameField.tsx'], ['ProjectPicker', 'src/components/ProjectPicker.tsx'], ['Icon', 'src/components/Icon.tsx'],
  ['SwipeRow', 'src/features/tasks/SwipeRow.tsx'], ['toastUndo', 'src/lib/undo.ts'],
])
const MOBILE_HOOK = /^use(Is)?(Mobile|Phone|Narrow|SmallScreen|Compact)$/
const NATIVE_OK = new Set(['src/components/kit.tsx', 'src/components/Select.tsx', 'src/components/DatePicker.tsx', 'src/components/TimePicker.tsx'])
const CONTROL_TAGS = ['button', 'label', 'legend', 'option', 'summary', 'Button', 'Chip', 'SectionLabel']
const MOTION_OK = new Set(['transform', 'opacity', 'translate', 'scale', 'rotate', 'visibility'])
const EASING = new Set(['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'step-start', 'step-end', 'allow-discrete', 'normal', 'var', 'fn', 'infinite', 'both', 'forwards', 'backwards', 'alternate', 'reverse', 'running', 'paused'])
const RADIUS_OK = new Set([0, 1, 2, 3, 6, 8])

// ── text plumbing ──────────────────────────────────────────────────────────────────────────────
const blank = (s) => s.replace(/[^\n]/g, ' ')
const stripVars = (v) => { let p; do { p = v; v = v.replace(/var\([^()]*\)/g, 'var') } while (v !== p); return v }
const pxIn = (v) => [...stripVars(v).matchAll(/(?<![\w.#-])(\d*\.?\d+)px\b/g)].map((m) => +m[1])
const splitTop = (v) => { const out = []; let d = 0, s = 0; for (let i = 0; i < v.length; i++) { const c = v[i]; if (c === '(') d++; else if (c === ')') d--; else if (c === ',' && d === 0) { out.push(v.slice(s, i)); s = i + 1 } } out.push(v.slice(s)); return out }

function readString(s, i) { // ' or " — ends at the matching quote, or (unterminated, e.g. an apostrophe in JSX text) at the newline
  const q = s[i]; let j = i + 1
  while (j < s.length) { const c = s[j]; if (c === '\\') j += 2; else if (c === q) return j + 1; else if (c === '\n') return j; else j++ }
  return j
}
function readTemplate(s, i) { // → { end, parts: [[from,to,isExpr]] }
  const parts = []; let j = i + 1, from = j
  while (j < s.length) {
    const c = s[j]
    if (c === '\\') { j += 2; continue }
    if (c === '`') { parts.push([from, j, false]); return { end: j + 1, parts } }
    if (c === '$' && s[j + 1] === '{') {
      parts.push([from, j, false])
      let d = 1, k = j + 2
      while (k < s.length && d > 0) { const ch = s[k]; if (ch === '"' || ch === "'") { k = readString(s, k); continue } if (ch === '`') { k = readTemplate(s, k).end; continue } if (ch === '{') d++; else if (ch === '}') d--; k++ }
      parts.push([j, k, true]); j = from = k; continue
    }
    j++
  }
  parts.push([from, j, false]); return { end: j, parts }
}
// A string literal whose content is CSS (a <style> template, a cssText string) is checked as CSS.
const CSSISH = /(^|[;{\s])-?[a-z][a-z-]*\s*:\s*[^;:{}]+;|@keyframes|[.#\w-][^{}]*\{[^{}]*:[^{}]*\}/i

// → { code: comments blanked, js: code minus CSS strings, css: only CSS (whole file for .css) }.
// Every output keeps every newline. code and js are index-aligned with the source; css is too for a
// .css file, but inside TS a template's ${…} becomes var(--d), so css hits use their own line index.
export function split(text, isCss) {
  if (isCss) { const css = text.replace(/\/\*[\s\S]*?\*\//g, blank); return { code: css, js: blank(css), css } }
  let code = '', js = '', css = '', i = 0
  const n = text.length
  while (i < n) {
    const c = text[i], d = text[i + 1]
    if (c === '/' && (d === '/' || d === '*')) {
      let j = d === '/' ? text.indexOf('\n', i) : text.indexOf('*/', i + 2)
      j = j < 0 ? n : d === '/' ? j : j + 2
      const b = blank(text.slice(i, j)); code += b; js += b; css += b; i = j; continue
    }
    if (c === '"' || c === "'" || c === '`') {
      let j, content
      if (c === '`') { const t = readTemplate(text, i); j = t.end; content = t.parts.map(([a, b, ex]) => (ex ? 'var(--d)' + text.slice(a, b).replace(/[^\n]/g, '') : text.slice(a, b))).join('') }
      else { j = readString(text, i); content = text.slice(i + 1, text[j - 1] === c && j - 1 > i ? j - 1 : j) }
      const raw = text.slice(i, j)
      code += raw
      if (CSSISH.test(content)) { js += blank(raw); css += ' ' + content + ' ' } // same newline count as raw
      else { js += raw; css += blank(raw) }
      i = j; continue
    }
    code += c; js += c; css += c === '\n' ? '\n' : ' '; i++
  }
  return { code, js, css }
}

function lineIndex(text) {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  return (idx) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= idx) lo = m; else hi = m - 1 } return lo }
}

function exprAt(s, i) { // a JS property value: up to the next top-level , ; or unmatched closer
  let d = 0, j = i
  const end = Math.min(s.length, i + 400)
  while (j < end) {
    const c = s[j]
    if (c === '"' || c === "'") { j = readString(s, j); continue }
    if (c === '`') { j = readTemplate(s, j).end; continue }
    if (c === '(' || c === '[' || c === '{') d++
    else if (c === ')' || c === ']' || c === '}') { if (d === 0) break; d-- }
    else if ((c === ',' || c === ';') && d === 0) break
    j++
  }
  return s.slice(i, j)
}
function stringsIn(expr) { // the string values an expression can produce (not the operands of === / !==)
  const out = []; let i = 0
  while (i < expr.length) {
    const c = expr[i]
    if (c !== '"' && c !== "'" && c !== '`') { i++; continue }
    let j, s
    if (c === '`') {
      const t = readTemplate(expr, i); j = t.end
      s = t.parts.map(([a, b, ex]) => (ex ? ' var(--d) ' : expr.slice(a, b))).join('')
      for (const [a, b, ex] of t.parts) if (ex) out.push(...stringsIn(expr.slice(a + 2, b - 1)))
    } else { j = readString(expr, i); s = expr.slice(i + 1, j - 1) }
    if (!/[=!]==?\s*$/.test(expr.slice(0, i)) && !/^\s*[=!]==?/.test(expr.slice(j))) out.push(s)
    i = j
  }
  return out
}
const numbersIn = (expr) => [...expr.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""').matchAll(/(?<![\w.$#-])(\d*\.?\d+)(?![\w.])/g)].map((m) => +m[1])

function openTagEnd(s, i) { // index just past the '>' that closes the JSX opening tag at i; self-closing flag
  let d = 0, j = i + 1
  while (j < s.length) {
    const c = s[j]
    if (c === '"' || c === "'") { j = readString(s, j); continue }
    if (c === '`') { j = readTemplate(s, j).end; continue }
    if (c === '{') d++
    else if (c === '}') d--
    else if (c === '>' && d === 0) return { end: j + 1, self: s[j - 1] === '/' }
    j++
  }
  return { end: s.length, self: true }
}
function elementRanges(js, tags) {
  const out = []
  for (const tag of tags) {
    const open = new RegExp(`<${tag}(?=[\\s/>])`, 'g')
    for (const m of js.matchAll(open)) {
      const { end, self } = openTagEnd(js, m.index)
      if (self) { out.push([m.index, end, tag]); continue }
      const re = new RegExp(`<${tag}(?=[\\s/>])|</${tag}\\s*>`, 'g'); re.lastIndex = end
      let depth = 1, close = js.length, t
      while ((t = re.exec(js))) {
        if (t[0][1] === '/') { if (--depth === 0) { close = t.index + t[0].length; break } }
        else if (!openTagEnd(js, t.index).self) depth++
      }
      out.push([m.index, close, tag])
    }
  }
  return out
}

// Innermost CSS blocks with their @-rule ancestors.
export function cssRules(css) {
  const out = [], stack = []
  let last = 0
  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    if (c === '{') { if (stack.length) stack[stack.length - 1].kids = true; const raw = css.slice(last, i); stack.push({ sel: raw.trim(), selAt: last + raw.search(/\S|$/), start: i + 1, kids: false }); last = i + 1 }
    else if (c === '}') { const b = stack.pop(); if (b && !b.kids) out.push({ sel: b.sel, selAt: b.selAt, body: css.slice(b.start, i), bodyAt: b.start, at: stack.map((s) => s.sel) }); last = i + 1 }
    else if (c === ';') last = i + 1
  }
  return out
}
const decls = (body) => [...body.matchAll(/(?<![\w-])(-?[a-z][a-z-]*)\s*:\s*([^;]*)/gi)].map((m) => ({ prop: m[1].toLowerCase(), value: m[2].trim(), at: m.index }))
const PHONE_MEDIA = /@media[^{]*(\(\s*max-width\s*:\s*([0-6]\d{0,2}|7[0-5]\d|76[0-7])px\s*\)|\(\s*(pointer\s*:\s*coarse|hover\s*:\s*none|any-hover\s*:\s*none)\s*\))/i
const DESKTOP_MEDIA = /@media[^{]*(\(\s*min-width\s*:\s*(76[89]|7[7-9]\d|[89]\d\d|\d{4,})px\s*\)|\(\s*(hover\s*:\s*hover|pointer\s*:\s*fine)\s*\))/i
const lastCompound = (sel) => sel.trim().split(/[\s>+~]+/).pop().replace(/:(hover|focus-within|focus-visible|focus|active)\b/g, '')

// ── value judges ───────────────────────────────────────────────────────────────────────────────
const isBoldWeight = (v) => /\bbold(er)?\b|--fw-semibold/.test(v) || (/^\s*\d+\s*$/.test(v) && +v >= 600)
const isHugeSize = (v) => /--fs-(display-xl|page-title|display-l)\b/.test(v) || pxIn(v).some((p) => p >= 24) || (/^\s*\d+(\.\d+)?\s*$/.test(v) && +v >= 24)
function shadowBad(v) {
  v = stripVars(v.replace(/!important/g, '')).replace(/color-mix\([^()]*\)/g, (m) => (/#|\b(rgb|hsl)a?\(/.test(m) ? 'raw' : 'var')) // a mix of tokens is a token colour
  if (/drop-shadow\(/.test(v)) return true
  return splitTop(v).some((layer) => {
    const t = layer.trim().split(/\s+/).filter((x) => x && x !== 'inset')
    if (!t.length || (t.length === 1 && /^(none|var|inherit|initial|unset|0)$/.test(t[0]))) return false
    const colour = t[t.length - 1]
    if (!/^(var|currentColor|transparent)$/i.test(colour)) return true
    const blur = t.length >= 4 ? parseFloat(t[2]) : 0 // x y [blur [spread]] colour
    return blur !== 0
  })
}
function motionBad(v, isList) { // → offending property names ('all' when none is named)
  const bad = []
  for (const raw of splitTop(v)) {
    const toks = stripVars(raw).replace(/[\w-]+\([^()]*\)/g, 'fn').trim().split(/\s+/).filter(Boolean)
    if (!toks.length || (toks.length === 1 && toks[0] === 'none')) continue
    const ident = toks.filter((t) => /^-?[a-z][a-z-]*$/i.test(t) && !EASING.has(t))
    if (isList) { bad.push(...ident.filter((t) => !MOTION_OK.has(t))); continue }
    if (!ident.length && raw.includes('var(--d)')) continue // the property is a template expression — can't tell
    const prop = ident[0] ?? 'all'
    if (!MOTION_OK.has(prop)) bad.push(prop)
  }
  return bad
}
const trackingBad = (v) => [...stripVars(v).matchAll(/(?<![\w.#-])-?(\d*\.?\d+)(px|em|rem)?\b/g)].some((m) => +m[1] !== 0)
const FAMILY_WORD = /["']|\b(serif|sans-serif|monospace|cursive|system-ui|fantasy|inter|caveat|courier|source|georgia|arial|helvetica|roboto|segoe)\b/i
const radiusBad = (nums) => nums.some((n) => n < 999 && !RADIUS_OK.has(n))

// colour value → token names, for hints ("= --ink-body")
function normColour(lit) {
  const l = lit.toLowerCase().replace(/\s+/g, '')
  if (l[0] === '#') { let h = l.slice(1); if (h.length <= 4) h = [...h].map((c) => c + c).join(''); return '#' + h }
  return l.replace(/(\.\d*?)0+(?=[,)])/g, '$1').replace(/,0?\./g, ',.').replace(/\.(?=[,)])/g, '')
}
const isBlack = (n) => /^#000000(..)?$/.test(n) || /^rgba?\(0,0,0(,|\))/.test(n)
const isWhite = (n) => /^#ffffff(ff)?$/.test(n) || /^rgba?\(255,255,255(\)|,1\))/.test(n)

const HEX = /(?<![\w&$-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g
const FN_COLOUR = /(?<![\w-])(?:rgba?|hsla?)\(\s*[\d.]+[^()]*\)/g
const SVG_ATTR = /\b(fill|stroke|stopColor|stop-color|floodColor|flood-color|lightingColor)\s*(=\s*\{?\s*|:\s*)["'`]?[^"'`]*$/
const JS_KEYS = 'fontSize|lineHeight|letterSpacing|fontFamily|font|fontWeight|boxShadow|textShadow|transition|transitionProperty|color|caretColor|WebkitTextFillColor|background|backgroundColor|borderColor|border|borderTop|borderBottom|borderLeft|borderRight|outline|fill|stroke|accentColor|borderRadius|borderTopLeftRadius|borderTopRightRadius|borderBottomLeftRadius|borderBottomRightRadius|filter'
const JS_PROP = new RegExp(`(?<![\\w$.-])(['"]?)(${JS_KEYS})\\1\\s*:(?!:)\\s*`, 'g')
const COLOUR_PROPS_JS = /^(color|caretColor|WebkitTextFillColor|background|backgroundColor|borderColor|border|borderTop|borderBottom|borderLeft|borderRight|outline|fill|stroke|accentColor|boxShadow|textShadow)$/
const COLOUR_PROPS_CSS = /^(color|caret-color|-webkit-text-fill-color|background(-color)?|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|fill|stroke|accent-color|box-shadow|text-shadow|text-decoration(-color)?)$/

// ── the check ──────────────────────────────────────────────────────────────────────────────────
// ctx (optional, from collectContext): { defined: Set of custom props, lightTokens: Set, handClasses: Set, colourNames: Map }
export function checkSource(file, text, ctx = {}) {
  text = text.replace(/\r\n?/g, '\n')
  const isCss = file.endsWith('.css')
  const { code, js, css } = split(text, isCss)
  const lineOf = lineIndex(text), cssLineOf = isCss ? lineOf : lineIndex(css)
  const raw = text.split('\n'), codeLines = code.split('\n')
  const hits = [], seen = new Set()
  const ok = (s) => /ds-ok:\s*\S|deviation\(/.test(s)
  const accepted = (ln) => { // the line itself, or the comment block directly above it
    if (ok(raw[ln])) return true
    for (let k = ln - 1; k >= 0 && k >= ln - 8; k--) { if (codeLines[k].replace(/[{}\s]/g, '') || !raw[k].trim()) break; if (ok(raw[k])) return true } // {/* … */} counts as a comment line
    return false
  }
  const hit = (rule, idx, hint = '', lo = lineOf) => {
    const ln = lo(idx), key = `${rule}:${ln}:${hint}`
    if (seen.has(key)) return
    seen.add(key)
    hits.push({ rule, file, line: ln + 1, text: raw[ln].trim().replace(/\s+/g, ' ').slice(0, 200), hint, accepted: accepted(ln) })
  }
  const cssHit = (rule, idx, hint) => hit(rule, idx, hint, cssLineOf)
  const BW = /(?<![\w-])(black|white)(?![\w-])/
  const phoneFile = /Phone|Mobile/.test(basename(file))

  // colours — anywhere that isn't a comment
  for (const re of [HEX, FN_COLOUR]) {
    for (const m of code.matchAll(re)) {
      const before = code.slice(code.lastIndexOf('\n', m.index) + 1, m.index)
      const fb = before.match(/var\(\s*(--[\w-]+)\s*,\s*[^()]*$/)
      if (fb && ctx.lightTokens?.has(fb[1])) continue // a dead fallback behind a real day token
      const n = normColour(m[0]), names = ctx.colourNames?.get(n)
      if (isBlack(n) || isWhite(n)) hit('pure-black-white', m.index, m[0])
      else hit(SVG_ATTR.test(before) ? 'svg-colour-literal' : 'colour-literal', m.index, names ? `${m[0]} = ${names.join(' / ')}` : m[0])
    }
  }

  // `font:` shorthand, shared by JS strings and CSS declarations
  function fontShorthand(v, at, h) {
    const sv = stripVars(v)
    if (/^\s*(inherit|initial|unset)?\s*$/.test(sv)) return
    const px = pxIn(v.replace(/\/\s*[\d.]+px/g, ''))
    if (px.length) h('font-size-literal', at, px.join('/'))
    if (/\/\s*[\d.]+px/.test(sv)) h('line-height-literal', at)
    if (FAMILY_WORD.test(sv)) h('font-family-literal', at)
    if (/\b([6-9]00|bold)\b/.test(sv) && (px.some((p) => p >= 24) || /--fs-(display-xl|page-title|display-l)\b/.test(v))) h('bold-huge', at)
  }

  // JS style props (style={{…}}, CSSProperties objects)
  const props = []
  for (const m of js.matchAll(JS_PROP)) {
    const key = m[2], at = m.index, expr = exprAt(js, at + m[0].length)
    const strs = stringsIn(expr), nums = numbersIn(expr), all = strs.join(' , ')
    props.push({ key, at, expr, strs, nums })
    if (key === 'fontSize') {
      const px = [...strs.flatMap(pxIn), ...strs.filter((s) => /^\s*\d*\.?\d+\s*$/.test(s)).map(Number), ...nums].filter((p) => p > 0)
      if (px.length) hit('font-size-literal', at, px.join('/'))
      const ph = expr.match(/\b(?:is)?(?:Mobile|Phone|Narrow|Compact|Coarse|Touch|mobile|phone|narrow|compact|coarse|touch)\w*\s*\?\s*['"]?(\d*\.?\d+)/)
      const dk = expr.match(/\b\w*(?:Desktop|Wide|desktop|wide)\w*\s*\?[^:]+:\s*['"]?(\d*\.?\d+)/)
      const small = [ph?.[1], dk?.[1]].filter((x) => x && +x < 12)
      if (small.length) hit('phone-tiny-text', at, `${small[0]}px`)
      else if (phoneFile && px.some((p) => p < 12)) hit('phone-tiny-text', at, `${Math.min(...px)}px`)
    } else if (key === 'lineHeight') {
      const px = strs.flatMap(pxIn)
      if (px.length) hit('line-height-literal', at, px.join('/') + 'px')
    } else if (key === 'letterSpacing') {
      if (strs.some(trackingBad) || nums.some((x) => x !== 0)) hit('letter-spacing-literal', at, (strs[0] ?? String(nums[0])).trim())
    } else if (key === 'fontFamily') {
      if (strs.some((s) => FAMILY_WORD.test(stripVars(s)))) hit('font-family-literal', at, strs[0])
    } else if (key === 'font') {
      fontShorthand(all, at, hit)
    } else if (key === 'boxShadow' || key === 'textShadow') {
      if (strs.some(shadowBad)) hit('shadow-literal', at)
    } else if (key === 'filter') {
      if (strs.some((s) => /drop-shadow\(/.test(stripVars(s)))) hit('shadow-literal', at, 'drop-shadow')
    } else if (key === 'transition' || key === 'transitionProperty') {
      const bad = strs.flatMap((s) => motionBad(s, key === 'transitionProperty'))
      if (bad.length) hit('motion-property', at, [...new Set(bad)].join(','))
    } else if (/Radius$/.test(key)) {
      const px = [...strs.flatMap(pxIn), ...nums]
      if (radiusBad(px)) hit('radius-off-scale', at, px.join('/'))
    }
    if (/^(color|WebkitTextFillColor|caretColor)$/.test(key) && /--ink-hairline\b/.test(all)) hit('hairline-text', at)
    if (COLOUR_PROPS_JS.test(key) && strs.some((s) => BW.test(stripVars(s)))) hit('pure-black-white', at, all.match(BW)[0])
  }
  // bold + huge inside one inline style object
  for (const m of js.matchAll(/style=\{\{/g)) {
    const a = m.index + m[0].length
    const end = (() => { let d = 1, j = a; while (j < js.length && d > 0) { const c = js[j]; if (c === '"' || c === "'") { j = readString(js, j); continue } if (c === '`') { j = readTemplate(js, j).end; continue } if (c === '{') d++; else if (c === '}') d--; j++ } return j })()
    const inObj = props.filter((p) => p.at > a && p.at < end)
    const w = inObj.find((p) => p.key === 'fontWeight'), s = inObj.find((p) => p.key === 'fontSize')
    if (w && s && [...w.strs, ...w.nums.map(String)].some(isBoldWeight) && [...s.strs, ...s.nums.map(String)].some(isHugeSize)) hit('bold-huge', s.at)
  }

  // SVG attributes in JSX
  for (const m of js.matchAll(/\bfontSize=\{?\s*["']?(\d*\.?\d+)/g)) hit('font-size-literal', m.index, m[1])
  for (const m of js.matchAll(/\b(fill|stroke)=\{?\s*["'](black|white)["']/g)) hit('pure-black-white', m.index, m[2])
  for (const m of js.matchAll(/(["'`])\s*(black|white)\s*\1/g)) hit('pure-black-white', m.index, m[2])

  // CSS declarations (.css files + CSS strings inside TS)
  for (const m of css.matchAll(/(?<![\w-])(-?[a-z][a-z-]*)\s*:\s*([^;{}]*)/gi)) {
    const prop = m[1].toLowerCase(), v = m[2].replace(/!important/g, ''), at = m.index
    if (prop === 'font-size') { const px = pxIn(v); if (px.length) cssHit('font-size-literal', at, px.join('/')) }
    else if (prop === 'line-height') { if (pxIn(v).length) cssHit('line-height-literal', at, pxIn(v).join('/') + 'px') }
    else if (prop === 'letter-spacing') { if (trackingBad(v)) cssHit('letter-spacing-literal', at, v.trim()) }
    else if (prop === 'font-family') { if (FAMILY_WORD.test(stripVars(v))) cssHit('font-family-literal', at, v.trim().slice(0, 40)) }
    else if (prop === 'font') fontShorthand(v, at, cssHit)
    else if (prop === 'box-shadow' || prop === 'text-shadow') { if (shadowBad(v)) cssHit('shadow-literal', at) }
    else if (prop === 'filter' || prop === '-webkit-filter') { if (/drop-shadow\(/.test(stripVars(v))) cssHit('shadow-literal', at, 'drop-shadow') }
    else if (prop === 'transition' || prop === '-webkit-transition' || prop === 'transition-property') {
      const bad = motionBad(v, prop === 'transition-property'); if (bad.length) cssHit('motion-property', at, [...new Set(bad)].join(','))
    } else if (/radius$/.test(prop)) { const px = pxIn(v); if (radiusBad(px)) cssHit('radius-off-scale', at, px.join('/')) }
    if (/^(color|-webkit-text-fill-color|caret-color)$/.test(prop) && /--ink-hairline\b/.test(v)) cssHit('hairline-text', at)
    if (COLOUR_PROPS_CSS.test(prop) && BW.test(stripVars(v))) cssHit('pure-black-white', at, v.match(BW)[0])
  }

  // CSS rule level: keyframes, bold-huge, hand in a control, phone sizes, hover reveals
  const rules = cssRules(css)
  const shows = (r) => decls(r.body).some((d) => (d.prop === 'opacity' && parseFloat(d.value) >= 1) || (d.prop === 'visibility' && d.value.startsWith('visible')))
  const kfSeen = new Set()
  for (const r of rules) {
    const ds = decls(r.body), get = (p) => ds.find((d) => d.prop === p)
    const kf = r.at.find((a) => /^@(-webkit-)?keyframes\b/.test(a))
    if (kf) {
      const bad = ds.map((d) => d.prop).filter((p) => !MOTION_OK.has(p) && !/^(animation-timing-function|offset|will-change)$/.test(p))
      if (bad.length && !kfSeen.has(kf)) { kfSeen.add(kf); cssHit('motion-property', css.lastIndexOf('@', r.selAt), `${kf} → ${[...new Set(bad)].join(',')}`) }
      continue
    }
    const w = get('font-weight'), s = get('font-size')
    if (w && s && isBoldWeight(w.value) && isHugeSize(s.value)) cssHit('bold-huge', r.bodyAt + s.at)
    if (/--font-hand|caveat/i.test(get('font-family')?.value ?? '') && /button|\blabel\b|-btn\b|\bbtn|__label|-label\b|chip/i.test(r.sel)) cssHit('hand-in-control', r.selAt, r.sel.slice(0, 40))
    if (r.at.some((a) => PHONE_MEDIA.test(a))) {
      for (const d of ds) if (d.prop === 'font-size' || d.prop === 'font') { const px = pxIn(d.value.replace(/\/\s*[\d.]+px/g, '')).filter((p) => p < 12); if (px.length) cssHit('phone-tiny-text', r.bodyAt + d.at, `${px[0]}px`) }
    }
  }
  for (const r of rules) {
    if (!r.sel.includes(':hover') || !shows(r)) continue
    for (const sel of r.sel.split(',').filter((x) => x.includes(':hover'))) {
      const target = lastCompound(sel)
      const hidden = rules.find((h) => !h.sel.includes(':hover') && h.sel.split(',').some((x) => lastCompound(x) === target) && decls(h.body).some((d) => (d.prop === 'opacity' && parseFloat(d.value) === 0) || (d.prop === 'visibility' && d.value.startsWith('hidden'))))
      if (!hidden || hidden.at.some((a) => DESKTOP_MEDIA.test(a))) continue
      if (!rules.some((t) => t.at.some((a) => PHONE_MEDIA.test(a)) && t.sel.includes(target) && shows(t))) { cssHit('hover-only-reveal', r.selAt, target); break }
    }
  }
  for (const m of js.matchAll(/\b(\w*[hH]over\w*)\s*(?:===?\s*[\w.]+\s*)?\?\s*1\s*:\s*0\b|\{\s*(\w*[hH]over\w*)\s*(?:===?\s*[\w.]+\s*)?&&/g)) hit('hover-only-reveal', m.index, m[1] || m[2])

  if (!isCss) {
    // Caveat inside a control element (heuristic: inside the same JSX element)
    const ranges = elementRanges(js, CONTROL_TAGS)
    const handAt = [...js.matchAll(/--font-hand\b|\bCaveat\b/g)].map((m) => m.index)
    if (ctx.handClasses?.size) for (const m of js.matchAll(/className=\{?\s*["'`]([^"'`]*)["'`]/g)) if (m[1].split(/\s+/).some((c) => ctx.handClasses.has(c))) handAt.push(m.index)
    for (const idx of handAt) { const r = ranges.find(([a, b]) => idx > a && idx < b); if (r) hit('hand-in-control', idx, `<${r[2]}>`) }

    // native controls the kit replaces
    if (!NATIVE_OK.has(file)) {
      for (const m of js.matchAll(/<select(?=[\s>])/g)) hit('native-control', m.index, 'select')
      for (const m of js.matchAll(/<input(?=[\s/>])/g)) {
        const t = js.slice(m.index, openTagEnd(js, m.index).end).match(/\btype=\{?\s*["'](date|time|datetime-local|checkbox)["']/)
        if (t) hit('native-control', m.index, t[1])
      }
    }

    // ask-before-delete
    const ownConfirm = /\b(?:function|const|let)\s+(confirm|alert)\b/.exec(js)?.[1]
    for (const m of js.matchAll(/(?<![\w$.])(window\.|globalThis\.)?(confirm|alert)\s*\(/g)) {
      if (!m[1] && (m[2] === ownConfirm || /function\s+$/.test(js.slice(Math.max(0, m.index - 10), m.index)))) continue
      hit('confirm-delete', m.index, `${m[2]}()`)
    }
    for (const m of js.matchAll(/are you sure/gi)) hit('confirm-delete', m.index, 'are you sure')
    // A ConfirmCard for something that goes to Trash (undoable) is drift; one for an irreversible purge is the
    // export's "Confirm · destructive only" (Overlays.dc.html) and stays.
    for (const [a] of elementRanges(js, ['ConfirmCard'])) {
      const open = js.slice(a, openTagEnd(js, a).end)
      if (/delet|remov|trash|erase/i.test(open) && !/permanent|for good|can'?t be undone|cannot be undone/i.test(open)) hit('confirm-delete', a, 'ConfirmCard')
    }

    // second copies of kit pieces
    let dupHook = false
    for (const m of js.matchAll(/(?:^|\n)[ \t]*(?:export\s+)?(?:default\s+)?(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:\(|function\b|async\b|memo\(|forwardRef\(|React\.))/g)) {
      const name = m[1] || m[2], home = KIT[name] ?? (MOBILE_HOOK.test(name) ? KIT.useIsMobile : null)
      if (home && home !== file) { hit('kit-duplicate', m.index + m[0].indexOf(name), `${name} → ${home}`); if (home === KIT.useIsMobile) dupHook = true }
    }
    if (file !== KIT.useIsMobile && !dupHook) for (const m of js.matchAll(/matchMedia\(\s*["']\(max-width:\s*767px\)["']/g)) hit('kit-duplicate', m.index, 'matchMedia(767) → useIsMobile')
    if (!file.startsWith('src/components/')) for (const m of js.matchAll(/\bcreatePortal\(/g)) hit('kit-duplicate', m.index, 'createPortal → Float / BottomSheet')
  }

  // tokens nobody defines
  if (ctx.defined) for (const m of code.matchAll(/var\(\s*(--[\w-]+)/g)) if (!ctx.defined.has(m[1]) && !/^--(fc|tw)-/.test(m[1])) hit('unknown-token', m.index, m[1])

  return hits.sort((x, y) => x.line - y.line)
}

// ── whole-tree pass ────────────────────────────────────────────────────────────────────────────
const TOKENS_DIR = 'src/styles/tokens/'
export function collectContext(files) { // files: [{ file, text }]
  const defined = new Set(), lightTokens = new Set(), handClasses = new Set(), colourNames = new Map()
  for (const { file, text } of files) {
    const isCss = file.endsWith('.css'), { code, css } = split(text.replace(/\r\n?/g, '\n'), isCss)
    for (const m of code.matchAll(/(--[\w-]+)["']?\s*:|setProperty\(\s*["'](--[\w-]+)|["'](--[\w-]+)["']/g)) defined.add(m[1] || m[2] || m[3])
    if (file.startsWith(TOKENS_DIR)) {
      const dark = file.endsWith('colors.dark.css')
      for (const m of code.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))\s*;/g)) {
        if (!dark) lightTokens.add(m[1])
        const n = normColour(m[2]), name = dark ? `night ${m[1]}` : m[1]
        colourNames.set(n, [...(colourNames.get(n) ?? []), name])
      }
      if (!dark) for (const m of code.matchAll(/(--[\w-]+)\s*:/g)) lightTokens.add(m[1])
    }
    for (const r of cssRules(css)) if (/--font-hand\b/.test(r.body) && /^[.\w\s,-]+$/.test(r.sel)) for (const c of r.sel.matchAll(/\.([\w-]+)/g)) handClasses.add(c[1])
  }
  return { defined, lightTokens, handClasses, colourNames }
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out) }
    else if (/\.(tsx?|css)$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

export function scan(appDir) {
  const files = walk(join(appDir, 'src')).map((p) => ({ file: relative(appDir, p).split('\\').join('/'), text: readFileSync(p, 'utf8') }))
  const ctx = collectContext(files)
  const hits = files.filter((f) => !f.file.startsWith(TOKENS_DIR)).flatMap((f) => checkSource(f.file, f.text, ctx))
  hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule))
  return { files: files.length, hits }
}

// Baseline = file → rule → line text → count (a multiset keyed by the line's text, not its number), so
// moving code up or down doesn't make an old hit "new".
export function toBaseline(hits) {
  const b = {}
  for (const h of hits.filter((x) => !x.accepted)) {
    const r = ((b[h.file] ??= {})[h.rule] ??= {})
    r[h.text] = (r[h.text] ?? 0) + 1
  }
  return b
}
export function diffBaseline(hits, base) {
  const left = structuredClone(base), fresh = []
  for (const h of hits.filter((x) => !x.accepted)) { const r = left[h.file]?.[h.rule]; if (r?.[h.text] > 0) r[h.text]--; else fresh.push(h) }
  const fixed = Object.values(left).flatMap((f) => Object.values(f).flatMap((r) => Object.values(r))).reduce((a, b) => a + b, 0)
  return { fresh, fixed }
}

function main(argv) {
  const t0 = Date.now()
  const appDir = join(fileURLToPath(import.meta.url), '..', '..')
  const arg = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null }
  const { files, hits } = scan(appDir)
  const live = hits.filter((h) => !h.accepted)
  const fmt = (h) => `${h.file}:${h.line}  ${h.rule}${h.hint ? `  [${h.hint}]` : ''}  ${h.text.slice(0, 110)}`

  if (argv.includes('--json')) { process.stdout.write(JSON.stringify({ rules: RULES, files, hits }, null, 1) + '\n'); return 0 }
  const wb = arg('--write-baseline')
  if (wb) {
    const about = 'ds-check grandfathered hits: file → rule → line text → count. CI fails only on hits not listed here. Re-snapshot after a fix wave: npm run ds:check -- --write-baseline scripts/ds-baseline.json'
    writeFileSync(join(appDir, wb), JSON.stringify({ about, hits: toBaseline(hits) }, null, 1) + '\n')
    console.log(`ds-check · wrote ${live.length} hits to ${wb}`); return 0
  }
  const bl = arg('--baseline')
  if (bl) {
    const { fresh, fixed } = diffBaseline(hits, JSON.parse(readFileSync(join(appDir, bl), 'utf8')).hits)
    console.log(`ds-check · ${files} files · ${live.length} hits · ${fresh.length} new vs ${bl} · ${fixed} fixed since · ${Date.now() - t0}ms`)
    for (const h of fresh) console.log('NEW  ' + fmt(h) + `\n     ${RULES[h.rule]}`)
    if (fresh.length) console.log('\nFix them, or mark a deliberate exception with `// ds-ok: <reason>` (CSS: /* ds-ok: <reason> */).')
    return fresh.length ? 1 : 0
  }
  if (argv.includes('--list')) { for (const h of live) console.log(fmt(h)); return 0 }

  console.log(`ds-check · ${files} files · ${live.length} hits (+${hits.length - live.length} accepted via ds-ok/deviation) · ${Date.now() - t0}ms\n`)
  console.log('rule                      hits  files')
  for (const [rule, about] of Object.entries(RULES)) {
    const r = live.filter((h) => h.rule === rule)
    console.log(`${rule.padEnd(24)} ${String(r.length).padStart(5)}  ${String(new Set(r.map((h) => h.file)).size).padStart(5)}  ${about}`)
  }
  const byFile = Object.entries(Object.groupBy(live, (h) => h.file)).map(([f, hs]) => [f, hs.length]).sort((a, b) => b[1] - a[1]).slice(0, 15)
  console.log('\ntop files')
  for (const [f, n] of byFile) console.log(`${String(n).padStart(6)}  ${f}`)
  console.log('\n--list for every hit · --json for machine output · --baseline <file> to gate only new drift')
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2))
