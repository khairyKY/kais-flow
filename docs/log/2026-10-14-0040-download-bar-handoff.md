---
date: 2026-10-14
session: download-bar (builder, worktree .claude/worktrees/download-bar)
type: handoff
related: Kai 2026-10-14 "why is there no download bar for both apps"
---

# 2026-10-14 00:40 UTC · handoff · download-bar

Branch `claude/download-bar`, from `claude/kai-bugs-1012`. Pushed. Not merged and not released.

## What it does

**Stable "latest" links** (`.github/workflows/android.yml`, `desktop.yml`)
- The Release step uploads a second, version-less copy of each installer beside the versioned file: `kais-flow.apk` and `kais-flow-windows-setup.exe` (`--clobber`).
- These two links always serve the newest release:
  - https://github.com/khairyKY/kais-flow/releases/latest/download/kais-flow.apk
  - https://github.com/khairyKY/kais-flow/releases/latest/download/kais-flow-windows-setup.exe
- The versioned files stay, because the apps' update check (`lib/appUpdate.ts` `releaseAssetName`) and the release notes read them.
- **The links 404 until the next release uploads the copies.** v1.1.6 and older have only the versioned files.

**The bar** (`app/src/features/download/DownloadBar.tsx` + `download.css`, mounted at the top of `<main>` in `AppLayout`)
- It reads "Get Kai’s Flow for" with **Android** and **Windows** buttons, which are plain links to the stable URLs.
- The device's own app comes first: Windows on a Windows computer, Android everywhere else (`downloadOrder`).
- It shows only in a plain browser tab (`inPlainBrowser`). It's hidden in the Tauri shell, in the Capacitor shell, and in the installed PWA (`display-mode: standalone`, or iOS `navigator.standalone`).
- **×** hides it for good on that device: `localStorage['kf-download-bar-dismissed'] = '1'`, inside try/catch. If storage is blocked, it hides for that visit only.
- The look comes from the top bar's strip (paper, a dashed rule, the 40px gutter), the kit's secondary buttons and the Inbox banner's ×. Tokens only, with 0 new ds-check hits.
- On a phone it stays one row, about 61px tall, and the × is a 48px target.

**Settings → App → "Download the apps"**
- A new row between "Kai’s Flow" and "The tour", with the same two links.
- It shows on every platform, so a dismissed bar is never a dead end.

**Docs and site**
- `docs/INSTALL.md` gives the stable link first, then a particular release and the test builds.
- On the site, the download buttons (`parts.mjs` `getIt`) and the two install guides use `APK_LATEST` / `EXE_LATEST` (`data.mjs`). The guide's filenames are now `kais-flow.apk` / `kais-flow-windows-setup.exe`.
- What's new keeps the versioned `apkUrl(r.v)`. `exeUrl` had no other caller and was removed.
- `site.js` no longer rewrites download hrefs from the GitHub API (`data-asset` is gone). It still fills in the live tag and date.

## Evidence

- `npx vitest run`: 159 files, 2176 tests green, including the new `appUpdate.test.ts` cases for `inPlainBrowser` and `downloadOrder`.
- `npm run lint`: 0 errors, 21 warnings, none in the touched files.
- `npm run build`: OK.
- `npm run ds:check -- --baseline scripts/ds-baseline.json`: 0 new.
- Site: `node build.mjs && node tools/check-links.mjs` built 31 pages; all 1208 internal links resolve.
- Browser (mock backend, dev server on :5285 from this worktree):
  - `docs/log/assets/download-bar/verify.mjs`: **49/49**. It covers desktop (Windows UA) and phone (Android UA), day and night; the × persisting across a reload and another page; Settings → App with the links (desktop, phone, night); and the bar hidden under a simulated Tauri, Capacitor and PWA.
  - Screenshots are in the same folder.
- Reruns:
  - `today-shell` **88/88**. In a parallel run, `l …"calls"` failed once; it passed alone and on a full rerun.
  - `fix-grammar` **97/97**.

## Left for Kai / the conductor
- The stable links work only after the next release, which runs `release.yml` → `android.yml` + `desktop.yml`.
- From then until the jobs finish uploading, `latest/download/<name>` can 404 for a few minutes. Afterwards it's stable.
- Other harnesses now see the bar in their screenshots, because headless Chrome is a plain browser. today-shell and fix-grammar are unaffected. A harness that measures the top of `<main>` may need `kf-download-bar-dismissed=1` in its init script.
- There's no iOS app, but an iPhone browser still shows the bar, as asked.
