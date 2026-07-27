// Motion 5f — "seed plant". The one primitive WB-1 was allowed to add; it sits next to the
// F4 primitives in lib/motion.ts (frozen, hence its own file) and follows the same shape as
// animateRowRemoval: a plain function over Web Animations, no React, no deps.
//
// Spec (MOTION_RETROFIT §5f): drop 260ms ease-in + puff 180ms. "Seed drops from the submit
// affordance, puffs into the row it becomes." Fires on creating any item — task, project,
// journal entry, event, routine.
//
// It deliberately animates a throwaway element positioned over the submit control rather than
// the created row: the row does not exist in the DOM until the mutation round-trips and the
// list re-renders, so anchoring to it would either mis-time or need a subscription per surface.

export function seedPlant(from: HTMLElement | null | undefined, motionOn: boolean) {
  if (!from || !motionOn || typeof document === 'undefined') return
  const r = from.getBoundingClientRect()
  if (!r.width && !r.height) return

  const seed = document.createElement('span')
  seed.setAttribute('aria-hidden', 'true')
  // A seed, not a dot: the botanical set never uses perfect circles.
  seed.style.cssText =
    `position:fixed;left:${r.left + r.width / 2 - 3}px;top:${r.bottom - 3}px;` +
    'width:6px;height:7px;border-radius:60% 40% 55% 45%;' +
    'background:var(--acc-moss,#6E7F5B);pointer-events:none;z-index:9999'
  document.body.appendChild(seed)

  if (typeof seed.animate !== 'function') {
    seed.remove()
    return
  }

  const drop = seed.animate(
    [
      { transform: 'translateY(0) scale(0.7)', opacity: 0 },
      { transform: 'translateY(6px) scale(1)', opacity: 1, offset: 0.25 },
      { transform: 'translateY(34px) scale(1)', opacity: 1 },
    ],
    // WAAPI does not resolve var() in easing — these are the literal --ease-in/--ease-out values.
    { duration: 260, easing: 'cubic-bezier(0.55, 0, 0.68, 0.53)', fill: 'forwards' },
  )
  drop.onfinish = () => {
    // Puff: the seed opens out and dissolves into the row it becomes.
    const puff = seed.animate(
      [
        { transform: 'translateY(34px) scale(1)', opacity: 0.9 },
        { transform: 'translateY(34px) scale(2.6)', opacity: 0 },
      ],
      { duration: 180, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', fill: 'forwards' },
    )
    puff.onfinish = () => seed.remove()
    puff.oncancel = () => seed.remove()
  }
  drop.oncancel = () => seed.remove()
}
