// The goal tick's fireworks — Kai's pick C4, "C2, with arcs and a fall" (design-export/Worth a look and
// fireworks.html, 2026-10-31), ported one-for-one: C2's three bursts (spark count, size, spread, brightness),
// the glow at 700 ms for 640 ms, ~1.35 s in all. Each shell flies an angled arc out of the task — the first
// from the checkbox, the others from along the title, leaning left or right — to its burst point above the
// card, and each burst sinks 38 px as it fades. Colours: three different palette C swatches or gold per tick,
// none from the tick before (tokens only, read by the browser — no colour value here).
//
// It draws on a fixed layer over the page (never clipped by the card's lists or scrollers), the glow masked
// to the ring around the card so it never tints the card itself; on the phone the layer stops at the top
// bar. Paused while the page is hidden; the layer is gone once the last animation ends. Effects off or
// reduced motion: the glow only (a fade). Only tasks/api completeOne calls it — a real tick by the user,
// never a load, a sync or an Undo.
import { motionOnNow } from '../lib/motion'
import { uiZoom } from '../lib/uiScale'

const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)'
const POOL = ['rose', 'clay', 'ochre', 'olive', 'fern', 'lagoon', 'cornflower', 'iris', 'wine', 'rust', 'honey', 'moss', 'pine', 'tide', 'indigo', 'heather', 'gold']
const tok = (n: string) => (n === 'gold' ? 'var(--acc-gold-warm)' : `var(--blk-${n})`) // ds-ok: palette C, --blk-<name> (POOL)
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
let lastCols: string[] = []

/** Three distinct swatches from palette C + gold, none of them the last tick's. */
export function pickColours(): string[] {
  const bag = POOL.filter((c) => !lastCols.includes(c))
  const out: string[] = []
  while (out.length < 3) out.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0])
  return (lastCols = out)
}

function piece(layer: HTMLElement, css: string): HTMLElement {
  const s = document.createElement('span')
  s.style.cssText = 'position:absolute;left:0;top:0;' + css
  layer.appendChild(s)
  return s
}

/** The goal row on screen: the one holding the box just clicked, else the first drawn. */
function goalRow(taskId: string): HTMLElement | null {
  const active = document.activeElement?.closest<HTMLElement>(`[id="task-${taskId}"]`) // ponytail: ids are uuids, nothing to escape
  return active ?? document.getElementById(`task-${taskId}`)
}

