// Where the app is running (M1, docs/phases/M1-android.md). The same dist/ ships as the web app
// and inside the Tauri native shells (Android APK, later Windows/macOS); the shell injects
// `window.__TAURI_INTERNALS__` before any app code runs, so this is settled at import time.

/** True inside a Tauri shell (the APK / desktop app), false in a browser tab or installed PWA. */
export function isNativeShell(w: object | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  return !!w && '__TAURI_INTERNALS__' in w
}
