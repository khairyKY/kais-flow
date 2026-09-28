import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { isCapacitorShell } from './platform'

// Haptics for the native shell (DS-CHANGELOG §3: long-press 400ms → haptic). A no-op on the web —
// the browser's vibrate() is a buzz, not a tick, and iOS Safari has none.

/** A light tick: a toggle, a snap, a picker step. */
export function tick(): void {
  if (isCapacitorShell()) void Haptics.impact({ style: ImpactStyle.Light })
}

/** Something landed: a task done, a capture filed. */
export function confirm(): void {
  if (isCapacitorShell()) void Haptics.notification({ type: NotificationType.Success })
}

/** A hold took: selection mode, a block picked up. */
export function longPress(): void {
  if (isCapacitorShell()) void Haptics.impact({ style: ImpactStyle.Medium })
}
