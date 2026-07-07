/**
 * Checkbox — 17px rounded square. Empty = task open; filled dark = done.
 * Companion to TaskRow. Rendered as a `<span>`, not an <input>.
 */
export interface CheckboxProps {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  /** Slightly larger goal-of-day variant with gold border. */
  variant?: 'default' | 'goal';
}
