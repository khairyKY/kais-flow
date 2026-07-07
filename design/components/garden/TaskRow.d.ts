/**
 * TaskRow — the horizontal task line used everywhere:
 * checkbox · title · optional metadata chips · optional trailing status.
 *
 * @startingPoint section="Garden" subtitle="Task line — open, done, overdue" viewport="800x260"
 */
export interface TaskRowProps {
  title: string;
  done?: boolean;
  onToggle?: (next: boolean) => void;
  /** Metadata chips: project tag, place, duration. */
  chips?: Array<{ label: string; dot?: string }>;
  /** Trailing status: `overdue Nd`, `↻ weekly`, timestamp, streak count. */
  status?: string;
  /** Handwritten margin note aligned to the right of the row. */
  note?: string;
  /** Optional species/state for a leading flower badge (instead of check). */
  flower?: { species: string; state?: string };
}
