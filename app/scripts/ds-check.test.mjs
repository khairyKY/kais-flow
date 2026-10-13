// Fixtures for the ds-check rule matchers (scripts/ds-check.mjs). One small source per rule: it fires on
// the drift and stays quiet on the sanctioned form next to it.
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkSource, collectContext, diffBaseline, toBaseline } from './ds-check.mjs'

const dir = new URL('../src/styles/tokens/', import.meta.url)
const TOKENS = readdirSync(dir).map((f) => ({ file: `src/styles/tokens/${f}`, text: readFileSync(new URL(f, dir), 'utf8') }))
const run = (file, text, extra = []) => checkSource(file, text, collectContext([...TOKENS, ...extra, { file, text }]))
const rules = (file, text, extra) => run(file, text, extra).filter((h) => !h.accepted).map((h) => h.rule)
const tsx = (body) => rules('src/features/x/X.tsx', body)
const css = (body) => rules('src/features/x/x.css', body)

describe('colours', () => {
  it('flags raw hex/rgb outside the tokens and names the token it equals', () => {
    const [h] = run('src/features/x/X.tsx', `const s = { color: '#2a2420' }`)
    expect(h.rule).toBe('colour-literal')
    expect(h.hint).toContain('--ink-body')
    expect(css('.a { background: rgba(60, 52, 38, 0.2); }')).toEqual(['colour-literal'])
  })
  it('accepts tokens, color-mix of tokens and a dead fallback behind a day token', () => {
    expect(tsx(`<div style={{ color: 'var(--ink-body)', background: 'color-mix(in srgb, var(--ink-body) 10%, transparent)' }} />`)).toEqual([])
    expect(css('.a { color: var(--ink-body, #2a2420); }')).toEqual([])
    expect(css('.a { color: var(--sky-panel, #F0EBD8); }')).toEqual(['colour-literal']) // night-only token: the fallback is the day colour
  })
  it('splits SVG fills from UI colour and calls out pure black/white', () => {
    expect(tsx(`<path fill="#A8C09A" />`)).toEqual(['svg-colour-literal'])
    expect(tsx(`<div style={{ color: '#fff' }} />`)).toEqual(['pure-black-white'])
    expect(css('.a { box-shadow: 0 2px 4px rgba(0,0,0,0.3); }')).toContain('pure-black-white')
    expect(css('.a { color: black; white-space: nowrap; }')).toEqual(['pure-black-white'])
    expect(css('.a { mask-image: linear-gradient(black, transparent); }')).toEqual([])
  })
  it('ignores comments', () => {
    expect(tsx(`// the export's #2a2420 bark\nconst a = 1`)).toEqual([])
    expect(css('/* #2a2420 */ .a { color: var(--ink-body); }')).toEqual([])
  })
})

