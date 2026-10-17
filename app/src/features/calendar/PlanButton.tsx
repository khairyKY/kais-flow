import { dragGuard } from './dragGuard'

/** Plan ▾ on a card (the rail, the day tray, planning mode): a dragGuard'd span, so pressing it never
 *  starts the card's drag. D13's tonal isn't used: it shows on a hovered (bone) row, where tonal is
 *  4.42:1 by day (AA 4.5) — Kai's call. */
export function PlanButton({ title, onPlan }: { title: string; onPlan: (x: number, y: number) => void }) {
  const open = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    onPlan(r.left, r.bottom + 4)
  }
  return (
    <span
      role="button"
      tabIndex={0}
      aria-haspopup="menu"
      aria-label={`Plan ${title}`}
      className="cal-plan-btn kf-button kf-button--secondary kf-press"
      ref={(el) => dragGuard(() => el && open(el))(el)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        open(e.currentTarget)
      }}
    >
      Plan ▾
    </span>
  )
}
