/**
 * GoalCard — the hero "Goal of the Day" card. Gold parchment, gold washi tape,
 * gold-bordered checkbox, single-priority title with a Caveat aside.
 *
 * @startingPoint section="Garden" subtitle="Gold hero card — one per day" viewport="520x260"
 */
export interface GoalCardProps {
  title: string;
  /** Small mono caption sitting above the title. */
  eyebrow?: string;
  /** Handwritten Caveat note beneath (why this matters). */
  why?: string;
  done?: boolean;
  onToggle?: (next: boolean) => void;
  /** Optional trailing meta right of the title (streak, duration…). */
  meta?: string;
}