describe('type', () => {
  it('flags px font sizes in JSX, CSS and CSS-in-template, not tokens', () => {
    expect(tsx(`<p style={{ fontSize: 11 }} />`)).toEqual(['font-size-literal'])
    expect(tsx(`<p style={{ fontSize: '13px' }} />`)).toEqual(['font-size-literal'])
    expect(tsx(`<p style={{ fontSize: 'var(--fs-meta)', fontSize2: 4 }} />`)).toEqual([])
    expect(css('.a { font-size: 10.5px; }')).toEqual(['font-size-literal'])
    expect(tsx('const s = `\n.a { font-size: 9px; }\n`')).toEqual(['font-size-literal'])
    expect(tsx(`<text fontSize="10">x</text>`)).toEqual(['font-size-literal'])
  })
  it('flags px line-height but not unitless', () => {
    expect(tsx(`<p style={{ lineHeight: '18px' }} />`)).toEqual(['line-height-literal'])
    expect(tsx(`<p style={{ lineHeight: 1.4 }} />`)).toEqual([])
  })
  it('flags literal tracking, not tokens or 0', () => {
    expect(tsx(`<p style={{ letterSpacing: '0.18em' }} />`)).toEqual(['letter-spacing-literal'])
    expect(css('.a { letter-spacing: 1px; }')).toEqual(['letter-spacing-literal'])
    expect(tsx(`<p style={{ letterSpacing: 'var(--ls-meta)' }} />`)).toEqual([])
    expect(css('.a { letter-spacing: 0; }')).toEqual([])
  })
  it('flags font family literals, including inside the font shorthand', () => {
    expect(tsx(`<p style={{ fontFamily: "'Inter Tight', sans-serif" }} />`)).toEqual(['font-family-literal'])
    expect(css('.a { font-family: Georgia, serif; }')).toEqual(['font-family-literal'])
    expect(tsx(`<p style={{ fontFamily: 'var(--font-mono)' }} />`)).toEqual([])
    expect(tsx(`<p style={{ fontFamily: 'inherit' }} />`)).toEqual([])
    expect(tsx(`<p style={{ font: '600 14px var(--font-ui)' }} />`)).toEqual(['font-size-literal'])
  })
  it('flags a big size at a bold weight, not a quiet one', () => {
    expect(tsx(`<h1 style={{ fontSize: 30, fontWeight: 600 }} />`)).toEqual(['font-size-literal', 'bold-huge'])
    expect(tsx(`<h1 style={{ fontSize: 'var(--fs-page-title)', fontWeight: 'var(--fw-semibold)' }} />`)).toEqual(['bold-huge'])
    expect(tsx(`<h1 style={{ fontSize: 'var(--fs-page-title)', fontWeight: 500 }} />`)).toEqual([])
    expect(css('.t { font-size: var(--fs-display-xl); font-weight: 700; }')).toEqual(['bold-huge'])
  })
  it('flags Caveat inside a button or label, not beside it', () => {
    expect(tsx(`<button onClick={go}><span style={{ fontFamily: 'var(--font-hand)' }}>hi</span></button>`)).toEqual(['hand-in-control'])
    expect(tsx(`<Button style={{ fontFamily: 'var(--font-hand)' }}>hi</Button>`)).toEqual(['hand-in-control'])
    expect(tsx(`<div><button>Go</button><p style={{ fontFamily: 'var(--font-hand)' }}>note</p></div>`)).toEqual([])
    const hand = { file: 'src/features/x/h.css', text: '.note-hand { font-family: var(--font-hand); }' }
    expect(rules('src/features/x/X.tsx', `<label><i className="note-hand">x</i></label>`, [hand])).toEqual(['hand-in-control'])
    expect(css('.save-btn { font-family: var(--font-hand); }')).toEqual(['hand-in-control'])
  })
  it('flags under-12px on phone paths only', () => {
    expect(css('@media (max-width: 767px) { .a { font-size: 11px; } }')).toEqual(['font-size-literal', 'phone-tiny-text'])
    expect(css('@media (min-width: 768px) { .a { font-size: 11px; } }')).toEqual(['font-size-literal'])
    expect(tsx(`<p style={{ fontSize: isMobile ? 11 : 10 }} />`)).toEqual(['font-size-literal', 'phone-tiny-text'])
    expect(tsx(`<p style={{ fontSize: isMobile ? 12 : 10 }} />`)).toEqual(['font-size-literal'])
    expect(rules('src/features/x/PhoneSheet.tsx', `<p style={{ fontSize: 10 }} />`)).toEqual(['font-size-literal', 'phone-tiny-text'])
  })
  it('flags --ink-hairline as text, not as a line', () => {
    expect(tsx(`<p style={{ color: 'var(--ink-hairline)' }} />`)).toEqual(['hairline-text'])
    expect(css('.a { color: var(--ink-hairline); }')).toEqual(['hairline-text'])
    expect(css('.a { border-color: var(--ink-hairline); text-decoration-color: var(--ink-hairline); }')).toEqual([])
  })
})

describe('surfaces & motion', () => {
  it('flags blurred or raw shadows, keeps tokens and crisp token-coloured rings', () => {
    expect(tsx(`<div style={{ boxShadow: '0 4px 12px rgba(60,52,38,0.2)' }} />`)).toEqual(['colour-literal', 'shadow-literal'])
    expect(tsx(`<div style={{ boxShadow: 'var(--shadow-card)' }} />`)).toEqual([])
    expect(tsx(`<div style={{ boxShadow: 'inset 0 0 0 1.5px var(--acc-sage-text)' }} />`)).toEqual([])
    expect(tsx(`<div style={{ boxShadow: '0 4px 12px var(--ink-body)' }} />`)).toEqual(['shadow-literal'])
    expect(css('.a { filter: drop-shadow(0 2px 2px var(--ink-body)); }')).toEqual(['shadow-literal'])
    expect(css('.a { filter: var(--shadow-drop-sm); }')).toEqual([])
  })
  it('flags radii off the 3/6/8/pill scale', () => {
    expect(tsx(`<div style={{ borderRadius: 16 }} />`)).toEqual(['radius-off-scale'])
    expect(css('.a { border-radius: 12px; }')).toEqual(['radius-off-scale'])
    expect(css('.a { border-radius: 3px; } .b { border-radius: 999px; } .c { border-radius: 50%; } .d { border-radius: var(--radius-md); }')).toEqual([])
  })
  it('flags transitions and keyframes that move anything but transform/opacity', () => {
    expect(css('.a { transition: background var(--dur-quick) var(--ease-out); }')).toEqual(['motion-property'])
    expect(css('.a { transition: all 200ms; }')).toEqual(['motion-property'])
    expect(css('.a { transition: var(--dur-quick); }')).toEqual(['motion-property']) // no property named = all
    expect(css('.a { transition: transform var(--dur-quick) cubic-bezier(0.2, 0, 0, 1), opacity 200ms; }')).toEqual([])
    expect(css('.a { transition-property: opacity, height; }')).toEqual(['motion-property'])
    expect(tsx(`<div style={{ transition: 'width 200ms ease' }} />`)).toEqual(['motion-property'])
    expect(tsx(`<div style={{ transition: \`transform \${d}ms\` }} />`)).toEqual([])
    expect(css('@keyframes grow { from { height: 0; } to { height: 10px; } }')).toEqual(['motion-property'])
    expect(css('@keyframes fade { from { opacity: 0; transform: none; } to { opacity: 1; } }')).toEqual([])
  })
  it('flags hover-only reveals unless a touch rule shows them', () => {
    const reveal = '.row-x { opacity: 0; }\n.row:hover .row-x { opacity: 1; }'
    expect(css(reveal)).toEqual(['hover-only-reveal'])
    expect(css(reveal + '\n@media (hover: none) { .row-x { opacity: 1; } }')).toEqual([])
    expect(css('@media (hover: hover) { .row-x { opacity: 0; } }\n.row:hover .row-x { opacity: 1; }')).toEqual([])
    expect(tsx(`<span style={{ opacity: hovered ? 1 : 0 }} />`)).toEqual(['hover-only-reveal'])
    expect(tsx(`{isHovered && <Menu />}`)).toEqual(['hover-only-reveal'])
  })
})

