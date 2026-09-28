import { DatePicker } from './DatePicker'

export interface ScheduleMenuProps {
  position: { x: number; y: number }
  /** Names the thing being scheduled — the picker's meta line (MK Date Picker). */
  title?: string
  /** The current due instant: preselects its day and ticks the matching quick pick. */
  value?: string | null
  onClose: () => void
  /** A picked day lands at 09:00 Cairo unless a time was set. `durationMin` comes only when
   * `duration` was passed and the time sheet changed it — write both in one row. */
  onSchedule: (iso: string, durationMin?: number) => void
  /** Adds a Someday row — the date picker of the ⋯ menu / bulk bar, where Snooze's Someday used to live. */
  onSomeday?: () => void
  /** Adds No date. */
  onClear?: () => void
  /** Shows the time sheet's duration chips. */
  duration?: number | null
}

/** Pick date… — the ⋯ menu, the swipe's Pick date, the bulk bars and the task sheet's Schedule row:
 * the MK Date Picker with its quick picks and Set time (a full sheet on a phone, a popover on desktop). */
export function ScheduleMenu({ position, title, value, onClose, onSchedule, onSomeday, onClear, duration }: ScheduleMenuProps) {
  return (
    <DatePicker
      title="Due date"
      meta={title}
      value={value ?? null}
      quick
      withTime
      position={position}
      onPick={onSchedule}
      onSomeday={onSomeday}
      onClear={onClear}
      duration={duration}
      onClose={onClose}
    />
  )
}
