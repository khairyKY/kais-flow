// cal-scroll: some scrolls are no one's — the calendar's glide re-centring its drawn days (or putting the same day
// back after a redraw) moves its scrollers without anything moving on screen. A menu or popover that closes on scroll
// (its anchor drifted) lets those through.

const QUIET_MS = 150

/** `el` is about to scroll without anything moving on screen. */
export function markQuietScroll(el: HTMLElement): void {
  el.dataset.kfQuietScroll = String(performance.now())
}

/** A scroll event from inside an element marked just now (the event lands a frame after the write). */
export function isQuietScroll(e: Event): boolean {
  const t = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-kf-quiet-scroll]') : null
  return !!t && performance.now() - Number(t.dataset.kfQuietScroll) < QUIET_MS
}