describe('kit & behaviour', () => {
  it('flags native controls the kit replaces, but not in the kit itself', () => {
    expect(tsx(`<select value={v}><option>a</option></select>`)).toEqual(['native-control'])
    expect(tsx(`<input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />`)).toEqual(['native-control'])
    expect(tsx(`<input type="text" onKeyDown={(e) => e.key === 'Enter' && go()} />`)).toEqual([])
    expect(rules('src/components/kit.tsx', `<input type="checkbox" />`)).toEqual([])
    expect(tsx(`// a native <input type="date"> would be wrong here\nconst a = 1`)).toEqual([])
  })
  it('flags ask-before-delete', () => {
    expect(tsx(`if (window.confirm('Delete?')) remove()`)).toEqual(['confirm-delete'])
    expect(tsx(`alert('done')`)).toEqual(['confirm-delete'])
    expect(tsx(`<p>Are you sure?</p>`)).toEqual(['confirm-delete'])
    expect(tsx(`<ConfirmCard title="Delete this entry?" onConfirm={del} />`)).toEqual(['confirm-delete'])
    expect(tsx(`<ConfirmCard title="Sign out?" onConfirm={out} />`)).toEqual([])
    expect(tsx(`const confirm = () => 1\nconfirm()`)).toEqual([])
  })
  it('flags second copies of kit pieces', () => {
    expect(tsx(`function useIsMobile() { return matchMedia('(max-width: 767px)').matches }`)).toEqual(['kit-duplicate'])
    expect(tsx(`export function Checkbox() { return null }`)).toEqual(['kit-duplicate'])
    expect(tsx(`const Toggle = ({ on }) => null`)).toEqual(['kit-duplicate'])
    expect(tsx(`const mq = matchMedia('(max-width: 767px)')`)).toEqual(['kit-duplicate'])
    expect(rules('src/components/BottomSheet.tsx', `export function useIsMobile() { return matchMedia('(max-width: 767px)').matches }`)).toEqual([])
    expect(tsx(`function TaskCheckbox() { return null }`)).toEqual([])
  })
  it('flags tokens nobody defines', () => {
    expect(tsx(`<p style={{ color: 'var(--colour-primary)' }} />`)).toEqual(['unknown-token'])
    expect(tsx(`<p style={{ color: 'var(--ink-body)', ['--row-h' as string]: '4px' }}><i style={{ height: 'var(--row-h)' }} /></p>`)).toEqual([])
  })
})

describe('escapes & baseline', () => {
  it('accepts ds-ok and deviation markers on the line or in the comment directly above', () => {
    const [same] = run('src/features/x/X.tsx', `<p style={{ fontSize: 11 }} /> // ds-ok: matches the export's tag`)
    expect(same.accepted).toBe(true)
    expect(run('src/features/x/x.css', '/* deviation(2026-07-18 audit): Kai\n   wants it bigger */\n.a { font-size: 30px; }')[0].accepted).toBe(true)
    expect(run('src/features/x/X.tsx', `{/* ds-ok: chart axis */}\n<text fontSize="9" />`)[0].accepted).toBe(true)
    expect(run('src/features/x/X.tsx', `// ds-ok:\n<p style={{ fontSize: 11 }} />`)[0].accepted).toBe(false) // a reason is required
    expect(run('src/features/x/X.tsx', `// ds-ok: reason\nconst a = 1\n<p style={{ fontSize: 11 }} />`)[0].accepted).toBe(false) // only the block directly above
  })
  it('the baseline gates only new hits and survives code moving', () => {
    const before = run('src/features/x/X.tsx', `<p style={{ fontSize: 11 }} />`)
    const base = toBaseline(before)
    const moved = run('src/features/x/X.tsx', `\n\n<p style={{ fontSize: 11 }} />`)
    expect(diffBaseline(moved, base).fresh).toEqual([])
    const grown = run('src/features/x/X.tsx', `<p style={{ fontSize: 11 }} />\n<p style={{ fontSize: 11 }} />\n<i style={{ color: '#2a2420' }} />`)
    expect(diffBaseline(grown, base).fresh.map((h) => h.rule)).toEqual(['font-size-literal', 'colour-literal'])
    expect(diffBaseline([], base).fixed).toBe(1)
  })
})