/** Plays the fireworks over the goal's row (`task-<id>`). Nothing on screen → nothing plays. */
export function goalFireworks(taskId: string): void {
  if (typeof document === 'undefined') return
  const row = goalRow(taskId)
  const card = row?.querySelector<HTMLElement>('.kf-page') ?? row
  if (!card) return
  // Rects are visual px; the layer is laid out in the root zoom's px (lib/uiScale uiZoom) — divide.
  const z = uiZoom()
  const rect = (el: Element) => { const b = el.getBoundingClientRect(); return new DOMRect(b.left / z, b.top / z, b.width / z, b.height / z) }
  const c = rect(card)
  if (!c.width || c.bottom < 0 || c.top > innerHeight / z) return
  const cbx = card.querySelector('[role="checkbox"]'), ttl = card.querySelector('.td-goal-title, .tp-gs-title, .tp-goal-title')
  const box = cbx ? rect(cbx) : new DOMRect(c.left + 16, c.top + 16, 20, 20)
  const title = ttl ? rect(ttl) : new DOMRect(box.right + 12, box.top, Math.max(40, c.right - box.right - 60), box.height)
  const quiet = !motionOnNow()
  const phone = innerWidth / z <= 767

  // The layer: the whole viewport; the stage sits on the card. Phone: nothing above the top bar.
  const layer = document.createElement('div')
  layer.className = 'kf-goal-fw'
  layer.setAttribute('aria-hidden', 'true')
  const barEl = phone ? document.querySelector('.tp-bar') : null
  const bar = barEl ? rect(barEl) : undefined
  layer.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden;${bar && bar.bottom > 0 ? `clip-path:inset(${Math.round(bar.bottom)}px 0 0 0);` : ''}`
  const stage = piece(layer, `left:${c.left}px;top:${c.top}px;width:${c.width}px;height:${c.height}px`)
  document.body.appendChild(layer)
  const anims: Animation[] = []

  // The glow (C2's): a halo round the card — the mask cuts the card's own box out, so it never tints it.
  const glow = piece(stage, 'left:-40px;top:-40px;right:-40px;bottom:-40px;width:auto;height:auto;padding:40px;box-sizing:border-box;opacity:0;'
    + 'background:radial-gradient(closest-side at 55% 45%,color-mix(in oklch,var(--acc-gold-warm) 50%,transparent) 0%,transparent 100%);'
    + 'mask:linear-gradient(var(--ink-body) 0 0) content-box exclude,linear-gradient(var(--ink-body) 0 0);'
    + '-webkit-mask:linear-gradient(var(--ink-body) 0 0) content-box,linear-gradient(var(--ink-body) 0 0);-webkit-mask-composite:xor')
  anims.push(glow.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'scale(1.02)', offset: 0.35 }, { opacity: 0, transform: 'scale(1.02)' }], { duration: quiet ? 900 : 640, delay: quiet ? 0 : 700, easing: 'ease-out', fill: 'both' }))

  if (!quiet) {
    const cols = pickColours().map(tok)
    // [burst height px, size] for left, centre, right — C2's; phone: on the card's top edge, short of the right side.
    const SHOTS: [number, number][] = phone ? [[-4, 0.8], [-6, 1], [-5, 0.9]] : [[-38, 0.8], [-52, 1], [-42, 0.9]]
    const LEFT = phone ? [0.2, 0.44, 0.68] : [0.2, 0.5, 0.8]
    const bx = box.left - c.left, by = box.top - c.top, tx = title.left - c.left, ty = title.top - c.top
    SHOTS.forEach(([H, k], j) => {
      const px = LEFT[j] * c.width
      const L = piece(stage, `left:${px}px;width:0;height:0`)
      const col = cols[j], t0 = Math.max(0, j * 200 + rnd(-20, 20))
      const lo = tx + 8, hi = tx + title.width - 8
      let sx = bx + box.width / 2, sy = by + box.height / 2
      if (j) {
        const d = (Math.random() < 0.5 ? -1 : 1) * rnd(40, 80)
        sx = px - d < lo || px - d > hi ? px + d : px - d
        sx = Math.min(hi, Math.max(lo, sx))
        sy = ty + 10
      }
      // A ballistic arc: x at a steady speed, y slowing as it climbs (exact quadratic ease-out); the streak points along the launch.
      const dx = sx - px, deg = (Math.atan2(-dx, 2 * (sy - H)) * 180) / Math.PI
      const ax = piece(L, ''), ay = piece(ax, '')
      piece(ay, `width:2px;height:12px;margin:-6px 0 0 -1px;border-radius:2px;background:linear-gradient(to top,transparent,${col});transform:rotate(${deg.toFixed(1)}deg)`)
      anims.push(ax.animate([{ opacity: 0, transform: `translateX(${dx}px)` }, { opacity: 1, offset: 0.2 }, { opacity: 1, transform: 'translateX(0)', offset: 0.92 }, { opacity: 0, transform: 'translateX(0)' }], { duration: 340, delay: t0, fill: 'both' }))
      anims.push(ay.animate([{ transform: `translateY(${sy}px)`, easing: 'cubic-bezier(.333,.667,.667,1)' }, { transform: `translateY(${H}px)`, offset: 0.92 }, { transform: `translateY(${H}px)` }], { duration: 340, delay: t0, fill: 'both' }))
      // The burst sinks as it fades (exact y = t² curve).
      const n = Math.round(14 * k), r0 = rnd(0, 30), fall = piece(L, '')
      anims.push(fall.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(38px)' }], { duration: 540, delay: t0 + 320, easing: 'cubic-bezier(.333,0,.667,.333)', fill: 'both' }))
      for (let i = 0; i < n; i++) {
        const a = i * (360 / n) + r0
        const el = piece(fall, `top:${H}px;width:2px;height:${(9 * k).toFixed(1)}px;margin:-4.5px 0 0 -1px;border-radius:1px;background:${col}`)
        anims.push(el.animate([
          { opacity: 0, transform: `rotate(${a}deg) translateY(-2px) scaleY(.4)` },
          { opacity: 1, offset: 0.15 },
          { opacity: 0.9, transform: `rotate(${a}deg) translateY(${-20 * k}px) scaleY(1)`, offset: 0.6 },
          { opacity: 0, transform: `rotate(${a}deg) translateY(${-27 * k}px) scaleY(.5)` },
        ], { duration: 540, delay: t0 + 320, easing: EASE, fill: 'both' }))
      }
    })
  }

  // A hidden page pauses it (no catch-up jump on return); the layer goes when the last one ends.
  const onVis = () => anims.forEach((a) => (document.hidden ? a.pause() : a.play()))
  document.addEventListener('visibilitychange', onVis)
  if (document.hidden) onVis()
  const end = () => {
    document.removeEventListener('visibilitychange', onVis)
    layer.remove()
  }
  Promise.all(anims.map((a) => a.finished)).then(end, end)
}
