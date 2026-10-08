import type { WidgetSnapshot } from './snapshot'

// The Android shell's `window.KaisFlowWidgets` (native/android/java/.../widgets/WidgetBridge.java):
// the widgets' snapshot goes in, the ticks made on the home screen come out. Kept free of the app's
// stores so the shell and sign-out can import it eagerly. Everywhere but the Android app: no-ops.

export interface Native {
  setSnapshot(json: string): void
  takeQueue(): string
}

export function native(): Native | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as { KaisFlowWidgets?: Native }).KaisFlowWidgets
}

export function widgetsAvailable(): boolean {
  return !!native()
}

/** What the widgets show when nobody is signed in (S4). */
export const SIGNED_OUT = { v: 1, signedIn: false } as const

export function pushSnapshot(s: WidgetSnapshot | typeof SIGNED_OUT): void {
  native()?.setSnapshot(JSON.stringify(s))
}

/** Signed out: the widgets show S4 (the seal and "Open Kai's Flow") and forget the day. */
export function widgetsSignedOut(): void {
  pushSnapshot(SIGNED_OUT)
}

let chatStarter: string | null = null

export function setChatStarter(text: string | null): void {
  chatStarter = text
}

/** Ask's chip: the question ChatPanel starts with (typed, not sent). */
export function takeChatStarter(): string | null {
  const s = chatStarter
  chatStarter = null
  return s
}
