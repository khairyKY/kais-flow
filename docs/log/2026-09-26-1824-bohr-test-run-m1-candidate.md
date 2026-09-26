---
date: 2026-09-26T18:24Z
author: conductor (bohr)
type: test-run
topic: claude/mobile-1 = release-2 + M1 (Android/Windows apps) — web gate
related: docs/phases/M1-android.md, 2026-09-26-1711-bohr-test-run-release2-candidate.md
---

# Test run: `claude/mobile-1` @ b637b3c (web side of M1 on top of release-2)

## What it adds to release-2

| Change | Where it shows |
|---|---|
| Clover app icon, also maskable | web + both apps |
| D2 lint fix | lint now at 0 errors |
| `lib/platform.ts`: no service worker inside the shell; bar colours follow Day/Night; emailed auth links go to the web app when sent from inside the shell | shell only |
| Tauri shell, CI builds (`ci.yml`, `android.yml`, `desktop.yml`) | build pipeline |

There is **no `supabase/` diff** vs release-2.

## Gate

| Check | Result |
|---|---|
| vitest UTC / Cairo / LA / Tokyo | **54 files · 752 tests** each, all passed |
| lint (oxlint) | **0 errors** (was 2) |
| build | green |
| Route sweep (`docs/log/assets/release-2/sweep.mjs`: 20 routes × desktop/phone × day/night, production build on the local stack) | **80/80 clean** |
| Shell-fit matrix (5 scales × 2 viewports × 4 routes) | **40/40** |
| Android APK (GitHub) | green through f494e83. Emulator: installs, launches to sign-in, WebView top at 24px (clear of the status bar), no console errors. b637b3c is building. |
| Windows installer (GitHub) | green (b637b3c) |

**Environment note:** the container restarted mid-gate. Docker and the local stack were brought back with the usual recipe, and the sweep and shell-fit were re-run. The first attempt's "sign-in failed" was the stack being down, not the app.

## Status

READY as the next web release after release-2. It's a superset, so it can ship in its place once the backend deploy is unblocked.

The apps are for Kai to install from the green runs (`docs/INSTALL.md`).
