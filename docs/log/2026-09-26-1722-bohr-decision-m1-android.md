---
date: 2026-09-26T17:22Z
author: conductor (bohr)
type: decision
topic: m1-android (the mobile version)
related: design-integration/PLAN.md (Platform target, SHIP P2), docs/phases/M1-android.md
---

# Decision: "the mobile version" = the Tauri v2 Android APK, built on GitHub

**Kai (2026-09-26):** "after you are done continue looping to enhance the experience and fix bugs, if that is ready start building the mobile version".

**Already decided by Kai (2026-07-12, `design-integration/PLAN.md`):**
- "no browser-installed apps … Start = web + Android APK";
- Tauri v2, Windows/macOS next, iOS later (9/yr + a Mac);
- SHIP P2 is the packaging workstream.

So this is not a new product call. It's executing an existing one. It's a new phase: `docs/phases/M1-android.md`.

## Why GitHub Actions builds it

- This sandbox blocks `dl.google.com` (403), so there's no Android SDK here, and it has only 3 GB of free disk.
- GitHub's Ubuntu runner ships the SDK + NDK, and it's free for a public repo.
- It's a **build** job: artifact only, no production access.
- A *published Release* also gets the APK attached. That's Kai's click.

## Choices

- **Identifier `com.kaisflow.garden`:** stable forever.
- **Origin `https://tauri.localhost`:** already on the functions' CORS allowlist (FIX-0 planned ahead), so there's **no backend change**.
- **arm64 only.**
- **Public Supabase config:** repo variables if set; otherwise read from the live web bundle (a browser user agent is needed: Cloudflare 403s `Python-urllib`). The key is never printed.
- **Mic:** `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS` are patched into the generated manifest.
- **Signing:** a persistent key needs a [KAI] secret. Until then each build uses a one-off key: installs are fine, updates need an uninstall first.
- **No service worker inside the shell** (`lib/platform.ts`).
- **Push:** stays web-only (no Web Push in WebView). FCM later (SHIP P4).

## Polish found on the way

- **The web app's own icon was a blank navy square.** The installed PWA showed an empty tile. It's now the interim four-leaf clover on paper (SHIP P1 named it), also declared maskable.
- **D2 lint errors fixed.** `ProjectsPage` had a byte-identical local copy of `useIsMobile` that broke rules-of-hooks. Lint is now **0 errors**, and CI enforces it.
