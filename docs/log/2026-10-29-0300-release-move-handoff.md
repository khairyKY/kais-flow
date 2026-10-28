# release-move handoff: downloads move to khairyKY/kais-flow-releases (2026-10-29)

Branch `claude/release-move`, from `claude/kai-bugs-1012` (kai-bugs @ c4a2c027 "Show lists" merged in). Pushed, not merged. No real release made, no `claude/ship*` pushed, repo visibility unchanged.

Why: the source repo `khairyKY/kais-flow` goes private soon. Downloads and in-app updates must keep working, so every release's files now go to the public repo **`khairyKY/kais-flow-releases`** (README + release files only). Kai's choices: **A** the Mac build moves to Codemagic's free tier once private; **C** the gate runs locally before shipping and CI is trimmed to fit a private repo's 2000 free minutes (Windows ×2, macOS ×10).

## What changed

**1. Releases go to both repos (for now)** — `.github/scripts/releases.sh` (sourced by every publishing step)
- `RELEASE_REPOS="khairyKY/kais-flow-releases khairyKY/kais-flow"`. The first is the **primary**: what the apps, the updater, the site and latest.json's URLs read. The old repo gets the same release as a bridge: installed apps' updaters still read it.
- `rgh <repo> …`: `gh` with this workflow's token for the source repo and `RELEASES_TOKEN` for any other. **A missing `RELEASES_TOKEN` fails the step with a message saying what to create; it never skips.**
- `release_upload <files>`: `gh release upload --clobber` into every repo of the list.
- `release.yml`:
  - **deploy**'s first step now also requires `RELEASES_TOKEN`, so a release that couldn't publish its files stops before production is touched.
  - **publish** creates the release in each repo, primary first: same tag, title and notes. The source repo gets `--target <sha>`; the releases repo has no source, so its tag sits on its README commit, and every release is created with `--latest` (GitHub otherwise ranks "latest" by the tagged commit's date, which is the same for all of them there). A release without a `releases.json` entry gets "Kai's Flow vX" + the live line instead of GitHub's generated notes (those can't come from a private repo). The release body's "docs/INSTALL.md" pointer is now the site's /download/ page.
  - **publish** also creates the `v*` tag in the source repo when it isn't there; once the source stops getting a release, that tag is still what triggers Codemagic.
  - **dry run**: Actions → Release → Run workflow → `dry_run` = true runs only a job that creates a **draft** `test-dry-run` in the releases repo, uploads a file twice (`--clobber`), views it, and deletes it (trap). Every other job skips.
- `android.yml`, `desktop.yml` (windows, msix, macos, updater): every `gh release upload` → `release_upload`, with `RELEASES_TOKEN` passed (the callers already use `secrets: inherit`).
- **The later switch to "only kais-flow-releases" is one line:** in `.github/scripts/releases.sh`, delete ` khairyKY/kais-flow` from `RELEASE_REPOS`.

**2. Every reader points at the releases repo**
- `app/src-tauri/tauri.conf.json` updater endpoint → `https://github.com/khairyKY/kais-flow-releases/releases/latest/download/latest.json`.
- latest.json's file URLs → `https://github.com/khairyKY/kais-flow-releases/releases/download/<tag>/<file>` (Windows job, Mac updater job, Codemagic). The old repo's copy of latest.json is the same file, so bridging apps also download from the releases repo.
- `app/src/lib/appUpdate.ts`: new `RELEASES_REPO`; `RELEASES_LATEST` (update check + What's new's release body) and `LATEST_DOWNLOADS` (android / windows / mac) are built from it. The download bar and Settings → App use `LATEST_DOWNLOADS`; `features/whats-new/check.ts` uses `RELEASES_LATEST` (no change needed in either file).
- Site: `data.mjs` `REPO` → the releases repo (download buttons, "GitHub releases", "Read on GitHub", footer GitHub); `site.js`'s live-version fetch; press-kit README line ("Releases: …"). The guides' "Was this helpful? Yes / Not really" went to `REPO/issues/new`; the releases repo has issues off, so it's now a `mailto:` CONTACT_EMAIL with the same subject.
- `docs/INSTALL.md`: a "Where downloads live" paragraph; every release link → the releases repo; test builds (Actions artifacts) stay in the source repo and say they need access; Mac test builds also via Codemagic.
- Grep (`app/ site/ .github/ docs/INSTALL.md`, `khairyKY/kais-flow` not followed by `-releases`) now only hits: `.github/scripts/releases.sh` (the bridge, on purpose), `docs/INSTALL.md`'s Actions test-build links, `site/README.md` (Cloudflare "connect to Git" setup: the source repo, internal).
- **Test** `app/src/lib/releaseRepo.test.ts` (in the gate): fails if any shipped file names the source repo (all of `app/src` except tests, `tauri.conf.json`, `site/src/**`, the press-kit tool, INSTALL.md minus its Actions lines, release/desktop/android.yml, codemagic.yaml), checks the constants + updater endpoint + that the releases repo is first in `releases.sh`, that no workflow builds a `github.com/$GITHUB_REPOSITORY/releases` URL, and the latest.json merge (below). Proven to fail: pointing `RELEASES_REPO` back at the source repo fails 2 of its tests.

**3. Codemagic Mac build, ready but off** — `codemagic.yaml`
- Workflow `mac`, `instance_type: mac_mini_m2`, 60 min cap, env group `kais-flow`, `node: 22`, `xcode: latest`, caches `~/.npm` + `~/.cargo/registry`.
- Triggers: a `v*` tag, or a manual start. Codemagic's Mac image has no Rust (checked: its software list has gh 2.95, jq, node 24, no rustup), so the build step installs rustup, then runs `.github/scripts/mac-build.sh` with `TAG=$CM_TAG`, `OUT=$CM_BUILD_DIR/mac-out` (the script's own defaults cover the rest: `APP_URL`, the Supabase public config read from the live app, `git rev-parse` for the sha).
- On a tag: it waits for the release in kais-flow-releases (up to 30 min; publish makes it before the tag, so normally at once), uploads the .dmg + `kais-flow-mac.dmg` + `.app.tar.gz` + `.sig`, then waits (up to 20 min) for latest.json's Windows entry, since the Windows build runs at the same time, and merges the darwin entries in with `.github/scripts/latest-json.mjs`. A manual start uploads nothing; the files are the build's artifacts (`mac-out/*`).
- Only to the releases repo (`RELEASES_TOKEN` can't write the source repo): the bridging release in the old repo has no Mac files, which is fine because no Mac app predates the move.
- **`.github/scripts/latest-json.mjs`** is now the one latest.json writer (Windows job, GitHub's Mac updater job, Codemagic): it keeps the release's existing entries when it's the same version, so whichever of Windows / Mac finishes last, both stay. Covered by `releaseRepo.test.ts`.
- **Switch**: repo variable **`MAC_BUILD_ON`** (unset = `github`). `desktop.yml`'s `macos` job runs only when it isn't `codemagic`; the `updater` job needs it, so it skips too. Going private = set the variable to `codemagic`.
- Checked against Codemagic's own JSON schema (`https://codemagic.io/codemagic-schema.json`, jsonschema): 0 errors; the schema does catch a bad `instance_type` or an unknown key. Every script also passes `bash -n`. Not run on Codemagic yet (no app/env group there).

**4. CI minutes (choice C)**

Measured (`gh run view <id> --json jobs`), release runs 40230580751 (v1.5.0), 40151271509 (v1.4.2), 39871206468 (v1.4.1); the Mac job from the mac-app runs 40779385954 / 40781590271 / 40782829663. GitHub bills each job rounded up to the minute.

| Job | Runner | Minutes (avg) | Billed (rounded) | × | Billed / release |
|---|---|---|---|---|---|
| gate: Tests ×4 TZ | Linux | 1.0 each | 1.5 each | 1 | 6 |
| gate: Lint, Build, Site build | Linux | 0.7 / 0.9 / 0.4 | 1 each | 1 | 3 |
| rehearse: Fresh chain | Linux | 3.1 | 4 | 1 | 4 |
| rehearse: Production rehearsal | Linux | 3.0 | 3.3 | 1 | 3.3 |
| Deploy | Linux | 7.1 | 7.7 | 1 | 7.7 |
| GitHub Release | Linux | 0.1 | 1 | 1 | 1 |
| Android: Build APK | Linux | 4.4 | 5 | 1 | 5 |
| Android: Emulator smoke | Linux | 3.2 | 4 | 1 | 4 |
| Windows installer | Windows | 9.8 | 10 | 2 | 20 |
| Microsoft Store package (skips, no STORE_* vars) | Windows | 0.2 | 1 | 2 | 2 |
| Mac app | macOS | 11.3 | 12 | 10 | 120 |
| Updater manifest (Mac) | Linux | 0.2 | 1 | 1 | 1 |
| **Total** | | | | | **≈177** (Linux 35, Windows 22, Mac 120) |

Releases per month: 39 release runs (35 green) from 2 to 25 Oct; the last two weeks ran 12 → **plan on ~30/month**. As-is but private: 30 × 177 ≈ 5300 min, 2.6× the 2000. Without the Mac: 30 × 57 ≈ 1700, before any other workflow.

Found: **no cache ever hits on a release.** GitHub caches are per branch (plus the default branch), every release ships from a new `claude/ship-vX` branch, and nothing builds on master, so the Windows job logs "npm cache is not found" + rust-cache "No cache found." and then spends 47 s saving a 417 MB cache nobody reads. Cached runs build in 245 s instead of 427 s.

Trims made:
- **The gate skips on a fresh local record.** `scripts/preship.ps1` writes `.github/preship.txt` (`sha=`, `result=`, `date=`, `failed=`); `release.yml`'s new `preship` job skips `gate` when `result=pass`, the recorded commit is in the release, and nothing but that file changed since (`git diff <sha> HEAD -- . ':(exclude).github/preship.txt'`). Deploy accepts a skipped gate only together with `fresh == 'true'` from a successful preship job; a failed preship job never lets it through. −9 billed, +1 for the check.
- **`claude/ship` (one branch for every release)** is now a trigger too; the version comes from `site/src/releases.json`'s newest entry. Same branch → npm, cargo and gradle caches carry over. `claude/ship-v*` still works, without caches. ≈ −6 billed (Windows ~3 min ×2).
- **Gradle cache**: `setup-java` `cache: gradle`, keyed on `app/package-lock.json` (android/ is generated each build, so there's no build.gradle to hash).
- **MSIX job doesn't start** without `vars.STORE_IDENTITY_NAME` (it billed 2 Windows minutes per release to say "skipped"). It was already built from the Windows job's exe artifact with no rebuild; that upload is skipped too when it isn't needed. −2.
- **Mac → Codemagic** when `MAC_BUILD_ON=codemagic`: −120 GitHub minutes (−121 with the updater job), ≈ +12–15 of Codemagic's 500.
- Kept as is: the rehearsal (fresh chain + deno check + the MCP and other suites, production rehearsal), deploy, the emulator smoke test.

After the trims (private, preship used, `claude/ship`, Mac on Codemagic): Linux ≈ 25 + Windows ≈ 14 → **≈ 39 billed / release**, 30 × 39 ≈ **1170/month**. Other workflows at October's rate (desktop/android builds on mobile branches, rehearsal dispatches) add ~400–500, so ≈ 1600–1700 of 2000. Codemagic ≈ 30 × 13 ≈ 390 of 500. Both fit, but not with much room: batching releases is the next lever, and `desktop.yml` building Windows on every `claude/mobile-*` push (~22 billed each) is the biggest remaining non-release cost.

**`scripts/preship.ps1`** (PowerShell, because Git Bash drops `TZ=Area/City`): vitest under UTC / Cairo / Los Angeles / Tokyo, lint, ds:check, build, site build + link check, `deno check` of every `supabase/functions/*/index.ts` (`deno` if installed, else `npx -y deno@2.9.6`, the newest on npm; CI pins 2.9.7), and birthday_on 1/1. A dirty tree records `result=dirty`, so CI runs its own gate. `-Commit` commits the record on top. Usage: run it on the commit to ship → `-Commit` (or commit the file) → push that commit to `claude/ship`.

## Verification
- **Dry run** (RELEASES_TOKEN exists now): run **40787506705**, `workflow_dispatch` on `claude/release-move` with `dry_run=true`: only "Publish dry run" ran, green, and printed `{"assets":["dry-run.txt"],"isDraft":true,"tagName":"test-dry-run"}`. Afterwards kais-flow-releases has 0 releases and 0 tags. Gate, rehearse, deploy, publish, android and desktop were all skipped.
- **CI** on the branch push: CI 40787495901 green; Rehearsal 40787495905: Production rehearsal green, deno check of every function green; **Fresh chain red in `mcp-week.sh` (144 passed, 14 failed) and `mcp-full.sh`**. Not from this branch: kai-bugs' 057f0208 (MCP `scope` on edit/delete/duplicate_event) makes a repeating event's change without `occurrence` or `scope: "all"` an error, and those two shell suites weren't updated (only the vitest mirrors were). **The next release's rehearse job fails until they are**; a background task was suggested for it.
- **Manual builds** on the branch (no tag, nothing uploaded): Desktop apps 40787688203 green: Windows + Mac built, the Microsoft Store job skipped (no STORE_* vars) instead of starting, and the updater job merged through `latest-json.mjs` + `releases.sh` (the releases repo has no release yet → fell back to the source repo's v1.5.0 latest.json): `windows-x86_64` kept at its v1.5.0 URL, `darwin-aarch64` / `darwin-x86_64` added with kais-flow-releases URLs. Android APK 40787693012: Build APK green with the new Gradle cache ("gradle cache is not found" the first time, then saved in 8 s); the emulator smoke failed once ("the WebView starts under the status bar", with emulator `ColorBuffer` errors), and its re-run went green: a flaky emulator, not this change.
- **actionlint**: no npx binary or docker here; ran the npm `actionlint` package (the wasm build, 2.0.6) on every workflow. Only two kinds of finding, both false positives that are on HEAD too: `vars` (that old build doesn't know the context) and `inputs.tag` under `workflow_dispatch`. Nothing new. Plus a YAML parse of the three workflows and `bash -n` on all 37 run scripts + releases.sh + mac-build.sh: clean.
- `releases.sh` with a fake `gh`: uploads go to the releases repo with RELEASES_TOKEN and to the source repo with the workflow token; without RELEASES_TOKEN it prints the `::error::` and exits 1. `latest-json.mjs` CLI: the base's Windows entry kept, darwin added.
- **Gate** (`gate.ps1`, after merging kai-bugs @ c4a2c027): vitest 2686/2686 in each of Cairo, UTC, Los Angeles and Tokyo (191 files); lint exit 0; build exit 0; ds:check 0 new (71 fixed since baseline); birthday_on 1/1.
- **`scripts/preship.ps1`** under Windows PowerShell 5.1 (`powershell -File`): every step passed (4 × vitest, lint, ds:check, build, site build + links, `deno check` of all 14 functions via `npx deno@2.9.6`, birthday_on 1/1); it recorded `result=dirty` and exited 1 because this handoff was still uncommitted, which is what it's meant to do. The test record was deleted, not committed.
- **Site**: `node build.mjs` 32 pages; `check-links` 1335 internal links all resolve. External: the releases repo and its /releases page answer 200; the download links, `/releases/tag/v1.5.0` and the API's `releases/latest` answer 404 **until the first release is published there** (expected; see step 4 below).

## Going private: the runbook (in order)
1. **Kai creates `RELEASES_TOKEN`** (done 2026-10-29). If it ever needs remaking: GitHub → Settings → Developer settings → Fine-grained tokens → Generate: Repository access *Only select repositories* → `kais-flow-releases`; Permissions → Contents: *Read and write*; then khairyKY/kais-flow → Settings → Secrets and variables → Actions → `RELEASES_TOKEN`. Optional proof: Actions → Release → Run workflow (branch with this change) → tick *dry run*.
2. **Ship one release** the normal way, after merging this branch (preferably `preship.ps1 -Commit`, then push to `claude/ship`). It publishes to both repos: check that both https://github.com/khairyKY/kais-flow-releases/releases and the old repo's Releases have the tag with the .apk, .exe, .exe.sig, latest.json, `kais-flow.apk`, `kais-flow-windows-setup.exe` and the Mac files.
3. **Check that Kai's Windows and Android apps updated** to that release (Settings → App → Check for updates → Update). From then on they read the releases repo. Every device that should keep updating must take this release before step 7.
4. **Deploy the site** (`npx wrangler deploy` from site/, after `node build.mjs`): its download buttons point at the releases repo, so only now do they resolve.
5. **Kai: Codemagic** (signed up with GitHub; the env group doesn't exist yet):
   1. codemagic.io → **Apps** → **Add application** → GitHub → pick **khairyKY/kais-flow** → project type **Other** (codemagic.yaml) → Finish. (When the repo is private, Codemagic needs its GitHub app installed with access to that repo: GitHub → Settings → Applications → Codemagic → Configure → Repository access.)
   2. In the app: **Environment variables** tab. For each of the three below: type the **Variable name**, paste the **Variable value**, in **Select group** type `kais-flow` (the first time choose *Create "kais-flow"*), keep **Secret** ticked, click **Add**:
      - `TAURI_SIGNING_PRIVATE_KEY` = the whole contents of `C:\Users\khair\.kaisflow-signing\tauri-updater.key` (one line);
      - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = the contents of `C:\Users\khair\.kaisflow-signing\tauri-updater-password.txt`;
      - `RELEASES_TOKEN` = the same fine-grained token as the GitHub secret.
   3. App settings → right sidebar **Webhooks** → **Create webhook** (so a pushed tag starts a build; without it only manual starts work).
   4. Check: **Start new build** → workflow **Mac app** (`mac`), branch `master` → it should finish green with `kais-flow-<sha>-mac.dmg` under Artifacts (a test build, nothing uploaded; ~15 of the 500 free minutes).
6. **Flip `MAC_BUILD_ON`**: khairyKY/kais-flow → Settings → Secrets and variables → Actions → **Variables** → New repository variable `MAC_BUILD_ON` = `codemagic`. From the next release, GitHub's macos + updater jobs skip and Codemagic builds the Mac app on the tag.
7. **Make the repo private** (Settings → General → Danger zone). Installed apps from step 3 on keep updating from the releases repo.
8. **Drop the old repo from publishing**: in `.github/scripts/releases.sh` delete ` khairyKY/kais-flow` from `RELEASE_REPOS`, ship. (publish keeps creating the source tag that Codemagic builds on.)

## Notes / follow-ups
- Ship by pushing to **`claude/ship`**, not a tag: a pushed `v*` tag starts Codemagic before the release exists (it waits up to 30 min of Mac minutes for it).
- The conductor docs that say "push `claude/ship-vX.Y.Z`" still work; switching them to `claude/ship` is what brings the caches back.
- After the move, Kai's own `releases.json` highlights are the only release notes (no `--generate-notes` fallback).
- Codemagic's real build time on the M2 is unmeasured; if it runs well past 15 min, caching `app/src-tauri/target` is the next step (personal accounts get 3 GB of cache per workflow; GitHub's trimmed rust-cache for this is 535 MB).
