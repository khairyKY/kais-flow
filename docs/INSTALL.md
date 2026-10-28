# Installing Kai's Flow

The web app is at https://kais-flow.kaidagoat.workers.dev and needs no install. The apps below are the same app in a native window, with no browser bar and their own icon. In a browser, the web app's bar at the top and **Settings → App → Download the apps** link to all three.

**Where downloads live:** every release's files are in the public repo https://github.com/khairyKY/kais-flow-releases (Releases). It holds only a README and the release files; the source code repo is going private. The links below always serve the newest release. Test builds (Actions artifacts) are in the source repo, so they need access to it.

## Android (APK)

**Where to get it:**
- **The newest release:** https://github.com/khairyKY/kais-flow-releases/releases/latest/download/kais-flow.apk (this link always serves the newest one).
- **A particular release:** https://github.com/khairyKY/kais-flow-releases/releases → that release → **Assets** → `kais-flow-v….apk`.
- **A test build:** https://github.com/khairyKY/kais-flow/actions/workflows/android.yml → the newest green run → **Artifacts** → the `kais-flow-….apk` file. Sign in to GitHub with access to the source repo first. It downloads as a `.zip`; open it and tap the `.apk` inside.

**Installing:**
1. Tap the `.apk`. Android asks to allow installs from your browser or Files app: **Settings → Allow from this source**, then back.
2. **Install**, then **Open**.
3. Sign in with your usual email and password. Your data is the same as on the web.
4. The first time you use voice capture, allow the microphone.

**Updating:** install the newer `.apk` over the old one.
- If Android says *"App not installed … conflicts with an existing package"*, that build was signed with a different key.
- Open the old app and check it says **Synced**, uninstall it, then install the new one. Nothing is lost, because your data lives in the cloud.
- A permanent signing key removes this step. It needs two repository secrets, `ANDROID_KEYSTORE_B64` + `ANDROID_KEYSTORE_PASSWORD`; the conductor can walk you through making them.
- **Coming from the old Android app (before 2026-09-28):** the app was rebuilt on a new shell, so it keeps its data in a new place. Open the old app, wait for **Synced**, uninstall it, install the new one, and sign in again.

**Not in the Android app yet:**
- Push notifications. Reminders still reach you through the web app, installed from Chrome.
- iOS. It needs a Mac and Apple's $99/yr account.

## Windows (installer)

**Where to get it:**
- **The newest release:** https://github.com/khairyKY/kais-flow-releases/releases/latest/download/kais-flow-windows-setup.exe (always the newest).
- **A particular release** or **a test build:** as for Android, but `kais-flow-v…-windows-setup.exe`, with test builds from https://github.com/khairyKY/kais-flow/actions/workflows/desktop.yml.

**Installing:**
1. Run the `.exe`.
2. Windows SmartScreen may say *"Windows protected your PC"*, because the installer isn't code-signed (that costs money). Click **More info → Run anyway**.
3. It installs per-user; no admin is needed. Start menu → **Kai's Flow**.
4. Later versions install from inside the app (Settings → App → **Update**), with no SmartScreen screen.

**Uninstalling:** Settings → Apps → Kai's Flow → Uninstall.

## Mac (.dmg)

**Where to get it:** https://github.com/khairyKY/kais-flow-releases/releases/latest/download/kais-flow-mac.dmg (always the newest; one universal app for Apple silicon and Intel). Test builds: the **kais-flow-mac** artifact of a manual run of https://github.com/khairyKY/kais-flow/actions/workflows/desktop.yml, or, once the repo variable `MAC_BUILD_ON` is `codemagic`, a manual build of the `mac` workflow on codemagic.io → its **Artifacts**.

**Installing (macOS 15 Sequoia and 26 Tahoe):**
1. Open the `.dmg` and drag **Kai's Flow** onto **Applications**.
2. Double-click it in Applications. It isn't notarized (that needs Apple's $99/yr account), so macOS says *"Kai's Flow" Not Opened* with only Move to Trash / Done. Click **Done**. (Right-click → Open no longer gets past this since Sequoia.)
3. **System Settings → Privacy & Security**, scroll to **Security**: *"Kai's Flow" was blocked to protect your Mac.* Click **Open Anyway** (it shows for about an hour after the attempt), enter your password, then **Open**.
4. Only once: later versions install from inside the app (Settings → App → **Update**) and never ask again. Terminal alternative to steps 2–3: `xattr -cr "/Applications/Kai's Flow.app"`.

**Uninstalling:** quit from the menu-bar K, then drag Kai's Flow from Applications to the Bin.

## Windows (Microsoft Store)

Once Kai's Flow is listed (docs/MICROSOFT-STORE.md), install it from the Microsoft Store instead. There's no SmartScreen warning, and the Store keeps it up to date (Settings → App says so).

**Coming from the installer:** open the old app and wait for **Synced**. Uninstall it, with **"Also forget this PC's sign-in and cache"** turned on. Then install from the Store and sign in.
