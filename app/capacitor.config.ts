import type { CapacitorConfig } from '@capacitor/cli'

// The Android app (docs/phases/M1-android.md, M1b): the same dist/ as the web app inside Capacitor's
// shell. CI generates android/ from this (`cap add android`) and copies native/android/ over it.
const config: CapacitorConfig = {
  appId: 'com.kaisflow.garden', // never change: Android ties installs and updates to it
  appName: 'Kai’s Flow', // U+2019 — a bare ' breaks Android's strings.xml
  webDir: 'dist',
  // Origin https://localhost: a secure context (mic, crypto.randomUUID), on the functions' CORS list.
  server: { androidScheme: 'https' },
}

export default config
