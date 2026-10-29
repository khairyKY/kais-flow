# license — proprietary LICENSE, open-source notices in the app, full-history secret scan

Branch `claude/license` (from `claude/kai-bugs-1012` @ 1a9deb8f). Not merged. Repo visibility untouched.

## Rotate list

**Nothing to rotate.** No real secret was found anywhere in the history (1,642 commits, all 180 branches, the 49 tags and the 4 PR refs). Detail and caveats are under "Secret scan" below.

## 1. Proprietary LICENSE

- `LICENSE` (repo root): "Copyright (c) 2026 Khairy Islam Shaheen. All rights reserved." followed by a plain-English notice. The source is visible for reference only, and no permission is granted to copy, modify, distribute or use it. Third-party parts stay under their own licences, which ship in the app. It makes no other legal claims.
- `app/package.json`: `"license": "UNLICENSED"` (`"private": true` was already set).
- `app/src-tauri/Cargo.toml`: `publish = false` was already set. Added `license-file = "../../LICENSE"`, because Cargo needs an SPDX id or a file and no SPDX id means "all rights reserved".

## 2. Third-party licence notices

- **Generator:** `app/scripts/licenses.mjs`. It uses only the Node standard library, adds no dependency, and does not use npx at build time. It writes `app/public/licenses.txt`, which is gitignored as a generated file.
  - **JS:** the production entries of `package-lock.json` (dev-only entries skipped), each with its own LICENSE/NOTICE/COPYING from node_modules. That gives 49 packages.
  - **Rust:** included only when Tauri runs the build (`TAURI_ENV_PLATFORM` is set for `beforeBuildCommand`) or with `--rust`. It runs `cargo metadata`, filtered to `TAURI_ENV_TARGET_TRIPLE`, and lists the crates reachable by normal dependencies. Build-dependencies and proc-macros are left out because they never ship. Each crate's licence files come from the cargo registry. Windows target: 240 crates, about 300 KB in total.
  - **Artwork:** Twemoji images in `public/emoji`, under CC-BY 4.0, attributed in the file.
  - **Android:** a note only. The Gradle libraries (AndroidX, Capacitor's Android code) come in at build time under Apache-2.0. `/android` is generated in CI, so they aren't listed one by one.
  - Identical licence texts print once, followed by every package that uses them and each package's copyright lines.
- **Can't go stale:** the script runs as `prebuild` and `predev` in app/package.json. Every build path goes through it: web/CI `npm run build`, android.yml `npm run build`, and desktop.yml `tauri build` → `beforeBuildCommand: npm run build`. The web and Android copies say "this build carries no Rust code"; the Windows app's copy lists the crates.
- **In the app:** Settings › App & updates › "Open-source licences" › Read opens `LicensesDialog`. It uses the same card (`Sheet` in `features/legal/LegalDialogs.tsx`) as the terms notice and Delete account, in a wider variant, with the text in a scrolling `<pre>`. It fetches `licenses.txt` when opened. The file isn't in the PWA precache (txt isn't in globPatterns), so an offline web open shows "No connection — the licences load when you're online." Esc and Close dismiss it.
  - Terms and Privacy themselves open on the site in the browser (`LegalLink`). The licences file is local to each build, so a card inside the app is the honest place for it: it works the same in the Windows and Android apps, where an external link to `/licenses.txt` would go nowhere.

### Licence risks in what ships

- **GPL / AGPL / LGPL: none.** The only GPL-family hit is `r-efi` (`MIT OR Apache-2.0 OR LGPL-2.1-or-later`). It's an OR choice, so we use it under MIT, and the script doesn't warn on OR licences.
- **MPL-2.0 (weak, file-level copyleft):** the Rust crates `cssparser`, `selectors`, `dtoa-short` and `option-ext`, pulled in by Tauri/wry. They're used unmodified from crates.io. MPL asks for the notice (included) and for the source of any *modified* MPL files. That's fine as long as nobody patches them.
- **OFL-1.1:** the four @fontsource fonts. Bundling is allowed and the notice is included.
- **CC-BY 4.0:** the Twemoji images. Attribution is in the file.
- 5 Windows crates ship no licence file inside the crate: `alloc-stdlib` (BSD-3-Clause), `defmt-parser` (MIT OR Apache-2.0), `selectors` (MPL-2.0), and `webview2-com` / `webview2-com-sys` (MIT). They're listed by name with their SPDX id and a link to the standard texts. The BSD/MIT ones strictly want the authors' copyright line. Before any wider distribution, copy it in from each crate's repo.

## 3. Secret scan of the full history

**Tools:** gitleaks 8.30.1, downloaded from the GitHub release, run as `gitleaks git --log-opts="--all"` after `git fetch --all` plus the PR refs. Its rules miss some providers, so I also ran a regex pass over every added line of `git log --all -p`. It looked for: Groq `gsk_`, Supabase `sb_secret_`/`sbp_`, every JWT (decoded to read its `role`), Google `GOCSPX-`/`AIza`, GitHub `ghp_`/`github_pat_`, HF `hf_`, `sk-`, PEM private keys, the Tauri minisign header, `postgres://user:pass@`, `password = '…'`, and Kai's real login password, which was counted, never printed. I also checked every file ever added for `.env*`, `*.jks`, `*.keystore`, `*.p12`, `*.pem` and `*.key`. Docker and trufflehog aren't installed, so trufflehog wasn't run.

| # | What (prefix only) | Where (first commit · file) | Verdict |
|---|---|---|---|
| 1 | JWT `eyJhbGciOi…` (`iss: supabase-demo`, `role: anon`) | 9996e21d · `docs/log/assets/p0b/lib.mjs` | **Test.** The Supabase CLI's well-known local demo anon key. It's the only gitleaks finding. |
| 2 | `"pubkey": "dW50cnVz…"` | 0f3749b7 · `app/src-tauri/tauri.conf.json` | **Public by design.** The updater's *public* key. The private key is only in GitHub secrets. |
| 3 | `PASSWORD = 'mad…'`, `'pol…'`, `'mcp…'`, `'not…'`, `'sec…'`, `'fix…'` | 412072a7 / e0756404 `docs/log/assets/{first-run,legal}/verify.mjs`, cf3889db / a75f9c23 `polish-{a,c}-e2e.mjs`, e40ca430 / 37614025 / f5eb4dad / 110924bd / 5769e6a5 `supabase/tests/*.sh` | **Test.** Throwaway accounts on the local stack or mock (127.0.0.1:54321 / `@example.com`). Several are commented "never a real password". |
| 4 | `postgresql://postgres:pos…@127.0.0.1:54322` | ae663d04 · `supabase/tests/fix5-search.sh` (and the mcp-*.sh guards) | **Test.** The Supabase CLI's local default. The mcp scripts *refuse* any non-local URL. |
| — | Kai's real login password | — | **0 occurrences** in history. |
| — | Groq, service-role JWT, `sb_secret_`, GitHub PAT, Google client secret, HF token, private keys, `.env` / keystore files | — | **None found.** The only `.env*` ever committed is `app/.env.example`, which holds placeholder values. The production anon key/URL were never committed, because CI injects them. |

**Caveats:** pattern scanning can't prove a negative. One free extra check: GitHub › Settings › Security › *Secret scanning* alerts, which GitHub runs on public repos. Kai should glance at that page before flipping to private. This repo's scan doesn't cover the separate Obsidian vault issue (the exposed HF token noted in July), which is a different place.

### .gitignore

- Root: `.env` became `.env*` (with `!.env.example`). Added `*.jks *.keystore *.p12 *.pfx *.key *.pem`; the Tauri updater key from `tauri signer generate` is a `.key`. No tracked file matches these patterns.
- `app/.gitignore`: `.env` became `.env*`, plus `public/licenses.txt`.
- Before this, `.env.production`, `.env.development` and any keystore would have been committable. They were checked and none ever was. The Android keystore lives outside the repo (`C:\Users\khair\.kaisflow-signing`).

## Verify

- **Gate** (`gate.ps1`): Cairo / UTC / LA / Tokyo each 190 files · **2677/2677**; lint exit 0; build exit 0, and `dist/licenses.txt` was produced by prebuild (40 KB, web, no Rust); ds-check 0 new.
- `tsc -b` clean.
- **Harness** `docs/log/assets/license/verify.mjs`: mock server `npx vite --mode mock --host :: --port 5333`, needs `app/.env.mock.local`, system Chrome. Result **11/11**: the row exists, Read opens the dialog with licenses.txt (react + MIT text), Esc closes it, there are no page errors (desktop + phone), and a 404 shows the error line. Screenshots: `desktop-licences.png`, `phone-licences.png`, `desktop-licences-failed.png`.
- Windows-target Rust generation was checked locally: `TAURI_ENV_PLATFORM=windows TAURI_ENV_TARGET_TRIPLE=x86_64-pc-windows-msvc node scripts/licenses.mjs` gives 240 crates. The first run downloads crate sources, which takes about 1 minute; after that it's quick.

## Notes

- `vite --mode mock` run directly skips `predev`. Run `node scripts/licenses.mjs` once first, as the harness header says.
- On a Tauri build, `cargo metadata` failing fails the build. That's on purpose: the app can't ship without its notices.
